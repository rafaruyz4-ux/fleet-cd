import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

/**
 * Rede de segurança global: qualquer erro de render que escapar não pode
 * virar tela branca. Mostra um aviso no padrão visual do sistema (tema
 * escuro, tokens) com botão de recarregar. Classe de propósito — React só
 * oferece error boundary via componente de classe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Log técnico só no console — o usuário vê a mensagem amigável.
    console.error('Erro não tratado na interface:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Algo deu errado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A tela encontrou um problema inesperado. Seus dados estão seguros — recarregue a
            página para continuar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCw className="h-4 w-4" /> Recarregar a página
          </button>
        </div>
      </div>
    )
  }
}
