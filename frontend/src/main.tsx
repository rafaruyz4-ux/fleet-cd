import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import './index.css'
import { App } from './App.tsx'
import { AuthProvider } from '@/lib/auth'
import { ApiError } from '@/lib/api'

const queryClient = new QueryClient({
  // Rede de segurança global: NENHUMA mutação falha em silêncio. Quem trata o
  // erro na própria tela (formulários com mensagem inline) marca a mutation
  // com `meta: { erroLocal: true }` e o toast global não repete o aviso.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.meta?.erroLocal) return
      // 401: a app já limpa a sessão e volta ao login — sem toast por cima.
      if (error instanceof ApiError && error.status === 401) return
      toast.error(
        error instanceof ApiError ? error.message : 'Algo deu errado. Tente de novo.',
      )
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            theme="dark"
            closeButton
            toastOptions={{
              style: {
                background: 'hsl(220 42% 9% / 0.92)',
                backdropFilter: 'blur(12px)',
                border: '1px solid hsl(205 38% 20%)',
                color: 'hsl(210 100% 96%)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
