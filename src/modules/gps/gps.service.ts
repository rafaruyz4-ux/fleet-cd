import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, queryOne, withTransaction } from '../../db/pool';
import { ingestPosicoesSchema, type IngestPosicoesInput, type PosicaoInput } from './gps.schemas';
import { matchTrajeto } from '../../integrations/mapmatch/valhalla';
import { matchTrajetoOsrm } from '../../integrations/mapmatch/osrm';
import { detectarParadas, haversineM, type ParadaDetectada } from './paradas';
import { ViagemStatus } from '../../domain/status';

// ---------------------------------------------------------------------
// Limiares de detecção (constantes; podem virar configuráveis depois).
// ---------------------------------------------------------------------
const VEL_MAX_KMH = 110; // acima disso → velocidade_alta
const SEM_GPS_GAP_MS = 10 * 60 * 1000; // intervalo entre pontos → sem_gps
const PARADA_RAIO_M = 50; // raio para considerar "parado"
const PARADA_TEMPO_MS = 15 * 60 * 1000; // parado por mais que isso → parada_longa
const COOLDOWN_MS = 5 * 60 * 1000; // janela mínima entre alertas do mesmo tipo

// Filtro de qualidade na ingestão: ponto ruim NÃO persiste, mas a resposta
// segue OK (o app não deve reenviar — o ponto é ruim mesmo).
const PRECISAO_MAX_M = 50; // precisão pior que isso → ponto impreciso demais
const TELETRANSPORTE_KMH = 160; // velocidade implícita acima disso → "teletransporte"

type AlertaTipo = 'desvio_rota' | 'parada_longa' | 'velocidade_alta' | 'sem_gps';

export interface AlertaGerado {
  id: string;
  viagem_id: string;
  tipo: AlertaTipo;
  descricao: string | null;
  coordenada: { lat: number; lng: number };
  criado_em: string;
  visualizado: boolean;
}

export interface IngestResult {
  inseridas: number;
  descartadas: number; // pontos ruins filtrados (precisão/teletransporte)
  alertas: AlertaGerado[];
}

interface Ponto {
  lat: number;
  lng: number;
  time: number; // epoch ms de registrado_em
}

async function inserirAlerta(
  client: PoolClient,
  empresaId: string,
  viagemId: string,
  tipo: AlertaTipo,
  descricao: string,
  ponto: PosicaoInput,
): Promise<AlertaGerado> {
  const result = await client.query<{
    id: string;
    viagem_id: string;
    tipo: AlertaTipo;
    descricao: string | null;
    lat: number;
    lng: number;
    criado_em: string;
    visualizado: boolean;
  }>(
    `INSERT INTO alertas (empresa_id, viagem_id, tipo, descricao, coordenada)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)
     RETURNING id, viagem_id, tipo, descricao,
               ST_Y(coordenada::geometry) AS lat,
               ST_X(coordenada::geometry) AS lng,
               criado_em, visualizado`,
    [empresaId, viagemId, tipo, descricao, ponto.lng, ponto.lat],
  );
  const r = result.rows[0]!;
  return {
    id: r.id,
    viagem_id: r.viagem_id,
    tipo: r.tipo,
    descricao: r.descricao,
    coordenada: { lat: r.lat, lng: r.lng },
    criado_em: r.criado_em,
    visualizado: r.visualizado,
  };
}

