/**
 * StatTile — métrica/KPI tile reusable.
 *
 * Apple HIG + Material 3 inspired:
 *   - Tonal gradient subtle del accent en background (Material 3 surface)
 *   - Icon avatar tonal a la izquierda (Apple HIG affordance)
 *   - Label uppercase eyebrow + value large + hint sutil
 *   - Hover lift sutil
 *
 * Variants:
 *   - 6 accent colors: emerald | sky | violet | indigo | amber | red
 *   - 'trend' opcional: small chip arriba derecha con +/- delta
 *   - 'loading' state: skeleton del value
 *
 * Densidad:
 *   - size='md' (default) — dashboard tiles
 *   - size='sm' — sidebar mini-tiles
 */
import type { LucideIcon } from 'lucide-react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ELEVATION } from './tokens'
import { Eyebrow, Metric, Caption } from './Typography'

export type StatAccent = 'emerald' | 'sky' | 'violet' | 'indigo' | 'amber' | 'red'

const ACCENT_TINT: Record<StatAccent, string> = {
  emerald: 'from-emerald-500/[0.06] via-emerald-500/[0.02] to-transparent',
  sky: 'from-sky-500/[0.06] via-sky-500/[0.02] to-transparent',
  violet: 'from-violet-500/[0.06] via-violet-500/[0.02] to-transparent',
  indigo: 'from-indigo-500/[0.06] via-indigo-500/[0.02] to-transparent',
  amber: 'from-amber-500/[0.06] via-amber-500/[0.02] to-transparent',
  red: 'from-red-500/[0.06] via-red-500/[0.02] to-transparent',
}

const ACCENT_ICON_BG: Record<StatAccent, string> = {
  emerald: 'bg-emerald-100/80 text-emerald-700 ring-emerald-200/50',
  sky: 'bg-sky-100/80 text-sky-700 ring-sky-200/50',
  violet: 'bg-violet-100/80 text-violet-700 ring-violet-200/50',
  indigo: 'bg-indigo-100/80 text-indigo-700 ring-indigo-200/50',
  amber: 'bg-amber-100/80 text-amber-700 ring-amber-200/50',
  red: 'bg-red-100/80 text-red-700 ring-red-200/50',
}

interface StatTileProps {
  icon: LucideIcon
  accent: StatAccent
  label: string
  value: string | number
  hint?: string
  trend?: {
    direction: 'up' | 'down'
    label: string // e.g. "+12%" or "-3"
    intent?: 'positive' | 'negative' | 'neutral' // visual semantics (up no siempre = positive)
  }
  isLoading?: boolean
  onClick?: () => void
  className?: string
}

export function StatTile({
  icon: Icon,
  accent,
  label,
  value,
  hint,
  trend,
  isLoading = false,
  onClick,
  className,
}: StatTileProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-slate-200/70 bg-white',
        ELEVATION.e1,
        onClick && 'cursor-pointer',
        'hover:shadow-[0_8px_24px_-6px_rgba(15,23,42,0.10),0_4px_8px_-4px_rgba(15,23,42,0.06)]',
        'transition-all duration-200 ease-out',
        className,
      )}
    >
      {/* Tonal gradient overlay — Material 3 surface */}
      <div
        className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', ACCENT_TINT[accent])}
        aria-hidden
      />

      <div className="relative p-3.5">
        {/* Top row: icon + trend */}
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              'inline-flex items-center justify-center w-8 h-8 rounded-lg ring-1 ring-inset',
              ACCENT_ICON_BG[accent],
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          {trend && (
            <TrendChip direction={trend.direction} label={trend.label} intent={trend.intent} />
          )}
        </div>

        {/* Label + value + hint */}
        <div className="mt-2.5">
          <Eyebrow tone="tertiary">{label}</Eyebrow>
          <div className="mt-1">
            {isLoading ? (
              <div className="h-7 w-16 bg-slate-200/60 rounded animate-pulse" />
            ) : (
              <Metric>{value}</Metric>
            )}
          </div>
          {hint && (
            <Caption className="mt-1 block" tone="tertiary">
              {hint}
            </Caption>
          )}
        </div>
      </div>
    </div>
  )
}

function TrendChip({
  direction,
  label,
  intent = direction === 'up' ? 'positive' : 'negative',
}: {
  direction: 'up' | 'down'
  label: string
  intent?: 'positive' | 'negative' | 'neutral'
}) {
  const intentCls =
    intent === 'positive'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60'
      : intent === 'negative'
        ? 'bg-red-50 text-red-700 ring-red-200/60'
        : 'bg-slate-50 text-slate-700 ring-slate-200/60'
  const Arrow = direction === 'up' ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ring-1 ring-inset text-[10px] font-semibold tabular-nums',
        intentCls,
      )}
    >
      <Arrow className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  )
}
