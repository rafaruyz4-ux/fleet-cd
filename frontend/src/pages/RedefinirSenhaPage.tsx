import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

export function RedefinirSenhaPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) {
      setErro('A senha deve ter ao menos 8 caracteres.')
      return
    }
    if (senha !== confirma) {
      setErro('As senhas não conferem.')
      return
    }
    setEnviando(true)
    try {
      await api.post('/auth/redefinir-senha', { token, senha })
      setOk(true)
      // Leva ao login depois de um instante.
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setErro(
        err instanceof ApiError && err.status === 400
          ? 'Este link é inválido ou expirou. Peça um novo em “Esqueci minha senha”.'
          : 'Não foi possível redefinir a senha. Tente de novo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="relative w-full max-w-sm overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-[hsl(258_100%_62%)]" />
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[hsl(258_100%_62%)] text-primary-foreground shadow-[0_0_28px_rgba(0,212,255,0.45)]">
            {ok ? <CheckCircle2 className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
            Nexus Orbital
          </div>
          <CardTitle className="font-display text-2xl">
            {ok ? 'Senha redefinida' : 'Criar nova senha'}
          </CardTitle>
          <CardDescription>
            {ok
              ? 'Pronto! Já pode entrar com a nova senha. Redirecionando…'
              : 'Escolha uma nova senha para sua conta.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ok ? (
            <Link to="/login">
              <Button className="w-full">Ir para o login</Button>
            </Link>
          ) : !token ? (
            <div className="space-y-4 text-center">
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Link inválido — falta o código de redefinição.
              </p>
              <Link to="/esqueci-senha">
                <Button variant="outline" className="w-full">
                  Pedir um novo link
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="senha">Nova senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ao menos 8 caracteres"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirma">Confirmar senha</Label>
                <Input
                  id="confirma"
                  type="password"
                  autoComplete="new-password"
                  value={confirma}
                  onChange={(e) => setConfirma(e.target.value)}
                  required
                />
              </div>
              {erro && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando && <Spinner />}
                Redefinir senha
              </Button>
              <Link
                to="/login"
                className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar para o login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
