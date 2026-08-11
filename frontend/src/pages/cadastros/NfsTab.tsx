import { useState } from 'react'
import { FileUp, Search, Upload, X } from 'lucide-react'
import { useImportarNfe, useNfs, type NfsFiltro } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import { DataState } from '@/components/DataState'
import { Pagination } from '@/components/Pagination'
import { NfStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'

const LIMIT = 20

/** Aba de Notas fiscais dentro de Cadastros (antes era a página /nfs). */
export function NfsTab() {
  const [status, setStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [offset, setOffset] = useState(0)
  const [importOpen, setImportOpen] = useState(false)

  const filtro: NfsFiltro = {
    status: status || undefined,
    busca: buscaAplicada || undefined,
    limit: LIMIT,
    offset,
  }

  const { data, isLoading, error, isPlaceholderData } = useNfs(filtro)
  const nfs = data?.data ?? []

  const reset = (fn: () => void) => {
    fn()
    setOffset(0)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setImportOpen((v) => !v)}>
          <FileUp className="h-4 w-4" /> Importar nota fiscal
        </Button>
      </div>

      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} />}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select
            className="w-44"
            value={status}
            onChange={(e) => reset(() => setStatus(e.target.value))}
          >
            <option value="">Todos</option>
            <option value="importada">Importada</option>
            <option value="alocada">Alocada</option>
            <option value="em_viagem">Em viagem</option>
            <option value="entregue">Entregue</option>
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
            <Label>Busca (nº / destinatário)</Label>
            <Input
              className="w-64"
              placeholder="Número da NF ou destinatário"
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
        isEmpty={nfs.length === 0}
        emptyLabel="Nenhuma nota fiscal encontrada."
        emptyAction={
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" /> Importar a primeira nota
          </Button>
        }
        skeleton={<TableSkeleton cols={5} />}
      />

      {nfs.length > 0 && (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          {/* Cards empilhados no mobile (<md) */}
          <div className="space-y-2 md:hidden">
            {nfs.map((nf) => (
              <div key={nf.id} className="rounded-lg border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    NF {nf.numero ?? '—'}
                    {nf.serie && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        Série {nf.serie}
                      </span>
                    )}
                  </span>
                  <NfStatusBadge status={nf.status} />
                </div>
                <div className="mt-1 truncate text-sm text-muted-foreground">
                  {nf.destinatario_nome ?? '—'}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Emissão: {formatDate(nf.emitida_em)}</span>
                  <span>{formatCurrency(nf.valor_total)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <TH>Número</TH>
                <TH>Destinatário</TH>
                <TH>Emissão</TH>
                <TH>Valor</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {nfs.map((nf) => (
                <TR key={nf.id}>
                  <TD>
                    <div className="font-medium">{nf.numero ?? '—'}</div>
                    {nf.serie && (
                      <div className="text-xs text-muted-foreground">Série {nf.serie}</div>
                    )}
                  </TD>
                  <TD>{nf.destinatario_nome ?? '—'}</TD>
                  <TD className="whitespace-nowrap">{formatDate(nf.emitida_em)}</TD>
                  <TD>{formatCurrency(nf.valor_total)}</TD>
                  <TD>
                    <NfStatusBadge status={nf.status} />
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
  )
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const [xml, setXml] = useState('')
  const importar = useImportarNfe()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setXml(await file.text())
  }

  async function onImport() {
    setMsg(null)
    try {
      const nf = await importar.mutateAsync(xml)
      setMsg({ ok: true, text: `NF ${nf.numero ?? nf.chave_acesso} importada com sucesso.` })
      setXml('')
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.status === 409
            ? 'Esta NF já foi importada.'
            : err.message
          : 'Falha ao importar o XML.'
      setMsg({ ok: false, text })
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Importar nota fiscal</h2>
          <p className="text-xs text-muted-foreground">
            Escolha o arquivo XML da NF-e (aquele que vem junto do DANFE por e-mail).
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Input
        type="file"
        accept=".xml,text/xml,application/xml"
        onChange={onFile}
        className="max-w-xs"
      />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Avançado: colar o conteúdo do XML manualmente
        </summary>
        <textarea
          className="mt-2 h-40 w-full rounded-md border border-input bg-background p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="<nfeProc>…</nfeProc>"
          value={xml}
          onChange={(e) => setXml(e.target.value)}
        />
      </details>
      {msg && (
        <p
          className={
            msg.ok
              ? 'rounded-md bg-success/10 px-3 py-2 text-sm text-success'
              : 'rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
          }
        >
          {msg.text}
        </p>
      )}
      <Button onClick={onImport} disabled={!xml.trim() || importar.isPending}>
        {importar.isPending ? <Spinner /> : <Upload className="h-4 w-4" />}
        Importar
      </Button>
    </div>
  )
}
