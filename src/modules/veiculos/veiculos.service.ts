import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import type { CreateVeiculoInput, UpdateVeiculoInput } from './veiculos.schemas';

const COLS = `id, placa, modelo, tipo, capacidade_kg, renavam, ativo, criado_em, updated_at`;

export interface Veiculo {
  id: string;
  placa: string;
  modelo: string | null;
  tipo: string;
  capacidade_kg: number | null;
  renavam: string | null;
  ativo: boolean;
  criado_em: string;
  updated_at: string;
}

export function list(): Promise<Veiculo[]> {
  return query<Veiculo>(`SELECT ${COLS} FROM veiculos ORDER BY placa`);
}

export async function getById(id: string): Promise<Veiculo> {
  const row = await queryOne<Veiculo>(`SELECT ${COLS} FROM veiculos WHERE id = $1`, [id]);
  if (!row) {
    throw AppError.notFound('Veículo não encontrado');
  }
  return row;
}

export async function create(input: CreateVeiculoInput): Promise<Veiculo> {
  const row = await queryOne<Veiculo>(
    `INSERT INTO veiculos (placa, modelo, tipo, capacidade_kg, renavam, ativo)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE))
     RETURNING ${COLS}`,
    [
      input.placa,
      input.modelo ?? null,
      input.tipo,
      input.capacidade_kg ?? null,
      input.renavam ?? null,
      input.ativo ?? null,
    ],
  );
  return row!;
}

export async function update(id: string, input: UpdateVeiculoInput): Promise<Veiculo> {
  await getById(id);

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const assign = (col: string, value: unknown) => {
    sets.push(`${col} = $${i++}`);
    values.push(value);
  };

  if (input.placa !== undefined) assign('placa', input.placa);
  if (input.modelo !== undefined) assign('modelo', input.modelo);
  if (input.tipo !== undefined) assign('tipo', input.tipo);
  if (input.capacidade_kg !== undefined) assign('capacidade_kg', input.capacidade_kg);
  if (input.renavam !== undefined) assign('renavam', input.renavam);
  if (input.ativo !== undefined) assign('ativo', input.ativo);

  if (sets.length === 0) {
    return getById(id);
  }

  values.push(id);
  const row = await queryOne<Veiculo>(
    `UPDATE veiculos SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${COLS}`,
    values,
  );
  return row!;
}

export async function remove(id: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'UPDATE veiculos SET ativo = FALSE WHERE id = $1 RETURNING id',
    [id],
  );
  if (!row) {
    throw AppError.notFound('Veículo não encontrado');
  }
}
