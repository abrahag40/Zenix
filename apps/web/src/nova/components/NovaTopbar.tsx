/**
 * NovaTopbar — barra superior del Nova shell.
 *
 * Refactor 2026-05-25 con design system: bg surface raised, typography
 * jerárquica (Title del page title), IconButton para logout.
 */
import { useNavigate } from 'react-router-dom'
import { LogOut, UserCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useNovaStore } from '../../store/nova'
import { TenantSwitcher } from './TenantSwitcher'
import { Title, Caption, IconButton } from '../design-system'

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
    <header className="h-14 border-b border-slate-200/70 bg-white/80 backdrop-blur-md backdrop-saturate-150 sticky top-0 z-20 flex items-center px-4 gap-3">
      <div className="flex-1 min-w-0">
        {title && <Title className="truncate">{title}</Title>}
      </div>

      <div className="flex items-center gap-2">
        {actions}
        <TenantSwitcher />

        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200/70 ml-1">
          <div className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-slate-400" aria-hidden />
            <div className="text-[12px] leading-tight">
              <div className="font-medium text-slate-900">
                {user?.name || user?.email || 'Usuario'}
              </div>
              {user?.actorTier && (
                <Caption tone="tertiary">{prettyTier(user.actorTier)}</Caption>
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
