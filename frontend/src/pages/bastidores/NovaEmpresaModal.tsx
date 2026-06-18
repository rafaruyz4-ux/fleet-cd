import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useCriarEmpresa } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { EmpresaCriada } from '@/types'
import { FormField } from '@/components/FormField'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

export function NovaEmpresaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const criar = useCriarEmpresa()
  const [empresaNome, setEmpresaNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [plano, setPlano] = useState<'trial' | 'ativo'>('trial')
  const [adminNome, setAdminNome] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminSenha, setAdminSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  // Quando criada, guardamos o resultado + a senha digitada para a equipe repassar.
  const [criada, setCriada] = useState<{ dados: EmpresaCriada; senha: string } | null>(null)

  function limpar() {
    setEmpresaNome('')
    setCnpj('')
    setPlano('trial')
    setAdminNome('')
    setAdminEmail('')
    setAdminSenha('')
    setErro(null)
    setCriada(null)
  }

  function fechar() {
    limpar()
    onClose()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    try {
      const dados = await criar.mutateAsync({
        empresaNome: empresaNome.trim(),
        cnpj: cnpj.trim() || undefined,
        plano,
        adminNome: adminNome.trim(),
        adminEmail: adminEmail.trim(),
        adminSenha,
      })
      setCriada({ dados, senha: adminSenha })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErro(err.message)
      else if (err instanceof ApiError && err.status === 400)
        setErro('Confira os dados: a senha precisa ter ao menos 8 caracteres.')
      else setErro('Não foi possível cadastrar a empresa.')
    }
  }

  // Tela de sucesso: mostra as credenciais para a equipe enviar ao cliente.
  if (criada) {
    return (
      <Modal open={open} onClose={fechar} title="Empresa cadastrada">
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>
              <strong>{criada.dados.empresa.nome}</strong> criada com sucesso.
            </span>
          </div>
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Envie estes dados de acesso ao cliente:</p>
            <p>
              <span className="text-muted-foreground">Site:</span> endereço do sistema
            </p>
            <p>
              <span className="text-muted-foreground">Login (e-mail):</span> {criada.dados.admin.email}
            </p>
            <p>
              <span className="text-muted-foreground">Senha:</span> {criada.senha}
            </p>
            <p className="text-xs text-muted-foreground">
              Oriente o cliente a trocar a senha após o primeiro acesso.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={limpar}>
              Cadastrar outra
            </Button>
            <Button type="button" onClick={fechar}>
              Concluir
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={fechar} title="Nova empresa">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nome da empresa" required htmlFor="empresaNome">
          <Input
            id="empresaNome"
            value={empresaNome}
            onChange={(e) => setEmpresaNome(e.target.value)}
            placeholder="Transportadora Silva"
            required
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="CNPJ (opcional)" htmlFor="cnpj">
            <Input
              id="cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </FormField>
          <FormField label="Plano" htmlFor="plano">
            <Select id="plano" value={plano} onChange={(e) => setPlano(e.target.value as 'trial' | 'ativo')}>
              <option value="trial">Teste (trial)</option>
              <option value="ativo">Ativo</option>
            </Select>
          </FormField>
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <p className="mb-3 text-sm font-medium">Responsável (1º acesso do cliente)</p>
          <div className="space-y-4">
            <FormField label="Nome do responsável" required htmlFor="adminNome">
              <Input
                id="adminNome"
                value={adminNome}
                onChange={(e) => setAdminNome(e.target.value)}
                required
              />
            </FormField>
            <FormField label="E-mail de acesso" required htmlFor="adminEmail">
              <Input
                id="adminEmail"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="cliente@empresa.com"
                required
              />
            </FormField>
            <FormField
              label="Senha inicial"
              required
              htmlFor="adminSenha"
              hint="Ao menos 8 caracteres. Você envia esta senha ao cliente."
            >
              <Input
                id="adminSenha"
                value={adminSenha}
                onChange={(e) => setAdminSenha(e.target.value)}
                minLength={8}
                required
              />
            </FormField>
          </div>
        </div>

        {erro && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={criar.isPending}>
            {criar.isPending && <Spinner />}
            Cadastrar empresa
          </Button>
        </div>
      </form>
    </Modal>
  )
}
