import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  useMotoristaMutations,
  useMotoristas,
  useRotaMutations,
  useRotas,
  useUnidadeMutations,
  useUnidades,
  useVeiculoMutations,
  useVeiculos,
} from '@/api/hooks'
import type { Motorista, Rota, Unidade, Veiculo } from '@/types'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCpf, formatDate } from '@/lib/format'
import { VeiculoFormModal } from './cadastros/VeiculoFormModal'
import { MotoristaFormModal } from './cadastros/MotoristaFormModal'
import { UnidadeFormModal } from './cadastros/UnidadeFormModal'
import { RotaFormModal } from './cadastros/RotaFormModal'

type Aba = 'veiculos' | 'motoristas' | 'unidades' | 'rotas'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'veiculos', label: 'Veículos' },
  { key: 'motoristas', label: 'Motoristas' },
  { key: 'unidades', label: 'Unidades' },
  { key: 'rotas', label: 'Rotas planejadas' },
]

function AtivoBadge({ ativo }: { ativo: boolean }) {
  return ativo ? <Badge variant="success">Ativo</Badge> : <Badge variant="muted">Inativo</Badge>
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Excluir">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  )
}

export function CadastrosPage() {
  const [aba, setAba] = useState<Aba>('veiculos')

  return (
    <div>
      <PageHeader title="Cadastros" description="Veículos, motoristas, unidades e rotas." />

      <div className="space-y-4 p-6">
        <div className="flex gap-1 border-b">
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                aba === a.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        {aba === 'veiculos' && <VeiculosTab />}
        {aba === 'motoristas' && <MotoristasTab />}
        {aba === 'unidades' && <UnidadesTab />}
        {aba === 'rotas' && <RotasTab />}
      </div>
    </div>
  )
}

function TabToolbar({ label, onNew }: { label: string; onNew: () => void }) {
  return (
    <div className="flex justify-end">
      <Button size="sm" onClick={onNew}>
        <Plus className="h-4 w-4" /> {label}
      </Button>
    </div>
  )
}

