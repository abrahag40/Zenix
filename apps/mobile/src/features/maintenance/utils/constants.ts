/**
 * Constants compartidos del módulo mantenimiento mobile (Sprint Mx-1B-M).
 * Espeja `maintenance.constants.ts` de web pero adaptado a React Native
 * (sin clases Tailwind — se usan StyleSheet en cada componente).
 */
import type {
  TicketCategoryValue,
  TicketPriorityValue,
  TicketStatusValue,
} from '@zenix/shared'

// ─── Priority ───────────────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<TicketPriorityValue, string> = {
  CRITICAL: 'Crítico',
  HIGH: 'Alto',
  MEDIUM: 'Medio',
  LOW: 'Bajo',
}

/** Hex semánticos siguiendo §13b CLAUDE.md — pre-attentive Treisman 1980. */
export const PRIORITY_HEX: Record<TicketPriorityValue, string> = {
  CRITICAL: '#dc2626', // red-600
  HIGH: '#f87171',     // red-400
  MEDIUM: '#f59e0b',   // amber-500
  LOW: '#94a3b8',      // slate-400
}

// Backgrounds para pill de priority (dark canvas)
export const PRIORITY_BG: Record<TicketPriorityValue, string> = {
  CRITICAL: 'rgba(239,68,68,0.18)',
  HIGH:     'rgba(248,113,113,0.18)',
  MEDIUM:   'rgba(245,158,11,0.18)',
  LOW:      'rgba(148,163,184,0.18)',
}

// Hex semánticos vibrantes para texto sobre el background dark
export const PRIORITY_HEX_DARK: Record<TicketPriorityValue, string> = {
  CRITICAL: '#FCA5A5',
  HIGH:     '#F87171',
  MEDIUM:   '#FBBF24',
  LOW:      '#CBD5E1',
}

// ─── Category ───────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<TicketCategoryValue, string> = {
  PLUMBING: 'Plomería',
  ELECTRICAL: 'Eléctrico',
  FURNITURE: 'Mobiliario',
  APPLIANCE: 'Electrodoméstico',
  HVAC: 'Climatización',
  STRUCTURAL: 'Estructura',
  COSMETIC: 'Cosmético',
  SAFETY: 'Seguridad',
  PEST: 'Plagas',
  DEEP_CLEANING: 'Limpieza profunda',
  OTHER: 'Otro',
}

// Emoji por categoría (mobile usa emoji nativo en vez de Lucide icons)
export const CATEGORY_EMOJI: Record<TicketCategoryValue, string> = {
  PLUMBING: '🚰',
  ELECTRICAL: '⚡',
  FURNITURE: '🛋',
  APPLIANCE: '📺',
  HVAC: '❄️',
  STRUCTURAL: '🏗',
  COSMETIC: '🎨',
  SAFETY: '🛡',
  PEST: '🐛',
  DEEP_CLEANING: '✨',
  OTHER: '🔧',
}

// ─── Status ─────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<TicketStatusValue, string> = {
  OPEN: 'Sin asignar',
  ACKNOWLEDGED: 'Recibido',
  IN_PROGRESS: 'En progreso',
  WAITING_PARTS: 'Esperando refacciones',
  RESOLVED: 'Por verificar',
  VERIFIED: 'Verificado',
  CLOSED: 'Archivado',
}

// ─── Días estimados default por categoría (research 2026) ───────────────

export const DEFAULT_DAYS_BY_CATEGORY: Record<TicketCategoryValue, number> = {
  PLUMBING: 3,
  ELECTRICAL: 3,
  HVAC: 2,
  APPLIANCE: 2,
  FURNITURE: 2,
  STRUCTURAL: 7,
  COSMETIC: 2,
  SAFETY: 1,
  PEST: 2,
  DEEP_CLEANING: 1,
  OTHER: 3,
}

// ─── Aging color (sincronizado con web maintenance.constants) ───────────

export type AgingColor = 'emerald' | 'amber' | 'red'

// Tonos dark-canvas (rgba con transparencia) — alineados con design/colors.ts
export const AGING_HEX: Record<AgingColor, { bg: string; fg: string }> = {
  emerald: { bg: 'rgba(16,185,129,0.16)',  fg: '#6EE7B7' },
  amber:   { bg: 'rgba(245,158,11,0.16)',  fg: '#FBBF24' },
  red:     { bg: 'rgba(239,68,68,0.16)',   fg: '#FCA5A5' },
}

export interface EstimateAging {
  color: AgingColor
  label: string
}

const ACTIVE_STATES: TicketStatusValue[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING_PARTS']

export function estimateAging(
  estimatedEndAt: string | null,
  status: TicketStatusValue,
): EstimateAging | null {
  if (!estimatedEndAt) return null
  if (!ACTIVE_STATES.includes(status)) return null
  const ms = new Date(estimatedEndAt).getTime() - Date.now()
  const hours = ms / (60 * 60 * 1000)
  const days = Math.floor(hours / 24)
  if (hours < 0) {
    const overdueDays = Math.ceil(-hours / 24)
    return { color: 'red', label: overdueDays === 1 ? 'Vencido (1d)' : `Vencido (${overdueDays}d)` }
  }
  if (hours < 24) return { color: 'amber', label: hours < 6 ? 'Vence hoy' : '<24h' }
  if (days < 3) return { color: 'amber', label: `${days}d restante${days === 1 ? '' : 's'}` }
  return { color: 'emerald', label: `${days}d restantes` }
}

// ─── Helpers ────────────────────────────────────────────────────────────

export function formatElapsed(fromIso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(fromIso).getTime()) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
