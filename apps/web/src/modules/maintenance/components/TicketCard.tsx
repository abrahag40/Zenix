/**
 * TicketCard.tsx — Sprint Mx-1B-W1
 *
 * Card 3-zonas siguiendo el patrón consolidado en KP-01 (Linear/Trello/Jira):
 *   1. Identity zone — priority accent left + categoría/título + kebab inline
 *   2. Action zone   — chip de contexto (room/asset) + descripción si cabe
 *   3. Footer zone   — avatar assignee + elapsed time + photo count + indicators
 *
 * Reglas no negociables (heredadas KP-01):
 *   · border-l SIEMPRE 4px (transparent fallback) — sin saltos visuales
 *   · color por priority via PRIORITY_ACCENT (Treisman 1980 pre-attentive)
 *   · scrollbar permanente cuando aplica (no auto-hide)
 *   · empty states top-aligned con copy positivo
 */
import {
  Camera,
  Clock,
  AlertCircle,
  CheckCircle2,
  Lock,
  Sparkles as SparklesIcon,
} from 'lucide-react'
import type { MaintenanceTicketDto } from '@zenix/shared'
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  PRIORITY_ACCENT,
  PRIORITY_LABEL,
  PRIORITY_PILL,
  avatarColor,
  avatarInitials,
  formatElapsed,
  isAged,
} from '../utils/maintenance.constants'

interface Props {
  ticket: MaintenanceTicketDto
  onClick: (id: string) => void
  /** When true, render compact variant (used in BookingDetailSheet tab — Mx-1B-W3). */
  compact?: boolean
}

export function TicketCard({ ticket, onClick, compact = false }: Props) {
  const Icon = CATEGORY_ICON[ticket.category]
  const aged = isAged(ticket.status, ticket.updatedAt)
  const slaBroken = !!ticket.slaBreachAt

  // Contexto descriptivo (igual filosofía HK-44 — chip que explica POR QUÉ
  // este ticket está donde está, sin que el usuario tenga que abrirlo).
  const contextChip = ticket.roomNumber
    ? `Hab. ${ticket.roomNumber}`
    : ticket.assetTag
    ? `🔧 ${ticket.assetTag}`
    : '📍 Área general'

  return (
    <button
      type="button"
      onClick={() => onClick(ticket.id)}
      className={[
        'group relative flex w-full flex-col text-left',
        'border-l-4 bg-white rounded-lg border border-slate-200 shadow-sm',
        'hover:shadow-md hover:border-slate-300 transition-all duration-200 motion-reduce:transition-none',
        PRIORITY_ACCENT[ticket.priority],
        aged && 'bg-amber-50/50',
        compact ? 'p-3 gap-1.5' : 'p-3.5 gap-2',
      ].filter(Boolean).join(' ')}
    >
      {/* ── Zone 1: Identity ──────────────────────────────────────────── */}
      <div className="flex items-start gap-2">
        <Icon
          className="h-4 w-4 text-slate-500 shrink-0 mt-0.5"
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                PRIORITY_PILL[ticket.priority]
              }`}
            >
              {PRIORITY_LABEL[ticket.priority]}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">
              {CATEGORY_LABEL[ticket.category]}
            </span>
          </div>
          <h3
            className={`mt-1 ${
              compact ? 'text-[13px]' : 'text-sm'
            } font-semibold text-slate-900 leading-snug line-clamp-2`}
          >
            {ticket.title}
          </h3>
        </div>
      </div>

      {/* ── Zone 2: Action / context ──────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200">
          {contextChip}
        </span>
        {ticket.hasAutoBlock && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
            title="Habitación bloqueada automáticamente — Channex notificado"
          >
            <Lock className="h-3 w-3" aria-hidden /> Bloqueada
          </span>
        )}
        {ticket.requiresApproval && ticket.pendingApproval && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
            <AlertCircle className="h-3 w-3" aria-hidden /> Aprobación
          </span>
        )}
        {slaBroken && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
            title="SLA vencido — supervisor notificado"
          >
            <Clock className="h-3 w-3" aria-hidden /> SLA
          </span>
        )}
        {ticket.recurrenceTemplateId && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200"
            title="Mantenimiento preventivo recurrente"
          >
            <SparklesIcon className="h-3 w-3" aria-hidden /> Preventivo
          </span>
        )}
      </div>

      {/* ── Zone 3: Footer ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-1 mt-auto text-[11px] text-slate-500">
        {ticket.assignedToName ? (
          <span
            className={`inline-flex items-center justify-center rounded-full text-white font-semibold w-5 h-5 text-[9px] ${avatarColor(
              ticket.assignedToName,
            )}`}
            title={ticket.assignedToName}
          >
            {avatarInitials(ticket.assignedToName)}
          </span>
        ) : (
          <span className="text-slate-400 italic">Sin asignar</span>
        )}
        <span className="ml-auto inline-flex items-center gap-0.5">
          <Clock className="h-3 w-3" aria-hidden />
          {formatElapsed(ticket.createdAt)}
        </span>
        {ticket.status === 'VERIFIED' && (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Verificado" />
        )}
      </div>
    </button>
  )
}
