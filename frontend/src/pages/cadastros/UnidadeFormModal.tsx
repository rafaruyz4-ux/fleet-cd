import { useState } from 'react'
import { useUnidadeMutations } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { Unidade } from '@/types'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

export function UnidadeFormModal({
  open,
  onClose,
  unidade,
}: {
  open: boolean
  onClose: () => void
  unidade?: Unidade | null
}) {
  const editando = !!unidade
  const { criar, atualizar } = useUnidadeMutations()
  const [nome, setNome] = useState(unidade?.nome ?? '')
  const [cnpj, setCnpj] = useState(unidade?.cnpj ?? '')
  const [endereco, setEndereco] = useState(unidade?.endereco ?? '')
  const [lat, setLat] = useState(unidade?.coordenada?.lat?.toString() ?? '')
  const [lng, setLng] = useState(unidade?.coordenada?.lng?.toString() ?? '')
  const [ativo, setAtivo] = useState(unidade?.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)

  const salvando = criar.isPending || atualizar.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const input: Record<string, unknown> = { nome: nome.trim(), ativo }
    if (cnpj.trim()) input.cnpj = cnpj.trim()
    if (endereco.trim()) input.endereco = endereco.trim()
    if (lat.trim() && lng.trim()) {
      input.coordenada = { lat: Number(lat), lng: Number(lng) }
    } else if (lat.trim() || lng.trim()) {
      setErro('Informe latitude e longitude juntas (ou deixe ambas em branco).')
      return
    }

    try {
      if (editando) await atualizar.mutateAsync({ id: unidade!.id, input })
      else await criar.mutateAsync(input)
      onClose()
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar a unidade.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar unidade' : 'Nova unidade'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nome" required htmlFor="nome">
          <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </FormField>
        <FormField label="CNPJ" htmlFor="cnpj">
          <Input
            id="cnpj"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="00.000.000/0000-00"
          />
        </FormField>
        <FormField label="Endereço" htmlFor="end">
          <Input id="end" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Latitude" htmlFor="lat">
            <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.55" />
          </FormField>
          <FormField label="Longitude" htmlFor="lng">
            <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.63" />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativa
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
