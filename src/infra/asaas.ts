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

async function chamar(path: string, body: unknown): Promise<RespAsaas> {
  const res = await fetch(`${env.asaas.baseUrl}${path}`, {
    method: 'POST',
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
}

/**
 * Garante um cliente + assinatura recorrente mensal no Asaas para a empresa.
 * Devolve os ids para guardarmos no banco. Em modo simulado, ids fictícios.
 */
export async function criarClienteEAssinatura(
  dados: DadosAssinatura,
): Promise<{ customerId: string; subscriptionId: string }> {
  if (!asaasAtivo()) {
    // Modo simulado: ids fictícios únicos (cada assinatura é distinta, como no Asaas real).
    return {
      customerId: `sim_cus_${randomBytes(8).toString('hex')}`,
      subscriptionId: `sim_sub_${randomBytes(8).toString('hex')}`,
    };
  }

  const cliente = await chamar('/customers', {
    name: dados.nome,
    cpfCnpj: dados.cnpj ?? undefined,
    email: dados.email,
  });

  const assinatura = await chamar('/subscriptions', {
    customer: cliente.id,
    billingType: 'UNDEFINED', // cliente escolhe Pix/boleto/cartão
    cycle: 'MONTHLY',
    value: dados.plano.precoMensalCentavos / 100,
    description: `Fleet CD — plano ${dados.plano.nome}`,
  });

  return { customerId: cliente.id, subscriptionId: assinatura.id };
}
