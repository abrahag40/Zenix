/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * NovaSidebar — sidebar dedicado para Zenix Nova (consultor/admin interface).
 *
 * Diferencia con `apps/web/src/components/Sidebar.tsx` (PMS):
 *   - PMS Sidebar es horizontal topbar con menú hamburger global (recepcionista)
 *   - Nova Sidebar es vertical lateral con secciones de admin/consultor
 *
 * Secciones (la mayoría placeholders hasta Day 10-13):
 *   - Dashboard          → /nova/dashboard
 *   - Clientes           → /nova/clientes (landing tenant list)
 *   - Channex Command    → /nova/channex (Days 10-13)
 *   - Wizard Activate    → /nova/wizard (Days 14-15)
 *   - Audit log          → /nova/audit (Day 13)
 *   - Settings           → /nova/settings
 *
 * Mobile: collapse a icon-only (w-14) en <md. Desktop: full w-60 con labels.
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Cable,
  Sparkles,
  ScrollText,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Chip } from './Chip'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  badge?: string
}

const NAV: NavItem[] = [
  { label: 'Dashboard', to: '/nova/dashboard', icon: LayoutDashboard },
  { label: 'Clientes', to: '/nova/clientes', icon: Building2 },
  { label: 'Channex Command', to: '/nova/channex', icon: Cable },
  { label: 'Wizard Activate', to: '/nova/wizard', icon: Sparkles, badge: 'Day 14' },
  { label: 'Audit log', to: '/nova/audit', icon: ScrollText, badge: 'Day 13' },
  { label: 'Settings', to: '/nova/settings', icon: Settings, badge: 'WIP' },
]

export function NovaSidebar() {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-200 bg-white">
      {/* Brand */}
      <div className="h-14 flex items-center px-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-[12px] font-bold">
            N
          </div>
          <div className="text-[14px] font-semibold tracking-tight text-slate-900">
            Zenix Nova
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/nova/dashboard'}
                className={({ isActive }) =>
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors ' +
                  (isActive
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-700 hover:bg-slate-50')
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <Chip variant="progress" intent="subtle" size="sm">{item.badge}</Chip>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer hint */}
      <div className="p-3 border-t border-slate-200">
        <div className="text-[10px] text-slate-400 leading-snug">
          Nova v1.0 (Phase 1)
          <br />
          Cliente sigue en app.zenix.com
        </div>
      </div>
    </aside>
  )
}
