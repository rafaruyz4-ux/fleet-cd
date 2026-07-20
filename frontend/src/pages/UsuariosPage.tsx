import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { useUsuarioMutations, useUsuariosEmpresa } from '@/api/hooks'
import { useAuth } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import type { UsuarioTenant } from '@/types'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { NovoUsuarioModal } from './usuarios/NovoUsuarioModal'

function PapelBadge({ papel }: { papel: 'admin' | 'gestor' }) {
  return papel === 'admin' ? (
    <Badge variant="default">Administrador</Badge>
  ) : (
    <Badge variant="secondary">Gestor</Badge>
  )
}

export function UsuariosPage() {
  const { usuario: eu } = useAuth()
  const { data: usuarios, isLoading, error } = useUsuariosEmpresa()
  const { atualizar } = useUsuarioMutations()
  const [criarOpen, setCriarOpen] = useState(false)
  const [desativarAlvo, setDesativarAlvo] = useState<UsuarioTenant | null>(null)

  const lista = usuarios ?? []
  const adminsAtivos = lista.filter((u) => u.papel === 'admin' && u.ativo).length

  function mudarPapel(u: UsuarioTenant) {
    const novo = u.papel === 'admin' ? 'gestor' : 'admin'
    atualizar.mutate(
      { id: u.id, input: { papel: novo } },
      {
        onSuccess: () =>
          toast.success(
            novo === 'admin'
              ? `${u.nome} agora é administrador.`
              : `${u.nome} agora é gestor.`,
          ),
      },
    )
  }

  function confirmarDesativar() {
    const u = desativarAlvo
    if (!u) return
    atualizar.mutate(
      { id: u.id, input: { ativo: false } },
      {
        onSuccess: () => {
          toast.success(`${u.nome} foi desativado e não acessa mais o painel.`)
          setDesativarAlvo(null)
        },
        onError: () => setDesativarAlvo(null),
      },
    )
  }

  function reativar(u: UsuarioTenant) {
    atualizar.mutate(
      { id: u.id, input: { ativo: true } },
      { onSuccess: () => toast.success(`${u.nome} foi reativado.`) },
    )
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Quem da sua equipe acessa o painel — e com qual papel."
        actions={
          <Button onClick={() => setCriarOpen(true)}>
            <Plus className="h-4 w-4" /> Novo usuário
          </Button>
        }
      />
      {criarOpen && <NovoUsuarioModal open={criarOpen} onClose={() => setCriarOpen(false)} />}

      <div className="space-y-4 p-4 sm:p-6">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={lista.length === 0}
          emptyLabel="Nenhum usuário ainda."
          skeleton={<TableSkeleton cols={5} />}
        />

        {lista.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>E-mail</TH>
                <TH>Papel</TH>
                <TH>Status</TH>
                <TH>Criado em</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {lista.map((u) => {
                const souEu = u.id === eu?.id
                // Espelho das travas do backend, para não oferecer ações que falhariam.
                const ultimoAdmin = u.papel === 'admin' && u.ativo && adminsAtivos <= 1
                return (
                  <TR key={u.id}>
                    <TD>
                      <span className="font-medium">{u.nome}</span>
                      {souEu && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                    </TD>
                    <TD>{u.email}</TD>
                    <TD>
                      <PapelBadge papel={u.papel} />
                    </TD>
                    <TD>
                      {u.ativo ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="muted">Desativado</Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(u.criado_em)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        {u.ativo && !souEu && !(u.papel === 'admin' && ultimoAdmin) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={atualizar.isPending}
                            onClick={() => mudarPapel(u)}
                            title={
                              u.papel === 'admin' ? 'Rebaixar para gestor' : 'Promover a administrador'
                            }
                          >
                            <ShieldCheck className="h-4 w-4" />
                            {u.papel === 'admin' ? 'Tornar gestor' : 'Tornar admin'}
                          </Button>
                        )}
                        {u.ativo ? (
                          !souEu &&
                          !ultimoAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={atualizar.isPending}
                              onClick={() => setDesativarAlvo(u)}
                            >
                              <UserX className="h-4 w-4" /> Desativar
                            </Button>
                          )
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={atualizar.isPending}
                            onClick={() => reativar(u)}
                          >
                            <UserCheck className="h-4 w-4" /> Reativar
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}

        <p className="text-xs text-muted-foreground">
          Desativar é reversível: a pessoa perde o acesso na hora, mas o histórico dela permanece. A
          empresa precisa de ao menos um administrador ativo.
        </p>
      </div>

      <ConfirmDialog
        open={desativarAlvo !== null}
        onClose={() => setDesativarAlvo(null)}
        onConfirm={confirmarDesativar}
        title="Desativar usuário?"
        description={
          desativarAlvo
            ? `${desativarAlvo.nome} (${desativarAlvo.email}) perderá o acesso ao painel imediatamente. Você pode reativar depois.`
            : undefined
        }
        confirmLabel="Desativar"
        destructive
        loading={atualizar.isPending}
      />
    </div>
  )
}
