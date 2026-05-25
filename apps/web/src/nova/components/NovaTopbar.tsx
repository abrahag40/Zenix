/**
 * NovaTopbar — top bar coordinada con sidebar oscuro.
 *
 * Refactor 2026-05-25 (Linear/Notion pattern):
 * Sidebar es slate-950 dark, main content es slate-50 light. La topbar
 * vive sobre main content → glass blanco con backdrop-blur preserve la
 * delineación visual.
 *
 * Sticky top con backdrop-blur-md + saturate-150 = "frosted glass" Apple
 * HIG materials. Border bottom subtle slate-200/70 separa del page content
 * sin agresión.
 */
import { useNavigate } from 'react-router-dom'
import { LogOut, UserCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useNovaStore } from '../../store/nova'
import { TenantSwitcher } from './TenantSwitcher'
import { IconButton } from '../design-system'

interface NovaTopbarProps {
  title?: string
  actions?: React.ReactNode
}

export function NovaTopbar({ title, actions }: NovaTopbarProps) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const clearActingOrg = useNovaStore((s) => s.clearActingOrg)
  const navigate = useNavigate()

  const handleLogout = () => {
    clearActingOrg()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="h-14 border-b border-slate-200/70 bg-white/85 backdrop-blur-md backdrop-saturate-150 sticky top-0 z-20 flex items-center px-5 gap-3">
      {/* Page title — uses tracking-tight + serif-adjacent semibold para
          el "Apple system title" feel. */}
      <div className="flex-1 min-w-0">
        {title && (
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-[-0.005em] truncate">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <TenantSwitcher />

        {/* User chip + logout */}
        <div className="hidden sm:flex items-center gap-2 pl-3 ml-1 border-l border-slate-200/70">
          <div className="flex items-center gap-2">
            <div className="relative">
              <UserCircle2 className="h-7 w-7 text-slate-400" aria-hidden />
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                aria-hidden
              />
            </div>
            <div className="text-[12px] leading-tight">
              <div className="font-semibold text-slate-900 tracking-[-0.005em]">
                {user?.name || user?.email || 'Usuario'}
              </div>
              {user?.actorTier && (
                <div className="text-[10px] text-slate-500 tracking-wide">
                  {prettyTier(user.actorTier)}
                </div>
              )}
            </div>
          </div>
          <IconButton
            icon={LogOut}
            size="sm"
            variant="ghost"
            aria-label="Cerrar sesión"
            onClick={handleLogout}
            title="Cerrar sesión"
          />
        </div>
      </div>
    </header>
  )
}

function prettyTier(tier: string): string {
  switch (tier) {
    case 'PLATFORM':
      return 'Platform Admin'
    case 'PARTNER_ADMIN':
      return 'Partner Admin'
    case 'PARTNER_MEMBER':
      return 'Partner Member'
    case 'ORG_OWNER':
      return 'Org Owner'
    case 'ORG_STAFF':
      return 'Org Staff'
    default:
      return tier
  }
}
