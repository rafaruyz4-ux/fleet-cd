import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * Diálogo de confirmação próprio (substitui window.confirm).
 * `destructive` deixa o botão de confirmar vermelho (exclusões/cancelamentos).
 * O foco inicial cai no botão "Cancelar" (escolha segura por padrão).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
}) {
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title={title} closeOnBackdrop className="max-w-md">
      <div className="space-y-4">
        {description && (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            {destructive && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
            )}
            <p className="pt-1">{description}</p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            data-autofocus
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Spinner />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
