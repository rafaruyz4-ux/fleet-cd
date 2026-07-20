import { useState } from 'react'
import { toast } from 'sonner'
import { Building2, Gauge } from 'lucide-react'
import { useAtualizarConfiguracoes, useConfiguracoes } from '@/api/hooks'
import { ApiError } from '@/lib/api'
import type { ConfiguracoesEmpresa } from '@/types'
import { PageHeader } from '@/components/AppLayout'
import { DataState } from '@/components/DataState'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

/** CNPJ só-dígitos → formatado (ou como veio, se não tiver 14 dígitos). */
function formatarCnpj(cnpj: string | null): string {
  if (!cnpj) return ''
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function ConfiguracoesPage() {
  const { data: cfg, isLoading, error } = useConfiguracoes()

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Dados da empresa e limites que disparam os alertas da frota."
      />

      <div className="space-y-6 p-4 sm:p-6">
        <DataState isLoading={isLoading} error={error} loadingLabel="Carregando configurações…" />
        {cfg && <ConfiguracoesForm inicial={cfg} />}
      </div>
    </div>
  )
}

// Formulário separado para inicializar o estado a partir dos dados já
// carregados (useState com valor inicial), sem setState dentro de effect.
function ConfiguracoesForm({ inicial }: { inicial: ConfiguracoesEmpresa }) {
  const salvar = useAtualizarConfiguracoes()

  const [nome, setNome] = useState(inicial.nome)
  const [cnpj, setCnpj] = useState(() => formatarCnpj(inicial.cnpj))
  const [velocidade, setVelocidade] = useState(String(inicial.alertaVelocidadeKmh))
  const [parada, setParada] = useState(String(inicial.alertaParadaMin))
  const [semGps, setSemGps] = useState(String(inicial.alertaSemGpsMin))
  const [erro, setErro] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    try {
      const atualizado = await salvar.mutateAsync({
        nome: nome.trim(),
        cnpj: cnpj.trim(),
        alertaVelocidadeKmh: Number(velocidade),
        alertaParadaMin: Number(parada),
        alertaSemGpsMin: Number(semGps),
      })
      // Reflete a normalização do servidor (ex.: CNPJ vira só dígitos).
      setNome(atualizado.nome)
      setCnpj(formatarCnpj(atualizado.cnpj))
      toast.success('Configurações salvas.')
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar as configurações. Tente de novo.',
      )
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <Building2 className="h-5 w-5 text-primary" /> Dados da empresa
          </CardTitle>
          <CardDescription>Aparecem na cobrança e nos relatórios exportados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Nome da empresa" required htmlFor="cfgNome">
            <Input
              id="cfgNome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              minLength={2}
            />
          </FormField>
          <FormField label="CNPJ" htmlFor="cfgCnpj" hint="Deixe em branco se não tiver.">
            <Input
              id="cfgCnpj"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <Gauge className="h-5 w-5 text-primary" /> Limites de alerta
          </CardTitle>
          <CardDescription>
            Ajuste quando o painel deve avisar sobre a frota. Valem para todas as viagens da
            empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Velocidade máxima (km/h)"
            htmlFor="cfgVelocidade"
            hint="Acima disso gera alerta de velocidade alta."
          >
            <Input
              id="cfgVelocidade"
              type="number"
              min={10}
              max={200}
              value={velocidade}
              onChange={(e) => setVelocidade(e.target.value)}
              required
            />
          </FormField>
          <FormField
            label="Parada longa (min)"
            htmlFor="cfgParada"
            hint="Veículo parado por mais que isso gera alerta."
          >
            <Input
              id="cfgParada"
              type="number"
              min={1}
              max={1440}
              value={parada}
              onChange={(e) => setParada(e.target.value)}
              required
            />
          </FormField>
          <FormField
            label="Sem GPS (min)"
            htmlFor="cfgSemGps"
            hint="Sem posição por mais que isso gera alerta."
          >
            <Input
              id="cfgSemGps"
              type="number"
              min={1}
              max={1440}
              value={semGps}
              onChange={(e) => setSemGps(e.target.value)}
              required
            />
          </FormField>
        </CardContent>
      </Card>

      {erro && (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{erro}</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Spinner />}
          Salvar configurações
        </Button>
      </div>
    </form>
  )
}
