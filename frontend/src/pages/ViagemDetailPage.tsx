import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Flag, Play, XCircle } from 'lucide-react'
import {
  useAlertasDaViagem,
  useRota,
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
  const { data: alertas } = useAlertasDaViagem(id)
  const { data: rota } = useRota(viagem?.rota_planejada_id)
  const { iniciar, encerrar, cancelar, marcarParada } = useViagemMutations()

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

          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader>
              <CardTitle>Trajeto</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<div className="h-[420px] w-full"><PageLoader label="Carregando mapa…" /></div>}>
                <TripMap
                  className="h-[420px] w-full"
                  pontos={trajetoria?.pontos ?? []}
                  rota={rota?.linha}
                  alertas={alertas}
                />
              </Suspense>
            </CardContent>
          </Card>
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
                {viagem.paradas.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-muted-foreground">{p.ordem}</TD>
                    <TD className="font-medium">{p.nf_numero ?? '—'}</TD>
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
                          onClick={() =>
                            marcarParada.mutate({
                              viagemId: viagem.id,
                              paradaId: p.id,
                              status: 'entregue',
                            })
                          }
                        >
                          <CheckCircle2 className="h-4 w-4" /> Entregar
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
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
              {alertas.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <AlertaTipoBadge tipo={a.tipo} />
                    <span className="text-sm">{a.descricao ?? '—'}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(a.criado_em)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum alerta nesta viagem.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
