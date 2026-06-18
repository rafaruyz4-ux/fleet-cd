import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, queryOne, withTransaction } from '../../db/pool';
import type { CreateMultaInput, ListMultasQuery, UpdateMultaInput } from './multas.schemas';

interface MultaRow {
  id: string;
  viagem_id: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  ocorrida_em: string | null;
  tipo: string | null;
  valor: string | null;
  pontos_cnh: number | null;
  local: string | null;
  lat: number | null;
  lng: number | null;
  numero_auto: string | null;
  fonte: string;
  status_pagamento: string;
  status_revisao: string;
  criado_em: string;
  updated_at: string;
  veiculo_placa: string | null;
  motorista_nome: string | null;
}

export interface Multa {
  id: string;
  viagem_id: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  ocorrida_em: string | null;
  tipo: string | null;
  valor: number | null;
  pontos_cnh: number | null;
  local: string | null;
  coordenada: { lat: number; lng: number } | null;
  numero_auto: string | null;
  fonte: string;
  status_pagamento: string;
  status_revisao: string;
  criado_em: string;
  updated_at: string;
  veiculo_placa: string | null;
  motorista_nome: string | null;
}

const SELECT_COLS = `
  m.id, m.viagem_id, m.veiculo_id, m.motorista_id, m.ocorrida_em, m.tipo,
  m.valor, m.pontos_cnh, m.local,
  ST_Y(m.coordenada::geometry) AS lat,
  ST_X(m.coordenada::geometry) AS lng,
  m.numero_auto, m.fonte, m.status_pagamento, m.status_revisao,
  m.criado_em, m.updated_at,
  ve.placa AS veiculo_placa, mo.nome AS motorista_nome
`;
const FROM = `
  FROM multas m
  LEFT JOIN veiculos ve ON ve.id = m.veiculo_id
  LEFT JOIN motoristas mo ON mo.id = m.motorista_id
`;

function toMulta(row: MultaRow): Multa {
  const { lat, lng, valor, ...rest } = row;
  return {
    ...rest,
    valor: valor === null ? null : Number(valor),
    coordenada: lat !== null && lng !== null ? { lat, lng } : null,
  };
}

export async function getById(empresaId: string, id: string): Promise<Multa> {
  const row = await queryOne<MultaRow>(
    `SELECT ${SELECT_COLS} ${FROM} WHERE m.id = $1 AND m.empresa_id = $2`,
    [id, empresaId],
  );
  if (!row) throw AppError.notFound('Multa não encontrada');
  return toMulta(row);
}

export interface ListMultasResult {
  data: Multa[];
  total: number;
  limit: number;
  offset: number;
}

export async function list(empresaId: string, q: ListMultasQuery): Promise<ListMultasResult> {
  const where: string[] = ['m.empresa_id = $1'];
  const values: unknown[] = [empresaId];
  let i = 2;

  if (q.status_pagamento) {
    where.push(`m.status_pagamento = $${i++}`);
    values.push(q.status_pagamento);
  }
  if (q.status_revisao) {
    where.push(`m.status_revisao = $${i++}`);
    values.push(q.status_revisao);
  }
  if (q.fonte) {
    where.push(`m.fonte = $${i++}`);
    values.push(q.fonte);
  }
  if (q.veiculo_id) {
    where.push(`m.veiculo_id = $${i++}`);
    values.push(q.veiculo_id);
  }
  if (q.motorista_id) {
    where.push(`m.motorista_id = $${i++}`);
    values.push(q.motorista_id);
  }
  if (q.de) {
    where.push(`m.ocorrida_em >= $${i++}`);
    values.push(q.de);
  }
  if (q.ate) {
    where.push(`m.ocorrida_em <= $${i++}`);
    values.push(q.ate);
  }
  if (q.busca) {
    where.push(`(m.numero_auto ILIKE $${i} OR m.tipo ILIKE $${i})`);
    values.push(`%${q.busca}%`);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total ${FROM} ${whereSql}`,
    values,
  );

  const rows = await query<MultaRow>(
    `SELECT ${SELECT_COLS} ${FROM} ${whereSql}
     ORDER BY m.ocorrida_em DESC NULLS LAST, m.criado_em DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...values, q.limit, q.offset],
  );

  return {
    data: rows.map(toMulta),
    total: Number(totalRow?.total ?? 0),
    limit: q.limit,
    offset: q.offset,
  };
}

