import { useState } from 'react'
import { useMotoristaMutations } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { Motorista } from '@/types'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

const CATEGORIAS = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']

export function MotoristaFormModal({
  open,
  onClose,
  motorista,
}: {
  open: boolean
  onClose: () => void
  motorista?: Motorista | null
}) {
  const editando = !!motorista
  const { criar, atualizar } = useMotoristaMutations()
  const [nome, setNome] = useState(motorista?.nome ?? '')
  const [cpf, setCpf] = useState(motorista?.cpf ?? '')
  const [cnh, setCnh] = useState(motorista?.cnh ?? '')
  const [categoria, setCategoria] = useState(motorista?.categoria_cnh ?? '')
  const [validade, setValidade] = useState(motorista?.validade_cnh?.slice(0, 10) ?? '')
  const [telefone, setTelefone] = useState(motorista?.telefone ?? '')
  const [senha, setSenha] = useState('')
  const [ativo, setAtivo] = useState(motorista?.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)

  const salvando = criar.isPending || atualizar.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const input: Record<string, unknown> = { nome: nome.trim(), cpf: cpf.trim(), ativo }
    if (cnh.trim()) input.cnh = cnh.trim()
    if (categoria) input.categoria_cnh = categoria
    if (validade) input.validade_cnh = validade
    if (telefone.trim()) input.telefone = telefone.trim()
    if (senha.trim()) input.senha = senha

    try {
      if (editando) await atualizar.mutateAsync({ id: motorista!.id, input })
      else await criar.mutateAsync(input)
      onClose()
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar o motorista.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar motorista' : 'Novo motorista'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nome" required htmlFor="nome">
          <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="CPF" required htmlFor="cpf">
            <Input
              id="cpf"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              required
              disabled={editando}
            />
          </FormField>
          <FormField label="Telefone" htmlFor="tel">
            <Input id="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="CNH" htmlFor="cnh">
            <Input id="cnh" value={cnh} onChange={(e) => setCnh(e.target.value)} />
          </FormField>
          <FormField label="Categoria" htmlFor="cat">
            <Select id="cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">—</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Validade CNH" htmlFor="val">
            <Input id="val" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </FormField>
        </div>
        <FormField
          label={editando ? 'Nova senha (app)' : 'Senha de acesso ao app'}
          htmlFor="senha"
          hint={
            editando
              ? 'Preencha apenas se quiser redefinir o acesso ao app.'
              : 'Opcional. Mín. 6 caracteres. Libera o login do motorista no app.'
          }
        >
          <Input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
          />
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
