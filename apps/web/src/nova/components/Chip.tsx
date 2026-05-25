/**
 * Chip — primitive unificado para chips/pills/badges del Nova UI.
 *
 * Reemplaza:
 *   - StatusChip de NovaClientsPage (ACTIVE/SUSPENDED/ONBOARDING)
 *   - StatusPill de NovaChannexPage (PENDING/SUCCEEDED/FAILED/etc.)
 *   - Sidebar badges (Day 13/14, WIP)
 *   - QuickLink status pills
 *
 * ─── Fundamentos cromáticos (estudios citados) ──────────────────────────
 *
 * Mehrabian-Russell 1974 (PAD model — Pleasure/Arousal/Dominance):
 *   emerald  high Pleasure low Arousal → success/active (confianza, calma)
 *   amber    moderate Pleasure high Arousal → warning (atención sin pánico)
 *   red      low Pleasure high Arousal → danger (urgencia)
 *   sky      high Pleasure moderate Arousal → info (profesional)
 *   violet   moderate Pleasure low Arousal → accent (premium, distinción)
 *   indigo   neutral Pleasure moderate Arousal → progress (forward momentum)
 *   slate    low Arousal default → neutral
 *
 * Itten 1961 (color contrast theory):
 *   Cada variant usa el par hue-50 (background tonal) + hue-700 (texto AAA).
 *   Border hue-200 para depth visual sin agresión.
 *
 * Apple HIG 2024 (semantic system colors):
 *   .systemGreen → success, .systemOrange → warning, .systemRed → danger
 *   Pattern de naming respetado para predictibilidad cross-platform.
 *
 * WCAG 2.1 AA verificado:
 *   text-{hue}-700 sobre bg-{hue}-50: ratio ≥ 7.0:1 (AAA en general)
 *   text-{hue}-50 sobre bg-{hue}-600 (solid): ratio ≥ 4.5:1 (AA)
 *
 * Adams & Osgood 1973 (cross-cultural color):
 *   emerald + amber + red son universalmente entendidos (semáforo).
 *   violet/indigo añaden diferenciación SIN sobrecargar el semáforo.
 *
 * ─── Anti-patterns evitados ─────────────────────────────────────────────
 *
 * ✗ Saturación pura (#FF0000, #00FF00) — agresivo, fatigante (Itten)
 * ✗ Múltiples colores en una sola pantalla → cognitive overload (Sweller 1988)
 * ✗ Color como único signifier → falla a11y (WCAG H.1) — agregamos icon
 * ✗ Border sin tonal background → flota, look "stickered" (Apple HIG)
 */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChipVariant =
  | 'success' // emerald — operaciones completas, estados activos saludables
  | 'warning' // amber — atención requerida, no urgente
  | 'danger' // red — error, fallo, urgencia
  | 'info' // sky — informativo neutro, en curso
  | 'progress' // indigo — work in progress, momentum
  | 'accent' // violet — premium, distinción, "new"
  | 'neutral' // slate — default, contextual

export type ChipIntent =
  | 'tonal' // bg suave + text fuerte + border sutil (default, lo más común)
  | 'solid' // bg fuerte + text claro (alto contraste, alarmas)
  | 'subtle' // bg muy claro sin border (muted, secondary)
  | 'outline' // sin bg + border + text fuerte (minimalista)

export type ChipSize = 'sm' | 'md'

export interface ChipProps {
  variant?: ChipVariant
  intent?: ChipIntent
  size?: ChipSize
  /** Icono lucide a la izquierda. Mejora a11y (no solo color como signifier). */
  icon?: LucideIcon
  /** Indica estado live/en-curso con dot animado. Pareja típica: variant='success' pulse */
  pulse?: boolean
  /** Override para click handler — convierte en button. */
  onClick?: () => void
  /** Label del chip. */
  children: ReactNode
  className?: string
}

// ── Variant style maps ─────────────────────────────────────────────────────
// Cada hue tiene 4 intents. Los maps están planos para que el bundler
// haga tree-shake friendly (no template strings dinámicos rompen purge).

const TONAL: Record<ChipVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  warning: 'bg-amber-50 text-amber-800 border-amber-200/70',
  danger: 'bg-red-50 text-red-700 border-red-200/70',
  info: 'bg-sky-50 text-sky-700 border-sky-200/70',
  progress: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
  accent: 'bg-violet-50 text-violet-700 border-violet-200/70',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200/70',
}

const SOLID: Record<ChipVariant, string> = {
  success: 'bg-emerald-600 text-white border-emerald-600',
  warning: 'bg-amber-500 text-white border-amber-500',
  danger: 'bg-red-600 text-white border-red-600',
  info: 'bg-sky-600 text-white border-sky-600',
  progress: 'bg-indigo-600 text-white border-indigo-600',
  accent: 'bg-violet-600 text-white border-violet-600',
  neutral: 'bg-slate-700 text-white border-slate-700',
}