export async function ingestPosicoes(
  empresaId: string,
  viagemId: string,
  motoristaId: string,
  input: IngestPosicoesInput,
): Promise<IngestResult> {
  return withTransaction(async (client) => {
    const viagemRows = await client.query<{
      motorista_id: string;
      status: string;
      rota_planejada_id: string | null;
    }>(
      'SELECT motorista_id, status, rota_planejada_id FROM viagens WHERE id = $1 AND empresa_id = $2',
      [viagemId, empresaId],
    );
    const viagem = viagemRows.rows[0];
    if (!viagem) throw AppError.notFound('Viagem não encontrada');
    if (viagem.motorista_id !== motoristaId) {
      throw AppError.forbidden('Esta viagem não pertence ao motorista autenticado');
    }
    if (viagem.status !== ViagemStatus.EM_ANDAMENTO) {
      throw AppError.badRequest('Só é possível enviar posições de viagens em andamento');
    }

    // Rota planejada (para detectar desvio).
    let raioTolerancia = 0;
    let temLinha = false;
    if (viagem.rota_planejada_id) {
      const rota = await client.query<{ raio_tolerancia_m: number; tem_linha: boolean }>(
        'SELECT raio_tolerancia_m, (linha IS NOT NULL) AS tem_linha FROM rotas_planejadas WHERE id = $1',
        [viagem.rota_planejada_id],
      );
      if (rota.rows[0]) {
        raioTolerancia = rota.rows[0].raio_tolerancia_m;
        temLinha = rota.rows[0].tem_linha;
      }
    }

    // Último ponto já gravado, para continuidade (gap / parada entre lotes).
    const ultimo = await client.query<{ lat: number; lng: number; registrado_em: string }>(
      `SELECT ST_Y(coordenada::geometry) AS lat, ST_X(coordenada::geometry) AS lng, registrado_em
       FROM posicoes_gps WHERE viagem_id = $1 ORDER BY registrado_em DESC LIMIT 1`,
      [viagemId],
    );
    let prev: Ponto | null = ultimo.rows[0]
      ? {
          lat: ultimo.rows[0].lat,
          lng: ultimo.rows[0].lng,
          time: new Date(ultimo.rows[0].registrado_em).getTime(),
        }
      : null;

    // Ordena cronologicamente.
    const posicoes = [...input.posicoes].sort(
      (a, b) => a.registrado_em.getTime() - b.registrado_em.getTime(),
    );

    let stopAnchor: Ponto | null = prev;
    let stopEmitido = false;
    const ultimoAlerta: Record<AlertaTipo, number> = {
      desvio_rota: -Infinity,
      parada_longa: -Infinity,
      velocidade_alta: -Infinity,
      sem_gps: -Infinity,
    };

    const alertas: AlertaGerado[] = [];
    let inseridas = 0;
    let descartadas = 0;

    for (const p of posicoes) {
      const time = p.registrado_em.getTime();
      const ponto: Ponto = { lat: p.lat, lng: p.lng, time };

      // --- Filtro de qualidade (não persiste, não vira alerta, não vira prev) ---
      // Precisão ruim: o círculo de incerteza é grande demais para valer algo.
      if (p.precisao_m != null && p.precisao_m > PRECISAO_MAX_M) {
        descartadas++;
        continue;
      }
      // "Teletransporte": velocidade implícita impossível vs o ponto anterior.
      if (prev && time > prev.time) {
        const velImplicitaKmh = (haversineM(ponto, prev) / ((time - prev.time) / 1000)) * 3.6;
        if (velImplicitaKmh > TELETRANSPORTE_KMH) {
          descartadas++;
          continue;
        }
      }

      await client.query(
        `INSERT INTO posicoes_gps (empresa_id, viagem_id, coordenada, velocidade_kmh, precisao_m, registrado_em)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7)`,
        [
          empresaId,
          viagemId,
          p.lng,
          p.lat,
          p.velocidade_kmh ?? null,
          p.precisao_m ?? null,
          p.registrado_em,
        ],
      );
      inseridas++;

      const candidatos: Array<{ tipo: AlertaTipo; descricao: string }> = [];

      // velocidade_alta
      if (p.velocidade_kmh != null && p.velocidade_kmh > VEL_MAX_KMH) {
        candidatos.push({
          tipo: 'velocidade_alta',
          descricao: `Velocidade de ${p.velocidade_kmh} km/h (limite ${VEL_MAX_KMH})`,
        });
      }

      // sem_gps (gap em relação ao ponto anterior)
      if (prev && time - prev.time > SEM_GPS_GAP_MS) {
        const minutos = Math.round((time - prev.time) / 60000);
        candidatos.push({
          tipo: 'sem_gps',
          descricao: `Sem posição por ~${minutos} min`,
        });
      }

      // desvio_rota
      if (temLinha && viagem.rota_planejada_id) {
        const dist = await client.query<{ dist: number }>(
          `SELECT ST_Distance(linha, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist
           FROM rotas_planejadas WHERE id = $3`,
          [p.lng, p.lat, viagem.rota_planejada_id],
        );
        const d = dist.rows[0]?.dist ?? 0;
        if (d > raioTolerancia) {
          candidatos.push({
            tipo: 'desvio_rota',
            descricao: `Fora da rota em ~${Math.round(d)} m (tolerância ${raioTolerancia} m)`,
          });
        }
      }

      // parada_longa (ancorado no último ponto onde "parou")
      if (stopAnchor == null) {
        stopAnchor = ponto;
        stopEmitido = false;
      } else if (haversineM(ponto, stopAnchor) <= PARADA_RAIO_M) {
        if (!stopEmitido && time - stopAnchor.time >= PARADA_TEMPO_MS) {
          const minutos = Math.round((time - stopAnchor.time) / 60000);
          candidatos.push({
            tipo: 'parada_longa',
            descricao: `Parado por ~${minutos} min`,
          });
          stopEmitido = true;
        }
      } else {
        stopAnchor = ponto;
        stopEmitido = false;
      }

      // Aplica cooldown por tipo e grava os que sobrarem.
      for (const c of candidatos) {
        if (time - ultimoAlerta[c.tipo] >= COOLDOWN_MS) {
          alertas.push(await inserirAlerta(client, empresaId, viagemId, c.tipo, c.descricao, p));
          ultimoAlerta[c.tipo] = time;
        }
      }

      prev = ponto;
    }

    return { inseridas, descartadas, alertas };
  });
}

