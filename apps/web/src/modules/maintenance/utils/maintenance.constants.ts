/**
 * maintenance.constants.ts — Sprint Mx-1B-W1
 *
 * Sistema de color semántico siguiendo el principio rector §13 / §13b CLAUDE.md
 * (pre-attentive Treisman 1980 + psicología del color Mehrabian-Russell 1974)
 * + Apple HIG 2024 (Color: "use color to communicate, not just decorate").
 *
 * El recepcionista debe poder decidir solo por color, sin leer el texto.
 *   CRITICAL → red-600   (peligro inminente — habitación bloqueada)
 *   HIGH     → red-400   (afecta huésped — atención prioritaria)
 *   MEDIUM   → amber-500 (advisory — funcional pero no urgente)
 *   LOW      → slate-400 (cosmético — sin presión temporal)
 *
 * Daltonismo (8% hombres): NUNCA solo color — siempre acompañado de ícono +
 * forma + label corto (Apple HIG Accessibility — "do not rely on color alone").
 */
import {
  Wrench,
  Zap,
  Sofa,
  Tv,
  Fan,
  Building2,
  Paintbrush,
  ShieldAlert,
  Bug,
  Sparkles,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'
import type { TicketCategoryValue, TicketPriorityValue, TicketStatusValue } from '@zenix/shared'

// ── Priority ────────────────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<TicketPriorityValue, string> = {
  CRITICAL: 'Crítico',
  HIGH: 'Alto',
  MEDIUM: 'Medio',
  LOW: 'Bajo',
}

/** Color del border-left de la card (4px). Siempre 4px transparent fallback. */
export const PRIORITY_ACCENT: Record<TicketPriorityValue, string> = {
  CRITICAL: 'border-l-red-600',
  HIGH: 'border-l-red-400',
  MEDIUM: 'border-l-amber-500',
  LOW: 'border-l-slate-300',
}

/** Pill compacto: bg + text. Usado en chips dentro de cards. */
export const PRIORITY_PILL: Record<TicketPriorityValue, string> = {
  CRITICAL: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  HIGH: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-100',
  MEDIUM: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  LOW: 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200',
}

export const PRIORITY_ICON: Record<TicketPriorityValue, string> = {
  CRITICAL: '🚨',
  HIGH: '🔴',
  MEDIUM: '🟡',
  LOW: '⚪',
}

// ── Status (testing T-status-prominent) ─────────────────────────────────
//
// Pill colorado por estado. Semántica:
//   OPEN          → slate     (pendiente/cola, sin acción aún)
//   ACKNOWLEDGED  → blue      (recibido por técnico, próximamente IN_PROGRESS)
//   IN_PROGRESS   → indigo    (trabajo activo)
//   WAITING_PARTS → amber     (pausado esperando material — advisory)
//   RESOLVED      → violet    (pendiente verificación — sistema 2 decisión)
//   VERIFIED      → emerald   (éxito, regresa a inventario)
//   CLOSED        → slate dim (archivado, histórico)
export const STATUS_PILL: Record<TicketStatusValue, string> = {
  OPEN:          'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  ACKNOWLEDGED:  'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  IN_PROGRESS:   'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
  WAITING_PARTS: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  RESOLVED:      'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200',
  VERIFIED:      'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  CLOSED:        'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200',
}

// ── Category ────────────────────────────────────────────────────────────

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

export const CATEGORY_ICON: Record<TicketCategoryValue, LucideIcon> = {
  PLUMBING: Wrench,
  ELECTRICAL: Zap,
  FURNITURE: Sofa,
  APPLIANCE: Tv,
  HVAC: Fan,
  STRUCTURAL: Building2,
  COSMETIC: Paintbrush,
  SAFETY: ShieldAlert,
  PEST: Bug,
  DEEP_CLEANING: Sparkles,
  OTHER: HelpCircle,
}

// ── Status (columnas Kanban) ────────────────────────────────────────────

/**
 * Subtítulos descriptivos en cada columna (NN/g H6 — recognition over recall).
 * Personal nuevo entiende el flujo sin entrenamiento. Patrón Linear/Trello.
 */
