import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '@/lib/api'
import type {
  Alerta,
  AssinaturaPublica,
  ConfiguracoesEmpresa,
  Empresa,
  EmpresaCriada,
  EmpresaDetalhe,
  Fatura,
  Motorista,
  Multa,
  NotaFiscal,
  Paginated,
  Parada,
  PlanoFaixa,
  Rota,
  Trajetoria,
  TrajetoRuas,
  Unidade,
  UsuarioTenant,
  Veiculo,
  Viagem,
} from '@/types'

// ---------------------------------------------------------------------
// Backoffice — empresas-clientes (somente super admin)
// ---------------------------------------------------------------------
export interface CriarEmpresaInput {
  empresaNome: string
  cnpj?: string
  plano?: 'trial' | 'ativo'
  adminNome: string
  adminEmail: string
  adminSenha: string
}

export function useEmpresas() {
  return useQuery({
    queryKey: ['admin-empresas'],
    queryFn: () => api.get<Empresa[]>('/admin/empresas'),
  })
}

export function useCriarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CriarEmpresaInput) => api.post<EmpresaCriada>('/admin/empresas', input),
    meta: { erroLocal: true }, // erro tratado inline no NovaEmpresaModal
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-empresas'] }),
  })
}

export function useEmpresa(id: string | null | undefined) {
  return useQuery({
    queryKey: ['admin-empresa', id],
    queryFn: () => api.get<EmpresaDetalhe>(`/admin/empresas/${id}`),
    enabled: !!id,
  })
}

export interface AtualizarEmpresaInput {
  nome?: string
  cnpj?: string
  plano?: 'trial' | 'ativo' | 'suspenso' | 'cancelado'
  ativo?: boolean
}

export function useAtualizarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AtualizarEmpresaInput }) =>
      api.patch<EmpresaDetalhe>(`/admin/empresas/${id}`, input),
    meta: { erroLocal: true }, // erro tratado inline no EmpresaDetalheModal
    onSuccess: (emp) => {
      qc.invalidateQueries({ queryKey: ['admin-empresas'] })
      qc.invalidateQueries({ queryKey: ['admin-empresa', emp.id] })
    },
  })
}

export function useRedefinirSenha() {
  return useMutation({
    mutationFn: ({
      empresaId,
      usuarioId,
      senha,
    }: {
      empresaId: string
      usuarioId: string
      senha: string
    }) =>
      api.post<{ ok: boolean }>(`/admin/empresas/${empresaId}/usuarios/${usuarioId}/senha`, { senha }),
    meta: { erroLocal: true }, // erro tratado inline no formulário de senha
  })
}

// ---------------------------------------------------------------------
// Assinatura (plano da própria empresa + cobrança Asaas)
// ---------------------------------------------------------------------
export function useAssinatura() {
  return useQuery({
    queryKey: ['assinatura'],
    queryFn: () => api.get<AssinaturaPublica>('/assinatura'),
  })
}

export function useMudarPlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (faixa: PlanoFaixa) =>
      api.post<AssinaturaPublica>('/assinatura/plano', { faixa }),
    meta: { erroLocal: true }, // erro tratado inline na AssinaturaPage
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assinatura'] })
      // O limite de consultas e a trava de veículos dependem do plano.
      qc.invalidateQueries({ queryKey: ['consultas-consumo'] })
      qc.invalidateQueries({ queryKey: ['veiculos'] })
    },
  })
}

export function useFaturas() {
  return useQuery({
    queryKey: ['faturas'],
    queryFn: () => api.get<Fatura[]>('/assinatura/faturas'),
  })
}

// ---------------------------------------------------------------------
// Usuários do próprio tenant (admin da empresa)
// ---------------------------------------------------------------------
export function useUsuariosEmpresa(enabled = true) {
  return useQuery({
    queryKey: ['usuarios-empresa'],
    queryFn: () => api.get<UsuarioTenant[]>('/usuarios'),
    enabled,
  })
}

