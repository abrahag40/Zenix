/**
 * NovaSidebar — sidebar lateral del Nova shell.
 *
 * Refactor 2026-05-25 con design system: typography jerárquica + Chip
 * primitive + brand logo con gradient + subtle border separators.
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
import { Title, Caption } from '../design-system'

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
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-200/70 bg-white">
      {/* Brand */}
      <div className="h-14 flex items-center px-4 border-b border-slate-200/70">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-800 flex items-center justify-center text-white text-[13px] font-bold shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]"
            aria-hidden
          >
            N
          </div>
          <div>
            <Title className="leading-none">Zenix Nova</Title>
            <Caption tone="tertiary" className="leading-tight">
              Consultor workspace
            </Caption>
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
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors group ' +
                  (isActive
                    ? 'bg-gradient-to-r from-emerald-50 to-emerald-50/0 text-emerald-800'
                    : 'text-slate-700 hover:bg-slate-100/60')
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={
                        'h-4 w-4 shrink-0 transition-colors ' +
                        (isActive ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700')
                      }
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <Chip variant="progress" intent="subtle" size="sm">
                        {item.badge}
                      </Chip>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer hint */}
      <div className="p-3 border-t border-slate-200/70">
        <Caption tone="quaternary" className="block leading-snug">
          Nova v1.0 — Phase 1
        </Caption>
        <Caption tone="quaternary" className="block leading-snug">
          Cliente: <span className="font-mono">app.zenix.com</span>
        </Caption>
      </div>
    </aside>
  )
}
