import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, ExternalLink, FileText, Link2, Plus, Radar, Search } from 'lucide-react'
import type { Multa } from '@/types'
import {
  useConsultarVeiculo,
  useMultaMutations,
  useMultas,
  useVeiculos,
  type MultasFiltro,
} from '@/api/hooks'
import { ApiError, baixarArquivo, qs } from '@/lib/api'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Pagination } from '@/components/Pagination'
import { MultaPagamentoBadge, MultaRevisaoBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
  const [exportando, setExportando] = useState(false)
  const multas = data?.data ?? []

  // Busca automática: consulta o Detran para todos os veículos aptos.
  const { data: veiculos } = useVeiculos()
  const consultar = useConsultarVeiculo()
  const [buscarOpen, setBuscarOpen] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const consultaveis = (veiculos ?? []).filter((v) => v.ativo && v.renavam)
  const semRenavam = (veiculos ?? []).filter((v) => v.ativo && !v.renavam).length

  async function buscarTodas() {
    setBuscarOpen(false)
    let novas = 0
    let duplicadas = 0
    const falhas: string[] = []
    // Progresso num toast persistente (id fixo): o Toaster é global, então o
    // andamento continua visível mesmo se o usuário navegar para outra tela
    // enquanto a consulta roda.
    const TOAST_ID = 'busca-multas-progresso'
    // Sequencial de propósito: o Detran não gosta de rajada e o limite de
    // consultas do plano é checado por chamada.
    for (const [i, v] of consultaveis.entries()) {
      const msg = `Consultando ${v.placa} (${i + 1}/${consultaveis.length})…`
      setProgresso(msg)
      toast.loading(msg, {
        id: TOAST_ID,
        duration: Infinity,
        description: 'Pode navegar pelo sistema — avisamos aqui quando terminar.',
      })
      try {
        const r = await consultar.mutateAsync(v.id)
        novas += r.multasNovas
        duplicadas += r.multasDuplicadas
      } catch {
        falhas.push(v.placa)
      }
    }
    setProgresso(null)
    if (novas > 0) {
      toast.success(
        `${novas} multa${novas > 1 ? 's' : ''} nova${novas > 1 ? 's' : ''} encontrada${novas > 1 ? 's' : ''}.` +
          (duplicadas > 0 ? ` Outras ${duplicadas} já estavam no sistema.` : ''),
        { id: TOAST_ID, duration: 8000, description: undefined },
      )
    } else if (falhas.length < consultaveis.length) {
      toast.info(
        duplicadas > 0
          ? `Nenhuma multa nova — ${duplicadas} já estavam no sistema.`
          : 'Nenhuma multa nova encontrada. Boa notícia para a frota.',
        { id: TOAST_ID, duration: 8000, description: undefined },
      )
    } else {
      // Só falhas: o toast de progresso não pode ficar girando para sempre.
      toast.dismiss(TOAST_ID)
    }
    if (falhas.length > 0) {
      toast.error(
        `A consulta falhou em: ${falhas.join(', ')}. O Detran pode estar instável — tente de novo em instantes.`,
        { duration: 10_000 },
      )
    }
  }

  const reset = (fn: () => void) => {
    fn()
    setOffset(0)
  }

  // Baixa o comprovante oficial da consulta que encontrou a multa.
  async function baixarComprovante(m: Multa) {
    try {
      await baixarArquivo(
        `/multas/${m.id}/comprovante`,
        `comprovante-${m.numero_auto ?? m.id}.${m.comprovante_ext ?? 'pdf'}`,
      )
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível baixar o comprovante.',
      )
    }
  }

  // Exporta com os mesmos filtros aplicados na tela (download autenticado).
  async function exportar() {
    setExportando(true)
    try {
      await baixarArquivo(
        `/multas/export.csv${qs({
          status_revisao: statusRevisao || undefined,
          status_pagamento: statusPagamento || undefined,
          busca: buscaAplicada || undefined,
        })}`,
        'multas.csv',
      )
      toast.success('CSV de multas exportado.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível exportar o CSV.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Multas"
        description="Infrações vinculadas automaticamente às viagens."
        actions={
          <>
            <Button variant="outline" onClick={exportar} disabled={exportando}>
              <Download className="h-4 w-4" /> {exportando ? 'Exportando…' : 'Exportar CSV'}
            </Button>
            <Button variant="outline" onClick={() => setCriarOpen(true)}>
              <Plus className="h-4 w-4" /> Lançar multa
            </Button>
            <Button
              disabled={!!progresso}
              onClick={() => {
                if (consultaveis.length === 0) {
                  toast.info(
                    'Cadastre um veículo com placa e Renavam em Cadastros → Veículos para poder buscar multas.',
                  )
                  return
                }
                setBuscarOpen(true)
              }}
            >
              <Radar className="h-4 w-4" /> {progresso ?? 'Buscar multas'}
            </Button>
          </>
        }
      />
      {criarOpen && <CriarMultaModal open={criarOpen} onClose={() => setCriarOpen(false)} />}
      {buscarOpen && (
        <ConfirmDialog
          open={buscarOpen}
          onClose={() => setBuscarOpen(false)}
          onConfirm={buscarTodas}
          title="Buscar multas no Detran"
          confirmLabel="Consultar agora"
          description={
            `Vamos consultar ${consultaveis.length} veículo${consultaveis.length > 1 ? 's' : ''} direto no Detran/SP. ` +
            `Cada veículo consome 1 consulta da cota do mês.` +
            (semRenavam > 0
              ? ` ${semRenavam} veículo${semRenavam > 1 ? 's' : ''} sem Renavam fica${semRenavam > 1 ? 'm' : ''} de fora.`
              : '')
          }
        />
      )}

      <div className="space-y-4 p-4 sm:p-6">
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
            {/* Cards empilhados no mobile (<md) — mesmo padrão da lista de viagens */}
            <div className="space-y-2 md:hidden">
              {multas.map((m) => (
                <div key={m.id} className="rounded-lg border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{m.veiculo_placa ?? '—'}</span>
                    <span className="font-display text-base font-semibold">
                      {formatCurrency(m.valor)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Auto {m.numero_auto ?? '—'}
                    {m.motorista_nome && ` · ${m.motorista_nome}`}
                  </div>
                  {m.tipo && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.tipo}</div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <MultaRevisaoBadge status={m.status_revisao} />
                    <MultaPagamentoBadge status={m.status_pagamento} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDateTime(m.ocorrida_em)}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    {m.comprovante_ext && (
                      <Button size="sm" variant="ghost" onClick={() => baixarComprovante(m)}>
                        <FileText className="h-4 w-4" /> Comprovante
                      </Button>
                    )}
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
                        <Link2 className="h-4 w-4" /> Achar viagem
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
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
                        {m.comprovante_ext && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Baixar o comprovante oficial da consulta (prova de que a multa existe no órgão)"
                            onClick={() => baixarComprovante(m)}
                          >
                            <FileText className="h-4 w-4" /> Comprovante
                          </Button>
                        )}
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
                            <Link2 className="h-4 w-4" /> Achar viagem
                          </Button>
                        )}
                      </div>
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