export interface CriarUsuarioInput {
  nome: string
  email: string
  papel: 'admin' | 'gestor'
  senha: string
}

export function useUsuarioMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['usuarios-empresa'] })
  return {
    criar: useMutation({
      mutationFn: (input: CriarUsuarioInput) => api.post<UsuarioTenant>('/usuarios', input),
      meta: { erroLocal: true }, // erro tratado inline no NovoUsuarioModal
      onSuccess: invalidate,
    }),
    atualizar: useMutation({
      mutationFn: ({ id, input }: { id: string; input: { papel?: 'admin' | 'gestor'; ativo?: boolean } }) =>
        api.patch<UsuarioTenant>(`/usuarios/${id}`, input),
      onSuccess: invalidate,
    }),
  }
}

export function useTrocarMinhaSenha() {
  return useMutation({
    mutationFn: (input: { senhaAtual: string; novaSenha: string }) =>
      api.post<{ ok: boolean }>('/usuarios/me/senha', input),
    meta: { erroLocal: true }, // erro tratado inline no TrocarSenhaModal
  })
}

// ---------------------------------------------------------------------
// Configurações da própria empresa
// ---------------------------------------------------------------------
export function useConfiguracoes() {
  return useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => api.get<ConfiguracoesEmpresa>('/configuracoes'),
  })
}

export interface AtualizarConfiguracoesInput {
  nome?: string
  cnpj?: string
  alertaVelocidadeKmh?: number
  alertaParadaMin?: number
  alertaSemGpsMin?: number
}

export function useAtualizarConfiguracoes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AtualizarConfiguracoesInput) =>
      api.patch<ConfiguracoesEmpresa>('/configuracoes', input),
    meta: { erroLocal: true }, // erro tratado inline na ConfiguracoesPage
    onSuccess: (cfg) => qc.setQueryData(['configuracoes'], cfg),
  })
}

// ---------------------------------------------------------------------
// Viagens
// ---------------------------------------------------------------------
export interface ViagensFiltro {
  status?: string
  veiculo_id?: string
  motorista_id?: string
  de?: string
  ate?: string
  limit?: number
  offset?: number
}

export function useViagens(filtro: ViagensFiltro) {
  return useQuery({
    queryKey: ['viagens', filtro],
    queryFn: () =>
      api.get<Paginated<Viagem>>(
        `/viagens${qs({ ...filtro, limit: filtro.limit ?? 20, offset: filtro.offset ?? 0 })}`,
      ),
    placeholderData: (prev) => prev,
  })
}

export function useViagem(id: string | undefined) {
  return useQuery({
    queryKey: ['viagem', id],
    queryFn: () => api.get<Viagem>(`/viagens/${id}`),
    enabled: !!id,
  })
}

export function useTrajetoria(viagemId: string | undefined, refetchMs?: number) {
  return useQuery({
    queryKey: ['trajetoria', viagemId],
    queryFn: () => api.get<Trajetoria>(`/viagens/${viagemId}/posicoes`),
    enabled: !!viagemId,
    refetchInterval: refetchMs,
  })
}

export function useTrajetoRuas(viagemId: string | undefined, refetchMs?: number) {
  return useQuery({
    queryKey: ['trajeto-ruas', viagemId],
    queryFn: () => api.get<TrajetoRuas>(`/viagens/${viagemId}/trajeto-ruas`),
    enabled: !!viagemId,
    refetchInterval: refetchMs,
    staleTime: 30_000,
  })
}

export function useAlertasDaViagem(viagemId: string | undefined) {
  return useQuery({
    queryKey: ['viagem-alertas', viagemId],
    queryFn: () => api.get<Alerta[]>(`/viagens/${viagemId}/alertas`),
    enabled: !!viagemId,
  })
}

type CreateViagemInput = {
  veiculo_id: string
  motorista_id: string
  rota_planejada_id?: string | null
  km_inicial?: number | null
  nf_ids?: string[]
}

