import { useState } from 'react'
import { toast } from 'sonner'
import { useTrocarMinhaSenha } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

/** Modal "Trocar minha senha" — disponível a qualquer papel (menu do usuário). */
export function TrocarSenhaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trocar = useTrocarMinhaSenha()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function fechar() {
    setSenhaAtual('')
    setNovaSenha('')
    setConfirmar('')
    setErro(null)
    onClose()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (novaSenha !== confirmar) {
      setErro('A confirmação não confere com a nova senha.')
      return
    }
    try {
      await trocar.mutateAsync({ senhaAtual, novaSenha })
      toast.success('Senha alterada com sucesso.')
      fechar()
    } catch (err) {
      setErro(
        err instanceof ApiError ? err.message : 'Não foi possível trocar a senha. Tente de novo.',
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Trocar minha senha"
      description="Informe a senha atual e a nova senha."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Senha atual" required htmlFor="senhaAtual">
          <Input
            id="senhaAtual"
            type="password"
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            required
          />
        </FormField>
        <FormField
          label="Nova senha"
          required
          htmlFor="novaSenha"
          hint="Ao menos 8 caracteres."
        >
          <Input
            id="novaSenha"
            type="password"
            autoComplete="new-password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            minLength={8}
            required
          />
        </FormField>
        <FormField label="Confirmar nova senha" required htmlFor="confirmarSenha">
          <Input
            id="confirmarSenha"
            type="password"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            minLength={8}
            required
          />
        </FormField>

        {erro && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={trocar.isPending}>
            {trocar.isPending && <Spinner />}
            Salvar nova senha
          </Button>
        </div>
      </form>
    </Modal>
  )
}
