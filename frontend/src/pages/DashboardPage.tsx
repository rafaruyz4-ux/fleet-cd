import { Link } from 'react-router-dom'
import { AlertTriangle, Receipt, Route as RouteIcon, Truck } from 'lucide-react'
import { useAlertas, useMultas, useVeiculos, useViagens } from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { AlertaTipoBadge } from '@/components/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'

export function DashboardPage() {
  const emAndamento = useViagens({ status: 'em_andamento', limit: 1 })
  const alertasNovos = useAlertas({ visualizado: false, limit: 5 })
  const multasRevisar = useMultas({ status_revisao: 'aguardando_revisao', limit: 1 })
  const veiculos = useVeiculos()

  const veiculosAtivos = veiculos.data?.filter((v) => v.ativo).length

  return (
    <div>
      <PageHeader title="Visão geral" description="Resumo da operação da frota." />

      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            to="/viagens"
            icon={RouteIcon}
            label="Viagens em andamento"
            value={emAndamento.data?.total}
            tone="text-primary"
          />
          <Stat
            to="/alertas"
            icon={AlertTriangle}
            label="Alertas não vistos"
            value={alertasNovos.data?.total}
            tone="text-destructive"
          />
          <Stat
            to="/multas"
            icon={Receipt}
            label="Multas a revisar"
            value={multasRevisar.data?.total}
            tone="text-[hsl(32_85%_38%)]"
          />
          <Stat
            to="/cadastros"
            icon={Truck}
            label="Veículos ativos"
            value={veiculosAtivos}
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
          {alertasNovos.data && alertasNovos.data.data.length > 0 ? (
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

function Stat({
  to,
  icon: Icon,
  label,
  value,
  tone,
}: {
  to: string
  icon: typeof Truck
  label: string
  value: number | undefined
  tone: string
}) {
  return (
    <Link to={to}>
      <Card className="transition-colors hover:bg-muted/40">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-muted ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{value ?? '—'}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
