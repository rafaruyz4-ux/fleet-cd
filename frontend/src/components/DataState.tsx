import { AlertCircle, Inbox } from 'lucide-react'
import { PageLoader } from '@/components/ui/spinner'

/**
 * Renderiza loading / erro / vazio de forma consistente. Retorna `null`
 * quando há dados (deixando o chamador renderizar o conteúdo).
 * - `skeleton`: substitui o spinner central por um esqueleto shimmer;
 * - `emptyAction`: CTA mostrado no estado vazio (ex.: "Cadastre o primeiro…").
 */
export function DataState({
  isLoading,
  error,
  isEmpty,
  emptyLabel = 'Nenhum registro encontrado.',
  loadingLabel,
  skeleton,
  emptyAction,
}: {
  isLoading: boolean
  error: unknown
  isEmpty?: boolean
  emptyLabel?: string
  loadingLabel?: string
  skeleton?: React.ReactNode
  emptyAction?: React.ReactNode
}) {
  if (isLoading) return <>{skeleton ?? <PageLoader label={loadingLabel} />}</>
  if (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar dados.'
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-destructive">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm">{message}</p>
      </div>
    )
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-card/40 py-16 text-muted-foreground">
        <Inbox className="h-6 w-6" />
        <p className="text-sm">{emptyLabel}</p>
        {emptyAction}
      </div>
    )
  }
  return null
}
