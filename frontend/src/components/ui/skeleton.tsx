import { cn } from '@/lib/utils'

/** Bloco de carregamento com shimmer (classe definida no index.css). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton-shimmer rounded-md', className)} />
}

/** Esqueleto de tabela — mesmo cartão/bordas das tabelas reais. */
export function TableSkeleton({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border bg-card" aria-busy="true">
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: cols }).map((_, j) => (
          <Skeleton key={j} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className={cn('h-3.5 flex-1', j === 0 && 'max-w-32')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Esqueleto de cards empilhados (listas mobile / feed de alertas). */
export function CardListSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
