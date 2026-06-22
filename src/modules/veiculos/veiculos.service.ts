import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { MontadorUpdate } from '../../db/sql';
import { assertPodeAdicionarVeiculo } from '../assinatura/assinatura.service';
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

export function list(empresaId: string): Promise<Veiculo[]> {
  return query<Veiculo>(`SELECT ${COLS} FROM veiculos WHERE empresa_id = $1 ORDER BY placa`, [
    empresaId,
  ]);
}

export async function getById(empresaId: string, id: string): Promise<Veiculo> {
  const row = await queryOne<Veiculo>(
    `SELECT ${COLS} FROM veiculos WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId],
  );
  if (!row) {
    throw AppError.notFound('Veículo não encontrado');
  }
  return row;
}

export async function create(empresaId: string, input: CreateVeiculoInput): Promise<Veiculo> {
  await assertPodeAdicionarVeiculo(empresaId); // trava do plano (faixa de frota)
  const row = await queryOne<Veiculo>(
    `INSERT INTO veiculos (empresa_id, placa, modelo, tipo, capacidade_kg, renavam, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE))
     RETURNING ${COLS}`,
    [
      empresaId,
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

export async function update(
  empresaId: string,
  id: string,
  input: UpdateVeiculoInput,
): Promise<Veiculo> {
  await getById(empresaId, id);

  const u = new MontadorUpdate();

  if (input.placa !== undefined) u.set('placa', input.placa);
  if (input.modelo !== undefined) u.set('modelo', input.modelo);
  if (input.tipo !== undefined) u.set('tipo', input.tipo);
  if (input.capacidade_kg !== undefined) u.set('capacidade_kg', input.capacidade_kg);
  if (input.renavam !== undefined) u.set('renavam', input.renavam);
  if (input.ativo !== undefined) u.set('ativo', input.ativo);

  if (u.vazio) {
    return getById(empresaId, id);
  }

  const idPh = u.ph(id);
  const empPh = u.ph(empresaId);
  const row = await queryOne<Veiculo>(
    `UPDATE veiculos SET ${u.sql} WHERE id = ${idPh} AND empresa_id = ${empPh} RETURNING ${COLS}`,
    u.valores,
  );
  return row!;
}

export async function remove(empresaId: string, id: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'UPDATE veiculos SET ativo = FALSE WHERE id = $1 AND empresa_id = $2 RETURNING id',
    [id, empresaId],
  );
  if (!row) {
    throw AppError.notFound('Veículo não encontrado');
  }
}
