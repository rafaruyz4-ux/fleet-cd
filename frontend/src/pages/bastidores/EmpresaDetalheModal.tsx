import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAtualizarEmpresa, useEmpresa, useRedefinirSenha } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { EmpresaDetalhe, EmpresaUsuario } from '@/types'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'

export function EmpresaDetalheModal({
  empresaId,
  open,
  onClose,
}: {
  empresaId: string | null
  open: boolean
  onClose: () => void
}) {
  const { data: empresa, isLoading } = useEmpresa(open ? empresaId : null)

  return (
    <Modal open={open} onClose={onClose} title="Empresa cliente">
      {isLoading || !empresa ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Spinner /> Carregando…
        </div>
      ) : (
        // key remonta o formulário ao trocar de empresa → estado inicial limpo
        // a partir dos dados carregados (sem setState em effect).
        <EmpresaForm key={empresa.id} empresa={empresa} onClose={onClose} />
      )}
    </Modal>
  )
}

function EmpresaForm({ empresa, onClose }: { empresa: EmpresaDetalhe; onClose: () => void }) {
  const atualizar = useAtualizarEmpresa()
  const [nome, setNome] = useState(empresa.nome)
  const [cnpj, setCnpj] = useState(empresa.cnpj ?? '')
  const [plano, setPlano] = useState(empresa.plano)
  const [ativo, setAtivo] = useState(empresa.ativo)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSalvo(false)
    try {
      await atualizar.mutateAsync({
        id: empresa.id,
        input: { nome: nome.trim(), cnpj: cnpj.trim(), plano: plano as never, ativo },
      })
      setSalvo(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErro(err.message)
      else setErro('Não foi possível salvar as alterações.')
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormField label="Nome da empresa" required htmlFor="ed-nome">
        <Input id="ed-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="CNPJ" htmlFor="ed-cnpj" hint="Deixe vazio para remover.">
          <Input id="ed-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </FormField>
        <FormField label="Plano" htmlFor="ed-plano">
          <Select id="ed-plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
            <option value="trial">Teste (trial)</option>
            <option value="ativo">Ativo</option>
            <option value="suspenso">Suspenso</option>
            <option value="cancelado">Cancelado</option>
          </Select>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Empresa ativa (desmarque para bloquear o acesso)
      </label>

      {/* Usuários da empresa */}
      <div className="rounded-md border bg-muted/20 p-3">
        <p className="mb-2 text-sm font-medium">Usuários ({empresa.usuarios.length})</p>
        <ul className="space-y-3">
          {empresa.usuarios.map((u) => (
            <li key={u.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{u.nome}</span>{' '}
                  <span className="text-muted-foreground">· {u.email}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Badge variant="muted">{u.papel}</Badge>
                  {!u.ativo && <Badge variant="destructive">inativo</Badge>}
                </span>
              </div>
              <RedefinirSenhaInline empresaId={empresa.id} usuario={u} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Endereço de acesso (login) do cliente. Use “Redefinir senha” quando o cliente esquecer.
        </p>
      </div>

      {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {salvo && !erro && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Alterações salvas.</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
        <Button type="submit" disabled={atualizar.isPending}>
          {atualizar.isPending && <Spinner />}
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}

// Botão + formulário inline para redefinir a senha de um usuário do cliente.
function RedefinirSenhaInline({
  empresaId,
  usuario,
}: {
  empresaId: string
  usuario: EmpresaUsuario
}) {
  const redefinir = useRedefinirSenha()
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [okSenha, setOkSenha] = useState<string | null>(null)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    try {
      await redefinir.mutateAsync({ empresaId, usuarioId: usuario.id, senha })
      setOkSenha(senha)
      setAberto(false)
      setSenha('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 400)
        setErro('A senha precisa ter ao menos 8 caracteres.')
      else setErro('Não foi possível redefinir a senha.')
    }
  }

  if (okSenha) {
    return (
      <p className="rounded-md bg-success/10 px-3 py-2 text-xs text-success">
        Senha redefinida. Envie ao cliente: <strong>{okSenha}</strong>
      </p>
    )
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setAberto(true)
          setErro(null)
        }}
      >
        <KeyRound className="h-3.5 w-3.5" />
        Redefinir senha
      </Button>
    )
  }

  return (
    <form onSubmit={salvar} className="space-y-2 rounded-md border bg-card p-2">
      <Input
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Nova senha (mín. 8 caracteres)"
        minLength={8}
        required
        autoFocus
      />
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAberto(false)
            setSenha('')
            setErro(null)
          }}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={redefinir.isPending}>
          {redefinir.isPending && <Spinner />}
          Salvar senha
        </Button>
      </div>
    </form>
  )
}
