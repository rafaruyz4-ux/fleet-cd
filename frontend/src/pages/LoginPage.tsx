import { useState } from 'react'
import { Truck } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await login(email, senha)
      // A navegação acontece automaticamente: o roteador reage ao usuário logado.
    } catch (err) {
      setErro(
        err instanceof ApiError && err.status === 401
          ? 'E-mail ou senha inválidos.'
          : 'Não foi possível entrar. Verifique se a API está no ar.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Truck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Gestão de Frota</CardTitle>
          <CardDescription>Painel do gestor — entre com suas credenciais</CardDescription>
        </CardHeader>
        <CardContent>
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
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
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
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
