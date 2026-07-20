import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ExternalLink, Link2, Plus, Search } from 'lucide-react'
import { useMultaMutations, useMultas, type MultasFiltro } from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Pagination } from '@/components/Pagination'
import { MultaPagamentoBadge, MultaRevisaoBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { CriarMultaModal } from './multas/CriarMultaModal'

const LIMIT = 20

export function MultasPage() {
  const [statusRevisao, setStatusRevisao] = useState('')
  const [statusPagamento, setStatusPagamento] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [offset, setOffset] = useState(0)
  const [criarOpen, setCriarOpen] = useState(false)

  const filtro: MultasFiltro = {
    status_revisao: statusRevisao || undefined,
    status_pagamento: statusPagamento || undefined,
    busca: buscaAplicada || undefined,
    limit: LIMIT,
    offset,
  }

  const { data, isLoading, error, isPlaceholderData } = useMultas(filtro)
  const { revincular } = useMultaMutations()
  const multas = data?.data ?? []

  const reset = (fn: () => void) => {
    fn()
    setOffset(0)
  }

  return (
    <div>
      <PageHeader
        title="Multas"
        description="Infrações vinculadas automaticamente às viagens."
        actions={
          <Button onClick={() => setCriarOpen(true)}>
            <Plus className="h-4 w-4" /> Lançar multa
          </Button>
        }
      />
      {criarOpen && <CriarMultaModal open={criarOpen} onClose={() => setCriarOpen(false)} />}

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <div className="space-y-1">
            <Label>Revisão</Label>
            <Select
              className="w-48"
              value={statusRevisao}
              onChange={(e) => reset(() => setStatusRevisao(e.target.value))}
            >
              <option value="">Todas</option>
              <option value="auto_vinculada">Auto-vinculada</option>
              <option value="aguardando_revisao">Aguardando revisão</option>
              <option value="revisada">Revisada</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Pagamento</Label>
            <Select
              className="w-44"
              value={statusPagamento}
              onChange={(e) => reset(() => setStatusPagamento(e.target.value))}
            >
              <option value="">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="recurso">Em recurso</option>
            </Select>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              reset(() => setBuscaAplicada(busca.trim()))
            }}
          >
            <div className="space-y-1">
              <Label>Busca (auto / tipo)</Label>
              <Input
                className="w-56"
                placeholder="Nº do auto ou descrição"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              <Search className="h-4 w-4" /> Buscar
            </Button>
          </form>
        </div>

        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={multas.length === 0}
          emptyLabel="Nenhuma multa encontrada. Boa notícia para a frota."
          skeleton={<TableSkeleton cols={7} />}
        />

        {multas.length > 0 && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <THead>
                <TR>
                  <TH>Auto</TH>
                  <TH>Veículo</TH>
                  <TH>Ocorrência</TH>
                  <TH>Valor</TH>
                  <TH>Revisão</TH>
                  <TH>Pagamento</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {multas.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <div className="font-medium">{m.numero_auto ?? '—'}</div>
                      {m.tipo && (
                        <div className="max-w-52 truncate text-xs text-muted-foreground">
                          {m.tipo}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <div>{m.veiculo_placa ?? '—'}</div>
                      {m.motorista_nome && (
                        <div className="text-xs text-muted-foreground">{m.motorista_nome}</div>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(m.ocorrida_em)}</TD>
                    <TD>{formatCurrency(m.valor)}</TD>
                    <TD>
                      <MultaRevisaoBadge status={m.status_revisao} />
                    </TD>
                    <TD>
                      <MultaPagamentoBadge status={m.status_pagamento} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        {m.viagem_id ? (
                          <Link to={`/viagens/${m.viagem_id}`}>
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="h-4 w-4" /> Viagem
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={revincular.isPending}
                            onClick={() =>
                              revincular.mutate(m.id, {
                                onSuccess: (r) => {
                                  if (r.viagem_id) toast.success('Multa vinculada a uma viagem.')
                                  else
                                    toast.info(
                                      'Nenhuma viagem encontrada para o veículo na data da multa.',
                                    )
                                },
                              })
                            }
                          >
                            <Link2 className="h-4 w-4" /> Revincular
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
