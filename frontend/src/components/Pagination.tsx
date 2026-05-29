import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Pagination({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
}) {
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + limit, total)
  const canPrev = offset > 0
  const canNext = offset + limit < total

  return (
    <div className="flex items-center justify-between px-1 py-2 text-sm text-muted-foreground">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onChange(offset + limit)}
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