// Ingestão "sem ID": resolve a viagem em_andamento do próprio motorista e
// delega para ingestPosicoes. Usado por apps de rastreio em 2º plano (GPSLogger),
// que postam numa URL fixa sem saber o id da viagem.
export async function ingestPosicoesViagemAtual(
  empresaId: string,
  motoristaId: string,
  input: IngestPosicoesInput,
): Promise<IngestResult> {
  const viagem = await queryOne<{ id: string }>(
    `SELECT id FROM viagens
     WHERE empresa_id = $1 AND motorista_id = $2 AND status = 'em_andamento'
     ORDER BY iniciada_em DESC NULLS LAST
     LIMIT 1`,
    [empresaId, motoristaId],
  );
  if (!viagem) {
    throw AppError.badRequest(
      'Nenhuma viagem em andamento para este motorista. Inicie uma viagem no dashboard.',
    );
  }
  return ingestPosicoes(empresaId, viagem.id, motoristaId, input);
}

// Adaptador Overland (app iOS de rastreio em 2º plano). Overland posta um
// FeatureCollection GeoJSON ({locations:[{geometry:{coordinates:[lng,lat]},
// properties:{timestamp,horizontal_accuracy,speed}}]}) e não permite header
// Authorization. Convertemos para o nosso formato e gravamos na viagem em_andamento.
interface OverlandFeature {
  geometry?: { coordinates?: number[] };
  properties?: { timestamp?: string; horizontal_accuracy?: number; speed?: number };
}

export async function ingestOverland(
  empresaId: string,
  motoristaId: string,
  body: { locations?: OverlandFeature[] },
): Promise<IngestResult> {
  const feats = Array.isArray(body?.locations) ? body.locations : [];
  const brutas = feats
    .map((f) => {
      const c = f.geometry?.coordinates;
      const ts = f.properties?.timestamp;
      if (!c || c.length < 2 || !ts) return null;
      const p: Record<string, unknown> = { lat: c[1], lng: c[0], registrado_em: ts };
      const acc = f.properties?.horizontal_accuracy;
      if (typeof acc === 'number' && acc >= 0) p.precisao_m = acc;
      const spd = f.properties?.speed;
      if (typeof spd === 'number' && spd >= 0) {
        p.velocidade_kmh = Math.min(999, Math.round(spd * 3.6 * 10) / 10);
      }
      return p;
    })
    .filter((p): p is Record<string, unknown> => p !== null);

  // Overland envia pings sem posições; nesse caso só confirmamos.
  if (brutas.length === 0) return { inseridas: 0, descartadas: 0, alertas: [] };

  const parsed = ingestPosicoesSchema.parse({ posicoes: brutas });
  return ingestPosicoesViagemAtual(empresaId, motoristaId, parsed);
}

// ---------------------------------------------------------------------
// Consultas (dashboard / app)
// ---------------------------------------------------------------------
export interface PontoTrajeto {
  lat: number;
  lng: number;
  velocidade_kmh: number | null;
  precisao_m: number | null;
  registrado_em: string;
  recebido_em: string;
}

// Teto de pontos lidos por trajeto: guarda contra estouro de memória em viagens
// muito longas (a poda/retenção de posicoes_gps é tratada à parte, na etapa LGPD).
const MAX_PONTOS_TRAJETO = 50_000;

