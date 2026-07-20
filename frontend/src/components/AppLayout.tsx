import { NavLink, Outlet } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  CreditCard,
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
  { to: '/assinatura', label: 'Assinatura', icon: CreditCard },
]

// Itens exclusivos da equipe da plataforma (super admin).
const NAV_SUPER = [{ to: '/bastidores', label: 'Bastidores', icon: Building2, end: false }]

export function AppLayout() {
  const { usuario, logout } = useAuth()
  const nav = usuario?.superAdmin ? [...NAV, ...NAV_SUPER] : NAV

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-border/70 bg-card/60 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 border-b border-border/70 px-5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(258_100%_62%)] text-primary-foreground shadow-[0_0_18px_rgba(0,212,255,0.45)]">
            <Truck className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-base font-bold">
              Frota<span className="text-primary"> CD</span>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Nexus Orbital
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'border border-primary/30 bg-primary/10 text-primary shadow-[0_0_16px_rgba(0,212,255,0.12)]'
                    : 'border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border/70 p-3">
          <div className="mb-2 flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-[hsl(258_100%_62%)] text-xs font-bold text-primary-foreground">
              {(usuario?.nome ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{usuario?.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{usuario?.email}</p>
            </div>
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
    <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-card/40 px-6 py-5 backdrop-blur">
      <div>
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
