import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import type { CreateRotaInput, UpdateRotaInput } from './rotas.schemas';

interface LineStringGeoJSON {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
}

interface RotaRow {
  id: string;
  tipo: string;
  nome: string | null;
  raio_tolerancia_m: number;
  duracao_estimada_min: number | null;
  linha_geojson: LineStringGeoJSON | null;
  criado_em: string;
  updated_at: string;
}

export interface Rota {
  id: string;
  tipo: string;
  nome: string | null;
  raio_tolerancia_m: number;
  duracao_estimada_min: number | null;
  linha: { lat: number; lng: number }[] | null;
  criado_em: string;
  updated_at: string;
}

const SELECT_COLS = `
  id, tipo, nome, raio_tolerancia_m, duracao_estimada_min,
  ST_AsGeoJSON(linha)::json AS linha_geojson,
  criado_em, updated_at
`;

function toRota(row: RotaRow): Rota {
  const { linha_geojson, ...rest } = row;
  return {
    ...rest,
    linha:
      linha_geojson?.coordinates.map(([lng, lat]) => ({ lat, lng })) ?? null,
  };
}

// Constrói o WKT (com SRID) de uma LINESTRING a partir dos pontos validados.
// Os números já passaram pelo Zod, então não há risco de injeção.
function toLinestringWkt(linha: { lat: number; lng: number }[]): string {
  const pts = linha.map((p) => `${p.lng} ${p.lat}`).join(', ');
  return `SRID=4326;LINESTRING(${pts})`;
}

export async function list(empresaId: string): Promise<Rota[]> {
  const rows = await query<RotaRow>(
    `SELECT ${SELECT_COLS} FROM rotas_planejadas WHERE empresa_id = $1 ORDER BY nome NULLS LAST, criado_em DESC`,
    [empresaId],
  );
  return rows.map(toRota);
}

export async function getById(empresaId: string, id: string): Promise<Rota> {
  const row = await queryOne<RotaRow>(
    `SELECT ${SELECT_COLS} FROM rotas_planejadas WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId],
  );
  if (!row) throw AppError.notFound('Rota não encontrada');
  return toRota(row);
}

export async function create(empresaId: string, input: CreateRotaInput): Promise<Rota> {
  const wkt = input.linha ? toLinestringWkt(input.linha) : null;
  const row = await queryOne<RotaRow>(
    `INSERT INTO rotas_planejadas (empresa_id, tipo, nome, raio_tolerancia_m, duracao_estimada_min, linha)
     VALUES ($1, $2, $3, COALESCE($4, 200), $5,
             CASE WHEN $6::text IS NULL THEN NULL ELSE ST_GeogFromText($6) END)
     RETURNING ${SELECT_COLS}`,
    [
      empresaId,
      input.tipo,
      input.nome ?? null,
      input.raio_tolerancia_m ?? null,
      input.duracao_estimada_min ?? null,
      wkt,
    ],
  );
  return toRota(row!);
}

export async function update(empresaId: string, id: string, input: UpdateRotaInput): Promise<Rota> {
  await getById(empresaId, id);

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const assign = (expr: string, value: unknown) => {
    values.push(value);
    sets.push(`${expr} = $${i++}`);
  };

  if (input.tipo !== undefined) assign('tipo', input.tipo);
  if (input.nome !== undefined) assign('nome', input.nome);
  if (input.raio_tolerancia_m !== undefined) assign('raio_tolerancia_m', input.raio_tolerancia_m);
  if (input.duracao_estimada_min !== undefined)
    assign('duracao_estimada_min', input.duracao_estimada_min);
  if (input.linha !== undefined) {
    values.push(input.linha ? toLinestringWkt(input.linha) : null);
    sets.push(
      `linha = CASE WHEN $${i}::text IS NULL THEN NULL ELSE ST_GeogFromText($${i}) END`,
    );
    i++;
  }

  if (sets.length === 0) return getById(empresaId, id);

  values.push(id, empresaId);
  const row = await queryOne<RotaRow>(
    `UPDATE rotas_planejadas SET ${sets.join(', ')} WHERE id = $${i} AND empresa_id = $${i + 1} RETURNING ${SELECT_COLS}`,
    values,
  );
  return toRota(row!);
}

export async function remove(empresaId: string, id: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'DELETE FROM rotas_planejadas WHERE id = $1 AND empresa_id = $2 RETURNING id',
    [id, empresaId],
  );
  if (!row) throw AppError.notFound('Rota não encontrada');
}
