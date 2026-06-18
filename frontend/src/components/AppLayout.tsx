import { NavLink, Outlet } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Route as RouteIcon,
  Truck,
  Users,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/viagens', label: 'Viagens', icon: RouteIcon },
  { to: '/alertas', label: 'Alertas', icon: AlertTriangle },
  { to: '/multas', label: 'Multas', icon: Receipt },
  { to: '/nfs', label: 'Notas fiscais', icon: FileText },
  { to: '/cadastros', label: 'Cadastros', icon: Users },
]

// Itens exclusivos da equipe da plataforma (super admin).
const NAV_SUPER = [{ to: '/bastidores', label: 'Bastidores', icon: Building2, end: false }]

export function AppLayout() {
  const { usuario, logout } = useAuth()
  const nav = usuario?.superAdmin ? [...NAV, ...NAV_SUPER] : NAV

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r bg-card">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="h-4 w-4" />
          </div>
          <span className="font-semibold">Frota CD</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{usuario?.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{usuario?.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

/** Cabeçalho padrão de página. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b bg-card px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
