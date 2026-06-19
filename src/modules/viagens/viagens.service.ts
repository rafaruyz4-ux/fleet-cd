import type { PoolClient, QueryResultRow } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, queryOne, withTransaction } from '../../db/pool';
import { MontadorUpdate, MontadorWhere } from '../../db/sql';
import type {
  AddParadaInput,
  CreateViagemInput,
  EncerrarViagemInput,
  IniciarViagemInput,
  ListViagensQuery,
  UpdateParadaInput,
  UpdateViagemInput,
} from './viagens.schemas';
import { ViagemStatus, ParadaStatus, NfStatus } from '../../domain/status';

// Runner: abstrai "rodar uma query" tanto no pool quanto dentro de uma
// transação. Ler via o client da transação enxerga linhas ainda não
// commitadas (o pool veria o estado antigo) — lição do módulo de NFs.
type Runner = <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;

const poolRunner: Runner = (text, params) => query(text, params);
const clientRunner =
  (client: PoolClient): Runner =>
  (text, params) =>
    client.query(text, params).then((r) => r.rows);

// ---------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------
interface ViagemRow {
  id: string;
  veiculo_id: string;
  motorista_id: string;
  rota_planejada_id: string | null;
  iniciada_em: string | null;
  encerrada_em: string | null;
  km_inicial: number | null;
  km_final: number | null;
  status: string;
  criado_em: string;
  updated_at: string;
  veiculo_placa: string;
  veiculo_modelo: string | null;
  motorista_nome: string;
  paradas_count?: number;
}

interface ParadaRow {
  id: string;
  viagem_id: string;
  nf_id: string | null;
  ordem: number;
  chegada_prevista: string | null;
  chegada_real: string | null;
  saida_real: string | null;
  status: string;
  nf_numero: string | null;
  nf_destinatario_nome: string | null;
  nf_status: string | null;
}

export type Parada = ParadaRow;
export interface Viagem extends ViagemRow {
  paradas?: Parada[];
}

const VIAGEM_COLS = `
  v.id, v.veiculo_id, v.motorista_id, v.rota_planejada_id,
  v.iniciada_em, v.encerrada_em, v.km_inicial, v.km_final, v.status,
  v.criado_em, v.updated_at,
  ve.placa AS veiculo_placa, ve.modelo AS veiculo_modelo,
  m.nome AS motorista_nome
`;
const VIAGEM_FROM = `
  FROM viagens v
  JOIN veiculos ve ON ve.id = v.veiculo_id
  JOIN motoristas m ON m.id = v.motorista_id
`;

const PARADA_SELECT = `
  SELECT p.id, p.viagem_id, p.nf_id, p.ordem,
         p.chegada_prevista, p.chegada_real, p.saida_real, p.status,
         nf.numero AS nf_numero,
         nf.destinatario_nome AS nf_destinatario_nome,
         nf.status AS nf_status
  FROM paradas p
  LEFT JOIN notas_fiscais nf ON nf.id = p.nf_id
  WHERE p.viagem_id = $1
  ORDER BY p.ordem
`;

// ---------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------
async function fetchViagemRow(
  run: Runner,
  empresaId: string,
  id: string,
): Promise<ViagemRow | null> {
  const rows = await run<ViagemRow>(
    `SELECT ${VIAGEM_COLS} ${VIAGEM_FROM} WHERE v.id = $1 AND v.empresa_id = $2`,
    [id, empresaId],
  );
  return rows[0] ?? null;
}

function fetchParadas(run: Runner, viagemId: string): Promise<Parada[]> {
  return run<ParadaRow>(PARADA_SELECT, [viagemId]);
}

async function getViagemComParadas(run: Runner, empresaId: string, id: string): Promise<Viagem> {
  const row = await fetchViagemRow(run, empresaId, id);
  if (!row) {
    throw AppError.notFound('Viagem não encontrada');
  }
  const viagem: Viagem = row;
  viagem.paradas = await fetchParadas(run, id);
  return viagem;
}

export async function getById(empresaId: string, id: string): Promise<Viagem> {
  return getViagemComParadas(poolRunner, empresaId, id);
}

