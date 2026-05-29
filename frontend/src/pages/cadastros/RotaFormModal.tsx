import { useState } from 'react'
import { useRotaMutations } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { LatLng, Rota } from '@/types'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

/** Converte "lat,lng" por linha em array de pontos. Retorna null se inválido. */
function parseLinha(texto: string): LatLng[] | null {
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (linhas.length === 0) return []
  const pontos: LatLng[] = []
  for (const l of linhas) {
    const [a, b] = l.split(/[,;]/).map((s) => Number(s.trim()))
    if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) return null
    pontos.push({ lat: a, lng: b })
  }
  return pontos
}

export function RotaFormModal({
  open,
  onClose,
  rota,
}: {
  open: boolean
  onClose: () => void
  rota?: Rota | null
}) {
  const editando = !!rota
  const { criar, atualizar } = useRotaMutations()
  const [tipo, setTipo] = useState(rota?.tipo ?? 'fixa')
  const [nome, setNome] = useState(rota?.nome ?? '')
  const [raio, setRaio] = useState(rota?.raio_tolerancia_m?.toString() ?? '200')
  const [duracao, setDuracao] = useState(rota?.duracao_estimada_min?.toString() ?? '')
  const [linhaTxt, setLinhaTxt] = useState(
    rota?.linha?.map((p) => `${p.lat}, ${p.lng}`).join('\n') ?? '',
  )
  const [erro, setErro] = useState<string | null>(null)

  const salvando = criar.isPending || atualizar.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const pontos = parseLinha(linhaTxt)
    if (pontos === null) {
      setErro('Linha inválida. Use "lat, lng" por linha (ex.: -23.55, -46.63).')
      return
    }
    if (pontos.length === 1) {
      setErro('A linha precisa de ao menos 2 pontos (ou nenhum).')
      return
    }

    const input: Record<string, unknown> = { tipo }
    if (nome.trim()) input.nome = nome.trim()
    if (raio.trim()) input.raio_tolerancia_m = Number(raio)
    if (duracao.trim()) input.duracao_estimada_min = Number(duracao)
    if (pontos.length >= 2) input.linha = pontos

    try {
      if (editando) await atualizar.mutateAsync({ id: rota!.id, input })
      else await criar.mutateAsync(input)
      onClose()
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar a rota.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar rota' : 'Nova rota'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Tipo" htmlFor="tipo">
            <Select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="fixa">Fixa</option>
              <option value="dinamica">Dinâmica</option>
            </Select>
          </FormField>
          <FormField label="Nome" htmlFor="nome">
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Tolerância (m)" htmlFor="raio" hint="Raio para desvio de rota.">
            <Input id="raio" type="number" min={1} value={raio} onChange={(e) => setRaio(e.target.value)} />
          </FormField>
          <FormField label="Duração estimada (min)" htmlFor="dur">
            <Input id="dur" type="number" min={1} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
          </FormField>
        </div>
        <FormField
          label="Linha (opcional)"
          htmlFor="linha"
          hint='Um ponto "lat, lng" por linha. Mínimo 2 pontos.'
        >
          <Textarea
            id="linha"
            className="font-mono text-xs"
            value={linhaTxt}
            onChange={(e) => setLinhaTxt(e.target.value)}
            placeholder={'-23.55, -46.63\n-23.56, -46.64'}
          />
        </FormField>

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
