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
