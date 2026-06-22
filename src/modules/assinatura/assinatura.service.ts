import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { PLANOS, type PlanoFaixa } from '../../domain/planos';
import { criarClienteEAssinatura } from '../../infra/asaas';

interface EmpresaAssinaturaRow {
  id: string;
  nome: string;
  cnpj: string | null;
  plano: string; // status: trial|ativo|suspenso|cancelado
  plano_faixa: PlanoFaixa;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
}

export interface AssinaturaPublica {
  faixa: PlanoFaixa;
  plano: string;
  status: string;
  limiteVeiculos: number | null;
  veiculosUsados: number;
  precoMensalCentavos: number;
}

async function contarVeiculosAtivos(empresaId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT count(*)::int AS n FROM veiculos WHERE empresa_id = $1 AND ativo = TRUE',
    [empresaId],
  );
  return row?.n ?? 0;
}

async function buscarEmpresa(empresaId: string): Promise<EmpresaAssinaturaRow> {
  const e = await queryOne<EmpresaAssinaturaRow>(
    `SELECT id, nome, cnpj, plano, plano_faixa, asaas_customer_id, asaas_subscription_id
     FROM empresas WHERE id = $1`,
    [empresaId],
  );
  if (!e) throw AppError.notFound('Empresa não encontrada');
  return e;
}

export async function obterAssinatura(empresaId: string): Promise<AssinaturaPublica> {
  const e = await buscarEmpresa(empresaId);
  const p = PLANOS[e.plano_faixa];
  return {
    faixa: e.plano_faixa,
    plano: p.nome,
    status: e.plano,
    limiteVeiculos: p.limiteVeiculos,
    veiculosUsados: await contarVeiculosAtivos(empresaId),
    precoMensalCentavos: p.precoMensalCentavos,
  };
}

/**
 * Trava de limite: barra a criação de veículo acima do que o plano permite.
 * Chamada pelo serviço de veículos antes de inserir.
 */
export async function assertPodeAdicionarVeiculo(empresaId: string): Promise<void> {
  const e = await buscarEmpresa(empresaId);
  const p = PLANOS[e.plano_faixa];
  if (p.limiteVeiculos === null) return; // ilimitado
  const usados = await contarVeiculosAtivos(empresaId);
  if (usados >= p.limiteVeiculos) {
    throw AppError.forbidden(
      `Limite do plano ${p.nome} atingido (${p.limiteVeiculos} veículos). Faça upgrade para adicionar mais.`,
    );
  }
}

/**
 * Troca o plano da empresa. Em downgrade, recusa se a frota ativa não couber no
 * novo limite. Cria/atualiza a assinatura no Asaas (simulado sem chave) e marca
 * a empresa como ativa.
 */
export async function mudarPlano(empresaId: string, faixa: PlanoFaixa): Promise<AssinaturaPublica> {
  const e = await buscarEmpresa(empresaId);
  const p = PLANOS[faixa];

  if (p.limiteVeiculos !== null) {
    const usados = await contarVeiculosAtivos(empresaId);
    if (usados > p.limiteVeiculos) {
      throw AppError.badRequest(
        `Você tem ${usados} veículos ativos; o plano ${p.nome} permite ${p.limiteVeiculos}. ` +
          'Desative veículos antes de trocar para este plano.',
      );
    }
  }

  const admin = await queryOne<{ email: string }>(
    "SELECT email FROM usuarios WHERE empresa_id = $1 AND papel = 'admin' ORDER BY criado_em LIMIT 1",
    [empresaId],
  );

  const { customerId, subscriptionId } = await criarClienteEAssinatura({
    nome: e.nome,
    cnpj: e.cnpj,
    email: admin?.email ?? `empresa-${empresaId}@fleetcd.local`,
    plano: p,
  });

  await query(
    `UPDATE empresas
       SET plano_faixa = $1,
           plano = 'ativo',
           asaas_customer_id = COALESCE(asaas_customer_id, $2),
           asaas_subscription_id = $3
     WHERE id = $4`,
    [faixa, customerId, subscriptionId, empresaId],
  );

  return obterAssinatura(empresaId);
}

// Mapeia eventos de pagamento do Asaas para o status da empresa.
const EVENTO_PARA_STATUS: Record<string, string> = {
  PAYMENT_CONFIRMED: 'ativo',
  PAYMENT_RECEIVED: 'ativo',
  PAYMENT_OVERDUE: 'suspenso',
  SUBSCRIPTION_DELETED: 'cancelado',
  PAYMENT_DELETED: 'cancelado',
};

/**
 * Processa um webhook do Asaas: encontra a empresa pela assinatura e ajusta o
 * status conforme o evento de pagamento. Ignora eventos/assinaturas que não
 * conhecemos (idempotente).
 */
export async function processarWebhook(
  evento: string,
  subscriptionId: string | undefined,
): Promise<void> {
  const novoStatus = EVENTO_PARA_STATUS[evento];
  if (!novoStatus || !subscriptionId) return;

  await query('UPDATE empresas SET plano = $1 WHERE asaas_subscription_id = $2', [
    novoStatus,
    subscriptionId,
  ]);
}
