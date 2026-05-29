/*
 * Armazena os tokens JWT (access + refresh) em localStorage e em memória.
 * Mantido fora do React para que o client HTTP possa lê-los/atualizá-los
 * sem depender do ciclo de render.
 */
const ACCESS_KEY = 'fleet.accessToken'
const REFRESH_KEY = 'fleet.refreshToken'

let accessToken: string | null = localStorage.getItem(ACCESS_KEY)
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY)

export const tokenStore = {
  getAccess: () => accessToken,
  getRefresh: () => refreshToken,
  set(access: string, refresh?: string) {
    accessToken = access
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh !== undefined) {
      refreshToken = refresh
      localStorage.setItem(REFRESH_KEY, refresh)
    }
  },
  clear() {
    accessToken = null
    refreshToken = null
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}
