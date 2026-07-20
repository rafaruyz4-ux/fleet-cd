import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Crosshair, Flag, MapPin, Play, XCircle } from 'lucide-react'
import type { FocoMapa } from '@/components/TripMap'
import type { PontoTrajeto } from '@/types'
import {
  useAlertasDaViagem,
  useRota,
  useTrajetoRuas,
  useTrajetoria,
  useViagem,
  useViagemMutations,
} from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { PageLoader } from '@/components/ui/spinner'
import {
  AlertaTipoBadge,
  ParadaStatusBadge,
  ViagemStatusBadge,
} from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { formatDuracaoMin, haversineM } from '@/lib/geo'
import { EncerrarViagemModal } from './viagens/EncerrarViagemModal'

// Lazy: o MapLibre (~pesado) só é baixado ao abrir o detalhe de uma viagem.
const TripMap = lazy(() =>
  import('@/components/TripMap').then((m) => ({ default: m.TripMap })),
)

export function ViagemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: viagem, isLoading, error } = useViagem(id)
  // Atualiza a trajetória a cada 15s quando a viagem está em andamento.
  const emAndamento = viagem?.status === 'em_andamento'
  const trajetoriaQ = useTrajetoria(id, emAndamento ? 15_000 : undefined)
  const trajetoria = trajetoriaQ.data
  // Trajeto encaixado nas ruas (atualiza junto da trajetória quando em andamento).
  const { data: trajetoRuas } = useTrajetoRuas(id, emAndamento ? 30_000 : undefined)
  const { data: alertas } = useAlertasDaViagem(id)
  const { data: rota } = useRota(viagem?.rota_planejada_id)
  const { iniciar, encerrar, cancelar, marcarParada } = useViagemMutations()

  const [foco, setFoco] = useState<FocoMapa | null>(null)
  const [encerrarOpen, setEncerrarOpen] = useState(false)
  const [cancelarOpen, setCancelarOpen] = useState(false)
  const mapaRef = useRef<HTMLDivElement>(null)

  // Faz o mapa "voar" até um ponto e traz o mapa para a vista.
  const focar = (lng: number, lat: number) => {
    setFoco((f) => ({ lng, lat, nonce: (f?.nonce ?? 0) + 1 }))
    mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Localização de cada parada: a parada não guarda coordenada, então usamos
  // o ponto de GPS mais próximo do horário de entrega/saída (onde o caminhão
  // estava na hora). Paradas sem esse horário não ficam clicáveis.
  const paradaCoord = useMemo(() => {
    const m = new Map<string, { lng: number; lat: number }>()
    const pontos = trajetoria?.pontos ?? []
    if (!pontos.length) return m
    for (const p of viagem?.paradas ?? []) {
      const quando = p.chegada_real ?? p.saida_real
      if (!quando) continue
      const c = pontoNoTempo(pontos, quando)
      if (c) m.set(p.id, c)
    }
    return m
  }, [viagem?.paradas, trajetoria?.pontos])

  // Estatísticas reais do GPS: km rodado, tempo em movimento × parado e
  // velocidades (média em movimento / máxima).
  const stats = useMemo(
    () => estatisticasGps(trajetoria?.pontos ?? [], trajetoria?.paradas_detectadas ?? []),
    [trajetoria],
  )

  if (isLoading || error || !viagem) {
    return (
      <div>
        <PageHeader title="Detalhe da viagem" />
        <div className="p-6">
          <DataState isLoading={isLoading} error={error} isEmpty={!isLoading && !viagem} />
        </div>
      </div>
    )
  }

  const busy =
    iniciar.isPending || encerrar.isPending || cancelar.isPending || marcarParada.isPending

  return (
    <div>
      <PageHeader
        title={`Viagem · ${viagem.veiculo_placa}`}
        description={viagem.motorista_nome}
        actions={
          <div className="flex items-center gap-2">
            <ViagemStatusBadge status={viagem.status} />
            {emAndamento && (
              <>
                {!viagem.iniciada_em && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      iniciar.mutate(viagem.id, {
                        onSuccess: () => toast.success('Viagem iniciada.'),
                      })
                    }
                  >
                    <Play className="h-4 w-4" /> Iniciar
                  </Button>
                )}
                {viagem.iniciada_em && (
                  <Button size="sm" disabled={busy} onClick={() => setEncerrarOpen(true)}>
                    <Flag className="h-4 w-4" /> Encerrar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setCancelarOpen(true)}
                >
                  <XCircle className="h-4 w-4" /> Cancelar
                </Button>
              </>
            )}
          </div>
        }
      />

      {encerrarOpen && (
        <EncerrarViagemModal
          open={encerrarOpen}
          onClose={() => setEncerrarOpen(false)}
          viagem={viagem}
        />
      )}
      <ConfirmDialog
        open={cancelarOpen}
        onClose={() => setCancelarOpen(false)}
        title="Cancelar viagem"
        description="Cancelar esta viagem? As NFs voltam a ficar disponíveis para outra viagem."
        confirmLabel="Cancelar viagem"
        cancelLabel="Voltar"
        destructive
        loading={cancelar.isPending}
        onConfirm={() =>
          cancelar.mutate(viagem.id, {
            onSuccess: () => {
              toast.success('Viagem cancelada.')
              setCancelarOpen(false)
            },
            onError: () => setCancelarOpen(false),
          })
        }
      />

      <div className="space-y-6 p-6">
        <Link
          to="/viagens"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para viagens
        </Link>

        {/* Resumo + mapa */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="Veículo" value={`${viagem.veiculo_placa}${viagem.veiculo_modelo ? ` — ${viagem.veiculo_modelo}` : ''}`} />
              <Info label="Motorista" value={viagem.motorista_nome} />
              <Info label="Início" value={formatDateTime(viagem.iniciada_em)} />
              <Info label="Encerramento" value={formatDateTime(viagem.encerrada_em)} />
              <Info label="Km inicial" value={viagem.km_inicial?.toString() ?? '—'} />
              <Info label="Km final" value={viagem.km_final?.toString() ?? '—'} />
              <Info label="Rota planejada" value={rota?.nome ?? (viagem.rota_planejada_id ? 'Sem nome' : 'Nenhuma')} />
              {stats && (
                <>
                  <p className="border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Telemetria (GPS)
                  </p>
                  <Info label="Km rodado (GPS)" value={`${stats.km.toFixed(1)} km`} />
                  <Info label="Tempo em movimento" value={formatDuracaoMin(stats.movimentoMin)} />
                  <Info
                    label="Tempo parado"
                    value={`${formatDuracaoMin(stats.paradoMin)}${
                      stats.paradas > 0 ? ` (${stats.paradas} parada${stats.paradas > 1 ? 's' : ''})` : ''
                    }`}
                  />
                  <Info
                    label="Vel. média / máxima"
                    value={`${Math.round(stats.velMedia)} / ${Math.round(stats.velMax)} km/h`}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <div ref={mapaRef} className="lg:col-span-2">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Trajeto</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Suspense fallback={<div className="h-[420px] w-full"><PageLoader label="Carregando mapa…" /></div>}>
                  <TripMap
                    className="h-[420px] w-full"
                    pontos={trajetoria?.pontos ?? []}
                    linhaRuas={trajetoRuas?.linha}
                    rota={rota?.linha}
                    alertas={alertas}
                    paradasDetectadas={trajetoria?.paradas_detectadas}
                    foco={foco}
                    erroTrajeto={trajetoriaQ.isError}
                    onTentarNovamente={() => void trajetoriaQ.refetch()}
                  />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Paradas */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Paradas ({viagem.paradas?.length ?? 0})
          </h2>
          {viagem.paradas && viagem.paradas.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH className="w-12">#</TH>
                  <TH>NF</TH>
                  <TH>Destinatário</TH>
                  <TH>Status</TH>
                  <TH>Chegada prevista</TH>
                  <TH>Chegada real</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {viagem.paradas.map((p) => {
                  const coord = paradaCoord.get(p.id)
                  return (
                    <TR
                      key={p.id}
                      className={
                        coord
                          ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                          : undefined
                      }
                      onClick={coord ? () => focar(coord.lng, coord.lat) : undefined}
                      onKeyDown={
                        coord
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                focar(coord.lng, coord.lat)
                              }
                            }
                          : undefined
                      }
                      tabIndex={coord ? 0 : undefined}
                      role={coord ? 'button' : undefined}
                      aria-label={coord ? `Ver no mapa onde a parada ${p.ordem} foi entregue` : undefined}
                      title={coord ? 'Ver no mapa onde foi entregue' : undefined}
                    >
                      <TD className="text-muted-foreground">{p.ordem}</TD>
                      <TD className="font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {coord && <MapPin className="h-3.5 w-3.5 text-primary" />}
                          {p.nf_numero ?? '—'}
                        </span>
                      </TD>
                      <TD>{p.nf_destinatario_nome ?? '—'}</TD>
                      <TD>
                        <ParadaStatusBadge status={p.status} />
                      </TD>
                      <TD>{formatDateTime(p.chegada_prevista)}</TD>
                      <TD>{formatDateTime(p.chegada_real)}</TD>
                      <TD className="text-right">
                        {p.status === 'pendente' && emAndamento && viagem.iniciada_em && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation()
                              marcarParada.mutate(
                                {
                                  viagemId: viagem.id,
                                  paradaId: p.id,
                                  status: 'entregue',
                                },
                                {
                                  onSuccess: () =>
                                    toast.success(
                                      `Parada ${p.nf_numero ? `da NF ${p.nf_numero} ` : ''}marcada como entregue.`,
                                    ),
                                },
                              )
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Entregar
                          </Button>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma parada cadastrada.</p>
          )}
        </section>

        {/* Alertas */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Alertas ({alertas?.length ?? 0})
          </h2>
          {alertas && alertas.length > 0 ? (
            <div className="space-y-2">
              {alertas.map((a) => {
                const coord = a.coordenada
                return (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 ${
                      coord
                        ? 'cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        : ''
                    }`}
                    onClick={coord ? () => focar(coord.lng, coord.lat) : undefined}
                    onKeyDown={
                      coord
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              focar(coord.lng, coord.lat)
                            }
                          }
                        : undefined
                    }
                    tabIndex={coord ? 0 : undefined}
                    role={coord ? 'button' : undefined}
                    title={coord ? 'Ver no mapa onde ocorreu' : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <AlertaTipoBadge tipo={a.tipo} />
                      <span className="text-sm">{a.descricao ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(a.criado_em)}
                      </span>
                      {coord && <Crosshair className="h-4 w-4 text-primary" />}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum alerta nesta viagem.</p>
          )}
        </section>
      </div>
    </div>
  )
}

// Estatísticas calculadas dos pontos brutos do GPS (mostradas no Resumo).
function estatisticasGps(
  pontos: PontoTrajeto[],
  paradasDetectadas: { duracao_min: number }[],
): {
  km: number
  movimentoMin: number
  paradoMin: number
  paradas: number
  velMedia: number
  velMax: number
} | null {
  if (pontos.length < 2) return null
  let metros = 0
  let velMax = 0
  for (let i = 1; i < pontos.length; i++) {
    const d = haversineM(pontos[i - 1]!, pontos[i]!)
    metros += d
    const dtS =
      (new Date(pontos[i]!.registrado_em).getTime() -
        new Date(pontos[i - 1]!.registrado_em).getTime()) /
      1000
    // Velocidade do trecho: a reportada pelo GPS; senão a implícita.
    const v = pontos[i]!.velocidade_kmh ?? (dtS > 0 ? (d / dtS) * 3.6 : 0)
    if (v > velMax) velMax = v
  }
  const km = metros / 1000
  const totalMin =
    (new Date(pontos[pontos.length - 1]!.registrado_em).getTime() -
      new Date(pontos[0]!.registrado_em).getTime()) /
    60000
  const paradoMin = Math.min(
    totalMin,
    paradasDetectadas.reduce((s, p) => s + p.duracao_min, 0),
  )
  const movimentoMin = Math.max(0, totalMin - paradoMin)
  const velMedia = movimentoMin > 0 ? km / (movimentoMin / 60) : 0
  return { km, movimentoMin, paradoMin, paradas: paradasDetectadas.length, velMedia, velMax }
}

// Acha o ponto de GPS mais próximo de um horário (até 30 min de diferença).
function pontoNoTempo(
  pontos: PontoTrajeto[],
  iso: string,
): { lng: number; lat: number } | null {
  const alvo = new Date(iso).getTime()
  if (Number.isNaN(alvo)) return null
  let melhor: PontoTrajeto | null = null
  let menorDif = Infinity
  for (const p of pontos) {
    const dif = Math.abs(new Date(p.registrado_em).getTime() - alvo)
    if (dif < menorDif) {
      menorDif = dif
      melhor = p
    }
  }
  return melhor && menorDif < 30 * 60 * 1000 ? { lng: melhor.lng, lat: melhor.lat } : null
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
