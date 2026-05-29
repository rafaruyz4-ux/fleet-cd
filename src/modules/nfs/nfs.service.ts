import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, queryOne, withTransaction } from '../../db/pool';
import type {
  CreateNfInput,
  ItemNfInput,
  ListNfsQuery,
  UpdateNfInput,
} from './nfs.schemas';

// Extrai lat/lng do GEOGRAPHY como colunas planas (mesmo padrão de unidades).
const SELECT_COLS = `
  id, chave_acesso, numero, serie, cfop, emitida_em,
  destinatario_cnpj, destinatario_nome, destinatario_endereco,
  unidade_propria_id,
  ST_Y(coordenada::geometry) AS lat,
  ST_X(coordenada::geometry) AS lng,
  valor_total, peso_kg, xml_path, status, criado_em, updated_at
`;

interface NfRow {
  id: string;
  chave_acesso: string;
  numero: string | null;
  serie: string | null;
  cfop: string | null;
  emitida_em: string | null;
  destinatario_cnpj: string | null;
  destinatario_nome: string | null;
  destinatario_endereco: string | null;
  unidade_propria_id: string | null;
  lat: number | null;
  lng: number | null;
  valor_total: string | null;
  peso_kg: string | null;
  xml_path: string | null;
  status: string;
  criado_em: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  codigo: string | null;
  descricao: string | null;
  quantidade: string | null;
  unidade: string | null;
  valor_unitario: string | null;
}

export interface ItemNf {
  id: string;
  codigo: string | null;
  descricao: string | null;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario: number | null;
}

export interface Nf {
  id: string;
  chave_acesso: string;
  numero: string | null;
  serie: string | null;
  cfop: string | null;
  emitida_em: string | null;
  destinatario_cnpj: string | null;
  destinatario_nome: string | null;
  destinatario_endereco: string | null;
  unidade_propria_id: string | null;
  coordenada: { lat: number; lng: number } | null;
  valor_total: number | null;
  peso_kg: number | null;
  xml_path: string | null;
  status: string;
  criado_em: string;
  updated_at: string;
  itens?: ItemNf[];
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

function toNf(row: NfRow): Nf {
  const { lat, lng, valor_total, peso_kg, ...rest } = row;
  return {
    ...rest,
    coordenada: lat !== null && lng !== null ? { lat, lng } : null,
    valor_total: num(valor_total),
    peso_kg: num(peso_kg),
  };
}

function toItem(row: ItemRow): ItemNf {
  return {
    ...row,
    quantidade: num(row.quantidade),
    valor_unitario: num(row.valor_unitario),
  };
}

// SRID 4326 = WGS84; ST_MakePoint recebe (X=lng, Y=lat).
const pointExpr = (lngIdx: number, latIdx: number) =>
  `ST_SetSRID(ST_MakePoint($${lngIdx}, $${latIdx}), 4326)::geography`;

export interface ListNfsResult {
  data: Nf[];
  total: number;
  limit: number;
  offset: number;
}

export async function list(q: ListNfsQuery): Promise<ListNfsResult> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (q.status) {
    where.push(`status = $${i++}`);
    values.push(q.status);
  }
  if (q.destinatario_cnpj) {
    where.push(`destinatario_cnpj = $${i++}`);
    values.push(q.destinatario_cnpj);
  }
  if (q.unidade_propria_id) {
    where.push(`unidade_propria_id = $${i++}`);
    values.push(q.unidade_propria_id);
  }
  if (q.de) {
    where.push(`emitida_em >= $${i++}`);
    values.push(q.de);
  }
  if (q.ate) {
    where.push(`emitida_em <= $${i++}`);
    values.push(q.ate);
  }
  if (q.busca) {
    where.push(`(numero ILIKE $${i} OR destinatario_nome ILIKE $${i})`);
    values.push(`%${q.busca}%`);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::int AS total FROM notas_fiscais ${whereSql}`,
    values,
  );

  const rows = await query<NfRow>(
    `SELECT ${SELECT_COLS} FROM notas_fiscais ${whereSql}
     ORDER BY emitida_em DESC NULLS LAST, criado_em DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...values, q.limit, q.offset],
  );

  return {
    data: rows.map(toNf),
    total: Number(totalRow?.total ?? 0),
    limit: q.limit,
    offset: q.offset,
  };
}

const ITENS_SQL = `SELECT id, codigo, descricao, quantidade, unidade, valor_unitario
     FROM itens_nf WHERE nf_id = $1 ORDER BY id`;

async function fetchItens(nfId: string): Promise<ItemNf[]> {
  const rows = await query<ItemRow>(ITENS_SQL, [nfId]);
  return rows.map(toItem);
}

// Versão para uso DENTRO de uma transação: lê via o mesmo client, enxergando
// as inserções ainda não commitadas (o pool veria o estado antigo).
async function fetchItensTx(client: PoolClient, nfId: string): Promise<ItemNf[]> {
  const result = await client.query<ItemRow>(ITENS_SQL, [nfId]);
  return result.rows.map(toItem);
}