export function useViagemMutations() {
  const qc = useQueryClient()
  const invalidate = (id?: string) => {
    qc.invalidateQueries({ queryKey: ['viagens'] })
    if (id) qc.invalidateQueries({ queryKey: ['viagem', id] })
  }
  return {
    criar: useMutation({
      mutationFn: (input: CreateViagemInput) => api.post<Viagem>('/viagens', input),
      meta: { erroLocal: true }, // erro tratado inline no CriarViagemModal
      onSuccess: () => invalidate(),
    }),
    iniciar: useMutation({
      mutationFn: (id: string) => api.post<Viagem>(`/viagens/${id}/iniciar`, {}),
      onSuccess: (v) => invalidate(v.id),
    }),
    encerrar: useMutation({
      mutationFn: ({ id, km_final }: { id: string; km_final?: number }) =>
        api.post<Viagem>(`/viagens/${id}/encerrar`, km_final != null ? { km_final } : {}),
      meta: { erroLocal: true }, // erro tratado inline no EncerrarViagemModal
      onSuccess: (v) => invalidate(v.id),
    }),
    cancelar: useMutation({
      mutationFn: (id: string) => api.post<Viagem>(`/viagens/${id}/cancelar`, {}),
      onSuccess: (v) => invalidate(v.id),
    }),
    marcarParada: useMutation({
      mutationFn: ({
        viagemId,
        paradaId,
        status,
      }: {
        viagemId: string
        paradaId: string
        status: string
      }) => api.patch<Parada>(`/viagens/${viagemId}/paradas/${paradaId}`, { status }),
      onSuccess: (_p, vars) => invalidate(vars.viagemId),
    }),
  }
}

// ---------------------------------------------------------------------
// Alertas (feed do gestor)
// ---------------------------------------------------------------------
export interface AlertasFiltro {
  visualizado?: boolean
  tipo?: string
  limit?: number
  offset?: number
}

export function useAlertas(filtro: AlertasFiltro) {
  return useQuery({
    queryKey: ['alertas', filtro],
    queryFn: () =>
      api.get<Paginated<Alerta>>(
        `/alertas${qs({
          visualizado: filtro.visualizado === undefined ? undefined : String(filtro.visualizado),
          tipo: filtro.tipo,
          limit: filtro.limit ?? 50,
          offset: filtro.offset ?? 0,
        })}`,
      ),
    placeholderData: (prev) => prev,
  })
}

export function useMarcarAlerta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, visualizado }: { id: string; visualizado: boolean }) =>
      api.patch<Alerta>(`/alertas/${id}`, { visualizado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertas'] })
      qc.invalidateQueries({ queryKey: ['viagem-alertas'] })
    },
  })
}

// ---------------------------------------------------------------------
// Multas
// ---------------------------------------------------------------------
export interface MultasFiltro {
  status_pagamento?: string
  status_revisao?: string
  busca?: string
  limit?: number
  offset?: number
}

export function useMultas(filtro: MultasFiltro) {
  return useQuery({
    queryKey: ['multas', filtro],
    queryFn: () =>
      api.get<Paginated<Multa>>(
        `/multas${qs({ ...filtro, limit: filtro.limit ?? 20, offset: filtro.offset ?? 0 })}`,
      ),
    placeholderData: (prev) => prev,
  })
}

export function useMultaMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['multas'] })
  return {
    criar: useMutation({
      mutationFn: (input: Record<string, unknown>) => api.post<Multa>('/multas', input),
      meta: { erroLocal: true }, // erro tratado inline no CriarMultaModal
      onSuccess: invalidate,
    }),
    revincular: useMutation({
      mutationFn: (id: string) => api.post<Multa>(`/multas/${id}/revincular`, {}),
      onSuccess: invalidate,
    }),
    atualizar: useMutation({
      mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
        api.patch<Multa>(`/multas/${id}`, input),
      onSuccess: invalidate,
    }),
    remover: useMutation({
      mutationFn: (id: string) => api.del<void>(`/multas/${id}`),
      onSuccess: invalidate,
    }),
  }
}