function VeiculosTab() {
  const { data, isLoading, error } = useVeiculos()
  const { remover } = useVeiculoMutations()
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Veiculo | null>(null)

  const novo = () => {
    setEditando(null)
    setModalOpen(true)
  }
  const editar = (v: Veiculo) => {
    setEditando(v)
    setModalOpen(true)
  }
  const excluir = (v: Veiculo) => {
    if (confirm(`Excluir o veículo ${v.placa}?`)) remover.mutate(v.id)
  }

  return (
    <div className="space-y-3">
      <TabToolbar label="Novo veículo" onNew={novo} />
      {isLoading || error || !data?.length ? (
        <DataState isLoading={isLoading} error={error} isEmpty={!data?.length} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Placa</TH>
              <TH>Modelo</TH>
              <TH>Tipo</TH>
              <TH>Capacidade (kg)</TH>
              <TH>Situação</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {data.map((v) => (
              <TR key={v.id}>
                <TD className="font-medium">{v.placa}</TD>
                <TD>{v.modelo ?? '—'}</TD>
                <TD>{v.tipo}</TD>
                <TD>{v.capacidade_kg ?? '—'}</TD>
                <TD>
                  <AtivoBadge ativo={v.ativo} />
                </TD>
                <TD>
                  <RowActions onEdit={() => editar(v)} onDelete={() => excluir(v)} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {modalOpen && (
        <VeiculoFormModal open={modalOpen} onClose={() => setModalOpen(false)} veiculo={editando} />
      )}
    </div>
  )
}

function MotoristasTab() {
  const { data, isLoading, error } = useMotoristas()
  const { remover } = useMotoristaMutations()
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Motorista | null>(null)

  const novo = () => {
    setEditando(null)
    setModalOpen(true)
  }
  const excluir = (m: Motorista) => {
    if (confirm(`Excluir o motorista ${m.nome}?`)) remover.mutate(m.id)
  }

  return (
    <div className="space-y-3">
      <TabToolbar label="Novo motorista" onNew={novo} />
      {isLoading || error || !data?.length ? (
        <DataState isLoading={isLoading} error={error} isEmpty={!data?.length} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nome</TH>
              <TH>CPF</TH>
              <TH>CNH</TH>
              <TH>Telefone</TH>
              <TH>Acesso ao app</TH>
              <TH>Situação</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {data.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.nome}</TD>
                <TD>{formatCpf(m.cpf)}</TD>
                <TD>{m.categoria_cnh ?? '—'}</TD>
                <TD>{m.telefone ?? '—'}</TD>
                <TD>
                  {m.tem_senha ? (
                    <Badge variant="success">Liberado</Badge>
                  ) : (
                    <Badge variant="muted">Sem senha</Badge>
                  )}
                </TD>
                <TD>
                  <AtivoBadge ativo={m.ativo} />
                </TD>
                <TD>
                  <RowActions
                    onEdit={() => {
                      setEditando(m)
                      setModalOpen(true)
                    }}
                    onDelete={() => excluir(m)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {modalOpen && (
        <MotoristaFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          motorista={editando}
        />
      )}
    </div>
  )
}

function UnidadesTab() {
  const { data, isLoading, error } = useUnidades()
  const { remover } = useUnidadeMutations()
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Unidade | null>(null)

  const excluir = (u: Unidade) => {
    if (confirm(`Excluir a unidade ${u.nome}?`)) remover.mutate(u.id)
  }

  return (
    <div className="space-y-3">
      <TabToolbar
        label="Nova unidade"
        onNew={() => {
          setEditando(null)
          setModalOpen(true)
        }}
      />
      {isLoading || error || !data?.length ? (
        <DataState isLoading={isLoading} error={error} isEmpty={!data?.length} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nome</TH>
              <TH>CNPJ</TH>
              <TH>Endereço</TH>
              <TH>Situação</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {data.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.nome}</TD>
                <TD>{u.cnpj ?? '—'}</TD>
                <TD className="max-w-80 truncate">{u.endereco ?? '—'}</TD>
                <TD>
                  <AtivoBadge ativo={u.ativo} />
                </TD>
                <TD>
                  <RowActions
                    onEdit={() => {
                      setEditando(u)
                      setModalOpen(true)
                    }}
                    onDelete={() => excluir(u)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {modalOpen && (
        <UnidadeFormModal open={modalOpen} onClose={() => setModalOpen(false)} unidade={editando} />
      )}
    </div>
  )
}

function RotasTab() {
  const { data, isLoading, error } = useRotas()
  const { remover } = useRotaMutations()
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Rota | null>(null)

  const excluir = (r: Rota) => {
    if (confirm(`Excluir a rota ${r.nome ?? r.id}?`)) remover.mutate(r.id)
  }

  return (
    <div className="space-y-3">
      <TabToolbar
        label="Nova rota"
        onNew={() => {
          setEditando(null)
          setModalOpen(true)
        }}
      />
      {isLoading || error || !data?.length ? (
        <DataState isLoading={isLoading} error={error} isEmpty={!data?.length} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nome</TH>
              <TH>Tipo</TH>
              <TH>Tolerância (m)</TH>
              <TH>Duração est. (min)</TH>
              <TH>Pontos</TH>
              <TH>Criada em</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {data.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.nome ?? '—'}</TD>
                <TD>{r.tipo}</TD>
                <TD>{r.raio_tolerancia_m}</TD>
                <TD>{r.duracao_estimada_min ?? '—'}</TD>
                <TD>{r.linha?.length ?? 0}</TD>
                <TD className="whitespace-nowrap">{formatDate(r.criado_em)}</TD>
                <TD>
                  <RowActions
                    onEdit={() => {
                      setEditando(r)
                      setModalOpen(true)
                    }}
                    onDelete={() => excluir(r)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {modalOpen && (
        <RotaFormModal open={modalOpen} onClose={() => setModalOpen(false)} rota={editando} />
      )}
    </div>
  )
}
