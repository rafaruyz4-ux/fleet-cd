import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { hashPassword } from '../../utils/password';
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

export function list(): Promise<Motorista[]> {
  return query<Motorista>(`SELECT ${PUBLIC_COLS} FROM motoristas ORDER BY nome`);
}

export async function getById(id: string): Promise<Motorista> {
  const row = await queryOne<Motorista>(
    `SELECT ${PUBLIC_COLS} FROM motoristas WHERE id = $1`,
    [id],
  );
  if (!row) {
    throw AppError.notFound('Motorista não encontrado');
  }
  return row;
}

export async function create(input: CreateMotoristaInput): Promise<Motorista> {
  const senhaHash = input.senha ? await hashPassword(input.senha) : null;
  const row = await queryOne<Motorista>(
    `INSERT INTO motoristas
       (nome, cpf, cnh, categoria_cnh, validade_cnh, telefone, senha_hash, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE))
     RETURNING ${PUBLIC_COLS}`,
    [
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

export async function update(id: string, input: UpdateMotoristaInput): Promise<Motorista> {
  // Garante que existe (e dá 404 claro antes de montar o UPDATE).
  await getById(id);

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const assign = (col: string, value: unknown) => {
    sets.push(`${col} = $${i++}`);
    values.push(value);
  };

  if (input.nome !== undefined) assign('nome', input.nome);
  if (input.cpf !== undefined) assign('cpf', input.cpf);
  if (input.cnh !== undefined) assign('cnh', input.cnh);
  if (input.categoria_cnh !== undefined) assign('categoria_cnh', input.categoria_cnh);
  if (input.validade_cnh !== undefined) assign('validade_cnh', input.validade_cnh);
  if (input.telefone !== undefined) assign('telefone', input.telefone);
  if (input.ativo !== undefined) assign('ativo', input.ativo);
  if (input.senha !== undefined) assign('senha_hash', await hashPassword(input.senha));

  if (sets.length === 0) {
    return getById(id);
  }

  values.push(id);
  const row = await queryOne<Motorista>(
    `UPDATE motoristas SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${PUBLIC_COLS}`,
    values,
  );
  return row!;
}

export async function remove(id: string): Promise<void> {
  // Soft delete: motoristas têm histórico (viagens, multas) e não devem sumir.
  const row = await queryOne<{ id: string }>(
    'UPDATE motoristas SET ativo = FALSE WHERE id = $1 RETURNING id',
    [id],
  );
  if (!row) {
    throw AppError.notFound('Motorista não encontrado');
  }
}
