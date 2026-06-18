import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'

// Lazy: o MapLibre (~pesado) só é baixado ao abrir o detalhe de uma viagem.
const TripMap = lazy(() =>
  import('@/components/TripMap').then((m) => ({ default: m.TripMap })),
)

export function ViagemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: viagem, isLoading, error } = useViagem(id)
  // Atualiza a trajetória a cada 15s quando a viagem está em andamento.
  const emAndamento = viagem?.status === 'em_andamento'
  const { data: trajetoria } = useTrajetoria(id, emAndamento ? 15_000 : undefined)
  // Trajeto encaixado nas ruas (atualiza junto da trajetória quando em andamento).
  const { data: trajetoRuas } = useTrajetoRuas(id, emAndamento ? 30_000 : undefined)
  const { data: alertas } = useAlertasDaViagem(id)
  const { data: rota } = useRota(viagem?.rota_planejada_id)
  const { iniciar, encerrar, cancelar, marcarParada } = useViagemMutations()

  const [foco, setFoco] = useState<FocoMapa | null>(null)
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

  const onEncerrar = () => {
    const entrada = window.prompt('Km final (opcional):', '')
    if (entrada === null) return // cancelou
    const km = entrada.trim() === '' ? undefined : Number(entrada)
    if (km !== undefined && Number.isNaN(km)) {
      alert('Km final inválido.')
      return
    }
    encerrar.mutate({ id: viagem.id, km_final: km })
  }

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
                  <Button size="sm" disabled={busy} onClick={() => iniciar.mutate(viagem.id)}>
                    <Play className="h-4 w-4" /> Iniciar
                  </Button>
                )}
                {viagem.iniciada_em && (
                  <Button size="sm" disabled={busy} onClick={onEncerrar}>
                    <Flag className="h-4 w-4" /> Encerrar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (confirm('Cancelar esta viagem? As NFs voltam a ficar disponíveis.'))
                      cancelar.mutate(viagem.id)
                  }}
                >
                  <XCircle className="h-4 w-4" /> Cancelar
                </Button>
              </>
            )}
          </div>
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
                    foco={foco}
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
                      className={coord ? 'cursor-pointer' : undefined}
                      onClick={coord ? () => focar(coord.lng, coord.lat) : undefined}
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
                              marcarParada.mutate({
                                viagemId: viagem.id,
                                paradaId: p.id,
                                status: 'entregue',
                              })
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
                      coord ? 'cursor-pointer transition-colors hover:bg-accent' : ''
                    }`}
                    onClick={coord ? () => focar(coord.lng, coord.lat) : undefined}
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
