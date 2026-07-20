import { useState } from 'react'
import { toast } from 'sonner'
import { useVeiculoMutations } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { Veiculo } from '@/types'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

export function VeiculoFormModal({
  open,
  onClose,
  veiculo,
}: {
  open: boolean
  onClose: () => void
  veiculo?: Veiculo | null
}) {
  const editando = !!veiculo
  const { criar, atualizar } = useVeiculoMutations()
  const [placa, setPlaca] = useState(veiculo?.placa ?? '')
  const [modelo, setModelo] = useState(veiculo?.modelo ?? '')
  const [tipo, setTipo] = useState(veiculo?.tipo ?? 'caminhao')
  const [capacidade, setCapacidade] = useState(veiculo?.capacidade_kg?.toString() ?? '')
  const [renavam, setRenavam] = useState(veiculo?.renavam ?? '')
  const [ativo, setAtivo] = useState(veiculo?.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)

  const salvando = criar.isPending || atualizar.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const input: Record<string, unknown> = {
      placa: placa.trim().toUpperCase(),
      tipo,
      ativo,
    }
    if (modelo.trim()) input.modelo = modelo.trim()
    if (renavam.trim()) input.renavam = renavam.trim()
    if (capacidade.trim()) input.capacidade_kg = Number(capacidade)

    try {
      if (editando) await atualizar.mutateAsync({ id: veiculo!.id, input })
      else await criar.mutateAsync(input)
      toast.success(editando ? 'Veículo atualizado.' : 'Veículo cadastrado.')
      onClose()
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar o veículo.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar veículo' : 'Novo veículo'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Placa" required htmlFor="placa" hint="Formato antigo (ABC1234) ou Mercosul (ABC1D23).">
          <Input
            id="placa"
            value={placa}
            onChange={(e) => setPlaca(e.target.value)}
            placeholder="ABC1D23"
            required
            disabled={editando}
          />
        </FormField>
        <FormField label="Modelo" htmlFor="modelo">
          <Input id="modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Tipo" htmlFor="tipo">
            <Select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="caminhao">Caminhão</option>
              <option value="carro">Carro</option>
              <option value="utilitario">Utilitário</option>
            </Select>
          </FormField>
          <FormField label="Capacidade (kg)" htmlFor="cap">
            <Input
              id="cap"
              type="number"
              min={0}
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="RENAVAM" htmlFor="renavam">
          <Input id="renavam" value={renavam} onChange={(e) => setRenavam(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativo
        </label>

        {erro && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando && <Spinner />}
            {editando ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
