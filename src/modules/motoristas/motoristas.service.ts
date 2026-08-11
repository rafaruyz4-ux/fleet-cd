import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { MontadorUpdate } from '../../db/sql';
import { invalidarCacheMotorista } from '../../middleware/acesso';
import { hashPassword } from '../../utils/password';
import { signDeviceToken } from '../../utils/jwt';
import { env } from '../../config/env';
import type { CreateMotoristaInput, UpdateMotoristaInput } from './motoristas.schemas';

// Colunas públicas (nunca devolvemos senha_hash). tem_senha indica se há acesso ao app.
const PUBLIC_COLS = `
  id, nome, cpf, cnh, categoria_cnh, validade_cnh, telefone, ativo,
  (senha_hash IS NOT NULL) AS tem_senha, criado_em, updated_at
`;

export interface Motorista {
  id: string;
  nome: string;
  cpf: string;
  cnh: string | null;
  categoria_cnh: string | null;
  validade_cnh: string | null;
  telefone: string | null;
  ativo: boolean;
  tem_senha: boolean;
  criado_em: string;
  updated_at: string;
}

export function list(empresaId: string): Promise<Motorista[]> {
  return query<Motorista>(
    `SELECT ${PUBLIC_COLS} FROM motoristas WHERE empresa_id = $1 ORDER BY nome`,
    [empresaId],
  );
}

export async function getById(empresaId: string, id: string): Promise<Motorista> {
  const row = await queryOne<Motorista>(
    `SELECT ${PUBLIC_COLS} FROM motoristas WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId],
  );
  if (!row) {
    throw AppError.notFound('Motorista não encontrado');
  }
  return row;
}

export async function create(empresaId: string, input: CreateMotoristaInput): Promise<Motorista> {
  const senhaHash = input.senha ? await hashPassword(input.senha) : null;
  const row = await queryOne<Motorista>(
    `INSERT INTO motoristas
       (empresa_id, nome, cpf, cnh, categoria_cnh, validade_cnh, telefone, senha_hash, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, TRUE))
     RETURNING ${PUBLIC_COLS}`,
    [
      empresaId,
      input.nome,
      input.cpf,
      input.cnh ?? null,
      input.categoria_cnh ?? null,
      input.validade_cnh ?? null,
      input.telefone ?? null,
      senhaHash,
      input.ativo ?? null,
    ],
  );
  return row!;
}

export async function update(
  empresaId: string,
  id: string,
  input: UpdateMotoristaInput,
): Promise<Motorista> {
  // Garante que existe (e dá 404 claro antes de montar o UPDATE).
  await getById(empresaId, id);

  const u = new MontadorUpdate();

  if (input.nome !== undefined) u.set('nome', input.nome);
  if (input.cpf !== undefined) u.set('cpf', input.cpf);
  if (input.cnh !== undefined) u.set('cnh', input.cnh);
  if (input.categoria_cnh !== undefined) u.set('categoria_cnh', input.categoria_cnh);
  if (input.validade_cnh !== undefined) u.set('validade_cnh', input.validade_cnh);
  if (input.telefone !== undefined) u.set('telefone', input.telefone);
  if (input.ativo !== undefined) {
    u.set('ativo', input.ativo);
    // Desativação vale já (o cache de acesso guarda o 'ativo' por ~60s).
    invalidarCacheMotorista(id);
  }
  if (input.senha !== undefined) u.set('senha_hash', await hashPassword(input.senha));

  if (u.vazio) {
    return getById(empresaId, id);
  }

  const idPh = u.ph(id);
  const empPh = u.ph(empresaId);
  const row = await queryOne<Motorista>(
    `UPDATE motoristas SET ${u.sql} WHERE id = ${idPh} AND empresa_id = ${empPh} RETURNING ${PUBLIC_COLS}`,
    u.valores,
  );
  return row!;
}

// Emite um token de dispositivo (long-lived) para o motorista usar em apps de
// rastreio GPS em 2º plano. Exige que o motorista esteja ativo.
export async function gerarDeviceToken(
  empresaId: string,
  id: string,
): Promise<{ deviceToken: string; validade: string; motorista: { id: string; nome: string } }> {
  const motorista = await getById(empresaId, id);
  if (!motorista.ativo) {
    throw AppError.badRequest('Motorista inativo não pode receber token de dispositivo');
  }
  // Versão atual dos tokens: carimbada no payload — incrementá-la (revogação)
  // derruba este token mesmo dentro do prazo de 365 dias.
  const versao = await queryOne<{ token_version: number }>(
    'SELECT token_version FROM motoristas WHERE id = $1 AND empresa_id = $2',
    [id, empresaId],
  );
  const deviceToken = signDeviceToken({
    sub: motorista.id,
    tipo: 'motorista',
    empresaId,
    cpf: motorista.cpf,
    tokenVersion: versao?.token_version ?? 0,
  });
  return {
    deviceToken,
    validade: env.jwt.deviceTtl,
    motorista: { id: motorista.id, nome: motorista.nome },
  };
}

/**
 * Revoga TODOS os tokens já emitidos do motorista (celular perdido/roubado):
 * incrementa token_version — os tokens antigos carregam a versão anterior e
 * passam a ser recusados. O motorista volta a acessar com um login novo (ou
 * um device token novo gerado pelo gestor).
 */
export async function revogarTokens(
  empresaId: string,
  id: string,
): Promise<{ ok: true; token_version: number }> {
  const row = await queryOne<{ token_version: number }>(
    `UPDATE motoristas SET token_version = token_version + 1
      WHERE id = $1 AND empresa_id = $2
      RETURNING token_version`,
    [id, empresaId],
  );
  if (!row) throw AppError.notFound('Motorista não encontrado');
  // A revogação precisa valer já (o cache de acesso guarda a versão por ~60s).
  invalidarCacheMotorista(id);
  return { ok: true, token_version: row.token_version };
}

export async function remove(empresaId: string, id: string): Promise<void> {
  // Hard delete quando não há histórico; com viagens/multas vinculadas (FK 23503)
  // o registro é preservado e apenas inativado.
  try {
    const row = await queryOne<{ id: string }>(
      'DELETE FROM motoristas WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [id, empresaId],
    );
    if (!row) {
      throw AppError.notFound('Motorista não encontrado');
    }
  } catch (err) {
    if ((err as { code?: string }).code !== '23503') {
      throw err;
    }
    await queryOne(
      'UPDATE motoristas SET ativo = FALSE WHERE id = $1 AND empresa_id = $2 RETURNING id',
      [id, empresaId],
    );
  }
  // Corta o acesso do app/device token imediatamente (cache de ~60s).
  invalidarCacheMotorista(id);
}
