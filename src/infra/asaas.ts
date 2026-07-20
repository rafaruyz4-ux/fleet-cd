import { randomBytes } from 'node:crypto';
import { env } from '../config/env';
import type { Plano } from '../domain/planos';

// Integração com o Asaas (cobrança recorrente). Sem ASAAS_API_KEY, opera em
// "modo simulado": não chama a API e devolve ids fictícios — assim o fluxo
// funciona ponta a ponta em dev/teste/sandbox sem cobrar de ninguém.

export function asaasAtivo(): boolean {
  return Boolean(env.asaas.apiKey);
}

interface RespAsaas {
  id: string;
}

async function chamar(method: 'POST' | 'PUT', path: string, body: unknown): Promise<RespAsaas> {
  const res = await fetch(`${env.asaas.baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: env.asaas.apiKey as string,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    throw new Error(`Asaas respondeu ${res.status}: ${detalhe.slice(0, 300)}`);
  }
  return (await res.json()) as RespAsaas;
}

// ---------------------------------------------------------------------
// Faturas (cobranças) de uma assinatura
// ---------------------------------------------------------------------

export type FaturaStatus = 'pago' | 'pendente' | 'atrasado';

export interface Fatura {
  id: string;
  vencimento: string; // ISO (YYYY-MM-DD)
  valorCentavos: number;
  status: FaturaStatus;
  // Página da fatura no Asaas (Pix/boleto/cartão) e o PDF do boleto.
  linkFatura: string | null;
  linkBoleto: string | null;
}

// Mapeia os status de payment do Asaas para os três que o painel mostra.
const STATUS_ASAAS: Record<string, FaturaStatus> = {
  RECEIVED: 'pago',
  CONFIRMED: 'pago',
  RECEIVED_IN_CASH: 'pago',
  OVERDUE: 'atrasado',
};

interface PaymentAsaas {
  id?: string;
  dueDate?: string;
  value?: number;
  status?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
}

/**
 * Lista as cobranças de uma assinatura (GET /payments?subscription=...),
 * mais recentes primeiro. Em modo simulado, devolve um histórico coerente
 * com o preço informado: meses anteriores pagos + a fatura do mês em aberto.
 */
export async function listarFaturasAssinatura(
  subscriptionId: string,
  precoMensalCentavos: number,
): Promise<Fatura[]> {
  if (!asaasAtivo()) {
    return faturasSimuladas(subscriptionId, precoMensalCentavos);
  }

  const res = await fetch(
    `${env.asaas.baseUrl}/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=50`,
    { headers: { access_token: env.asaas.apiKey as string } },
  );
  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    throw new Error(`Asaas respondeu ${res.status}: ${detalhe.slice(0, 300)}`);
  }
  const body = (await res.json()) as { data?: PaymentAsaas[] };
  const pagamentos = Array.isArray(body.data) ? body.data : [];

  return pagamentos
    .map(
      (p): Fatura => ({
        id: p.id ?? '',
        vencimento: p.dueDate ?? '',
        valorCentavos: Math.round((p.value ?? 0) * 100),
        status: STATUS_ASAAS[p.status ?? ''] ?? 'pendente',
        linkFatura: p.invoiceUrl ?? null,
        linkBoleto: p.bankSlipUrl ?? null,
      }),
    )
    .sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1));
}

// Modo simulado: 2 meses pagos + a fatura do mês atual em aberto. Datas
// relativas a hoje para a tela sempre parecer "viva" em dev/demo.
function faturasSimuladas(subscriptionId: string, precoMensalCentavos: number): Fatura[] {
  const hoje = new Date();
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const mesAtras = (n: number) =>
    new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - n, 10));

  return [0, 1, 2].map((n) => ({
    id: `sim_pay_${subscriptionId}_${n}`,
    vencimento: dia(mesAtras(n)),
    valorCentavos: precoMensalCentavos,
    status: n === 0 ? 'pendente' : 'pago',
    linkFatura: null, // sem link em modo simulado (não há cobrança real)
    linkBoleto: null,
  }));
}

export interface DadosAssinatura {
  nome: string;
  cnpj: string | null;
  email: string;
  plano: Plano;
  // Ids já gravados no banco (se a empresa já assinou antes): são REUSADOS,
  // para nunca deixar duas assinaturas ativas no Asaas para a mesma empresa.
  customerId?: string | null;
  subscriptionId?: string | null;
}

/**
 * Garante UM cliente + UMA assinatura recorrente mensal no Asaas para a empresa:
 *  - cliente já existe → reusa (não cria duplicado);
 *  - assinatura já existe → atualiza o valor via PUT /subscriptions/{id}
 *    (mais simples que cancelar e recriar: mantém o histórico de cobranças e
 *    não abre janela com duas assinaturas ativas);
 *  - senão, cria. Em modo simulado, ids fictícios (também reusados).
 */
export async function garantirClienteEAssinatura(
  dados: DadosAssinatura,
): Promise<{ customerId: string; subscriptionId: string }> {
  if (!asaasAtivo()) {
    // Modo simulado: reusa os ids fictícios existentes ou gera novos únicos.
    return {
      customerId: dados.customerId ?? `sim_cus_${randomBytes(8).toString('hex')}`,
      subscriptionId: dados.subscriptionId ?? `sim_sub_${randomBytes(8).toString('hex')}`,
    };
  }

  const customerId =
    dados.customerId ??
    (
      await chamar('POST', '/customers', {
        name: dados.nome,
        cpfCnpj: dados.cnpj ?? undefined,
        email: dados.email,
      })
    ).id;

  if (dados.subscriptionId) {
    await chamar('PUT', `/subscriptions/${dados.subscriptionId}`, {
      value: dados.plano.precoMensalCentavos / 100,
      description: `Fleet CD — plano ${dados.plano.nome}`,
      // Ajusta também a cobrança em aberto (o cliente paga já o valor novo).
      updatePendingPayments: true,
    });
    return { customerId, subscriptionId: dados.subscriptionId };
  }

  const assinatura = await chamar('POST', '/subscriptions', {
    customer: customerId,
    billingType: 'UNDEFINED', // cliente escolhe Pix/boleto/cartão
    cycle: 'MONTHLY',
    value: dados.plano.precoMensalCentavos / 100,
    description: `Fleet CD — plano ${dados.plano.nome}`,
  });

  return { customerId, subscriptionId: assinatura.id };
}