// Acha a viagem que estava em curso para o veículo no instante da infração.
// Usa o índice idx_viagens_periodo (veiculo_id, iniciada_em, encerrada_em).
async function acharViagemNoPeriodo(
  client: PoolClient,
  empresaId: string,
  veiculoId: string,
  ocorridaEm: Date,
): Promise<{ id: string; motorista_id: string } | null> {
  const result = await client.query<{ id: string; motorista_id: string }>(
    `SELECT id, motorista_id FROM viagens
     WHERE empresa_id = $1
       AND veiculo_id = $2
       AND status <> 'cancelada'
       AND iniciada_em IS NOT NULL
       AND iniciada_em <= $3
       AND (encerrada_em IS NULL OR encerrada_em >= $3)
     ORDER BY iniciada_em DESC
     LIMIT 1`,
    [empresaId, veiculoId, ocorridaEm],
  );
  return result.rows[0] ?? null;
}

// Resolve o veículo (por id ou placa) garantindo que pertence à empresa —
// impede vincular uma multa a um veículo de outro cliente.
async function resolverVeiculoId(
  client: PoolClient,
  empresaId: string,
  veiculoId: string | undefined,
  placa: string | undefined,
): Promise<string | null> {
  if (veiculoId) {
    const row = await client.query<{ id: string }>(
      'SELECT id FROM veiculos WHERE id = $1 AND empresa_id = $2',
      [veiculoId, empresaId],
    );
    if (!row.rows[0]) throw AppError.badRequest('Veículo não encontrado');
    return row.rows[0].id;
  }
  if (!placa) return null;
  const norm = placa.toUpperCase().replace(/-/g, '');
  const row = await client.query<{ id: string }>(
    'SELECT id FROM veiculos WHERE placa = $1 AND empresa_id = $2',
    [norm, empresaId],
  );
  if (!row.rows[0]) throw AppError.badRequest(`Veículo de placa ${norm} não encontrado`);
  return row.rows[0].id;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}

