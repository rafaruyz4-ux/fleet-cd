import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, queryOne, withTransaction } from '../../db/pool';
import type { IngestPosicoesInput, PosicaoInput } from './gps.schemas';

// ---------------------------------------------------------------------
// Limiares de detecção (constantes; podem virar configuráveis depois).
// ---------------------------------------------------------------------
const VEL_MAX_KMH = 110; // acima disso → velocidade_alta
const SEM_GPS_GAP_MS = 10 * 60 * 1000; // intervalo entre pontos → sem_gps
const PARADA_RAIO_M = 50; // raio para considerar "parado"
const PARADA_TEMPO_MS = 15 * 60 * 1000; // parado por mais que isso → parada_longa
const COOLDOWN_MS = 5 * 60 * 1000; // janela mínima entre alertas do mesmo tipo

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
  alertas: AlertaGerado[];
}

interface Ponto {
  lat: number;
  lng: number;
  time: number; // epoch ms de registrado_em
}

// Distância aproximada em metros entre dois pontos (haversine).
function distanciaM(a: Ponto, b: Ponto): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function inserirAlerta(
  client: PoolClient,
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
    `INSERT INTO alertas (viagem_id, tipo, descricao, coordenada)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
     RETURNING id, viagem_id, tipo, descricao,
               ST_Y(coordenada::geometry) AS lat,
               ST_X(coordenada::geometry) AS lng,
               criado_em, visualizado`,
    [viagemId, tipo, descricao, ponto.lng, ponto.lat],
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
  viagemId: string,
  motoristaId: string,
  input: IngestPosicoesInput,
): Promise<IngestResult> {
  return withTransaction(async (client) => {
    const viagemRows = await client.query<{
      motorista_id: string;
      status: string;
      rota_planejada_id: string | null;
    }>('SELECT motorista_id, status, rota_planejada_id FROM viagens WHERE id = $1', [viagemId]);
    const viagem = viagemRows.rows[0];
    if (!viagem) throw AppError.notFound('Viagem não encontrada');
    if (viagem.motorista_id !== motoristaId) {
      throw AppError.forbidden('Esta viagem não pertence ao motorista autenticado');
    }
    if (viagem.status !== 'em_andamento') {
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

    for (const p of posicoes) {
      const time = p.registrado_em.getTime();
      const ponto: Ponto = { lat: p.lat, lng: p.lng, time };

      await client.query(
        `INSERT INTO posicoes_gps (viagem_id, coordenada, velocidade_kmh, precisao_m, registrado_em)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6)`,
        [viagemId, p.lng, p.lat, p.velocidade_kmh ?? null, p.precisao_m ?? null, p.registrado_em],
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
      } else if (distanciaM(ponto, stopAnchor) <= PARADA_RAIO_M) {
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
          alertas.push(await inserirAlerta(client, viagemId, c.tipo, c.descricao, p));
          ultimoAlerta[c.tipo] = time;
        }
      }

      prev = ponto;
    }

    return { inseridas, alertas };
  });
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

export async function getTrajetoria(
  viagemId: string,
): Promise<{ viagem_id: string; total: number; pontos: PontoTrajeto[] }> {
  const existe = await queryOne<{ id: string }>('SELECT id FROM viagens WHERE id = $1', [viagemId]);
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
     FROM posicoes_gps WHERE viagem_id = $1 ORDER BY registrado_em`,
    [viagemId],
  );

  const pontos: PontoTrajeto[] = rows.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    velocidade_kmh: r.velocidade_kmh === null ? null : Number(r.velocidade_kmh),
    precisao_m: r.precisao_m === null ? null : Number(r.precisao_m),
    registrado_em: r.registrado_em,
    recebido_em: r.recebido_em,
  }));

  return { viagem_id: viagemId, total: pontos.length, pontos };
}

export interface MinhaViagem {
  id: string;
  status: string;
  veiculo_placa: string;
  iniciada_em: string | null;
  criado_em: string;
  paradas_count: number;
}

export async function getMinhasViagens(motoristaId: string): Promise<MinhaViagem[]> {
  return query<MinhaViagem>(
    `SELECT v.id, v.status, ve.placa AS veiculo_placa, v.iniciada_em, v.criado_em,
            (SELECT COUNT(*)::int FROM paradas WHERE viagem_id = v.id) AS paradas_count
     FROM viagens v
     JOIN veiculos ve ON ve.id = v.veiculo_id
     WHERE v.motorista_id = $1
     ORDER BY (v.status = 'em_andamento') DESC, v.criado_em DESC`,
    [motoristaId],
  );
}
