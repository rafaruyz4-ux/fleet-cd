/*
 * Catálogo de planos no frontend — espelha src/domain/planos.ts do backend.
 * Mantido manualmente em sincronia (mesma fonte de preços/limites usada na
 * trava de limite, na cobrança Asaas e na tela de assinatura).
 */
import type { PlanoFaixa } from '@/types'

export interface PlanoUI {
  faixa: PlanoFaixa
  nome: string
  limiteVeiculos: number | null // null = ilimitado
  limiteConsultasMes: number | null // null = ilimitado
  precoMensalCentavos: number
  /** Resumo curto para o card. */
  resumo: string
}

export const PLANOS_UI: Record<PlanoFaixa, PlanoUI> = {
  starter: {
    faixa: 'starter',
    nome: 'Starter',
    limiteVeiculos: 5,
    limiteConsultasMes: 50,
    precoMensalCentavos: 9900,
    resumo: 'Para começar a controlar uma frota pequena.',
  },
  pro: {
    faixa: 'pro',
    nome: 'Pro',
    limiteVeiculos: 20,
    limiteConsultasMes: 200,
    precoMensalCentavos: 24900,
    resumo: 'Para operações em crescimento, com mais consultas.',
  },
  enterprise: {
    faixa: 'enterprise',
    nome: 'Enterprise',
    limiteVeiculos: null,
    limiteConsultasMes: null,
    precoMensalCentavos: 59900,
    resumo: 'Frota e consultas sem limite, para grandes operações.',
  },
}

export const PLANO_ORDEM: PlanoFaixa[] = ['starter', 'pro', 'enterprise']

/** Texto de um limite (número ou "Ilimitado"). */
export function limiteTexto(valor: number | null, sufixo: string): string {
  return valor === null ? 'Ilimitado' : `${valor} ${sufixo}`
}
