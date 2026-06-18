import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthResult, UsuarioPublico } from '@/types'
import { api, setOnAuthFailure } from './api'
import { tokenStore } from './token-store'

interface AuthContextValue {
  usuario: UsuarioPublico | null
  /** true enquanto valida a sessão existente no carregamento inicial. */
  loading: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null)
  // loading só começa true quando há token a revalidar (evita setState síncrono no effect).
  const [loading, setLoading] = useState(() => Boolean(tokenStore.getAccess()))

  useEffect(() => {
    // Quando o refresh falha em qualquer chamada, derruba a sessão.
    setOnAuthFailure(() => setUsuario(null))

    // Sem token guardado, não há sessão a revalidar (loading já é false).
    if (!tokenStore.getAccess()) return

    api
      .get<UsuarioPublico>('/auth/me')
      .then(setUsuario)
      .catch(() => {
        tokenStore.clear()
        setUsuario(null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, senha: string) {
    const result = await api.post<AuthResult>(
      '/auth/login',
      { email, senha },
      { skipAuthRetry: true },
    )
    tokenStore.set(result.accessToken, result.refreshToken)
    setUsuario(result.usuario)
  }

  function logout() {
    tokenStore.clear()
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