export interface ListViagensResult {
  data: ViagemRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function list(empresaId: string, q: ListViagensQuery): Promise<ListViagensResult> {
  const w = new MontadorWhere();
  w.add(`v.empresa_id = ${w.ph(empresaId)}`);

  if (q.status) w.add(`v.status = ${w.ph(q.status)}`);
  if (q.veiculo_id) w.add(`v.veiculo_id = ${w.ph(q.veiculo_id)}`);
  if (q.motorista_id) w.add(`v.motorista_id = ${w.ph(q.motorista_id)}`);
  if (q.de) w.add(`v.criado_em >= ${w.ph(q.de)}`);
  if (q.ate) w.add(`v.criado_em <= ${w.ph(q.ate)}`);

  const whereSql = w.whereSql;

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total ${VIAGEM_FROM} ${whereSql}`,
    w.valores,
  );

  const rows = await query<ViagemRow>(
    `SELECT ${VIAGEM_COLS},
            (SELECT COUNT(*)::int FROM paradas WHERE viagem_id = v.id) AS paradas_count
     ${VIAGEM_FROM} ${whereSql}
     ORDER BY v.criado_em DESC
     LIMIT ${w.ph(q.limit)} OFFSET ${w.ph(q.offset)}`,
    w.valores,
  );

  return {
    data: rows,
    total: Number(totalRow?.total ?? 0),
    limit: q.limit,
    offset: q.offset,
  };
}

// ---------------------------------------------------------------------
// Validações de cadastro (veículo / motorista ativos)
// ---------------------------------------------------------------------
async function assertVeiculoDisponivel(run: Runner, empresaId: string, id: string): Promise<void> {
  const rows = await run<{ ativo: boolean }>(
    'SELECT ativo FROM veiculos WHERE id = $1 AND empresa_id = $2',
    [id, empresaId],
  );
  if (!rows[0]) throw AppError.badRequest('Veículo não encontrado');
  if (!rows[0].ativo) throw AppError.badRequest('Veículo inativo não pode receber viagem');
}

async function assertMotoristaDisponivel(
  run: Runner,
  empresaId: string,
  id: string,
): Promise<void> {
  const rows = await run<{ ativo: boolean }>(
    'SELECT ativo FROM motoristas WHERE id = $1 AND empresa_id = $2',
    [id, empresaId],
  );
  if (!rows[0]) throw AppError.badRequest('Motorista não encontrado');
  if (!rows[0].ativo) throw AppError.badRequest('Motorista inativo não pode receber viagem');
}

// Aloca uma NF como parada e ajusta o status da NF conforme a viagem já
// tenha sido iniciada ou não.
async function alocarNfComoParada(
  run: Runner,
  empresaId: string,
  viagemId: string,
  nfId: string,
  ordem: number,
  viagemIniciada: boolean,
  chegadaPrevista?: Date,
): Promise<void> {
  const nf = await run<{ status: string }>(
    'SELECT status FROM notas_fiscais WHERE id = $1 AND empresa_id = $2',
    [nfId, empresaId],
  );
  if (!nf[0]) throw AppError.badRequest(`NF ${nfId} não encontrada`);
  if (nf[0].status === NfStatus.ENTREGUE) {
    throw AppError.badRequest(`NF ${nfId} já foi entregue e não pode ser alocada`);
  }

  await run(
    `INSERT INTO paradas (empresa_id, viagem_id, nf_id, ordem, chegada_prevista, status)
     VALUES ($1, $2, $3, $4, $5, 'pendente')`,
    [empresaId, viagemId, nfId, ordem, chegadaPrevista ?? null],
  );
  await run('UPDATE notas_fiscais SET status = $1 WHERE id = $2 AND empresa_id = $3', [
    viagemIniciada ? NfStatus.EM_VIAGEM : NfStatus.ALOCADA,
    nfId,
    empresaId,
  ]);
}

// ---------------------------------------------------------------------
// Criação / atualização
// ---------------------------------------------------------------------
export async function create(empresaId: string, input: CreateViagemInput): Promise<Viagem> {
  return withTransaction(async (client) => {
    const run = clientRunner(client);
    await assertVeiculoDisponivel(run, empresaId, input.veiculo_id);
    await assertMotoristaDisponivel(run, empresaId, input.motorista_id);

    const inserted = await run<{ id: string }>(
      `INSERT INTO viagens (empresa_id, veiculo_id, motorista_id, rota_planejada_id, km_inicial)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        empresaId,
        input.veiculo_id,
        input.motorista_id,
        input.rota_planejada_id ?? null,
        input.km_inicial ?? null,
      ],
    );
    const viagemId = inserted[0]!.id;

    if (input.nf_ids?.length) {
      let ordem = 1;
      for (const nfId of input.nf_ids) {
        await alocarNfComoParada(run, empresaId, viagemId, nfId, ordem++, false);
      }
    }

    return getViagemComParadas(run, empresaId, viagemId);
  });
}

