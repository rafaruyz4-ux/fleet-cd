import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink } from 'lucide-react'
import { useAlertas, useMarcarAlerta, type AlertasFiltro } from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Pagination } from '@/components/Pagination'
import { AlertaTipoBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'

const LIMIT = 50

export function AlertasPage() {
  const [tipo, setTipo] = useState('')
  const [visualizado, setVisualizado] = useState('') // '', 'false', 'true'
  const [offset, setOffset] = useState(0)

  const filtro: AlertasFiltro = {
    tipo: tipo || undefined,
    visualizado: visualizado === '' ? undefined : visualizado === 'true',
    limit: LIMIT,
    offset,
  }

  const { data, isLoading, error, isPlaceholderData } = useAlertas(filtro)
  const marcar = useMarcarAlerta()
  const alertas = data?.data ?? []

  const reset = (fn: () => void) => {
    fn()
    setOffset(0)
  }

  return (
    <div>
      <PageHeader title="Alertas" description="Eventos de telemetria detectados nas viagens." />

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select
              className="w-48"
              value={tipo}
              onChange={(e) => reset(() => setTipo(e.target.value))}
            >
              <option value="">Todos</option>
              <option value="velocidade_alta">Velocidade alta</option>
              <option value="desvio_rota">Desvio de rota</option>
              <option value="parada_longa">Parada longa</option>
              <option value="sem_gps">Sem GPS</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Situação</Label>
            <Select
              className="w-44"
              value={visualizado}
              onChange={(e) => reset(() => setVisualizado(e.target.value))}
            >
              <option value="">Todas</option>
              <option value="false">Não vistos</option>
              <option value="true">Vistos</option>
            </Select>
          </div>
        </div>

        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={alertas.length === 0}
          emptyLabel="Nenhum alerta encontrado. Frota rodando em paz."
          skeleton={<TableSkeleton cols={5} />}
        />

        {alertas.length > 0 && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH>Descrição</TH>
                  <TH>Quando</TH>
                  <TH>Situação</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {alertas.map((a) => (
                  <TR key={a.id} className={a.visualizado ? 'opacity-60' : undefined}>
                    <TD>
                      <AlertaTipoBadge tipo={a.tipo} />
                    </TD>
                    <TD>{a.descricao ?? '—'}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(a.criado_em)}</TD>
                    <TD>
                      {a.visualizado ? (
                        <Badge variant="muted">Visto</Badge>
                      ) : (
                        <Badge variant="warning">Novo</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        {a.viagem_id && (
                          <Link to={`/viagens/${a.viagem_id}`}>
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="h-4 w-4" /> Viagem
                            </Button>
                          </Link>
                        )}
                        {!a.visualizado && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={marcar.isPending}
                            onClick={() => marcar.mutate({ id: a.id, visualizado: true })}
                          >
                            <Check className="h-4 w-4" /> Marcar visto
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              total={data?.total ?? 0}
              limit={LIMIT}
              offset={offset}
              onChange={setOffset}
            />
          </div>
        )}
      </div>
    </div>
  )
}
