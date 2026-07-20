import { useSyncExternalStore } from 'react'

/*
 * Sinal global de "assinatura suspensa": o client HTTP marca quando qualquer
 * resposta vem 403 com details.codigo === 'assinatura_suspensa', e desmarca
 * quando uma chamada de domínio volta a responder OK (acesso restabelecido).
 * Mantido fora do React (como o tokenStore) para o client poder escrever
 * sem depender do ciclo de render; a UI lê via useSyncExternalStore.
 */

let suspensa = false
const listeners = new Set<() => void>()

function emitir() {
  for (const l of listeners) l()
}

export const assinaturaSuspensaStore = {
  get: () => suspensa,
  set(valor: boolean) {
    if (suspensa === valor) return
    suspensa = valor
    emitir()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** true enquanto a API estiver respondendo "assinatura suspensa". */
export function useAssinaturaSuspensa(): boolean {
  return useSyncExternalStore(assinaturaSuspensaStore.subscribe, assinaturaSuspensaStore.get)
}
