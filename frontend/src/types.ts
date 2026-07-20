/*
 * Tipos espelhando os contratos da API (backend fleet-cd).
 * Mantidos manualmente em sincronia com os services do backend.
 */

export interface UsuarioPublico {
  id: string
  nome: string
  email: string
  papel: 'admin' | 'gestor'
  superAdmin: boolean
}

/** Faixa de plano (cobrança por tamanho de frota). Espelha src/domain/planos.ts. */
export type PlanoFaixa = 'starter' | 'pro' | 'enterprise'

/** Assinatura da própria empresa (GET /assinatura). */
export interface AssinaturaPublica {
  faixa: PlanoFaixa
  plano: string // nome do plano (ex.: "Pro")
  status: string // trial | ativo | suspenso | cancelado
  limiteVeiculos: number | null // null = ilimitado
  veiculosUsados: number
  precoMensalCentavos: number
}

/** Empresa-cliente, como listada no backoffice (super admin). */
export interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  slug: string | null
  plano: string
  ativo: boolean
  criado_em: string
  total_usuarios: number
}

/** Resultado da criação de empresa-cliente no backoffice. */
export interface EmpresaCriada {
  empresa: { id: string; nome: string; slug: string | null; plano: string }
  admin: { id: string; nome: string; email: string }
}

export interface EmpresaUsuario {
  id: string
  nome: string
  email: string
  papel: 'admin' | 'gestor'
  ativo: boolean
}

/** Detalhe de uma empresa-cliente (dados + usuários dela). */
export interface EmpresaDetalhe {
  id: string
  nome: string
  cnpj: string | null
  slug: string | null
  plano: string
  ativo: boolean
  criado_em: string
  usuarios: EmpresaUsuario[]
}

export interface AuthResult {
  usuario: UsuarioPublico
  accessToken: string
  refreshToken: string
}

/** Envelope de listagens paginadas usado pelo backend. */
export interface Paginated<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

export interface LatLng {
  lat: number
  lng: number
}

// --- Viagens ---
export type ViagemStatus = 'em_andamento' | 'encerrada' | 'cancelada'

export interface Viagem {
  id: string
  veiculo_id: string
  motorista_id: string
  rota_planejada_id: string | null
  iniciada_em: string | null
  encerrada_em: string | null
  km_inicial: number | null
  km_final: number | null
  status: ViagemStatus
  criado_em: string
  updated_at: string
  veiculo_placa: string
  veiculo_modelo: string | null
  motorista_nome: string
  paradas_count?: number
  paradas?: Parada[]
}

export type ParadaStatus = 'pendente' | 'entregue' | 'cancelada'

export interface Parada {
  id: string
  viagem_id: string
  nf_id: string | null
  ordem: number
  chegada_prevista: string | null
  chegada_real: string | null
  saida_real: string | null
  status: ParadaStatus
  nf_numero: string | null
  nf_destinatario_nome: string | null
  nf_status: string | null
}

// --- Telemetria (GPS) ---
export interface PontoTrajeto {
  lat: number
  lng: number
  velocidade_kmh: number | null
  precisao_m: number | null
  registrado_em: string
  recebido_em: string
}

/** Parada automática detectada pelo backend (cluster parado 5+ min). */
export interface ParadaDetectada {
  lat: number
  lng: number
  inicio: string
  fim: string
  duracao_min: number
}

export interface Trajetoria {
  viagem_id: string
  total: number
  pontos: PontoTrajeto[]
  paradas_detectadas: ParadaDetectada[]
}

/** Trajeto encaixado nas ruas (map matching); 'gps' = plano B (linha bruta). */
export interface TrajetoRuas {
  viagem_id: string
  fonte: 'ruas' | 'gps'
  linha: LatLng[]
}

export type AlertaTipo = 'velocidade_alta' | 'desvio_rota' | 'parada_longa' | 'sem_gps'

export interface Alerta {
  id: string
  viagem_id: string | null
  tipo: AlertaTipo
  descricao: string | null
  coordenada: LatLng | null
  criado_em: string
  visualizado: boolean
}

// --- Rotas planejadas ---
export interface Rota {
  id: string
  tipo: string
  nome: string | null
  raio_tolerancia_m: number
  duracao_estimada_min: number | null
  linha: LatLng[] | null
  criado_em: string
  updated_at: string
}

// --- Cadastros ---
export interface Veiculo {
  id: string
  placa: string
  modelo: string | null
  tipo: string
  capacidade_kg: number | null
  renavam: string | null
  ativo: boolean
  criado_em: string
  updated_at: string
}

export interface Motorista {
  id: string
  nome: string
  cpf: string
  cnh: string | null
  categoria_cnh: string | null
  validade_cnh: string | null
  telefone: string | null
  ativo: boolean
  tem_senha: boolean
  criado_em: string
  updated_at: string
}

export interface Unidade {
  id: string
  nome: string
  cnpj: string | null
  endereco: string | null
  coordenada: LatLng | null
  janela_recebimento: Record<string, string[]> | null
  ativo: boolean
  criado_em: string
  updated_at: string
}

// --- NFs ---
export interface NotaFiscal {
  id: string
  chave_acesso: string
  numero: string | null
  serie: string | null
  cfop: string | null
  emitida_em: string | null
  destinatario_cnpj: string | null
  destinatario_nome: string | null
  destinatario_endereco: string | null
  unidade_propria_id: string | null
  coordenada: LatLng | null
  valor_total: number | null
  peso_kg: number | null
  xml_path: string | null
  status: string
  criado_em: string
  updated_at: string
}

// --- Multas ---
export type MultaStatusRevisao = 'auto_vinculada' | 'aguardando_revisao' | 'revisada'
export type MultaStatusPagamento = 'pendente' | 'pago' | 'recurso'

export interface Multa {
  id: string
  numero_auto: string | null
  veiculo_id: string | null
  motorista_id: string | null
  viagem_id: string | null
  ocorrida_em: string | null
  tipo: string | null
  valor: number | null
  pontos_cnh: number | null
  local: string | null
  coordenada: LatLng | null
  fonte: string
  status_pagamento: MultaStatusPagamento | string
  status_revisao: MultaStatusRevisao | string
  criado_em: string
  updated_at: string
  veiculo_placa: string | null
  motorista_nome: string | null
}
