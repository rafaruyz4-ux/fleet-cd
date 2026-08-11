import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Route as RouteIcon,
  Settings,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAlertasNaoVistosCount } from '@/api/hooks'
import { useAssinaturaSuspensa } from '@/lib/assinatura-suspensa'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TrocarSenhaModal } from '@/components/TrocarSenhaModal'
import { VetraLogo } from '@/components/Logo'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

// Menu agrupado por assunto: dia a dia primeiro, conta depois.
// Notas fiscais viraram aba de Cadastros (menos itens soltos no menu).
const GRUPO_OPERACAO: NavItem[] = [
  { to: '/viagens', label: 'Viagens', icon: RouteIcon },
  { to: '/alertas', label: 'Alertas', icon: AlertTriangle },
  { to: '/multas', label: 'Multas', icon: Receipt },
  { to: '/cadastros', label: 'Cadastros', icon: Users },
]

const NAV_ADMIN: NavItem[] = [
  { to: '/usuarios', label: 'Usuários', icon: UserCog },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

// Itens exclusivos da equipe da plataforma (super admin).
const NAV_SUPER: NavItem[] = [{ to: '/bastidores', label: 'Bastidores', icon: Building2 }]

function Logo() {
  return <VetraLogo />
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
  // Alertas vivos: contador de não vistos com polling (badge no item Alertas).
  const alertasNovos = useAlertasNaoVistosCount()
  const grupos: { titulo?: string; itens: NavItem[] }[] = [
    { itens: [{ to: '/', label: 'Início', icon: LayoutDashboard, end: true }] },
    { titulo: 'Operação', itens: GRUPO_OPERACAO },
    {
      titulo: 'Empresa',
      itens: [
        { to: '/assinatura', label: 'Assinatura', icon: CreditCard },
        ...(usuario?.papel === 'admin' ? NAV_ADMIN : []),
      ],
    },
    ...(usuario?.superAdmin ? [{ titulo: 'Plataforma', itens: NAV_SUPER }] : []),
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
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {grupos.map((grupo, gi) => (
          <div key={grupo.titulo ?? gi} className="space-y-1">
            {grupo.titulo && (
              <p className="font-display px-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                {grupo.titulo}
              </p>
            )}
            {grupo.itens.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-accent font-semibold text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
                {to === '/alertas' && (alertasNovos.data ?? 0) > 0 && (
                  <span
                    className="tabular-nums ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-destructive-foreground"
                    aria-label={`${alertasNovos.data} alertas não vistos`}
                  >
                    {alertasNovos.data! > 99 ? '99+' : alertasNovos.data}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-border/70 p-3">
        <div className="mb-2 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
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

// Elementos que participam do ciclo de foco dentro do drawer (mesma lista do Modal).
const FOCAVEIS_DRAWER =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AppLayout() {
  const [menuAberto, setMenuAberto] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)

  // O drawer fecha ao navegar (onNavigate nos NavLinks) e também no ESC.
  // Enquanto aberto, é um diálogo: foco inicial dentro, Tab preso (trap, como
  // no Modal) e foco devolvido a quem abriu ao fechar.
  useEffect(() => {
    if (!menuAberto) return
    const focoAnterior = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const el = drawerRef.current
      if (!el || el.contains(document.activeElement)) return
      el.querySelector<HTMLElement>(FOCAVEIS_DRAWER)?.focus()
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuAberto(false)
        return
      }
      if (e.key !== 'Tab') return
      const el = drawerRef.current
      if (!el) return
      const focaveis = Array.from(el.querySelectorAll<HTMLElement>(FOCAVEIS_DRAWER)).filter(
        (f) => f.offsetParent !== null || f === document.activeElement,
      )
      if (focaveis.length === 0) return
      const primeiro = focaveis[0]!
      const ultimo = focaveis[focaveis.length - 1]!
      const ativo = document.activeElement
      const dentro = ativo instanceof HTMLElement && el.contains(ativo)
      if (e.shiftKey) {
        if (!dentro || ativo === primeiro) {
          e.preventDefault()
          ultimo.focus()
        }
      } else if (!dentro || ativo === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      focoAnterior?.focus?.()
    }
  }, [menuAberto])

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Sidebar fixa — só no desktop (lg+) */}
      <aside className="hidden w-60 flex-col border-r bg-card lg:flex">
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
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r bg-card shadow-2xl"
          >
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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 lg:hidden">
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
    <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-card px-4 py-5 sm:px-6">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
