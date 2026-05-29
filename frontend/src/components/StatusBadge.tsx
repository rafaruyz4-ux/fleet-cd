import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { AlertaTipo, ParadaStatus, ViagemStatus } from '@/types'

type Variant = BadgeProps['variant']

const VIAGEM: Record<ViagemStatus, { label: string; variant: Variant }> = {
  em_andamento: { label: 'Em andamento', variant: 'default' },
  encerrada: { label: 'Encerrada', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'muted' },
}

export function ViagemStatusBadge({ status }: { status: ViagemStatus }) {
  const s = VIAGEM[status] ?? { label: status, variant: 'secondary' as Variant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const PARADA: Record<ParadaStatus, { label: string; variant: Variant }> = {
  pendente: { label: 'Pendente', variant: 'warning' },
  entregue: { label: 'Entregue', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'muted' },
}

export function ParadaStatusBadge({ status }: { status: ParadaStatus }) {
  const s = PARADA[status] ?? { label: status, variant: 'secondary' as Variant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const ALERTA: Record<AlertaTipo, { label: string; variant: Variant }> = {
  velocidade_alta: { label: 'Velocidade alta', variant: 'destructive' },
  desvio_rota: { label: 'Desvio de rota', variant: 'warning' },
  parada_longa: { label: 'Parada longa', variant: 'warning' },
  sem_gps: { label: 'Sem GPS', variant: 'muted' },
}

export function AlertaTipoBadge({ tipo }: { tipo: AlertaTipo }) {
  const s = ALERTA[tipo] ?? { label: tipo, variant: 'secondary' as Variant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const MULTA_REVISAO: Record<string, { label: string; variant: Variant }> = {
  auto_vinculada: { label: 'Auto-vinculada', variant: 'success' },
  aguardando_revisao: { label: 'Aguardando revisão', variant: 'warning' },
  revisada: { label: 'Revisada', variant: 'default' },
}

export function MultaRevisaoBadge({ status }: { status: string }) {
  const s = MULTA_REVISAO[status] ?? { label: status, variant: 'secondary' as Variant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const NF_STATUS: Record<string, { label: string; variant: Variant }> = {
  importada: { label: 'Importada', variant: 'secondary' },
  alocada: { label: 'Alocada', variant: 'warning' },
  em_viagem: { label: 'Em viagem', variant: 'default' },
  entregue: { label: 'Entregue', variant: 'success' },
}

export function NfStatusBadge({ status }: { status: string }) {
  const s = NF_STATUS[status] ?? { label: status, variant: 'secondary' as Variant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const MULTA_PAGAMENTO: Record<string, { label: string; variant: Variant }> = {
  pendente: { label: 'Pendente', variant: 'warning' },
  pago: { label: 'Pago', variant: 'success' },
  recurso: { label: 'Em recurso', variant: 'secondary' },
}

export function MultaPagamentoBadge({ status }: { status: string }) {
  const s = MULTA_PAGAMENTO[status] ?? { label: status, variant: 'secondary' as Variant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}