// ---------------------------------------------------------------------
// Consultas de débitos/multas (Infosimples) + contador de consumo
// ---------------------------------------------------------------------
export interface ConsumoConsultas {
  faixa: string
  plano: string
  usados: number
  limite: number | null // null = ilimitado
  restantes: number | null
  custoCentavosMes: number
  configurado: boolean // false = modo simulado (sem chave ainda)
}

export interface ResultadoConsulta {
  simulado: boolean
  mensagem: string
  placa: string
  multasEncontradas: number
  multasNovas: number
  multasDuplicadas: number
  consumo: ConsumoConsultas
}

export function useConsumoConsultas() {
  return useQuery({
    queryKey: ['consultas-consumo'],
    queryFn: () => api.get<ConsumoConsultas>('/consultas/consumo'),
  })
}

export function useConsultarVeiculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (veiculoId: string) =>
      api.post<ResultadoConsulta>(`/consultas/veiculo/${veiculoId}`, {}),
    meta: { erroLocal: true }, // erro tratado no aviso inline da aba Veículos
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultas-consumo'] })
      qc.invalidateQueries({ queryKey: ['multas'] })
    },
  })
}

// ---------------------------------------------------------------------
// NFs
// ---------------------------------------------------------------------
export interface NfsFiltro {
  status?: string
  busca?: string
  limit?: number
  offset?: number
}

export function useNfs(filtro: NfsFiltro) {
  return useQuery({
    queryKey: ['nfs', filtro],
    queryFn: () =>
      api.get<Paginated<NotaFiscal>>(
        `/nfs${qs({ ...filtro, limit: filtro.limit ?? 20, offset: filtro.offset ?? 0 })}`,
      ),
    placeholderData: (prev) => prev,
  })
}

export function useImportarNfe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (xml: string) => api.post<NotaFiscal>('/nfs/importar', { xml }),
    meta: { erroLocal: true }, // erro tratado inline no painel de importação
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nfs'] }),
  })
}

// ---------------------------------------------------------------------
// Cadastros (listas simples — endpoints retornam array)
// ---------------------------------------------------------------------
export function useVeiculos() {
  return useQuery({ queryKey: ['veiculos'], queryFn: () => api.get<Veiculo[]>('/veiculos') })
}

export function useMotoristas() {
  return useQuery({ queryKey: ['motoristas'], queryFn: () => api.get<Motorista[]>('/motoristas') })
}

export function useUnidades() {
  return useQuery({ queryKey: ['unidades'], queryFn: () => api.get<Unidade[]>('/unidades') })
}

export function useRotas() {
  return useQuery({ queryKey: ['rotas'], queryFn: () => api.get<Rota[]>('/rotas') })
}

export function useRota(id: string | null | undefined) {
  return useQuery({
    queryKey: ['rota', id],
    queryFn: () => api.get<Rota>(`/rotas/${id}`),
    enabled: !!id,
  })
}

/**
 * Fábrica de mutations CRUD para um recurso de cadastro (lista por array).
 * `key` é o caminho da API e a queryKey (ex.: 'veiculos').
 */
function useCrud<T>(key: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [key] })
  return {
    criar: useMutation({
      mutationFn: (input: Record<string, unknown>) => api.post<T>(`/${key}`, input),
      meta: { erroLocal: true }, // erro tratado inline no modal do formulário
      onSuccess: invalidate,
    }),
    atualizar: useMutation({
      mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
        api.patch<T>(`/${key}/${id}`, input),
      meta: { erroLocal: true }, // erro tratado inline no modal do formulário
      onSuccess: invalidate,
    }),
    remover: useMutation({
      mutationFn: (id: string) => api.del<void>(`/${key}/${id}`),
      onSuccess: invalidate,
    }),
  }
}

export const useVeiculoMutations = () => useCrud<Veiculo>('veiculos')
export const useMotoristaMutations = () => useCrud<Motorista>('motoristas')
export const useUnidadeMutations = () => useCrud<Unidade>('unidades')
export const useRotaMutations = () => useCrud<Rota>('rotas')
