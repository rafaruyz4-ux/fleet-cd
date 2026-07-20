import { tokenStore } from './token-store'
import { assinaturaSuspensaStore } from './assinatura-suspensa'

const BASE = '/api'

// Rotas que continuam acessíveis com a assinatura suspensa (mesma lista do
// backend): sucesso nelas NÃO significa que o acesso foi restabelecido.
const LIBERADAS_COM_SUSPENSA = ['/auth', '/assinatura']

function rotaLiberadaComSuspensa(path: string): boolean {
  return LIBERADAS_COM_SUSPENSA.some((base) => path === base || path.startsWith(`${base}/`))
}

/** Atualiza o sinal global de assinatura suspensa a partir de uma resposta. */
function observarAssinatura(path: string, status: number, body: unknown) {
  if (status === 403) {
    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined
    const details =
      obj?.details && typeof obj.details === 'object'
        ? (obj.details as Record<string, unknown>)
        : undefined
    if (details?.codigo === 'assinatura_suspensa') {
      assinaturaSuspensaStore.set(true)
      return
    }
  }
  // Uma chamada de DOMÍNIO respondendo 2xx = o bloqueio caiu (pagamento ok).
  if (status >= 200 && status < 300 && !rotaLiberadaComSuspensa(path)) {
    assinaturaSuspensaStore.set(false)
  }
}

export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Chamado quando o refresh falha — a app limpa o estado e volta ao login. */
let onAuthFailure: (() => void) | null = null
export function setOnAuthFailure(fn: () => void) {
  onAuthFailure = fn
}

// Single-flight: várias requisições que tomam 401 ao mesmo tempo compartilham
// um único refresh em andamento, em vez de dispararem N refreshes.
let refreshing: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { accessToken: string }
    tokenStore.set(data.accessToken)
    return true
  } catch {
    return false
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Não tenta refresh em 401 (usado pelo próprio fluxo de login). */
  skipAuthRetry?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuthRetry, signal } = opts

  const send = (token: string | null) => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  }

  let res = await send(tokenStore.getAccess())

  if (res.status === 401 && !skipAuthRetry) {
    const ok = await refreshOnce()
    if (ok) {
      res = await send(tokenStore.getAccess())
    } else {
      tokenStore.clear()
      onAuthFailure?.()
      throw new ApiError(401, 'Sessão expirada')
    }
  }

  if (res.status === 204) {
    observarAssinatura(path, res.status, undefined)
    return undefined as T
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined

  observarAssinatura(path, res.status, data)

  if (!res.ok) {
    // O backend padroniza erros como { error, details }; aceitamos message como fallback.
    const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
    const message =
      (obj && typeof obj.error === 'string' && obj.error) ||
      (obj && typeof obj.message === 'string' && obj.message) ||
      `Erro ${res.status}`
    throw new ApiError(res.status, message, data)
  }

  return data as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/**
 * Baixa um arquivo de uma rota autenticada (as rotas de export exigem o token
 * no header, então não dá para usar um <a href> direto): busca via fetch com
 * Authorization (com retry de refresh em 401, como o request) e dispara o
 * download pelo blob.
 */
export async function baixarArquivo(path: string, nomeArquivo: string): Promise<void> {
  const send = (token: string | null) =>
    fetch(`${BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

  let res = await send(tokenStore.getAccess())
  if (res.status === 401) {
    const ok = await refreshOnce()
    if (!ok) {
      tokenStore.clear()
      onAuthFailure?.()
      throw new ApiError(401, 'Sessão expirada')
    }
    res = await send(tokenStore.getAccess())
  }

  if (!res.ok) {
    let data: unknown
    try {
      data = await res.json()
    } catch {
      data = undefined
    }
    observarAssinatura(path, res.status, data)
    const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
    const message =
      (obj && typeof obj.error === 'string' && obj.error) || `Erro ${res.status} ao exportar`
    throw new ApiError(res.status, message, data)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Constrói uma query string a partir de um objeto, omitindo vazios. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
