import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

/** Tela de carregamento centralizada para suspense de página inteira. */
export function PageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-60 w-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
