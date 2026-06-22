// Planos por faixa (cobrança por tamanho de frota). Fonte única dos limites e
// preços — usada na trava de limite, na tela de assinatura e na cobrança Asaas.

export const PLANO_FAIXAS = ['starter', 'pro', 'enterprise'] as const;
export type PlanoFaixa = (typeof PLANO_FAIXAS)[number];

export interface Plano {
  faixa: PlanoFaixa;
  nome: string;
  // null = ilimitado.
  limiteVeiculos: number | null;
  precoMensalCentavos: number;
}

export const PLANOS: Record<PlanoFaixa, Plano> = {
  starter: { faixa: 'starter', nome: 'Starter', limiteVeiculos: 5, precoMensalCentavos: 9900 },
  pro: { faixa: 'pro', nome: 'Pro', limiteVeiculos: 20, precoMensalCentavos: 24900 },
  enterprise: {
    faixa: 'enterprise',
    nome: 'Enterprise',
    limiteVeiculos: null,
    precoMensalCentavos: 59900,
  },
};

export function plano(faixa: PlanoFaixa): Plano {
  return PLANOS[faixa];
}