export async function getById(id: string): Promise<Nf> {
  const row = await queryOne<NfRow>(
    `SELECT ${SELECT_COLS} FROM notas_fiscais WHERE id = $1`,
    [id],
  );
  if (!row) {
    throw AppError.notFound('Nota fiscal não encontrada');
  }
  const nf = toNf(row);
  nf.itens = await fetchItens(id);
  return nf;
}

async function insertItens(
  client: PoolClient,
  nfId: string,
  itens: ItemNfInput[],
): Promise<void> {
  for (const item of itens) {
    await client.query(
      `INSERT INTO itens_nf (nf_id, codigo, descricao, quantidade, unidade, valor_unitario)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        nfId,
        item.codigo ?? null,
        item.descricao ?? null,
        item.quantidade ?? null,
        item.unidade ?? null,
        item.valor_unitario ?? null,
      ],
    );
  }
}

export async function create(input: CreateNfInput): Promise<Nf> {
  const values: unknown[] = [
    input.chave_acesso,
    input.numero ?? null,
    input.serie ?? null,
    input.cfop ?? null,
    input.emitida_em ?? null,
    input.destinatario_cnpj ?? null,
    input.destinatario_nome ?? null,
    input.destinatario_endereco ?? null,
    input.unidade_propria_id ?? null,
    input.valor_total ?? null,
    input.peso_kg ?? null,
    input.xml_path ?? null,
    input.status ?? null,
  ];

  let coordExpr = 'NULL';
  if (input.coordenada) {
    values.push(input.coordenada.lng, input.coordenada.lat);
    coordExpr = pointExpr(values.length - 1, values.length);
  }

  try {
    return await withTransaction(async (client) => {
      const result = await client.query<NfRow>(
        `INSERT INTO notas_fiscais
           (chave_acesso, numero, serie, cfop, emitida_em,
            destinatario_cnpj, destinatario_nome, destinatario_endereco,
            unidade_propria_id, valor_total, peso_kg, xml_path,
            status, coordenada)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 COALESCE($13, 'importada'), ${coordExpr})
         RETURNING ${SELECT_COLS}`,
        values,
      );
      const nf = toNf(result.rows[0]!);
      if (input.itens?.length) {
        await insertItens(client, nf.id, input.itens);
        nf.itens = await fetchItensTx(client, nf.id);
      } else {
        nf.itens = [];
      }
      return nf;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw AppError.conflict('Já existe uma NF com esta chave de acesso');
    }
    throw err;
  }
}

export async function update(id: string, input: UpdateNfInput): Promise<Nf> {
  await getById(id);

  return withTransaction(async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const assign = (expr: string, value: unknown) => {
      values.push(value);
      sets.push(`${expr} = $${i++}`);
    };

    if (input.numero !== undefined) assign('numero', input.numero ?? null);
    if (input.serie !== undefined) assign('serie', input.serie ?? null);
    if (input.cfop !== undefined) assign('cfop', input.cfop ?? null);
    if (input.emitida_em !== undefined) assign('emitida_em', input.emitida_em ?? null);
    if (input.destinatario_cnpj !== undefined)
      assign('destinatario_cnpj', input.destinatario_cnpj ?? null);
    if (input.destinatario_nome !== undefined)
      assign('destinatario_nome', input.destinatario_nome ?? null);
    if (input.destinatario_endereco !== undefined)
      assign('destinatario_endereco', input.destinatario_endereco ?? null);
    if (input.unidade_propria_id !== undefined)
      assign('unidade_propria_id', input.unidade_propria_id ?? null);
    if (input.valor_total !== undefined) assign('valor_total', input.valor_total ?? null);
    if (input.peso_kg !== undefined) assign('peso_kg', input.peso_kg ?? null);
    if (input.xml_path !== undefined) assign('xml_path', input.xml_path ?? null);
    if (input.status !== undefined) assign('status', input.status);
    if (input.coordenada !== undefined) {
      if (input.coordenada === null) {
        sets.push('coordenada = NULL');
      } else {
        values.push(input.coordenada.lng);
        const lngIdx = i++;
        values.push(input.coordenada.lat);
        const latIdx = i++;
        sets.push(`coordenada = ${pointExpr(lngIdx, latIdx)}`);
      }
    }

    if (sets.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE notas_fiscais SET ${sets.join(', ')} WHERE id = $${i}`,
        values,
      );
    }

    // itens enviados substituem por completo o conjunto atual.
    if (input.itens !== undefined) {
      await client.query('DELETE FROM itens_nf WHERE nf_id = $1', [id]);
      if (input.itens.length) {
        await insertItens(client, id, input.itens);
      }
    }

    const row = await client.query<NfRow>(
      `SELECT ${SELECT_COLS} FROM notas_fiscais WHERE id = $1`,
      [id],
    );
    const nf = toNf(row.rows[0]!);
    nf.itens = await fetchItensTx(client, id);
    return nf;
  });
}

export async function remove(id: string): Promise<void> {
  // Hard delete: itens_nf cai por CASCADE; paradas ficam com nf_id = NULL.
  const row = await queryOne<{ id: string }>(
    'DELETE FROM notas_fiscais WHERE id = $1 RETURNING id',
    [id],
  );
  if (!row) {
    throw AppError.notFound('Nota fiscal não encontrada');
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
