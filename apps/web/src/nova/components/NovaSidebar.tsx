/**
 * NovaSidebar — dark sidebar Linear-style.
 *
 * Refactor 2026-05-25: bg-slate-950 con accent emerald, glass nav items.
 * Patrón inspirado en Linear / Notion / Vercel dashboards — sidebar oscuro
 * + main content blanco da contraste fuerte y personalidad inmediata.
 *
 * ─── Decisiones cromáticas ──────────────────────────────────────────────
 *
 * bg-slate-950: casi-negro warm. Itten 1961: hue cool muy oscuro reduce
 * la sensación de "frío clínico" del black puro. Linear usa #0F0F0F equivalente.
 *
 * Nav items:
 *   - idle: text-slate-400 + icon-slate-500 (deference Apple HIG — el
 *     contenido principal del main panel domina, el chrome del sidebar
 *     se difumina)
 *   - hover: text-slate-100 + bg-white/[0.04] (glass micro-tint, no flat fill)
 *   - active: text-white + gradient emerald-500/15 → transparent + ring sutil
 *     emerald-500/20. Icon emerald-400.
 *
 * Glow del brand: shadow emerald solo en logo + active nav indicator —
 * NO en sidebar bg (sería abrumador en dashboard largo).
 *
 * Footer hint: text-slate-500 muy sutil — Apple HIG quaternary label en
 * surface oscura.
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
import { cn } from '@/lib/utils'

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
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-slate-950 text-slate-300 relative overflow-hidden">
      {/* Subtle ambient gradient — barely visible warmth en el top */}
      <div
        className="absolute inset-0 opacity-100 pointer-events-none"
        style={{
          background:
            'radial-gradient(800px circle at 0% 0%, rgba(16,185,129,0.06) 0%, transparent 50%)',
        }}
        aria-hidden
      />

      {/* Brand */}
      <div className="relative h-14 flex items-center px-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[13px]',
              'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700',
              'text-white',
              'shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_8px_24px_-8px_rgba(16,185,129,0.6)]',
            )}
            aria-hidden
          >
            N
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-tight text-white">
              Zenix Nova
            </div>
            <div className="text-[10px] text-slate-500 tracking-wide">
              Consultor workspace
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/nova/dashboard'}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                    isActive
                      ? 'text-white bg-gradient-to-r from-emerald-500/[0.15] to-emerald-500/[0.02] ring-1 ring-inset ring-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active indicator vertical bar — Linear pattern */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-gradient-to-b from-emerald-400 to-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        aria-hidden
                      />
                    )}
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-emerald-400'
                          : 'text-slate-500 group-hover:text-slate-300',
                      )}
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

        {/* Section divider for futuro grouping (e.g. Admin · Ops · Reports) */}
        {/* <div className="my-3 border-t border-white/[0.05]" /> */}
      </nav>

      {/* Footer */}
      <div className="relative p-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            Nova v1.0
          </span>
        </div>
        <div className="text-[10px] text-slate-500 leading-snug">
          Phase 1 · Cliente en <span className="font-mono text-slate-400">app.zenix.com</span>
        </div>
      </div>
    </aside>
  )
}
