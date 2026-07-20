import { useState } from 'react'
import { CheckCircle2, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useUsuarioMutations } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

/** Gera uma senha legível de 12 caracteres (sem 0/O/1/l ambíguos). */
function gerarSenha(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export function NovoUsuarioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { criar } = useUsuarioMutations()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<'admin' | 'gestor'>('gestor')
  const [senha, setSenha] = useState(() => gerarSenha())
  const [erro, setErro] = useState<string | null>(null)
  // Após criar, mostramos as credenciais UMA vez (a senha não é recuperável).
  const [criado, setCriado] = useState<{ nome: string; email: string; senha: string } | null>(null)

  function fechar() {
    setNome('')
    setEmail('')
    setPapel('gestor')
    setSenha(gerarSenha())
    setErro(null)
    setCriado(null)
    onClose()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    try {
      const novo = await criar.mutateAsync({
        nome: nome.trim(),
        email: email.trim(),
        papel,
        senha,
      })
      setCriado({ nome: novo.nome, email: novo.email, senha })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErro(err.message)
      else if (err instanceof ApiError && err.status === 400)
        setErro('Confira os dados: a senha precisa ter ao menos 8 caracteres.')
      else setErro('Não foi possível criar o usuário. Tente de novo.')
    }
  }

  async function copiarCredenciais() {
    if (!criado) return
    try {
      await navigator.clipboard.writeText(
        `Acesso ao painel da frota\nLogin: ${criado.email}\nSenha: ${criado.senha}`,
      )
      toast.success('Credenciais copiadas.')
    } catch {
      toast.error('Não foi possível copiar. Anote os dados manualmente.')
    }
  }

  // Tela de sucesso: senha visível uma única vez, com botão de copiar.
  if (criado) {
    return (
      <Modal open={open} onClose={fechar} title="Usuário criado">
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>
              <strong>{criado.nome}</strong> já pode acessar o painel.
            </span>
          </div>
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Envie estes dados de acesso (a senha não aparece de novo):</p>
            <p>
              <span className="text-muted-foreground">Login (e-mail):</span> {criado.email}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Senha:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{criado.senha}</code>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={copiarCredenciais}>
              <Copy className="h-4 w-4" /> Copiar credenciais
            </Button>
            <p className="text-xs text-muted-foreground">
              Oriente a pessoa a trocar a senha após o primeiro acesso (menu Trocar senha).
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={fechar}>
              Concluir
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Novo usuário"
      description="A pessoa acessa o painel com e-mail e a senha inicial abaixo."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nome" required htmlFor="usuarioNome">
          <Input
            id="usuarioNome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Maria Silva"
            required
          />
        </FormField>
        <FormField label="E-mail de acesso" required htmlFor="usuarioEmail">
          <Input
            id="usuarioEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@empresa.com"
            required
          />
        </FormField>
        <FormField
          label="Papel"
          required
          htmlFor="usuarioPapel"
          hint="Administradores gerenciam usuários, configurações e assinatura; gestores operam a frota."
        >
          <Select
            id="usuarioPapel"
            value={papel}
            onChange={(e) => setPapel(e.target.value as 'admin' | 'gestor')}
          >
            <option value="gestor">Gestor</option>
            <option value="admin">Administrador</option>
          </Select>
        </FormField>
        <FormField
          label="Senha inicial"
          required
          htmlFor="usuarioSenha"
          hint="Ao menos 8 caracteres. Mostrada uma única vez após criar."
        >
          <div className="flex gap-2">
            <Input
              id="usuarioSenha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={8}
              required
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSenha(gerarSenha())}
              aria-label="Gerar outra senha"
              title="Gerar outra senha"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </FormField>

        {erro && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={criar.isPending}>
            {criar.isPending && <Spinner />}
            Criar usuário
          </Button>
        </div>
      </form>
    </Modal>
  )
}
