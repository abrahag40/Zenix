/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * NovaTopbar — barra superior del Nova shell.
 *
 * Contenido:
 *   - Izquierda: breadcrumb / page title (slot)
 *   - Centro/derecha: TenantSwitcher chip + user menu
 *
 * Diferencia con PMS topbar: no incluye PropertySwitcher (las properties
 * son intra-cliente — el consultor primero selecciona cliente, después
 * navega entre sus properties dentro del workspace cliente).
 */
import { useNavigate } from 'react-router-dom'
import { LogOut, UserCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useNovaStore } from '../../store/nova'
import { TenantSwitcher } from './TenantSwitcher'

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
    <header className="h-14 border-b border-slate-200 bg-white flex items-center px-4 gap-3">
      {/* Title slot */}
      <div className="flex-1 min-w-0">
        {title && (
          <h1 className="text-[14px] font-semibold text-slate-900 truncate">{title}</h1>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {actions}
        <TenantSwitcher />

        {/* User menu — minimal for Day 9; expand in Day 13+ */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 ml-1">
          <div className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-slate-400" aria-hidden />
            <div className="text-[12px]">
              <div className="font-medium text-slate-900 leading-tight">
                {user?.name || user?.email || 'Usuario'}
              </div>
              {user?.actorTier && (
                <div className="text-[10px] text-slate-500 leading-tight">
                  {prettyTier(user.actorTier)}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
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