export async function update(
  empresaId: string,
  id: string,
  input: UpdateViagemInput,
): Promise<Viagem> {
  const atual = await fetchViagemRow(poolRunner, empresaId, id);
  if (!atual) throw AppError.notFound('Viagem não encontrada');

  return withTransaction(async (client) => {
    const run = clientRunner(client);

    if (input.veiculo_id !== undefined)
      await assertVeiculoDisponivel(run, empresaId, input.veiculo_id);
    if (input.motorista_id !== undefined)
      await assertMotoristaDisponivel(run, empresaId, input.motorista_id);

    const u = new MontadorUpdate();

    if (input.veiculo_id !== undefined) u.set('veiculo_id', input.veiculo_id);
    if (input.motorista_id !== undefined) u.set('motorista_id', input.motorista_id);
    if (input.rota_planejada_id !== undefined) u.set('rota_planejada_id', input.rota_planejada_id);
    if (input.km_inicial !== undefined) u.set('km_inicial', input.km_inicial);
    if (input.km_final !== undefined) u.set('km_final', input.km_final);

    if (!u.vazio) {
      const idPh = u.ph(id);
      const empPh = u.ph(empresaId);
      await run(
        `UPDATE viagens SET ${u.sql} WHERE id = ${idPh} AND empresa_id = ${empPh}`,
        u.valores,
      );
    }

    return getViagemComParadas(run, empresaId, id);
  });
}

// ---------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------
export async function iniciar(
  empresaId: string,
  id: string,
  input: IniciarViagemInput,
): Promise<Viagem> {
  return withTransaction(async (client) => {
    const run = clientRunner(client);
    const viagem = await fetchViagemRow(run, empresaId, id);
    if (!viagem) throw AppError.notFound('Viagem não encontrada');
    if (viagem.status !== ViagemStatus.EM_ANDAMENTO) {
      throw AppError.badRequest(`Viagem ${viagem.status} não pode ser iniciada`);
    }
    if (viagem.iniciada_em) {
      throw AppError.badRequest('Viagem já foi iniciada');
    }

    await run(
      `UPDATE viagens
         SET iniciada_em = COALESCE($1, now()),
             km_inicial = COALESCE($2, km_inicial)
       WHERE id = $3 AND empresa_id = $4`,
      [input.iniciada_em ?? null, input.km_inicial ?? null, id, empresaId],
    );
    // NFs alocadas passam a "em_viagem".
    await run(
      `UPDATE notas_fiscais SET status = 'em_viagem'
       WHERE status = 'alocada'
         AND id IN (SELECT nf_id FROM paradas WHERE viagem_id = $1 AND nf_id IS NOT NULL)`,
      [id],
    );

    return getViagemComParadas(run, empresaId, id);
  });
}

export async function encerrar(
  empresaId: string,
  id: string,
  input: EncerrarViagemInput,
): Promise<Viagem> {
  return withTransaction(async (client) => {
    const run = clientRunner(client);
    const viagem = await fetchViagemRow(run, empresaId, id);
    if (!viagem) throw AppError.notFound('Viagem não encontrada');
    if (viagem.status !== ViagemStatus.EM_ANDAMENTO) {
      throw AppError.badRequest(`Viagem ${viagem.status} não pode ser encerrada`);
    }
    if (!viagem.iniciada_em) {
      throw AppError.badRequest('Viagem ainda não foi iniciada');
    }
    const kmFinal = input.km_final ?? viagem.km_final;
    if (kmFinal != null && viagem.km_inicial != null && kmFinal < viagem.km_inicial) {
      throw AppError.badRequest('km_final não pode ser menor que km_inicial');
    }

    await run(
      `UPDATE viagens
         SET encerrada_em = COALESCE($1, now()),
             km_final = COALESCE($2, km_final),
             status = 'encerrada'
       WHERE id = $3 AND empresa_id = $4`,
      [input.encerrada_em ?? null, input.km_final ?? null, id, empresaId],
    );

    return getViagemComParadas(run, empresaId, id);
  });
}

export async function cancelar(empresaId: string, id: string): Promise<Viagem> {
  return withTransaction(async (client) => {
    const run = clientRunner(client);
    const viagem = await fetchViagemRow(run, empresaId, id);
    if (!viagem) throw AppError.notFound('Viagem não encontrada');
    if (viagem.status === ViagemStatus.ENCERRADA) {
      throw AppError.badRequest('Viagem encerrada não pode ser cancelada');
    }
    if (viagem.status === ViagemStatus.CANCELADA) {
      throw AppError.badRequest('Viagem já está cancelada');
    }

    await run(`UPDATE viagens SET status = 'cancelada' WHERE id = $1 AND empresa_id = $2`, [
      id,
      empresaId,
    ]);
    // Devolve as NFs não entregues ao estado "importada".
    await run(
      `UPDATE notas_fiscais SET status = 'importada'
       WHERE status IN ('alocada', 'em_viagem')
         AND id IN (SELECT nf_id FROM paradas WHERE viagem_id = $1 AND nf_id IS NOT NULL)`,
      [id],
    );

    return getViagemComParadas(run, empresaId, id);
  });
}

