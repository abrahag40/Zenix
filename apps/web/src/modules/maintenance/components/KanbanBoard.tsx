/**
 * KanbanBoard.tsx — Sprint Mx-1B-W1
 *
 * Vista principal de tickets para SUPERVISOR/MAINTENANCE: 7 columnas por
 * TicketStatus + 1 columna virtual al inicio para Flujo B (esperando
 * aprobación) cuando el actor es supervisor y hay tickets pendientes.
 *
 * Reglas no negociables (heredadas KP-01 — KanbanPage de housekeeping):
 *   · Scrollbar horizontal SIEMPRE visible (no auto-hide).
 *     NN/g 2020 (n=300): scrollbar permanente + partial column = 95%
 *     discoverability vs 67% del fade aislado.
 *   · Empty states top-aligned con copy neutral-positivo
 *     (Krug 2014: empty state nunca debe requerir scroll).
 *   · Columna `border-t-{color}` = pre-attentive identification.
 *   · Cards con priority accent left (4px transparent fallback).
 */
import { useMemo } from 'react'
import type { MaintenanceTicketDto, StaffRole, TicketStatusValue } from '@zenix/shared'
import {
  PENDING_APPROVAL_COLUMN,
  STATUS_COLUMNS,
} from '../utils/maintenance.constants'
import { TicketCard } from './TicketCard'

interface Props {
  tickets: MaintenanceTicketDto[]
  role: StaffRole
  onSelectTicket: (id: string) => void
}

/**
 * Particiona los tickets en 8 buckets visibles.
 * - Columna virtual "Esperando aprobación" sale ANTES si role=SUPERVISOR
 *   y hay >=1 ticket con pendingApproval.
 * - "CLOSED" se colapsa por default — el supervisor rara vez lo usa.
 */
export function KanbanBoard({ tickets, role, onSelectTicket }: Props) {
  const buckets = useMemo(() => {
    const pendingApproval =
      role === 'SUPERVISOR' ? tickets.filter((t) => t.pendingApproval) : []
    const showApprovalColumn = pendingApproval.length > 0
    const byStatus = new Map<TicketStatusValue, MaintenanceTicketDto[]>()
    for (const t of tickets) {
      // Tickets pendingApproval ya viven en la columna virtual; no duplicar.
      if (showApprovalColumn && t.pendingApproval) continue
      const arr = byStatus.get(t.status) ?? []
      arr.push(t)
      byStatus.set(t.status, arr)
    }
    return { pendingApproval, showApprovalColumn, byStatus }
  }, [tickets, role])

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-start py-16 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-base font-semibold text-slate-700">Sin tickets activos</h3>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Cuando alguien levante un reporte aparecerá aquí en tiempo real.
        </p>
      </div>
    )
  }

  return (
    <div
      className="
        overflow-x-auto pb-4
        [scrollbar-width:thin]
        [&::-webkit-scrollbar]:h-2
        [&::-webkit-scrollbar-track]:bg-slate-100
        [&::-webkit-scrollbar-thumb]:bg-slate-300
        [&::-webkit-scrollbar-thumb]:rounded
      "
    >
      <div className="flex items-start gap-3 min-w-max">
        {buckets.showApprovalColumn && (
          <Column
            label={PENDING_APPROVAL_COLUMN.label}
            hint={PENDING_APPROVAL_COLUMN.hint}
            ringColor={PENDING_APPROVAL_COLUMN.ringColor}
            pillBg={PENDING_APPROVAL_COLUMN.pillBg}
            tickets={buckets.pendingApproval}
            onSelect={onSelectTicket}
            emptyMessage="Cuando un técnico o housekeeper reporte un problema, lo verás aquí."
          />
        )}
        {STATUS_COLUMNS.map((col) => {
          const items = buckets.byStatus.get(col.status) ?? []
          // Ocultar CLOSED si está vacío (es un archivo histórico).
          if (col.status === 'CLOSED' && items.length === 0) return null
          return (
            <Column
              key={col.status}
              label={col.label}
              hint={col.hint}
              ringColor={col.ringColor}
              pillBg={col.pillBg}
              tickets={items}
              onSelect={onSelectTicket}
              emptyMessage={emptyCopy(col.status)}
            />
          )
        })}
      </div>
    </div>
  )
}

function Column({
  label,
  hint,
  ringColor,
  pillBg,
  tickets,
  onSelect,
  emptyMessage,
}: {
  label: string
  hint: string
  ringColor: string
  pillBg: string
  tickets: MaintenanceTicketDto[]
  onSelect: (id: string) => void
  emptyMessage: string
}) {
  return (
    <section
      className={`
        flex flex-col w-72 shrink-0 rounded-xl bg-slate-50/60
        border-t-4 ${ringColor}
        ring-1 ring-slate-200/70
      `}
    >
      {/* Sticky header — visible al hacer scroll vertical dentro de la columna */}
      <header className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm rounded-t-xl px-3 pt-3 pb-2 border-b border-slate-200/60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
            {label}
          </h3>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${pillBg}`}
          >
            {tickets.length}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{hint}</p>
      </header>

      {/* Body */}
      <div className="px-2 py-2 flex flex-col gap-2 min-h-[120px]">
        {tickets.length === 0 ? (
          <p className="text-[11px] text-slate-400 px-2 py-3 leading-relaxed">
            {emptyMessage}
          </p>
        ) : (
          tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} onClick={onSelect} />
          ))
        )}
      </div>
    </section>
  )
}

function emptyCopy(status: TicketStatusValue): string {
  switch (status) {
    case 'OPEN':
      return 'No hay tickets sin asignar 🎉'
    case 'ACKNOWLEDGED':
      return 'Nadie con tickets recién recibidos.'
    case 'IN_PROGRESS':
      return 'Sin trabajo activo en este momento.'
    case 'WAITING_PARTS':
      return 'Sin tickets esperando refacciones.'
    case 'RESOLVED':
      return 'Nada por verificar — todo al día.'
    case 'VERIFIED':
      return 'Sin tickets listos para cerrar.'
    default:
      return ''
  }
}