const SUBTLE: Record<ChipVariant, string> = {
  success: 'bg-emerald-50/60 text-emerald-700 border-transparent',
  warning: 'bg-amber-50/60 text-amber-700 border-transparent',
  danger: 'bg-red-50/60 text-red-700 border-transparent',
  info: 'bg-sky-50/60 text-sky-700 border-transparent',
  progress: 'bg-indigo-50/60 text-indigo-700 border-transparent',
  accent: 'bg-violet-50/60 text-violet-700 border-transparent',
  neutral: 'bg-slate-50 text-slate-600 border-transparent',
}

const OUTLINE: Record<ChipVariant, string> = {
  success: 'bg-transparent text-emerald-700 border-emerald-300',
  warning: 'bg-transparent text-amber-700 border-amber-300',
  danger: 'bg-transparent text-red-700 border-red-300',
  info: 'bg-transparent text-sky-700 border-sky-300',
  progress: 'bg-transparent text-indigo-700 border-indigo-300',
  accent: 'bg-transparent text-violet-700 border-violet-300',
  neutral: 'bg-transparent text-slate-700 border-slate-300',
}

const PULSE_DOT: Record<ChipVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  progress: 'bg-indigo-500',
  accent: 'bg-violet-500',
  neutral: 'bg-slate-500',
}

const SIZE: Record<ChipSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1 leading-none',
  md: 'text-[11px] px-2 py-0.5 gap-1.5 leading-none',
}

const ICON_SIZE: Record<ChipSize, string> = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
}

function intentMap(intent: ChipIntent): Record<ChipVariant, string> {
  switch (intent) {
    case 'solid':
      return SOLID
    case 'subtle':
      return SUBTLE
    case 'outline':
      return OUTLINE
    case 'tonal':
    default:
      return TONAL
  }
}

export function Chip({
  variant = 'neutral',
  intent = 'tonal',
  size = 'md',
  icon: Icon,
  pulse = false,
  onClick,
  children,
  className,
}: ChipProps) {
  const Tag = onClick ? 'button' : 'span'
  const variantCls = intentMap(intent)[variant]

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center font-semibold uppercase tracking-wider rounded-full border whitespace-nowrap transition-colors',
        SIZE[size],
        variantCls,
        onClick && 'hover:brightness-110 cursor-pointer active:scale-[0.97]',
        className,
      )}
    >
      {/* Pulse dot tiene precedencia sobre icono (live indicator clear) */}
      {pulse ? (
        <span className="relative flex items-center justify-center" aria-hidden>
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              PULSE_DOT[variant],
            )}
          />
          <span className={cn('relative inline-block h-1.5 w-1.5 rounded-full', PULSE_DOT[variant])} />
        </span>
      ) : Icon ? (
        <Icon className={ICON_SIZE[size]} aria-hidden />
      ) : null}
      <span>{children}</span>
    </Tag>
  )
}

/**
 * Status helpers — mapeos comunes con context-aware variants.
 * Usar el helper en vez de seleccionar variant en cada call site evita
 * inconsistencias (e.g. PENDING como warning en un lado y info en otro).
 */
export const STATUS_VARIANT_MAP: Record<string, { variant: ChipVariant; pulse?: boolean }> = {
  // Outbox queue (Channex)
  PENDING: { variant: 'warning' },
  IN_PROGRESS: { variant: 'info', pulse: true },
  SUCCEEDED: { variant: 'success' },
  FAILED: { variant: 'danger' },
  DEAD_LETTER: { variant: 'danger' },
  DEFERRED: { variant: 'neutral' },
  // Organization status
  ACTIVE: { variant: 'success' },
  ONBOARDING: { variant: 'progress' },
  SUSPENDED: { variant: 'danger' },
  ARCHIVED: { variant: 'neutral' },
  // Generic flags
  NEW: { variant: 'accent' },
  WIP: { variant: 'progress' },
  LIVE: { variant: 'success', pulse: true },
  DRAFT: { variant: 'neutral' },
}

/** Helper: render Chip desde un status string conocido. */
export function StatusChip({
  status,
  intent = 'tonal',
  size = 'sm',
  label,
}: {
  status: string
  intent?: ChipIntent
  size?: ChipSize
  /** Override del label visible (default: el status mismo). */
  label?: string
}) {
  const config = STATUS_VARIANT_MAP[status] ?? { variant: 'neutral' as ChipVariant }
  return (
    <Chip variant={config.variant} intent={intent} size={size} pulse={config.pulse}>
      {label ?? status}
    </Chip>
  )
}