export async function create(empresaId: string, input: CreateMultaInput): Promise<Multa> {
  try {
    const id = await withTransaction(async (client) => {
      const veiculoId = await resolverVeiculoId(client, empresaId, input.veiculo_id, input.placa);

      // Vínculo automático: só roda com veículo + instante da infração.
      let viagemId: string | null = null;
      let motoristaId: string | null = input.motorista_id ?? null;
      let statusRevisao: 'auto_vinculada' | 'aguardando_revisao' = 'aguardando_revisao';

      if (veiculoId && input.ocorrida_em) {
        const viagem = await acharViagemNoPeriodo(client, empresaId, veiculoId, input.ocorrida_em);
        if (viagem) {
          viagemId = viagem.id;
          motoristaId = input.motorista_id ?? viagem.motorista_id;
          statusRevisao = 'auto_vinculada';
        }
      }

      const values: unknown[] = [
        empresaId,
        input.numero_auto,
        veiculoId,
        motoristaId,
        viagemId,
        input.ocorrida_em ?? null,
        input.tipo ?? null,
        input.valor ?? null,
        input.pontos_cnh ?? null,
        input.local ?? null,
        input.fonte,
        input.status_pagamento ?? null,
        statusRevisao,
      ];

      let coordExpr = 'NULL';
      if (input.coordenada) {
        values.push(input.coordenada.lng, input.coordenada.lat);
        coordExpr = `ST_SetSRID(ST_MakePoint($${values.length - 1}, $${values.length}), 4326)::geography`;
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO multas
           (empresa_id, numero_auto, veiculo_id, motorista_id, viagem_id, ocorrida_em, tipo,
            valor, pontos_cnh, local, fonte, status_pagamento, status_revisao, coordenada)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 COALESCE($12, 'pendente'), $13, ${coordExpr})
         RETURNING id`,
        values,
      );
      return inserted.rows[0]!.id;
    });
    return getById(empresaId, id);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw AppError.conflict('Já existe uma multa com este número de auto');
    }
    throw err;
  }
}

export async function update(empresaId: string, id: string, input: UpdateMultaInput): Promise<Multa> {
  await getById(empresaId, id);

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const assign = (expr: string, value: unknown) => {
    values.push(value);
    sets.push(`${expr} = $${i++}`);
  };

  if (input.veiculo_id !== undefined) assign('veiculo_id', input.veiculo_id);
  if (input.motorista_id !== undefined) assign('motorista_id', input.motorista_id);
  if (input.viagem_id !== undefined) assign('viagem_id', input.viagem_id);
  if (input.ocorrida_em !== undefined) assign('ocorrida_em', input.ocorrida_em);
  if (input.tipo !== undefined) assign('tipo', input.tipo);
  if (input.valor !== undefined) assign('valor', input.valor);
  if (input.pontos_cnh !== undefined) assign('pontos_cnh', input.pontos_cnh);
  if (input.local !== undefined) assign('local', input.local);
  if (input.status_pagamento !== undefined) assign('status_pagamento', input.status_pagamento);
  if (input.status_revisao !== undefined) assign('status_revisao', input.status_revisao);
  if (input.coordenada !== undefined) {
    if (input.coordenada === null) {
      sets.push('coordenada = NULL');
    } else {
      values.push(input.coordenada.lng);
      const lngIdx = i++;
      values.push(input.coordenada.lat);
      const latIdx = i++;
      sets.push(`coordenada = ST_SetSRID(ST_MakePoint($${lngIdx}, $${latIdx}), 4326)::geography`);
    }
  }

  if (sets.length === 0) return getById(empresaId, id);

  values.push(id, empresaId);
  await queryOne(`UPDATE multas SET ${sets.join(', ')} WHERE id = $${i} AND empresa_id = $${i + 1}`, values);
  return getById(empresaId, id);
}

// Re-roda o vínculo automático (útil após corrigir ocorrida_em/veículo ou
// cadastrar a viagem depois da multa).
export async function revincular(empresaId: string, id: string): Promise<Multa> {
  await withTransaction(async (client) => {
    const cur = await client.query<{ veiculo_id: string | null; ocorrida_em: string | null }>(
      'SELECT veiculo_id, ocorrida_em FROM multas WHERE id = $1 AND empresa_id = $2',
      [id, empresaId],
    );
    const multa = cur.rows[0];
    if (!multa) throw AppError.notFound('Multa não encontrada');
    if (!multa.veiculo_id || !multa.ocorrida_em) {
      throw AppError.badRequest('Multa precisa de veículo e ocorrida_em para vínculo automático');
    }

    const viagem = await acharViagemNoPeriodo(
      client,
      empresaId,
      multa.veiculo_id,
      new Date(multa.ocorrida_em),
    );
    if (viagem) {
      await client.query(
        `UPDATE multas SET viagem_id = $1, motorista_id = $2, status_revisao = 'auto_vinculada'
         WHERE id = $3 AND empresa_id = $4`,
        [viagem.id, viagem.motorista_id, id, empresaId],
      );
    } else {
      await client.query(
        `UPDATE multas SET viagem_id = NULL, status_revisao = 'aguardando_revisao' WHERE id = $1 AND empresa_id = $2`,
        [id, empresaId],
      );
    }
  });
  return getById(empresaId, id);
}

export async function remove(empresaId: string, id: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'DELETE FROM multas WHERE id = $1 AND empresa_id = $2 RETURNING id',
    [id, empresaId],
  );
  if (!row) throw AppError.notFound('Multa não encontrada');
}
