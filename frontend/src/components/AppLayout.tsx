import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Route as RouteIcon,
  Settings,
  Truck,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAssinaturaSuspensa } from '@/lib/assinatura-suspensa'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TrocarSenhaModal } from '@/components/TrocarSenhaModal'

const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/viagens', label: 'Viagens', icon: RouteIcon },
  { to: '/alertas', label: 'Alertas', icon: AlertTriangle },
  { to: '/multas', label: 'Multas', icon: Receipt },
  { to: '/nfs', label: 'Notas fiscais', icon: FileText },
  { to: '/cadastros', label: 'Cadastros', icon: Users },
  { to: '/assinatura', label: 'Assinatura', icon: CreditCard },
]

// Itens exclusivos do ADMIN da empresa (gestão da conta).
const NAV_ADMIN = [
  { to: '/usuarios', label: 'Usuários', icon: UserCog, end: false },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, end: false },
]

// Itens exclusivos da equipe da plataforma (super admin).
const NAV_SUPER = [{ to: '/bastidores', label: 'Bastidores', icon: Building2, end: false }]

function Logo() {
  return (
    <div className="flex items-center gap-3">
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
  )
}

/** Conteúdo da sidebar (compartilhado entre a fixa do desktop e o drawer). */
function SidebarConteudo({
  onNavigate,
  onFechar,
}: {
  onNavigate?: () => void
  onFechar?: () => void
}) {
  const { usuario, logout } = useAuth()
  const [trocarSenhaOpen, setTrocarSenhaOpen] = useState(false)
  const nav = [
    ...NAV,
    ...(usuario?.papel === 'admin' ? NAV_ADMIN : []),
    ...(usuario?.superAdmin ? NAV_SUPER : []),
  ]

  return (
    <>
      <div className="flex h-16 items-center justify-between gap-3 border-b border-border/70 px-5">
        <Logo />
        {onFechar && (
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar menu">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
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
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => setTrocarSenhaOpen(true)}
        >
          <KeyRound className="h-4 w-4" />
          Trocar senha
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
      {trocarSenhaOpen && (
        <TrocarSenhaModal open={trocarSenhaOpen} onClose={() => setTrocarSenhaOpen(false)} />
      )}
    </>
  )
}

/**
 * Banner global de assinatura suspensa: aparece quando qualquer chamada à API
 * responde 403 com codigo 'assinatura_suspensa' e some quando o acesso volta.
 */
function BannerAssinaturaSuspensa() {
  const suspensa = useAssinaturaSuspensa()
  if (!suspensa) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/40 bg-destructive/15 px-4 py-2.5 text-sm text-destructive sm:px-6">
      <span className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Assinatura suspensa — regularize o pagamento para voltar a usar o sistema.
      </span>
      <Link
        to="/assinatura"
        className="rounded-md border border-destructive/40 px-3 py-1 font-medium transition-colors hover:bg-destructive/20"
      >
        Ir para Assinatura
      </Link>
    </div>
  )
}

export function AppLayout() {
  const [menuAberto, setMenuAberto] = useState(false)

  // O drawer fecha ao navegar (onNavigate nos NavLinks) e também no ESC.
  useEffect(() => {
    if (!menuAberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAberto(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuAberto])

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Sidebar fixa — só no desktop (lg+) */}
      <aside className="hidden w-60 flex-col border-r border-border/70 bg-card/60 backdrop-blur-xl lg:flex">
        <SidebarConteudo />
      </aside>

      {/* Drawer mobile (overlay escuro + sidebar deslizante) */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuAberto(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl">
            <SidebarConteudo
              onNavigate={() => setMenuAberto(false)}
              onFechar={() => setMenuAberto(false)}
            />
          </aside>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior — só no mobile */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-card/60 px-3 backdrop-blur-xl lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Logo />
        </header>
        <BannerAssinaturaSuspensa />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
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
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 bg-card/40 px-4 py-5 backdrop-blur sm:px-6">
      <div>
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
