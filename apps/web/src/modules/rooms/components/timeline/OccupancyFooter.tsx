import { useMemo } from 'react'
import { startOfDay } from 'date-fns'
import { cn } from '@/lib/utils'
import type { GuestStayBlock, VirtualColumn } from '../../types/timeline.types'

interface ReadinessTask {
  roomId: string
  status: string
  itemsDone: number
  itemsTotal: number
}

interface OccupancyFooterProps {
  virtualColumns: VirtualColumn[]
  stays: GuestStayBlock[]
  totalRooms: number
  dayWidth: number
  columnWidth: number
  scrollLeft: number
  readinessTasks?: ReadinessTask[]
  /** Cancel-Archive Sprint: counter "Canceladas hoy" + handler para abrir slide drawer. */
  cancelledTodayCount?: number
  onOpenCancelledToday?: () => void
}

function calcDayOccupancy(
  date: Date,
  stays: GuestStayBlock[],
  totalRooms: number,
): { count: number; percent: number } {
  const d = startOfDay(date)
  const active = stays.filter(s => {
    const checkIn = startOfDay(new Date(s.checkIn))
    const checkOut = startOfDay(new Date(s.checkOut))
    return checkIn <= d && d < checkOut
  })
  return {
    count: active.length,
    percent: totalRooms > 0
      ? Math.round((active.length / totalRooms) * 100)
      : 0,
  }
}

export function OccupancyFooter({
  virtualColumns, stays, totalRooms, dayWidth, columnWidth, scrollLeft, readinessTasks,
  cancelledTodayCount, onOpenCancelledToday,
}: OccupancyFooterProps) {
  const today = useMemo(() => startOfDay(new Date()), [])

  return (
    <div className="flex-shrink-0 border-t-2 border-slate-200 bg-white
                   flex overflow-hidden select-none"
         style={{ height: 52 }}>
      {/* Fixed label — Propuesta A (Sprint CANCEL-ARCHIVE 2026-05-16):
          Cuando hay cancelaciones, la columna se transforma 100% en CTA
          clickeable (Fitts 1954: max touch target). Trade-off aceptado:
          se oculta "Ocupación / X hab. total" ese día — la info de % por
          día sigue visible en las columnas a la derecha.
          Sin cancelaciones, vuelve al estado label informativo. */}
      {(cancelledTodayCount ?? 0) > 0 && onOpenCancelledToday ? (
        <button
          type="button"
          onClick={onOpenCancelledToday}
          className="flex-shrink-0 flex flex-col items-start justify-center
                     gap-0.5 px-3 border-r border-slate-200 bg-rose-50
                     hover:bg-rose-100 transition-colors text-left group"
          style={{ width: columnWidth, height: '100%' }}
          title="Ver cancelaciones del día"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">
            Canceladas
          </span>
          <span className="text-base font-bold text-rose-700 leading-none tabular-nums">
            {cancelledTodayCount}{' '}
            <span className="text-[10px] font-medium text-rose-500/80">hoy</span>
          </span>
          <span className="text-[9px] text-rose-400 leading-tight inline-flex items-center gap-0.5
                          opacity-70 group-hover:opacity-100 transition-opacity">
            Ver archivo
            <span className="text-rose-400">›</span>
          </span>
        </button>
      ) : (
        <div
          className="flex-shrink-0 flex flex-col justify-center px-3
                     border-r border-slate-200 bg-slate-50"
          style={{ width: columnWidth }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Ocupación
          </span>
          <span className="text-[9px] text-slate-300 font-mono">
            {totalRooms} hab. total
          </span>
        </div>
      )}

      {/* Metrics per day — synced with grid scroll via translateX */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="absolute top-0 left-0 h-full"
          style={{ transform: `translateX(-${scrollLeft}px)` }}
        >
          {virtualColumns.map((vc) => {
            const { count, percent } = calcDayOccupancy(vc.date, stays, totalRooms)
            const isToday = startOfDay(vc.date).getTime() === today.getTime()
            const isPast = startOfDay(vc.date) < today

            const barColor = percent >= 90 ? '#10B981'
              : percent >= 60 ? '#F59E0B'
              : percent >= 30 ? '#94A3B8'
              : '#E2E8F0'

            return (
              <div
                key={vc.key}
                className={cn(
                  'absolute top-0 flex flex-col items-center justify-center gap-0.5',
                  'border-r border-slate-100',
                  isToday && 'bg-emerald-50/40',
                  isPast && 'opacity-50',
                )}
                style={{ left: vc.start, width: vc.size, height: 52, flexShrink: 0 }}
              >
                {/* Count */}
                {dayWidth >= 40 && (
                  <span
                    className="text-[10px] font-semibold font-mono leading-none"
                    style={{ color: isPast ? '#94A3B8' : '#475569' }}
                  >
                    {count}/{totalRooms}
                  </span>
                )}
                {/* Bar */}
                <div className="w-4/5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
                {/* Percent + readiness indicator */}
                <div className="flex items-center gap-1">
                  {dayWidth >= 40 && (
                    <span
                      className="text-[9px] font-mono font-medium leading-none"
                      style={{ color: isPast ? '#94A3B8' : barColor }}
                    >
                      {percent > 0 ? `${percent}%` : '—'}
                    </span>
                  )}
                  {(() => {
                    if (!readinessTasks?.length || !isToday) return null
                    const pending = readinessTasks.filter((t) =>
                      ['PENDING', 'IN_PROGRESS', 'NEEDS_MAINTENANCE'].includes(t.status),
                    )
                    if (!pending.length) return null
                    const hasIssue = pending.some((t) => t.status === 'NEEDS_MAINTENANCE')
                    return (
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: hasIssue ? '#FB923C' : '#38BDF8' }}
                        title={
                          hasIssue
                            ? 'Mantenimiento requerido'
                            : `${pending.length} tarea${pending.length > 1 ? 's' : ''} pendiente${pending.length > 1 ? 's' : ''}`
                        }
                      />
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
