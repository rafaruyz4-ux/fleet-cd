import { AppError } from '../errors/AppError';
import { queryOne } from '../db/pool';

// Controle de acesso por status (assinatura da empresa + motorista ativo).
//
// O requireAuth roda em TODA request autenticada, então estas checagens usam um
// cache em memória com TTL curto (~60s) para não custar 1 query por request.
// Consequência aceita: uma suspensão/demissão pode demorar até 60s para surtir
// efeito — e os pontos que mudam esses status invalidam o cache na hora.

const TTL_MS = 60_000;

interface Cacheado<T> {
  valor: T;
  expira: number;
}

export interface StatusEmpresa {
  plano: string; // trial | ativo | pendente | suspenso | cancelado
  ativo: boolean;
}

const cacheEmpresa = new Map<string, Cacheado<StatusEmpresa>>();
const cacheMotorista = new Map<string, Cacheado<boolean>>();

function lembrado<T>(mapa: Map<string, Cacheado<T>>, chave: string): T | undefined {
  const hit = mapa.get(chave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  if (hit) mapa.delete(chave);
  return undefined;
}

function lembrar<T>(mapa: Map<string, Cacheado<T>>, chave: string, valor: T): T {
  mapa.set(chave, { valor, expira: Date.now() + TTL_MS });
  return valor;
}

/** Status de assinatura da empresa (com cache de ~60s). */
export async function statusDaEmpresa(empresaId: string): Promise<StatusEmpresa> {
  const hit = lembrado(cacheEmpresa, empresaId);
  if (hit) return hit;
  const row = await queryOne<StatusEmpresa>('SELECT plano, ativo FROM empresas WHERE id = $1', [
    empresaId,
  ]);
  // Empresa que não existe mais é tratada como cancelada (fecha por padrão).
  return lembrar(cacheEmpresa, empresaId, row ?? { plano: 'cancelado', ativo: false });
}

/** true quando a empresa NÃO pode usar o sistema (suspensa/cancelada/inativa). */
export function empresaBloqueada(s: StatusEmpresa): boolean {
  return !s.ativo || s.plano === 'suspenso' || s.plano === 'cancelado';
}

/** 403 padrão de assinatura suspensa, com código estável para o frontend tratar. */
export function erroAssinaturaSuspensa(): AppError {
  return new AppError(
    403,
    'Assinatura suspensa ou cancelada. Regularize o pagamento para voltar a usar o sistema.',
    { codigo: 'assinatura_suspensa' },
  );
}

/**
 * Motorista ainda está ativo? (com cache de ~60s). É a revogação prática do
 * device token (JWT de 365 dias): motorista demitido → soft delete → 401 aqui.
 */
export async function motoristaEstaAtivo(motoristaId: string): Promise<boolean> {
  const hit = lembrado(cacheMotorista, motoristaId);
  if (hit !== undefined) return hit;
  const row = await queryOne<{ ativo: boolean }>('SELECT ativo FROM motoristas WHERE id = $1', [
    motoristaId,
  ]);
  return lembrar(cacheMotorista, motoristaId, row?.ativo === true);
}

/** Chame ao mudar plano/status/ativo da empresa (webhook, backoffice, upgrade). */
export function invalidarCacheEmpresa(empresaId: string): void {
  cacheEmpresa.delete(empresaId);
}

/** Chame ao mudar o campo ativo do motorista (update/soft delete). */
export function invalidarCacheMotorista(motoristaId: string): void {
  cacheMotorista.delete(motoristaId);
}

/** Zera os caches (usado pelos testes, que manipulam o banco por fora). */
export function limparCachesDeAcesso(): void {
  cacheEmpresa.clear();
  cacheMotorista.clear();
}
