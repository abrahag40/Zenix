/**
 * NovaSidebar — warm dark sidebar coordinada con main light.
 *
 * Iteración 2026-05-25 (post owner feedback "muy agresivo"):
 *
 * Cambios vs versión slate-950 puro:
 *   - bg slate-900 (no -950) — un nivel más suave
 *   - Subtle warm radial gradient interno (emerald 4% top-left,
 *     violet 3% bottom-right) tinta el "negro" con calor sutil
 *   - text-slate-300 idle (no slate-400) — mejor legibilidad
 *   - Border-r con gradient soft → transparente al body slate-50
 *     en vez de hard line slate-950 vs slate-50
 *
 * ─── Por qué slate-900 y no -950 ─────────────────────────────────────
 *
 * slate-950 hex #020617 — value contrast 17:1 vs slate-50 #f8fafc.
 * slate-900 hex #0f172a — value contrast 14:1, still high pero menos
 * "stark fence". Stripe Dashboard 2024 usa equivalente #1c1f26.
 *
 * Cool blue undertone del slate sin compensación se siente "clinical".
 * Subtle gradient warmth via emerald/violet radials neutraliza el
 * cool sin perder la identidad dark professional.
 *
 * ─── Text contrast tiers (Apple HIG label colors aplicados a dark bg)
 *
 * white (label primary)         — active labels, brand text
 * text-slate-200 (secondary)    — hover state
 * text-slate-300 (tertiary)     — idle nav labels (READABLE, no disabled-look)
 * text-slate-400 (quaternary)   — icons idle, captions
 * text-slate-500 (disabled)     — section dividers, deeply de-emphasized
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Cable,
  CreditCard,
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
  { label: 'Billing', to: '/nova/billing', icon: CreditCard },
  { label: 'Channex Command', to: '/nova/channex', icon: Cable },
  { label: 'Wizard Activate', to: '/nova/wizard', icon: Sparkles },
  { label: 'Audit log', to: '/nova/audit', icon: ScrollText },
  { label: 'Settings', to: '/nova/settings', icon: Settings },
]

export function NovaSidebar() {
  return (
    <aside
      className="hidden md:flex flex-col w-60 shrink-0 bg-slate-900 text-slate-300 relative z-10"
      style={{
        // Drop shadow real al lado derecho — depth perceptible entre sidebar
        // y main. Stacked shadows (Apple HIG layered depth pattern):
        //   1. Inner highlight white/[0.05] — micro edge highlight 1px
        //   2. Close shadow oscura — define el corte (3px spread)
        //   3. Soft ambient shadow — depth proyectada hasta 24px
        boxShadow:
          'inset -1px 0 0 rgba(255,255,255,0.05),' +
          '2px 0 4px -1px rgba(15,23,42,0.10),' +
          '6px 0 24px -4px rgba(15,23,42,0.12)',
      }}
    >
      {/* Subtle warm gradient internos — neutraliza el "cool clinical" del slate */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            // Top-left: warm emerald glow (identity tint)
            'radial-gradient(600px circle at 0% 0%, rgba(16,185,129,0.07) 0%, transparent 50%),' +
            // Bottom-right: violet warmth (color theory complementary)
            'radial-gradient(500px circle at 100% 100%, rgba(139,92,246,0.04) 0%, transparent 55%)',
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
              'shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_8px_24px_-8px_rgba(16,185,129,0.55)]',
            )}
            aria-hidden
          >
            N
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-[-0.005em] text-white">
              Zenix Nova
            </div>
            <div className="text-[10px] text-slate-400 tracking-wide mt-0.5">
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
                      ? 'text-white bg-gradient-to-r from-emerald-500/[0.18] via-emerald-500/[0.06] to-transparent ring-1 ring-inset ring-emerald-400/20'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.05]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active indicator vertical bar — Linear pattern */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-gradient-to-b from-emerald-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
                        aria-hidden
                      />
                    )}
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-emerald-400'
                          : 'text-slate-400 group-hover:text-slate-200',
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
      </nav>

      {/* Footer — sutilmente más cálido */}
      <div className="relative p-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300/90">
            Nova v1.0
          </span>
        </div>
        <div className="text-[10px] text-slate-400 leading-snug">
          Phase 1 · Cliente en{' '}
          <span className="font-mono text-slate-300">app.zenix.com</span>
        </div>
      </div>
    </aside>
  )
}