// ---------------------------------------------------------------------
// Paradas
// ---------------------------------------------------------------------
export async function addParada(
  empresaId: string,
  viagemId: string,
  input: AddParadaInput,
): Promise<Parada> {
  return withTransaction(async (client) => {
    const run = clientRunner(client);
    const viagem = await fetchViagemRow(run, empresaId, viagemId);
    if (!viagem) throw AppError.notFound('Viagem não encontrada');
    if (viagem.status !== ViagemStatus.EM_ANDAMENTO) {
      throw AppError.badRequest('Só é possível adicionar paradas a viagens em andamento');
    }

    let ordem = input.ordem;
    if (ordem === undefined) {
      const max = await run<{ max: number | null }>(
        'SELECT MAX(ordem) AS max FROM paradas WHERE viagem_id = $1',
        [viagemId],
      );
      ordem = (max[0]?.max ?? 0) + 1;
    }

    await alocarNfComoParada(
      run,
      empresaId,
      viagemId,
      input.nf_id,
      ordem,
      Boolean(viagem.iniciada_em),
      input.chegada_prevista,
    );

    const paradas = await fetchParadas(run, viagemId);
    const criada = paradas.find((p) => p.nf_id === input.nf_id && p.ordem === ordem);
    return criada!;
  });
}

export async function updateParada(
  empresaId: string,
  viagemId: string,
  paradaId: string,
  input: UpdateParadaInput,
): Promise<Parada> {
  return withTransaction(async (client) => {
    const run = clientRunner(client);
    const existentes = await run<{ id: string; nf_id: string | null; status: string }>(
      'SELECT id, nf_id, status FROM paradas WHERE id = $1 AND viagem_id = $2 AND empresa_id = $3',
      [paradaId, viagemId, empresaId],
    );
    const parada = existentes[0];
    if (!parada) throw AppError.notFound('Parada não encontrada nesta viagem');

    const u = new MontadorUpdate();

    if (input.status !== undefined) u.set('status', input.status);
    if (input.ordem !== undefined) u.set('ordem', input.ordem);
    if (input.chegada_prevista !== undefined) u.set('chegada_prevista', input.chegada_prevista);
    if (input.chegada_real !== undefined) u.set('chegada_real', input.chegada_real);
    if (input.saida_real !== undefined) u.set('saida_real', input.saida_real);

    // Ao marcar entregue, registra a chegada (se ausente) e conclui a NF.
    if (input.status === ParadaStatus.ENTREGUE) {
      if (input.chegada_real === undefined)
        u.setExpr('chegada_real = COALESCE(chegada_real, now())');
    }

    if (!u.vazio) {
      const idPh = u.ph(paradaId);
      const empPh = u.ph(empresaId);
      await run(
        `UPDATE paradas SET ${u.sql} WHERE id = ${idPh} AND empresa_id = ${empPh}`,
        u.valores,
      );
    }

    if (input.status === ParadaStatus.ENTREGUE && parada.nf_id) {
      await run(`UPDATE notas_fiscais SET status = 'entregue' WHERE id = $1 AND empresa_id = $2`, [
        parada.nf_id,
        empresaId,
      ]);
    }

    const paradas = await fetchParadas(run, viagemId);
    return paradas.find((p) => p.id === paradaId)!;
  });
}

export async function removeParada(
  empresaId: string,
  viagemId: string,
  paradaId: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const run = clientRunner(client);
    const rows = await run<{ nf_id: string | null }>(
      'DELETE FROM paradas WHERE id = $1 AND viagem_id = $2 AND empresa_id = $3 RETURNING nf_id',
      [paradaId, viagemId, empresaId],
    );
    if (!rows[0]) throw AppError.notFound('Parada não encontrada nesta viagem');

    // NF ainda não entregue volta a ficar disponível.
    if (rows[0].nf_id) {
      await run(
        `UPDATE notas_fiscais SET status = 'importada'
         WHERE id = $1 AND empresa_id = $2 AND status IN ('alocada', 'em_viagem')`,
        [rows[0].nf_id, empresaId],
      );
    }
  });
}
