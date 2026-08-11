import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Clock, CreditCard, ExternalLink, Sparkles, Zap } from 'lucide-react'
import { useAssinatura, useConsumoConsultas, useFaturas, useMudarPlano } from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Spinner } from '@/components/ui/spinner'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PLANO_ORDEM, PLANOS_UI, limiteTexto } from '@/lib/planos'
import type { Fatura, PlanoFaixa } from '@/types'

const ICONE: Record<PlanoFaixa, typeof Zap> = {
  starter: Zap,
  pro: Sparkles,
  enterprise: CreditCard,
}

type Aba = 'plano' | 'planos' | 'faturas'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'plano', label: 'Meu plano' },
  { key: 'planos', label: 'Mudar de plano' },
  { key: 'faturas', label: 'Faturas' },
]

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
    ativo: { label: 'Ativa', variant: 'success' },
    trial: { label: 'Período de teste', variant: 'warning' },
    pendente: { label: 'Aguardando pagamento', variant: 'warning' },
    suspenso: { label: 'Suspensa (pagamento em atraso)', variant: 'destructive' },
    cancelado: { label: 'Cancelada', variant: 'muted' },
  }
  const s = map[status] ?? { label: status, variant: 'muted' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

function faturaBadge(status: Fatura['status']) {
  const map: Record<Fatura['status'], { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
    pago: { label: 'Paga', variant: 'success' },
    pendente: { label: 'Em aberto', variant: 'warning' },
    atrasado: { label: 'Atrasada', variant: 'destructive' },
  }
  const s = map[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

/** Centavos → reais inteiros (ex.: 9900 → "R$ 99"). */
function precoMensal(centavos: number): string {
  return formatCurrency(centavos / 100).replace(/,00$/, '')
}

/**
 * Procura um link de pagamento (fatura/boleto do Asaas) na resposta da troca
 * de plano. O contrato tipado não garante o campo, então a leitura é
 * defensiva: aceita linkFatura/linkBoleto/invoiceUrl/bankSlipUrl no topo.
 */
function extrairLinkPagamento(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== 'object') return null
  const obj = resposta as Record<string, unknown>
  for (const campo of ['linkFatura', 'linkBoleto', 'invoiceUrl', 'bankSlipUrl']) {
    const v = obj[campo]
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
  }
  return null
}

/**
 * Vencimento vem como data pura (YYYY-MM-DD); formata sem passar por Date
 * para não sofrer o deslocamento de fuso (UTC−3 jogaria para o dia anterior).
 */
function formatarVencimento(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  if (!m) return formatDate(data)
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function AssinaturaPage() {
  const { data: assinatura, isLoading, error } = useAssinatura()
  const { data: consumo } = useConsumoConsultas()
  const mudarPlano = useMudarPlano()
  const [searchParams, setSearchParams] = useSearchParams()
  const abaParam = searchParams.get('aba')
  const aba: Aba = ABAS.some((a) => a.key === abaParam) ? (abaParam as Aba) : 'plano'
  const setAba = (a: Aba) => setSearchParams(a === 'plano' ? {} : { aba: a })

  const [faixaAlvo, setFaixaAlvo] = useState<PlanoFaixa | null>(null)
  // Plano escolhido aguardando o "sim" no diálogo de confirmação.
  const [confirmarFaixa, setConfirmarFaixa] = useState<PlanoFaixa | null>(null)
  const [erroTroca, setErroTroca] = useState<string | null>(null)

  async function trocar(faixa: PlanoFaixa) {
    setConfirmarFaixa(null)
    setErroTroca(null)
    setFaixaAlvo(faixa)
    try {
      const resposta = await mudarPlano.mutateAsync(faixa)
      // SEM beco sem saída: depois de confirmar a troca, o usuário é levado
      // direto ao pagamento — aba Faturas + (se a API devolver) o link do
      // boleto/fatura do Asaas aberto na hora.
      const linkPagamento = extrairLinkPagamento(resposta)
      setAba('faturas')
      if (linkPagamento) {
        window.open(linkPagamento, '_blank', 'noopener')
        toast.success(
          `Troca para o plano ${PLANOS_UI[faixa].nome} solicitada. Abrimos a fatura para pagamento em outra aba.`,
          {
            duration: 10_000,
            action: { label: 'Abrir de novo', onClick: () => window.open(linkPagamento, '_blank', 'noopener') },
          },
        )
      } else {
        toast.success(
          `Troca para o plano ${PLANOS_UI[faixa].nome} solicitada. Pague a fatura para o novo plano entrar em vigor.`,
          {
            duration: 10_000,
            action: { label: 'Ver faturas', onClick: () => setAba('faturas') },
          },
        )
      }
    } catch (err) {
      setErroTroca(
        err instanceof ApiError ? err.message : 'Não foi possível trocar de plano. Tente de novo.',
      )
    } finally {
      setFaixaAlvo(null)
    }
  }

  const pendente = assinatura?.faixaPendente ?? null

  return (
    <div>
      <PageHeader title="Assinatura" description="Seu plano, consumo e cobrança mensal." />

      <div className="space-y-4 p-6">
        <div role="tablist" aria-label="Seções da assinatura" className="flex gap-1 overflow-x-auto border-b">
          {ABAS.map((a) => (
            <button
              key={a.key}
              role="tab"
              id={`tab-assinatura-${a.key}`}
              aria-selected={aba === a.key}
              aria-controls={`panel-assinatura-${a.key}`}
              onClick={() => setAba(a.key)}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                aba === a.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <DataState isLoading={isLoading} error={error} loadingLabel="Carregando assinatura…" />

        <div role="tabpanel" id={`panel-assinatura-${aba}`} aria-labelledby={`tab-assinatura-${aba}`}>
        {assinatura && aba === 'plano' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                      Plano atual
                    </CardDescription>
                    <CardTitle className="text-2xl">{assinatura.plano}</CardTitle>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
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

            {/* Aviso de troca de plano aguardando pagamento (Pacote 5) */}
            {pendente && (
              <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  <strong>Troca para o plano {PLANOS_UI[pendente].nome} aguardando pagamento.</strong>{' '}
                  O novo plano ({precoMensal(PLANOS_UI[pendente].precoMensalCentavos)}/mês) entra em
                  vigor assim que o pagamento for confirmado. Até lá, o plano atual continua valendo.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Quer mais veículos ou consultas?{' '}
              <button
                type="button"
                onClick={() => setAba('planos')}
                className="font-medium text-primary hover:underline"
              >
                Ver os planos disponíveis →
              </button>
            </p>
          </div>
        )}

        {assinatura && aba === 'planos' && (
          <PlanosTab
            assinatura={{ atual: assinatura.faixa, pendente }}
            erroTroca={erroTroca}
            trocando={mudarPlano.isPending}
            faixaAlvo={faixaAlvo}
            onEscolher={setConfirmarFaixa}
          />
        )}

        {aba === 'faturas' && <FaturasTab />}
        </div>
      </div>

      {/* Confirmação da troca de plano: mostra o valor e o aviso do pagamento. */}
      <ConfirmDialog
        open={confirmarFaixa !== null}
        onClose={() => setConfirmarFaixa(null)}
        onConfirm={() => confirmarFaixa && trocar(confirmarFaixa)}
        title={confirmarFaixa ? `Mudar para o plano ${PLANOS_UI[confirmarFaixa].nome}?` : ''}
        description={
          confirmarFaixa ? (
            <span>
              O plano <strong>{PLANOS_UI[confirmarFaixa].nome}</strong> custa{' '}
              <strong>{precoMensal(PLANOS_UI[confirmarFaixa].precoMensalCentavos)}/mês</strong> (
              {limiteTexto(PLANOS_UI[confirmarFaixa].limiteVeiculos, 'veículos')}). A troca só entra
              em vigor <strong>após a confirmação do pagamento</strong> — até lá, o plano atual
              continua valendo.
            </span>
          ) : undefined
        }
        confirmLabel="Confirmar troca"
        loading={mudarPlano.isPending}
      />
    </div>
  )
}

function PlanosTab({
  assinatura,
  erroTroca,
  trocando,
  faixaAlvo,
  onEscolher,
}: {
  assinatura: { atual: PlanoFaixa; pendente: PlanoFaixa | null }
  erroTroca: string | null
  trocando: boolean
  faixaAlvo: PlanoFaixa | null
  onEscolher: (faixa: PlanoFaixa) => void
}) {
  const idxAtual = PLANO_ORDEM.indexOf(assinatura.atual)
  return (
    <div className="space-y-4">
      {erroTroca && (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erroTroca}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANO_ORDEM.map((faixa) => {
          const p = PLANOS_UI[faixa]
          const Icone = ICONE[faixa]
          const ehAtual = faixa === assinatura.atual
          const ehPendente = faixa === assinatura.pendente
          const ehUpgrade = PLANO_ORDEM.indexOf(faixa) > idxAtual
          const carregando = trocando && faixaAlvo === faixa
          return (
            <Card key={faixa} className={cn('flex flex-col', ehAtual && 'border-primary')}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icone className="h-5 w-5" />
                  </div>
                  {ehAtual && <Badge variant="success">Plano atual</Badge>}
                  {ehPendente && !ehAtual && <Badge variant="warning">Aguardando pagamento</Badge>}
                </div>
                <CardTitle className="text-xl">{p.nome}</CardTitle>
                <CardDescription>{p.resumo}</CardDescription>
                <div className="pt-1 text-3xl font-bold">
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
                    variant={ehAtual || !ehUpgrade ? 'outline' : 'default'}
                    disabled={ehAtual || ehPendente || trocando}
                    onClick={() => onEscolher(faixa)}
                  >
                    {carregando && <Spinner />}
                    {ehAtual
                      ? 'Plano atual'
                      : ehPendente
                        ? 'Aguardando pagamento'
                        : ehUpgrade
                          ? 'Fazer upgrade'
                          : 'Mudar para este'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        A cobrança é feita mensalmente pelo Asaas. A troca de plano só entra em vigor após a
        confirmação do pagamento. No downgrade, é preciso que a frota ativa caiba no limite do novo
        plano.
      </p>
    </div>
  )
}

function FaturasTab() {
  const faturas = useFaturas()
  return (
    <div className="space-y-3">
      <DataState
        isLoading={faturas.isLoading}
        error={faturas.error}
        isEmpty={(faturas.data ?? []).length === 0}
        emptyLabel="Nenhuma fatura ainda — elas aparecem aqui quando a cobrança começar."
        loadingLabel="Carregando faturas…"
      />
      {(faturas.data ?? []).length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Vencimento</TH>
              <TH>Valor</TH>
              <TH>Status</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {faturas.data!.map((f) => (
              <TR key={f.id}>
                <TD className="whitespace-nowrap">{formatarVencimento(f.vencimento)}</TD>
                <TD>{formatCurrency(f.valorCentavos / 100)}</TD>
                <TD>{faturaBadge(f.status)}</TD>
                <TD className="text-right">
                  {(f.linkFatura ?? f.linkBoleto) ? (
                    <a
                      href={f.linkFatura ?? f.linkBoleto ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-4 w-4" /> Abrir boleto
                      </Button>
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem link</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
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
    <div className="rounded-lg border bg-muted/40 p-4">
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
            perto ? 'bg-destructive' : 'bg-primary',
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
