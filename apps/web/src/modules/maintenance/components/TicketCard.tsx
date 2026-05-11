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
import { CheckCircle2, Lock, AlertCircle } from 'lucide-react'
import type { MaintenanceTicketDto } from '@zenix/shared'
import {
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
  const aged = isAged(ticket.status, ticket.updatedAt)
  const slaBroken = !!ticket.slaBreachAt
  const pendingApproval = ticket.requiresApproval && ticket.pendingApproval

  // Contexto principal (NN/g: una ubicación clara > muchos detalles)
  const locationLabel = ticket.roomNumber
    ? `Hab. ${ticket.roomNumber}`
    : ticket.assetTag
    ? ticket.assetTag
    : 'Área general'

  return (
    <button
      type="button"
      onClick={() => onClick(ticket.id)}
      className={[
        'group relative flex w-full flex-col text-left',
        'border-l-4 bg-white rounded-lg border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        'hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)] hover:border-slate-300 transition-all duration-200 motion-reduce:transition-none',
        PRIORITY_ACCENT[ticket.priority],
        aged && 'bg-amber-50/50',
        compact ? 'p-2.5 gap-1.5' : 'p-3 gap-1.5',
      ].filter(Boolean).join(' ')}
    >
      {/* ── Zone 1: Priority + Category (alineados a la izquierda) ─── */}
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

      {/* ── Zone 2: Title — full width, alineado a la izquierda ────── */}
      <h3 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 tracking-tight">
        {ticket.title}
      </h3>

      {/* ── Zone 3: Solo señales operativas críticas. El resto (preventivo,
            tiempo restante, friendlyId) vive en el detalle. ──────── */}
      {(slaBroken || ticket.hasAutoBlock || pendingApproval) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {ticket.hasAutoBlock && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
              title="Habitación bloqueada automáticamente"
            >
              <Lock className="h-3 w-3" aria-hidden /> Bloqueada
            </span>
          )}
          {slaBroken && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
              title="El ticket excedió el tiempo objetivo de atención"
            >
              <AlertCircle className="h-3 w-3" aria-hidden /> Atrasado
            </span>
          )}
        </div>
      )}

      {/* ── Zone 4: Footer — ubicación · asignado · elapsed ────────── */}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
        <span className="text-slate-600 font-medium truncate max-w-[40%]">
          {locationLabel}
        </span>
        <span className="text-slate-300">·</span>
        {ticket.assignedToName ? (
          <span
            className={`inline-flex items-center justify-center rounded-full text-white font-semibold w-5 h-5 text-[9px] shrink-0 ${avatarColor(
              ticket.assignedToName,
            )}`}
            title={ticket.assignedToName}
          >
            {avatarInitials(ticket.assignedToName)}
          </span>
        ) : (
          <span className="text-slate-400 italic">Sin asignar</span>
        )}
        <span className="ml-auto shrink-0 tabular-nums">
          {formatElapsed(ticket.createdAt)}
        </span>
        {ticket.status === 'VERIFIED' && (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Verificado" />
        )}
      </div>
    </button>
  )
}
