import { useState } from 'react'
import { useMultaMutations, useVeiculos } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

/**
 * Lançamento manual de multa. Se veículo + data da ocorrência forem
 * informados, o backend tenta vincular automaticamente à viagem do período.
 */
export function CriarMultaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { criar } = useMultaMutations()
  const veiculos = useVeiculos()

  const [numeroAuto, setNumeroAuto] = useState('')
  const [veiculoId, setVeiculoId] = useState('')
  const [ocorridaEm, setOcorridaEm] = useState('')
  const [tipo, setTipo] = useState('')
  const [valor, setValor] = useState('')
  const [pontos, setPontos] = useState('')
  const [local, setLocal] = useState('')
  const [statusPagamento, setStatusPagamento] = useState('pendente')
  const [erro, setErro] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!numeroAuto.trim()) {
      setErro('Informe o número do auto.')
      return
    }
    if (!veiculoId) {
      setErro('Selecione o veículo.')
      return
    }
    const input: Record<string, unknown> = {
      numero_auto: numeroAuto.trim(),
      veiculo_id: veiculoId,
      fonte: 'manual',
      status_pagamento: statusPagamento,
    }
    if (ocorridaEm) input.ocorrida_em = ocorridaEm
    if (tipo.trim()) input.tipo = tipo.trim()
    if (valor.trim()) input.valor = Number(valor)
    if (pontos.trim()) input.pontos_cnh = Number(pontos)
    if (local.trim()) input.local = local.trim()

    try {
      await criar.mutateAsync(input)
      onClose()
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 409
            ? 'Já existe uma multa com este número de auto.'
            : err.message
          : 'Falha ao lançar a multa.'
      setErro(msg)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lançar multa"
      description="Com veículo + data, o vínculo à viagem é automático."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Número do auto" required htmlFor="auto">
          <Input id="auto" value={numeroAuto} onChange={(e) => setNumeroAuto(e.target.value)} required />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Veículo" required htmlFor="veiculo">
            <Select id="veiculo" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} required>
              <option value="">Selecione…</option>
              {veiculos.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa}
                  {v.modelo ? ` — ${v.modelo}` : ''}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Data/hora da ocorrência" htmlFor="ocorr">
            <Input
              id="ocorr"
              type="datetime-local"
              value={ocorridaEm}
              onChange={(e) => setOcorridaEm(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Tipo / descrição" htmlFor="tipo">
          <Input id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Excesso de velocidade" />
        </FormField>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Valor (R$)" htmlFor="valor">
            <Input id="valor" type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          </FormField>
          <FormField label="Pontos CNH" htmlFor="pontos">
            <Input id="pontos" type="number" min={0} value={pontos} onChange={(e) => setPontos(e.target.value)} />
          </FormField>
          <FormField label="Pagamento" htmlFor="pag">
            <Select id="pag" value={statusPagamento} onChange={(e) => setStatusPagamento(e.target.value)}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="recurso">Em recurso</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Local" htmlFor="local">
          <Input id="local" value={local} onChange={(e) => setLocal(e.target.value)} />
        </FormField>

        {erro && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={criar.isPending}>
            {criar.isPending && <Spinner />}
            Lançar multa
          </Button>
        </div>
      </form>
    </Modal>
  )
}