export const STATUS_COLUMNS: {
  status: TicketStatusValue
  label: string
  hint: string
  ringColor: string
  pillBg: string
}[] = [
  {
    status: 'OPEN',
    label: 'Sin asignar',
    hint: 'Disponibles en cola — pueden tomarse',
    ringColor: 'border-t-red-300',
    pillBg: 'bg-red-100 text-red-700',
  },
  {
    status: 'ACKNOWLEDGED',
    label: 'Vistos',
    hint: 'Técnico recibió el ticket',
    ringColor: 'border-t-blue-300',
    pillBg: 'bg-blue-100 text-blue-700',
  },
  {
    status: 'IN_PROGRESS',
    label: 'En progreso',
    hint: 'Trabajo activo',
    ringColor: 'border-t-emerald-300',
    pillBg: 'bg-emerald-100 text-emerald-700',
  },
  {
    status: 'WAITING_PARTS',
    label: 'En espera',
    hint: 'Esperando refacciones / proveedor',
    ringColor: 'border-t-amber-300',
    pillBg: 'bg-amber-100 text-amber-700',
  },
  {
    status: 'RESOLVED',
    label: 'Por verificar',
    hint: 'Supervisor debe revisar calidad',
    ringColor: 'border-t-violet-300',
    pillBg: 'bg-violet-100 text-violet-700',
  },
  {
    status: 'VERIFIED',
    label: 'Verificados',
    hint: 'Listos para cerrar',
    ringColor: 'border-t-slate-300',
    pillBg: 'bg-slate-100 text-slate-700',
  },
  {
    status: 'CLOSED',
    label: 'Archivados',
    hint: 'Histórico read-only',
    ringColor: 'border-t-slate-200',
    pillBg: 'bg-slate-50 text-slate-500',
  },
]

// ── Pending approval column (virtual, only for SUPERVISOR) ──────────────

export const PENDING_APPROVAL_COLUMN = {
  label: 'Esperando aprobación',
  hint: 'Reportes que requieren tu visto bueno',
  ringColor: 'border-t-amber-400',
  pillBg: 'bg-amber-100 text-amber-800',
} as const

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Formato compacto operativo (Apple HIG Time Display): "2h 15m", "45m", "ahora".
 * Reusado del patrón consolidado en KanbanPage (KP-01).
 */
export function formatElapsed(fromIso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(fromIso).getTime()) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Card aging — Trello signature feature: tickets viejos en estado activo
 *  sugieren atasco. >2h en OPEN/ACK/IN_PROGRESS/WAITING_PARTS → tinte amber. */
const AGING_THRESHOLD_MS = 2 * 60 * 60 * 1000
const ACTIVE_STATES: TicketStatusValue[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'WAITING_PARTS',
]
export function isAged(status: TicketStatusValue, updatedAt: string): boolean {
  if (!ACTIVE_STATES.includes(status)) return false
  return Date.now() - new Date(updatedAt).getTime() > AGING_THRESHOLD_MS
}

/**
 * Color de proximidad a `estimatedEndAt` (Sprint Mx-1B-W1.1).
 *   emerald: >2 días restantes — todo OK
 *   amber:   1 día o vence hoy — alerta, coordinar
 *   red:     vencido — extender o cerrar
 *   null:    sin estimación o ticket inactivo (VERIFIED/CLOSED)
 *
 * Research 2026-05-10 (Hotel Facility Guide + Flexkeeping + Clock PMS+):
 * la VISIBILIDAD de la duración restante es lo que diferencia los mejores
 * PMS de los peores. Feature request más pedido en Mews desde 2019.
 */
export interface EstimateAging {
  color: 'emerald' | 'amber' | 'red'
  label: string
  hoursRemaining: number
}

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
    return {
      color: 'red',
      label: overdueDays === 1 ? 'Vencido (1 día)' : `Vencido (${overdueDays} días)`,
      hoursRemaining: hours,
    }
  }
  if (hours < 24) {
    return {
      color: 'amber',
      label: hours < 6 ? 'Vence hoy' : 'Vence en <24h',
      hoursRemaining: hours,
    }
  }
  if (days < 3) {
    return {
      color: 'amber',
      label: `${days} día${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}`,
      hoursRemaining: hours,
    }
  }
  return {
    color: 'emerald',
    label: `${days} días restantes`,
    hoursRemaining: hours,
  }
}

export const AGING_PILL_CLASS: Record<EstimateAging['color'], string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
}

/**
 * Avatar color — hash determinístico para que mismo staff = mismo color
 * en TODA la app (consistencia con KanbanPage de housekeeping).
 */
const AVATAR_PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-rose-500',
]
export function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
