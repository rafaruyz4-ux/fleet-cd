import { tokenStore } from './token-store'

const BASE = '/api'

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

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined

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

/** Constrói uma query string a partir de um objeto, omitindo vazios. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
