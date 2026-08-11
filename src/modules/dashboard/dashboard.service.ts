import { query } from '../../db/pool';

// Mapa da frota (dashboard do gestor): a última posição conhecida de cada
// viagem em andamento da empresa. O CONTRATO desta resposta é consumido pelo
// frontend do mapa — não mude os nomes/formatos dos campos.

export interface VeiculoNoMapa {
  veiculo_id: string;
  placa: string;
  viagem_id: string;
  motorista_nome: string;
  lat: number;
  lng: number;
  velocidade_kmh: number | null;
  registrado_em: string; // ISO
}

export interface FrotaMapa {
  veiculos: VeiculoNoMapa[];
}

interface FrotaMapaRow {
  veiculo_id: string;
  placa: string;
  viagem_id: string;
  motorista_nome: string;
  lat: number;
  lng: number;
  velocidade_kmh: string | null; // NUMERIC vem como string do pg
  registrado_em: string;
}

/**
 * Última posição de cada viagem em_andamento da empresa, numa query só
 * (DISTINCT ON + índice único (viagem_id, registrado_em) — sem N+1).
 * Viagem sem nenhuma posição fica de fora (o JOIN é inner de propósito).
 */
export async function frotaMapa(empresaId: string): Promise<FrotaMapa> {
  const rows = await query<FrotaMapaRow>(
    `SELECT DISTINCT ON (v.id)
            v.veiculo_id,
            ve.placa,
            v.id AS viagem_id,
            m.nome AS motorista_nome,
            ST_Y(p.coordenada::geometry) AS lat,
            ST_X(p.coordenada::geometry) AS lng,
            p.velocidade_kmh,
            p.registrado_em
       FROM viagens v
       JOIN veiculos ve ON ve.id = v.veiculo_id
       JOIN motoristas m ON m.id = v.motorista_id
       JOIN posicoes_gps p ON p.viagem_id = v.id
      WHERE v.empresa_id = $1
        AND v.status = 'em_andamento'
      ORDER BY v.id, p.registrado_em DESC`,
    [empresaId],
  );

  return {
    veiculos: rows.map((r) => ({
      veiculo_id: r.veiculo_id,
      placa: r.placa,
      viagem_id: r.viagem_id,
      motorista_nome: r.motorista_nome,
      lat: r.lat,
      lng: r.lng,
      velocidade_kmh: r.velocidade_kmh === null ? null : Number(r.velocidade_kmh),
      registrado_em: new Date(r.registrado_em).toISOString(),
    })),
  };
}
