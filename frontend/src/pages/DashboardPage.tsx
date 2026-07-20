import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Check,
  Copy,
  Receipt,
  Route as RouteIcon,
  Smartphone,
  Truck,
} from 'lucide-react'
import { useAlertas, useMotoristas, useMultas, useVeiculos, useViagens } from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { AlertaTipoBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardListSkeleton, Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'

export function DashboardPage() {
  const emAndamento = useViagens({ status: 'em_andamento', limit: 1 })
  const todasViagens = useViagens({ limit: 1 })
  const alertasNovos = useAlertas({ visualizado: false, limit: 5 })
  const multasRevisar = useMultas({ status_revisao: 'aguardando_revisao', limit: 1 })
  const veiculos = useVeiculos()
  const motoristas = useMotoristas()

  const veiculosAtivos = veiculos.data?.filter((v) => v.ativo).length

  return (
    <div>
      <PageHeader title="Visão geral" description="Resumo da operação da frota." />

      <div className="space-y-6 p-4 sm:p-6">
        <PrimeirosPassos
          temVeiculo={veiculos.data ? veiculos.data.length > 0 : undefined}
          temMotorista={motoristas.data ? motoristas.data.length > 0 : undefined}
          temViagem={todasViagens.data ? todasViagens.data.total > 0 : undefined}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            to="/viagens"
            icon={RouteIcon}
            label="Viagens em andamento"
            value={emAndamento.data?.total}
            loading={emAndamento.isLoading}
            tone="text-primary"
          />
          <Stat
            to="/alertas"
            icon={AlertTriangle}
            label="Alertas não vistos"
            value={alertasNovos.data?.total}
            loading={alertasNovos.isLoading}
            tone="text-destructive"
          />
          <Stat
            to="/multas"
            icon={Receipt}
            label="Multas a revisar"
            value={multasRevisar.data?.total}
            loading={multasRevisar.isLoading}
            tone="text-warning"
          />
          <Stat
            to="/cadastros"
            icon={Truck}
            label="Veículos ativos"
            value={veiculosAtivos}
            loading={veiculos.isLoading}
            tone="text-success"
          />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Alertas recentes
            </h2>
            <Link to="/alertas" className="text-sm text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          {alertasNovos.isLoading ? (
            <CardListSkeleton items={3} />
          ) : alertasNovos.data && alertasNovos.data.data.length > 0 ? (
            <div className="space-y-2">
              {alertasNovos.data.data.map((a) => (
                <Link
                  key={a.id}
                  to={a.viagem_id ? `/viagens/${a.viagem_id}` : '/alertas'}
                  className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <AlertaTipoBadge tipo={a.tipo} />
                    <span className="text-sm">{a.descricao ?? '—'}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(a.criado_em)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum alerta pendente. 🎉
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Checklist de primeiros passos: aparece só enquanto falta a base do sistema
 * (veículo → motorista → viagem) e some sozinho quando tudo está pronto.
 */
function PrimeirosPassos({
  temVeiculo,
  temMotorista,
  temViagem,
}: {
  temVeiculo: boolean | undefined
  temMotorista: boolean | undefined
  temViagem: boolean | undefined
}) {
  // Só decide quando as três consultas já responderam — sem "piscar" o card.
  if (temVeiculo === undefined || temMotorista === undefined || temViagem === undefined) return null
  if (temVeiculo && temMotorista && temViagem) return null

  const passos = [
    { done: temVeiculo, label: 'Cadastre um veículo', to: '/cadastros' },
    { done: temMotorista, label: 'Cadastre um motorista (com senha do app)', to: '/cadastros' },
    { done: temViagem, label: 'Crie a primeira viagem', to: '/viagens' },
  ]
  const linkApp = `${window.location.origin}/motorista`

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkApp)
      toast.success('Link do app do motorista copiado.')
    } catch {
      toast.error('Não foi possível copiar. O link é: ' + linkApp)
    }
  }

  return (
    <Card className="relative overflow-hidden border-primary/30">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-[hsl(258_100%_62%)]" />
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Primeiros passos</h2>
          <p className="text-sm text-muted-foreground">
            Deixe sua frota pronta para rodar em 4 passos.
          </p>
        </div>
        <ol className="space-y-2">
          {passos.map((p, i) => (
            <li key={p.label}>
              <Link
                to={p.to}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                  p.done
                    ? 'border-success/30 bg-success/5 text-muted-foreground'
                    : 'border-border/70 bg-card/60 hover:border-primary/40 hover:text-primary',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    p.done ? 'bg-success/20 text-success' : 'bg-primary/15 text-primary',
                  )}
                >
                  {p.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={p.done ? 'line-through decoration-success/40' : undefined}>
                  {p.label}
                </span>
                {!p.done && <span className="ml-auto text-primary">→</span>}
              </Link>
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              4
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-primary" />
              Envie o link do app ao motorista
            </span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={copiarLink}>
              <Copy className="h-3.5 w-3.5" /> Copiar link
            </Button>
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}

function Stat({
  to,
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  to: string
  icon: typeof Truck
  label: string
  value: number | undefined
  loading?: boolean
  tone: string
}) {
  return (
    <Link to={to}>
      <Card className="group relative overflow-hidden transition-all hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(0,212,255,0.25)]">
        {/* barra de gradiente no topo — assinatura visual da Nexus */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-[hsl(258_100%_62%)]" />
        <CardContent className="flex items-center gap-4 p-5">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-white/5 ${tone}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-3xl font-bold">
              {loading ? <Skeleton className="my-1.5 h-7 w-12" /> : (value ?? '—')}
            </div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
