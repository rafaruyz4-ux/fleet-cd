import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { useMotoristas, useVeiculos, useViagens, type ViagensFiltro } from '@/api/hooks'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Pagination } from '@/components/Pagination'
import { ViagemStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { CardListSkeleton, TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { CriarViagemModal } from './viagens/CriarViagemModal'

const LIMIT = 20

export function ViagensPage() {
  const [status, setStatus] = useState('')
  const [veiculoId, setVeiculoId] = useState('')
  const [motoristaId, setMotoristaId] = useState('')
  const [offset, setOffset] = useState(0)
  const [criarOpen, setCriarOpen] = useState(false)

  const filtro: ViagensFiltro = {
    status: status || undefined,
    veiculo_id: veiculoId || undefined,
    motorista_id: motoristaId || undefined,
    limit: LIMIT,
    offset,
  }

  const { data, isLoading, error, isPlaceholderData } = useViagens(filtro)
  const veiculos = useVeiculos()
  const motoristas = useMotoristas()

  const reset = (fn: () => void) => {
    fn()
    setOffset(0)
  }

  const viagens = data?.data ?? []
  const semFiltros = !status && !veiculoId && !motoristaId

  return (
    <div>
      <PageHeader
        title="Viagens"
        description="Acompanhe e gerencie as viagens da frota."
        actions={
          <Button onClick={() => setCriarOpen(true)}>
            <Plus className="h-4 w-4" /> Nova viagem
          </Button>
        }
      />
      {criarOpen && <CriarViagemModal open={criarOpen} onClose={() => setCriarOpen(false)} />}

      <div className="space-y-4 p-4 sm:p-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select
              className="w-44"
              value={status}
              onChange={(e) => reset(() => setStatus(e.target.value))}
            >
              <option value="">Todos</option>
              <option value="em_andamento">Em andamento</option>
              <option value="encerrada">Encerrada</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Veículo</Label>
            <Select
              className="w-48"
              value={veiculoId}
              onChange={(e) => reset(() => setVeiculoId(e.target.value))}
            >
              <option value="">Todos</option>
              {veiculos.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa}
                  {v.modelo ? ` — ${v.modelo}` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Motorista</Label>
            <Select
              className="w-52"
              value={motoristaId}
              onChange={(e) => reset(() => setMotoristaId(e.target.value))}
            >
              <option value="">Todos</option>
              {motoristas.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Tabela */}
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={viagens.length === 0}
          emptyLabel={
            semFiltros
              ? 'Nenhuma viagem ainda.'
              : 'Nenhuma viagem encontrada com os filtros atuais.'
          }
          emptyAction={
            semFiltros ? (
              <Button size="sm" onClick={() => setCriarOpen(true)}>
                <Plus className="h-4 w-4" /> Criar a primeira viagem
              </Button>
            ) : undefined
          }
          skeleton={
            <>
              <div className="hidden md:block">
                <TableSkeleton cols={7} />
              </div>
              <div className="md:hidden">
                <CardListSkeleton items={4} />
              </div>
            </>
          }
        />

        {viagens.length > 0 && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            {/* Cards empilhados no mobile (<md) */}
            <div className="space-y-2 md:hidden">
              {viagens.map((v) => (
                <Link
                  key={v.id}
                  to={`/viagens/${v.id}`}
                  className="block rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {v.veiculo_placa}
                      {v.veiculo_modelo && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {v.veiculo_modelo}
                        </span>
                      )}
                    </span>
                    <ViagemStatusBadge status={v.status} />
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{v.motorista_nome}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Início: {formatDateTime(v.iniciada_em)}</span>
                    <span className="inline-flex items-center gap-1">
                      {v.paradas_count ?? 0} parada{(v.paradas_count ?? 0) === 1 ? '' : 's'}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Tabela no desktop (md+) — a 1ª célula é um Link que cobre a linha */}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Veículo</TH>
                    <TH>Motorista</TH>
                    <TH>Status</TH>
                    <TH>Início</TH>
                    <TH>Encerramento</TH>
                    <TH className="text-center">Paradas</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {viagens.map((v) => (
                    <TR key={v.id} className="relative">
                      <TD>
                        <Link
                          to={`/viagens/${v.id}`}
                          className="font-medium hover:text-primary focus-visible:outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                          aria-label={`Abrir viagem de ${v.veiculo_placa} com ${v.motorista_nome}`}
                        >
                          {v.veiculo_placa}
                        </Link>
                        {v.veiculo_modelo && (
                          <div className="text-xs text-muted-foreground">{v.veiculo_modelo}</div>
                        )}
                      </TD>
                      <TD>{v.motorista_nome}</TD>
                      <TD>
                        <ViagemStatusBadge status={v.status} />
                      </TD>
                      <TD className="whitespace-nowrap">{formatDateTime(v.iniciada_em)}</TD>
                      <TD className="whitespace-nowrap">{formatDateTime(v.encerrada_em)}</TD>
                      <TD className="text-center">{v.paradas_count ?? 0}</TD>
                      <TD className="text-right">
                        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

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
