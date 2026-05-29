import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import type { ListAlertasQuery } from './alertas.schemas';

interface AlertaRow {
  id: string;
  viagem_id: string | null;
  tipo: string;
  descricao: string | null;
  lat: number | null;
  lng: number | null;
  criado_em: string;
  visualizado: boolean;
}

export interface Alerta {
  id: string;
  viagem_id: string | null;
  tipo: string;
  descricao: string | null;
  coordenada: { lat: number; lng: number } | null;
  criado_em: string;
  visualizado: boolean;
}

const SELECT_COLS = `
  id, viagem_id, tipo, descricao,
  ST_Y(coordenada::geometry) AS lat,
  ST_X(coordenada::geometry) AS lng,
  criado_em, visualizado
`;

function toAlerta(row: AlertaRow): Alerta {
  const { lat, lng, ...rest } = row;
  return {
    ...rest,
    coordenada: lat !== null && lng !== null ? { lat, lng } : null,
  };
}

export interface ListAlertasResult {
  data: Alerta[];
  total: number;
  limit: number;
  offset: number;
}

export async function list(q: ListAlertasQuery): Promise<ListAlertasResult> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (q.visualizado !== undefined) {
    where.push(`visualizado = $${i++}`);
    values.push(q.visualizado);
  }
  if (q.tipo) {
    where.push(`tipo = $${i++}`);
    values.push(q.tipo);
  }
  if (q.viagem_id) {
    where.push(`viagem_id = $${i++}`);
    values.push(q.viagem_id);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM alertas ${whereSql}`,
    values,
  );

  const rows = await query<AlertaRow>(
    `SELECT ${SELECT_COLS} FROM alertas ${whereSql}
     ORDER BY criado_em DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...values, q.limit, q.offset],
  );

  return {
    data: rows.map(toAlerta),
    total: Number(totalRow?.total ?? 0),
    limit: q.limit,
    offset: q.offset,
  };
}

export async function listByViagem(viagemId: string): Promise<Alerta[]> {
  const rows = await query<AlertaRow>(
    `SELECT ${SELECT_COLS} FROM alertas WHERE viagem_id = $1 ORDER BY criado_em DESC`,
    [viagemId],
  );
  return rows.map(toAlerta);
}

export async function marcarVisualizado(id: string, visualizado: boolean): Promise<Alerta> {
  const row = await queryOne<AlertaRow>(
    `UPDATE alertas SET visualizado = $1 WHERE id = $2 RETURNING ${SELECT_COLS}`,
    [visualizado, id],
  );
  if (!row) throw AppError.notFound('Alerta não encontrado');
  return toAlerta(row);
}
