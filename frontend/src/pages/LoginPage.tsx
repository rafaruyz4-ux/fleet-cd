import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Eye, EyeOff } from 'lucide-react'
import { VetraMark } from '@/components/Logo'
import { useAuth } from '@/lib/auth'
import { ApiError, SESSAO_EXPIRADA_KEY } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

// Lê (e consome) o sinal de sessão expirada deixado pelo client HTTP quando
// o refresh do token falha — o usuário caiu aqui sem pedir logout.
function consumirSessaoExpirada(): boolean {
  try {
    const expirou = sessionStorage.getItem(SESSAO_EXPIRADA_KEY) === '1'
    if (expirou) sessionStorage.removeItem(SESSAO_EXPIRADA_KEY)
    return expirou
  } catch {
    return false
  }
}

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [sessaoExpirou] = useState(consumirSessaoExpirada)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await login(email, senha)
      // A navegação acontece automaticamente: o roteador reage ao usuário logado.
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.status === 401
            ? 'E-mail ou senha inválidos.'
            : err.message
          : 'Não foi possível conectar. Tente novamente.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="relative w-full max-w-sm overflow-hidden">
        <CardHeader className="space-y-3 text-center">
          <VetraMark className="mx-auto h-14 w-14" />
          <div className="font-display text-xl font-extrabold tracking-[0.2em]">NEXUS FROTA</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
            Inteligência em Movimento
          </div>
          <CardDescription>Painel do gestor — entre com suas credenciais</CardDescription>
        </CardHeader>
        <CardContent>
          {sessaoExpirou && (
            <p className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-left text-sm text-warning">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              Sua sessão expirou — entre de novo.
            </p>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-10"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={mostrarSenha}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {erro && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando && <Spinner />}
              Entrar
            </Button>
            <Link
              to="/esqueci-senha"
              className="block text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Esqueci minha senha
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
