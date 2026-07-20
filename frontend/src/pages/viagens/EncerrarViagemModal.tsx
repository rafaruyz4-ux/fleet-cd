import { useState } from 'react'
import { toast } from 'sonner'
import { Flag } from 'lucide-react'
import { useViagemMutations } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { Viagem } from '@/types'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

/** Encerramento da viagem com km final opcional e validado (substitui o window.prompt). */
export function EncerrarViagemModal({
  open,
  onClose,
  viagem,
}: {
  open: boolean
  onClose: () => void
  viagem: Viagem
}) {
  const { encerrar } = useViagemMutations()
  const [kmFinal, setKmFinal] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    let km: number | undefined
    if (kmFinal.trim() !== '') {
      km = Number(kmFinal)
      if (Number.isNaN(km) || km < 0) {
        setErro('Km final inválido: informe um número maior ou igual a zero.')
        return
      }
      if (viagem.km_inicial != null && km < viagem.km_inicial) {
        setErro(`O km final não pode ser menor que o km inicial (${viagem.km_inicial}).`)
        return
      }
    }

    try {
      await encerrar.mutateAsync({ id: viagem.id, km_final: km })
      toast.success('Viagem encerrada.')
      onClose()
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível encerrar a viagem.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Encerrar viagem"
      description={`${viagem.veiculo_placa} · ${viagem.motorista_nome}`}
      className="max-w-md"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField
          label="Km final (opcional)"
          htmlFor="km-final"
          hint={
            viagem.km_inicial != null
              ? `Km inicial registrado: ${viagem.km_inicial}.`
              : 'Deixe em branco se não anotou o odômetro.'
          }
        >
          <Input
            id="km-final"
            type="number"
            min={viagem.km_inicial ?? 0}
            inputMode="numeric"
            placeholder={viagem.km_inicial != null ? String(viagem.km_inicial) : 'ex.: 123456'}
            value={kmFinal}
            onChange={(e) => setKmFinal(e.target.value)}
          />
        </FormField>

        {erro && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={encerrar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={encerrar.isPending}>
            {encerrar.isPending ? <Spinner /> : <Flag className="h-4 w-4" />}
            Encerrar viagem
          </Button>
        </div>
      </form>
    </Modal>
  )
}
