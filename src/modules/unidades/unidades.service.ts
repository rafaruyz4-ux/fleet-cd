import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import type { CreateUnidadeInput, UpdateUnidadeInput } from './unidades.schemas';

// Extrai lat/lng do GEOGRAPHY como colunas planas no SELECT.
const SELECT_COLS = `
  id, nome, cnpj, endereco,
  ST_Y(coordenada::geometry) AS lat,
  ST_X(coordenada::geometry) AS lng,
  janela_recebimento, ativo, criado_em, updated_at
`;

interface UnidadeRow {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  janela_recebimento: Record<string, string[]> | null;
  ativo: boolean;
  criado_em: string;
  updated_at: string;
}

export interface Unidade {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  coordenada: { lat: number; lng: number } | null;
  janela_recebimento: Record<string, string[]> | null;
  ativo: boolean;
  criado_em: string;
  updated_at: string;
}

function toUnidade(row: UnidadeRow): Unidade {
  const { lat, lng, ...rest } = row;
  return {
    ...rest,
    coordenada: lat !== null && lng !== null ? { lat, lng } : null,
  };
}

export async function list(): Promise<Unidade[]> {
  const rows = await query<UnidadeRow>(
    `SELECT ${SELECT_COLS} FROM unidades_proprias ORDER BY nome`,
  );
  return rows.map(toUnidade);
}

export async function getById(id: string): Promise<Unidade> {
  const row = await queryOne<UnidadeRow>(
    `SELECT ${SELECT_COLS} FROM unidades_proprias WHERE id = $1`,
    [id],
  );
  if (!row) {
    throw AppError.notFound('Unidade não encontrada');
  }
  return toUnidade(row);
}

// SRID 4326 = WGS84 (lat/lng). ST_MakePoint recebe (X=lng, Y=lat).
const POINT_EXPR = 'ST_SetSRID(ST_MakePoint($LNG, $LAT), 4326)::geography';

export async function create(input: CreateUnidadeInput): Promise<Unidade> {
  const values: unknown[] = [
    input.nome,
    input.cnpj ?? null,
    input.endereco ?? null,
    input.janela_recebimento ? JSON.stringify(input.janela_recebimento) : null,
    input.ativo ?? null,
  ];

  let coordExpr = 'NULL';
  if (input.coordenada) {
    values.push(input.coordenada.lng, input.coordenada.lat);
    coordExpr = POINT_EXPR.replace('$LNG', `$${values.length - 1}`).replace(
      '$LAT',
      `$${values.length}`,
    );
  }

  const row = await queryOne<UnidadeRow>(
    `INSERT INTO unidades_proprias (nome, cnpj, endereco, janela_recebimento, ativo, coordenada)
     VALUES ($1, $2, $3, $4, COALESCE($5, TRUE), ${coordExpr})
     RETURNING ${SELECT_COLS}`,
    values,
  );
  return toUnidade(row!);
}

export async function update(id: string, input: UpdateUnidadeInput): Promise<Unidade> {
  await getById(id);

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const assign = (expr: string, value: unknown) => {
    values.push(value);
    sets.push(`${expr} = $${i++}`);
  };

  if (input.nome !== undefined) assign('nome', input.nome);
  if (input.cnpj !== undefined) assign('cnpj', input.cnpj);
  if (input.endereco !== undefined) assign('endereco', input.endereco);
  if (input.ativo !== undefined) assign('ativo', input.ativo);
  if (input.janela_recebimento !== undefined) {
    assign('janela_recebimento', JSON.stringify(input.janela_recebimento));
  }
  if (input.coordenada !== undefined) {
    values.push(input.coordenada.lng);
    const lngIdx = i++;
    values.push(input.coordenada.lat);
    const latIdx = i++;
    sets.push(
      `coordenada = ST_SetSRID(ST_MakePoint($${lngIdx}, $${latIdx}), 4326)::geography`,
    );
  }

  if (sets.length === 0) {
    return getById(id);
  }

  values.push(id);
  const row = await queryOne<UnidadeRow>(
    `UPDATE unidades_proprias SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${SELECT_COLS}`,
    values,
  );
  return toUnidade(row!);
}

export async function remove(id: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'UPDATE unidades_proprias SET ativo = FALSE WHERE id = $1 RETURNING id',
    [id],
  );
  if (!row) {
    throw AppError.notFound('Unidade não encontrada');
  }
}
