import { useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { useEmpresas } from '@/api/hooks'
import type { Empresa } from '@/types'
import { PageHeader } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { NovaEmpresaModal } from './bastidores/NovaEmpresaModal'

const PLANO_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  ativo: { label: 'Ativo', variant: 'success' },
  trial: { label: 'Teste', variant: 'warning' },
  suspenso: { label: 'Suspenso', variant: 'destructive' },
  cancelado: { label: 'Cancelado', variant: 'muted' },
}

function formatarData(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

export function BackofficePage() {
  const { data: empresas, isLoading, isError } = useEmpresas()
  const [modalAberto, setModalAberto] = useState(false)

  return (
    <>
      <PageHeader
        title="Bastidores — Empresas clientes"
        description="Cadastre e acompanhe as empresas que contrataram o sistema."
        actions={
          <Button onClick={() => setModalAberto(true)}>
            <Plus className="h-4 w-4" />
            Nova empresa
          </Button>
        }
      />

      <div className="p-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Carregando empresas…
          </div>
        )}
        {isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Não foi possível carregar as empresas.
          </p>
        )}

        {empresas && empresas.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhuma empresa cadastrada ainda</p>
              <p className="text-sm text-muted-foreground">
                Cadastre a primeira empresa cliente após fechar o contrato.
              </p>
            </div>
            <Button onClick={() => setModalAberto(true)}>
              <Plus className="h-4 w-4" />
              Nova empresa
            </Button>
          </div>
        )}

        {empresas && empresas.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Empresa</TH>
                <TH>CNPJ</TH>
                <TH>Plano</TH>
                <TH>Usuários</TH>
                <TH>Criada em</TH>
              </TR>
            </THead>
            <TBody>
              {empresas.map((e: Empresa) => {
                const badge = PLANO_BADGE[e.plano] ?? { label: e.plano, variant: 'muted' as const }
                return (
                  <TR key={e.id}>
                    <TD className="font-medium">{e.nome}</TD>
                    <TD className="text-muted-foreground">{e.cnpj ?? '—'}</TD>
                    <TD>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TD>
                    <TD>{e.total_usuarios}</TD>
                    <TD className="text-muted-foreground">{formatarData(e.criado_em)}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </div>

      <NovaEmpresaModal open={modalAberto} onClose={() => setModalAberto(false)} />
    </>
  )
}
