// Planos por faixa (cobrança por tamanho de frota). Fonte única dos limites e
// preços — usada na trava de limite, na tela de assinatura e na cobrança Asaas.

export const PLANO_FAIXAS = ['starter', 'pro', 'enterprise'] as const;
export type PlanoFaixa = (typeof PLANO_FAIXAS)[number];

export interface Plano {
  faixa: PlanoFaixa;
  nome: string;
  // null = ilimitado.
  limiteVeiculos: number | null;
  // Teto de consultas de débitos/multas (Infosimples) por mês. null = ilimitado.
  // Protege o custo da conta única da Nexus e diferencia os planos.
  limiteConsultasMes: number | null;
  precoMensalCentavos: number;
}

export const PLANOS: Record<PlanoFaixa, Plano> = {
  starter: {
    faixa: 'starter',
    nome: 'Starter',
    limiteVeiculos: 5,
    limiteConsultasMes: 50,
    precoMensalCentavos: 9900,
  },
  pro: {
    faixa: 'pro',
    nome: 'Pro',
    limiteVeiculos: 20,
    limiteConsultasMes: 200,
    precoMensalCentavos: 24900,
  },
  enterprise: {
    faixa: 'enterprise',
    nome: 'Enterprise',
    limiteVeiculos: null,
    limiteConsultasMes: null,
    precoMensalCentavos: 59900,
  },
};

export function plano(faixa: PlanoFaixa): Plano {
  return PLANOS[faixa];
}
