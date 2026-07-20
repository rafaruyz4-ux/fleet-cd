import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

export function EsqueciSenhaPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    try {
      await api.post('/auth/esqueci-senha', { email })
      // Resposta sempre genérica (o backend não revela se o e-mail existe).
      setEnviado(true)
    } catch {
      // Mesmo em erro de rede, mostramos a confirmação genérica por segurança.
      setEnviado(true)
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
            {enviado ? <MailCheck className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
            Nexus Orbital
          </div>
          <CardTitle className="font-display text-2xl">
            {enviado ? 'Verifique seu e-mail' : 'Recuperar senha'}
          </CardTitle>
          <CardDescription>
            {enviado
              ? 'Se o e-mail estiver cadastrado, enviamos as instruções para redefinir sua senha.'
              : 'Informe seu e-mail e enviaremos um link para criar uma nova senha.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enviado ? (
            <Link to="/login">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4" /> Voltar para o login
              </Button>
            </Link>
          ) : (
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
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando && <Spinner />}
                Enviar instruções
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
