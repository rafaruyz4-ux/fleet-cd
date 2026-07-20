import { useState } from 'react'
import { toast } from 'sonner'
import { Check, CreditCard, Sparkles, Zap } from 'lucide-react'
import { useAssinatura, useConsumoConsultas, useMudarPlano } from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PLANO_ORDEM, PLANOS_UI, limiteTexto } from '@/lib/planos'
import type { PlanoFaixa } from '@/types'

const ICONE: Record<PlanoFaixa, typeof Zap> = {
  starter: Zap,
  pro: Sparkles,
  enterprise: CreditCard,
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
    ativo: { label: 'Ativa', variant: 'success' },
    trial: { label: 'Período de teste', variant: 'warning' },
    suspenso: { label: 'Suspensa (pagamento em atraso)', variant: 'destructive' },
    cancelado: { label: 'Cancelada', variant: 'muted' },
  }
  const s = map[status] ?? { label: status, variant: 'muted' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

/** Centavos → reais inteiros (ex.: 9900 → "R$ 99"). */
function precoMensal(centavos: number): string {
  return formatCurrency(centavos / 100).replace(/,00$/, '')
}

export function AssinaturaPage() {
  const { data: assinatura, isLoading, error } = useAssinatura()
  const { data: consumo } = useConsumoConsultas()
  const mudarPlano = useMudarPlano()
  const [faixaAlvo, setFaixaAlvo] = useState<PlanoFaixa | null>(null)
  const [erroTroca, setErroTroca] = useState<string | null>(null)

  async function trocar(faixa: PlanoFaixa) {
    setErroTroca(null)
    setFaixaAlvo(faixa)
    try {
      await mudarPlano.mutateAsync(faixa)
      toast.success(`Plano alterado para ${PLANOS_UI[faixa].nome}.`)
    } catch (err) {
      setErroTroca(
        err instanceof ApiError ? err.message : 'Não foi possível trocar de plano. Tente de novo.',
      )
    } finally {
      setFaixaAlvo(null)
    }
  }

  const atual = assinatura?.faixa
  const idxAtual = atual ? PLANO_ORDEM.indexOf(atual) : -1

  return (
    <div>
      <PageHeader
        title="Assinatura"
        description="Seu plano, consumo e cobrança mensal."
      />

      <div className="space-y-6 p-6">
        <DataState isLoading={isLoading} error={error} loadingLabel="Carregando assinatura…" />

        {assinatura && (
          <>
            {/* Resumo do plano atual */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-[hsl(258_100%_62%)]" />
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
                      Plano atual
                    </CardDescription>
                    <CardTitle className="font-display text-2xl">{assinatura.plano}</CardTitle>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-bold">
                      {precoMensal(assinatura.precoMensalCentavos)}
                      <span className="text-sm font-normal text-muted-foreground">/mês</span>
                    </div>
                    <div className="mt-1">{statusBadge(assinatura.status)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Consumo
                  titulo="Veículos"
                  usado={assinatura.veiculosUsados}
                  limite={assinatura.limiteVeiculos}
                  sufixo="veículos"
                />
                <Consumo
                  titulo="Consultas de débitos (mês)"
                  usado={consumo?.usados ?? 0}
                  limite={consumo?.limite ?? null}
                  sufixo="consultas"
                />
              </CardContent>
            </Card>

            {erroTroca && (
              <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {erroTroca}
              </p>
            )}

            {/* Cards dos planos */}
            <div>
              <h2 className="mb-3 font-display text-lg font-bold">Planos disponíveis</h2>
              <div className="grid gap-4 lg:grid-cols-3">
                {PLANO_ORDEM.map((faixa) => {
                  const p = PLANOS_UI[faixa]
                  const Icone = ICONE[faixa]
                  const ehAtual = faixa === atual
                  const idx = PLANO_ORDEM.indexOf(faixa)
                  const ehUpgrade = idx > idxAtual
                  const trocando = mudarPlano.isPending && faixaAlvo === faixa
                  return (
                    <Card
                      key={faixa}
                      className={cn(
                        'flex flex-col',
                        ehAtual && 'border-primary/60 shadow-[0_0_24px_rgba(0,212,255,0.15)]',
                      )}
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-[hsl(258_100%_62%)] text-primary-foreground">
                            <Icone className="h-5 w-5" />
                          </div>
                          {ehAtual && <Badge variant="success">Plano atual</Badge>}
                        </div>
                        <CardTitle className="font-display text-xl">{p.nome}</CardTitle>
                        <CardDescription>{p.resumo}</CardDescription>
                        <div className="pt-1 font-display text-3xl font-bold">
                          {precoMensal(p.precoMensalCentavos)}
                          <span className="text-sm font-normal text-muted-foreground">/mês</span>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col gap-4">
                        <ul className="space-y-2 text-sm">
                          <Item>{limiteTexto(p.limiteVeiculos, 'veículos')}</Item>
                          <Item>{limiteTexto(p.limiteConsultasMes, 'consultas de débitos/mês')}</Item>
                          <Item>Rastreio GPS, viagens e alertas</Item>
                          <Item>Multas vinculadas automaticamente</Item>
                        </ul>
                        <div className="mt-auto">
                          <Button
                            className="w-full"
                            variant={ehAtual ? 'outline' : ehUpgrade ? 'default' : 'outline'}
                            disabled={ehAtual || mudarPlano.isPending}
                            onClick={() => trocar(faixa)}
                          >
                            {trocando && <Spinner />}
                            {ehAtual ? 'Plano atual' : ehUpgrade ? 'Fazer upgrade' : 'Mudar para este'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                A cobrança é feita mensalmente pelo Asaas. No downgrade, é preciso que a frota ativa
                caiba no limite do novo plano.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  )
}

function Consumo({
  titulo,
  usado,
  limite,
  sufixo,
}: {
  titulo: string
  usado: number
  limite: number | null
  sufixo: string
}) {
  const ilimitado = limite === null
  const pct = ilimitado || limite === 0 ? 0 : Math.min(100, Math.round((usado / limite) * 100))
  const perto = !ilimitado && pct >= 80
  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{titulo}</span>
        <span className="font-medium">
          {usado}
          {ilimitado ? '' : ` / ${limite}`} <span className="text-muted-foreground">{sufixo}</span>
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            ilimitado
              ? 'bg-gradient-to-r from-primary to-[hsl(258_100%_62%)]'
              : perto
                ? 'bg-destructive'
                : 'bg-primary',
          )}
          style={{ width: ilimitado ? '100%' : `${pct}%` }}
        />
      </div>
      {perto && (
        <p className="mt-2 text-xs text-destructive">
          Você está perto do limite do plano. Considere um upgrade.
        </p>
      )}
      {ilimitado && <p className="mt-2 text-xs text-muted-foreground">Sem limite neste plano.</p>}
    </div>
  )
}
