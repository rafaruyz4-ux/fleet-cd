import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { PageLoader } from '@/components/ui/spinner'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ViagensPage } from '@/pages/ViagensPage'
import { ViagemDetailPage } from '@/pages/ViagemDetailPage'
import { AlertasPage } from '@/pages/AlertasPage'
import { MultasPage } from '@/pages/MultasPage'
import { NfsPage } from '@/pages/NfsPage'
import { CadastrosPage } from '@/pages/CadastrosPage'
import { BackofficePage } from '@/pages/BackofficePage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth()
  if (loading) return <PageLoader label="Verificando sessão…" />
  if (!usuario) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Restringe o backoffice à equipe da plataforma (super admin).
function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth()
  if (!usuario?.superAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  const { usuario, loading } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? <PageLoader /> : usuario ? <Navigate to="/" replace /> : <LoginPage />
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="viagens" element={<ViagensPage />} />
        <Route path="viagens/:id" element={<ViagemDetailPage />} />
        <Route path="alertas" element={<AlertasPage />} />
        <Route path="multas" element={<MultasPage />} />
        <Route path="nfs" element={<NfsPage />} />
        <Route path="cadastros" element={<CadastrosPage />} />
        <Route path="bastidores" element={<RequireSuperAdmin><BackofficePage /></RequireSuperAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
