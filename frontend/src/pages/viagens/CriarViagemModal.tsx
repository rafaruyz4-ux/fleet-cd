import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMotoristas,
  useNfs,
  useRotas,
  useVeiculos,
  useViagemMutations,
} from '@/api/hooks'
import { ApiError } from '@/lib/api'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { formatCurrency } from '@/lib/format'

export function CriarViagemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { criar } = useViagemMutations()
  const veiculos = useVeiculos()
  const motoristas = useMotoristas()
  const rotas = useRotas()
  // Só NFs ainda não alocadas podem virar paradas.
  const nfsDisponiveis = useNfs({ status: 'importada', limit: 100 })

  const [veiculoId, setVeiculoId] = useState('')
  const [motoristaId, setMotoristaId] = useState('')
  const [rotaId, setRotaId] = useState('')
  const [kmInicial, setKmInicial] = useState('')
  const [nfIds, setNfIds] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const toggleNf = (id: string) =>
    setNfIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!veiculoId || !motoristaId) {
      setErro('Selecione veículo e motorista.')
      return
    }
    const input = {
      veiculo_id: veiculoId,
      motorista_id: motoristaId,
      rota_planejada_id: rotaId || undefined,
      km_inicial: kmInicial.trim() ? Number(kmInicial) : undefined,
      nf_ids: nfIds.length ? nfIds : undefined,
    }
    try {
      const viagem = await criar.mutateAsync(input)
      onClose()
      navigate(`/viagens/${viagem.id}`)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar a viagem.')
    }
  }

  const nfs = nfsDisponiveis.data?.data ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova viagem"
      description="Selecione veículo, motorista e as NFs a entregar."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Veículo" required htmlFor="veiculo">
            <Select id="veiculo" value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} required>
              <option value="">Selecione…</option>
              {veiculos.data
                ?.filter((v) => v.ativo)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa}
                    {v.modelo ? ` — ${v.modelo}` : ''}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Motorista" required htmlFor="motorista">
            <Select
              id="motorista"
              value={motoristaId}
              onChange={(e) => setMotoristaId(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {motoristas.data
                ?.filter((m) => m.ativo)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Rota planejada" htmlFor="rota">
            <Select id="rota" value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">Nenhuma</option>
              {rotas.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome ?? `Rota ${r.tipo}`}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Km inicial" htmlFor="km">
            <Input
              id="km"
              type="number"
              min={0}
              value={kmInicial}
              onChange={(e) => setKmInicial(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label={`Notas fiscais a alocar (${nfIds.length} selecionadas)`}>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
            {nfsDisponiveis.isLoading ? (
              <p className="p-2 text-sm text-muted-foreground">Carregando NFs…</p>
            ) : nfs.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                Nenhuma NF disponível (status "importada") para alocar.
              </p>
            ) : (
              nfs.map((nf) => (
                <label
                  key={nf.id}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    checked={nfIds.includes(nf.id)}
                    onChange={() => toggleNf(nf.id)}
                  />
                  <span className="font-medium">NF {nf.numero ?? '—'}</span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {nf.destinatario_nome ?? 'Sem destinatário'}
                  </span>
                  <span className="text-muted-foreground">{formatCurrency(nf.valor_total)}</span>
                </label>
              ))
            )}
          </div>
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
            Criar viagem
          </Button>
        </div>
      </form>
    </Modal>
  )
}
