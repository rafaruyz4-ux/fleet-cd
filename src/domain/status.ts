// Fonte única dos valores de status/enum do domínio. As schemas zod e a lógica
// de negócio importam daqui — assim um valor existe em UM lugar só e o
// TypeScript pega digitação errada.

export const VIAGEM_STATUS = ['em_andamento', 'encerrada', 'cancelada'] as const;
export type ViagemStatus = (typeof VIAGEM_STATUS)[number];
export const ViagemStatus = {
  EM_ANDAMENTO: 'em_andamento',
  ENCERRADA: 'encerrada',
  CANCELADA: 'cancelada',
} as const satisfies Record<string, ViagemStatus>;

export const PARADA_STATUS = ['pendente', 'em_rota', 'entregue', 'falhou'] as const;
export type ParadaStatus = (typeof PARADA_STATUS)[number];
export const ParadaStatus = {
  PENDENTE: 'pendente',
  EM_ROTA: 'em_rota',
  ENTREGUE: 'entregue',
  FALHOU: 'falhou',
} as const satisfies Record<string, ParadaStatus>;

export const NF_STATUS = ['importada', 'alocada', 'em_viagem', 'entregue'] as const;
export type NfStatus = (typeof NF_STATUS)[number];
export const NfStatus = {
  IMPORTADA: 'importada',
  ALOCADA: 'alocada',
  EM_VIAGEM: 'em_viagem',
  ENTREGUE: 'entregue',
} as const satisfies Record<string, NfStatus>;

export const MULTA_STATUS_PAGAMENTO = ['pendente', 'pago', 'recurso'] as const;
export type MultaStatusPagamento = (typeof MULTA_STATUS_PAGAMENTO)[number];

export const MULTA_STATUS_REVISAO = ['auto_vinculada', 'aguardando_revisao', 'revisada'] as const;
export type MultaStatusRevisao = (typeof MULTA_STATUS_REVISAO)[number];

export const ALERTA_TIPO = ['desvio_rota', 'parada_longa', 'velocidade_alta', 'sem_gps'] as const;
export type AlertaTipo = (typeof ALERTA_TIPO)[number];

export const EMPRESA_PLANO = ['trial', 'ativo', 'suspenso', 'cancelado'] as const;
export type EmpresaPlano = (typeof EMPRESA_PLANO)[number];