export async function getTrajetoria(
  empresaId: string,
  viagemId: string,
): Promise<{
  viagem_id: string;
  total: number;
  pontos: PontoTrajeto[];
  paradas_detectadas: ParadaDetectada[];
}> {
  const existe = await queryOne<{ id: string }>(
    'SELECT id FROM viagens WHERE id = $1 AND empresa_id = $2',
    [viagemId, empresaId],
  );
  if (!existe) throw AppError.notFound('Viagem não encontrada');

  const rows = await query<{
    lat: number;
    lng: number;
    velocidade_kmh: string | null;
    precisao_m: string | null;
    registrado_em: string;
    recebido_em: string;
  }>(
    `SELECT ST_Y(coordenada::geometry) AS lat, ST_X(coordenada::geometry) AS lng,
            velocidade_kmh, precisao_m, registrado_em, recebido_em
     FROM posicoes_gps WHERE viagem_id = $1 AND empresa_id = $2
     ORDER BY registrado_em LIMIT $3`,
    [viagemId, empresaId, MAX_PONTOS_TRAJETO],
  );
  if (rows.length === MAX_PONTOS_TRAJETO) {
    console.warn(
      `[gps] trajeto da viagem ${viagemId} atingiu o teto de ${MAX_PONTOS_TRAJETO} pontos`,
    );
  }

  const pontos: PontoTrajeto[] = rows.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    velocidade_kmh: r.velocidade_kmh === null ? null : Number(r.velocidade_kmh),
    precisao_m: r.precisao_m === null ? null : Number(r.precisao_m),
    registrado_em: r.registrado_em,
    recebido_em: r.recebido_em,
  }));

  // Paradas automáticas: clusters onde o veículo ficou parado 5+ min.
  // Calculado on-read a partir dos próprios pontos (sem tabela nova).
  const paradasDetectadas = detectarParadas(
    pontos.map((p) => ({ lat: p.lat, lng: p.lng, time: new Date(p.registrado_em).getTime() })),
  );

  return {
    viagem_id: viagemId,
    total: pontos.length,
    pontos,
    paradas_detectadas: paradasDetectadas,
  };
}

// ---------------------------------------------------------------------
// Trajeto "nas ruas" (map matching): encaixa o GPS na malha de ruas.
// ---------------------------------------------------------------------
export interface TrajetoRuas {
  viagem_id: string;
  fonte: 'ruas' | 'gps'; // 'ruas' = encaixado; 'gps' = plano B (linha bruta)
  linha: { lng: number; lat: number }[];
}

// Cache simples em memória do trajeto encaixado: evita bater no serviço
// externo a cada poll do dashboard. A chave muda quando chegam pontos novos.
const trajetoRuasCache = new Map<string, { chave: string; expira: number; resultado: TrajetoRuas }>();
const TRAJETO_RUAS_CACHE_MS = 10 * 60 * 1000; // TTL (a chave já invalida por ponto novo)
const TRAJETO_RUAS_CACHE_MAX = 200; // teto de viagens em cache

export async function getTrajetoRuas(empresaId: string, viagemId: string): Promise<TrajetoRuas> {
  const { pontos } = await getTrajetoria(empresaId, viagemId); // já valida a viagem/tenant
  const bruto = pontos.map((p) => ({ lng: p.lng, lat: p.lat }));

  const chave = `${pontos.length}:${pontos[pontos.length - 1]?.registrado_em ?? ''}`;
  const emCache = trajetoRuasCache.get(viagemId);
  if (emCache && emCache.chave === chave && emCache.expira > Date.now()) {
    return emCache.resultado;
  }

  // Plano A: encaixar nas ruas (Valhalla; se falhar, OSRM). Plano B: linha bruta.
  const ruas =
    (await matchTrajeto(bruto)) ??
    (await matchTrajetoOsrm(pontos.map((p) => ({ lat: p.lat, lng: p.lng, precisao_m: p.precisao_m }))));

  const resultado: TrajetoRuas =
    ruas && ruas.length >= 2
      ? { viagem_id: viagemId, fonte: 'ruas', linha: ruas.map(([lng, lat]) => ({ lng, lat })) }
      : { viagem_id: viagemId, fonte: 'gps', linha: bruto };

  // Só vale a pena guardar o resultado "bom" (o fallback tende a ser transitório).
  if (resultado.fonte === 'ruas') {
    if (trajetoRuasCache.size >= TRAJETO_RUAS_CACHE_MAX) trajetoRuasCache.clear();
    trajetoRuasCache.set(viagemId, {
      chave,
      expira: Date.now() + TRAJETO_RUAS_CACHE_MS,
      resultado,
    });
  }
  return resultado;
}

export interface MinhaViagem {
  id: string;
  status: string;
  veiculo_placa: string;
  iniciada_em: string | null;
  criado_em: string;
  paradas_count: number;
}

export async function getMinhasViagens(
  empresaId: string,
  motoristaId: string,
): Promise<MinhaViagem[]> {
  return query<MinhaViagem>(
    `SELECT v.id, v.status, ve.placa AS veiculo_placa, v.iniciada_em, v.criado_em,
            (SELECT COUNT(*)::int FROM paradas WHERE viagem_id = v.id) AS paradas_count
     FROM viagens v
     JOIN veiculos ve ON ve.id = v.veiculo_id
     WHERE v.empresa_id = $1 AND v.motorista_id = $2
     ORDER BY (v.status = 'em_andamento') DESC, v.criado_em DESC`,
    [empresaId, motoristaId],
  );
}
