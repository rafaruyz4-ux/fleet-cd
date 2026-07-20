import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Elementos que participam do ciclo de foco dentro do diálogo.
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal/dialog leve (sem Radix), acessível:
 * - `aria-modal` + `aria-labelledby` apontando para o título;
 * - foco inicial no primeiro campo (ou em `[data-autofocus]`), foco preso
 *   dentro do diálogo (Tab/Shift+Tab dão a volta) e devolvido ao fechar;
 * - fecha no ESC;
 * - por padrão NÃO fecha no clique do backdrop — um clique acidental não pode
 *   jogar fora um formulário preenchido. Diálogos sem dados (ex.: confirmação)
 *   podem ligar `closeOnBackdrop`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  closeOnBackdrop = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  closeOnBackdrop?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const focoAnterior = document.activeElement as HTMLElement | null

    // Foco inicial: [data-autofocus] > primeiro campo > primeiro focável.
    const raf = requestAnimationFrame(() => {
      const el = dialogRef.current
      if (!el || el.contains(document.activeElement)) return
      const alvo =
        el.querySelector<HTMLElement>('[data-autofocus]') ??
        el.querySelector<HTMLElement>('input, select, textarea') ??
        el.querySelector<HTMLElement>(FOCAVEIS)
      ;(alvo ?? el).focus()
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: mantém o Tab circulando dentro do diálogo.
      const el = dialogRef.current
      if (!el) return
      const focaveis = Array.from(el.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
        (f) => f.offsetParent !== null || f === document.activeElement,
      )
      if (focaveis.length === 0) {
        e.preventDefault()
        el.focus()
        return
      }
      const primeiro = focaveis[0]!
      const ultimo = focaveis[focaveis.length - 1]!
      const ativo = document.activeElement
      const dentro = ativo instanceof HTMLElement && el.contains(ativo)
      if (e.shiftKey) {
        if (!dentro || ativo === primeiro) {
          e.preventDefault()
          ultimo.focus()
        }
      } else if (!dentro || ativo === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      focoAnterior?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'my-8 w-full max-w-lg rounded-lg border bg-card shadow-lg outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
