import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { MontadorUpdate } from '../../db/sql';
import type { AtualizarConfiguracoesInput } from './configuracoes.schemas';

// Configurações da PRÓPRIA empresa: dados cadastrais + limiares de alerta.
// (O plano/status NÃO passa por aqui — isso é assunto da assinatura/backoffice.)

interface ConfiguracoesRow {
  nome: string;
  cnpj: string | null;
  alerta_velocidade_kmh: number;
  alerta_parada_min: number;
  alerta_sem_gps_min: number;
}

export interface ConfiguracoesEmpresa {
  nome: string;
  cnpj: string | null;
  alertaVelocidadeKmh: number;
  alertaParadaMin: number;
  alertaSemGpsMin: number;
}

function toPublico(row: ConfiguracoesRow): ConfiguracoesEmpresa {
  return {
    nome: row.nome,
    cnpj: row.cnpj,
    alertaVelocidadeKmh: row.alerta_velocidade_kmh,
    alertaParadaMin: row.alerta_parada_min,
    alertaSemGpsMin: row.alerta_sem_gps_min,
  };
}

const COLS = 'nome, cnpj, alerta_velocidade_kmh, alerta_parada_min, alerta_sem_gps_min';

export async function obter(empresaId: string): Promise<ConfiguracoesEmpresa> {
  const row = await queryOne<ConfiguracoesRow>(`SELECT ${COLS} FROM empresas WHERE id = $1`, [
    empresaId,
  ]);
  if (!row) throw AppError.notFound('Empresa não encontrada');
  return toPublico(row);
}

export async function atualizar(
  empresaId: string,
  input: AtualizarConfiguracoesInput,
): Promise<ConfiguracoesEmpresa> {
  const u = new MontadorUpdate();

  if (input.nome !== undefined) u.set('nome', input.nome);
  if (input.cnpj !== undefined) {
    const cnpj = input.cnpj ? input.cnpj.replace(/\D/g, '') : null;
    if (cnpj) {
      const conflito = await queryOne<{ id: string }>(
        'SELECT id FROM empresas WHERE cnpj = $1 AND id <> $2',
        [cnpj, empresaId],
      );
      if (conflito) throw AppError.conflict('Já existe uma empresa com este CNPJ');
    }
    u.set('cnpj', cnpj);
  }
  if (input.alertaVelocidadeKmh !== undefined)
    u.set('alerta_velocidade_kmh', input.alertaVelocidadeKmh);
  if (input.alertaParadaMin !== undefined) u.set('alerta_parada_min', input.alertaParadaMin);
  if (input.alertaSemGpsMin !== undefined) u.set('alerta_sem_gps_min', input.alertaSemGpsMin);

  if (!u.vazio) {
    const idPh = u.ph(empresaId);
    await query(`UPDATE empresas SET ${u.sql} WHERE id = ${idPh}`, u.valores);
  }
  return obter(empresaId);
}
