import { useMemo, forwardRef } from 'react'
import type { VirtualColumn } from '../../types/timeline.types'
import type { DailyBar } from '../../hooks/useRates'

interface BarStripProps {
  virtualColumns: VirtualColumn[]
  /** Ref para el inner div con transform — manejado por TimelineScheduler
   *  vía DOM mutation directa (sin React state) para fluidez SwiftUI-style. */
  innerRef?: React.Ref<HTMLDivElement>
  columnWidth: number  // ancho del fixed left label
  dayWidth: number
  data: DailyBar[] | undefined
  onClickStrip?: () => void  // abre Rate Quote Sheet
}

/**
 * Nivel 1 — BAR strip ambient en el header del calendar.
 *
 * Pattern: WebRezPro (rack rate default) + Booking Engine Cloudbeds, mejorado
 * con: solo 1 número/columna día (Sweller 1988), clickable para abrir Rate
 * Quote Sheet (Nivel 3).
 *
 * Resuelve la queja Mews verbatim ("BAR per room per day inline en timeline")
 * sin caer en la saturación visual de RoomKey Enhanced View (rate por celda).
 *
 * Ver docs/sprints/RATES-3-LEVEL-PROPOSAL.md (research citado, 12 fuentes).
 */
export function BarStrip({
  virtualColumns,
  innerRef,
  columnWidth,
  dayWidth,
  data,
  onClickStrip,
}: BarStripProps) {
  const barByDate = useMemo(() => {
    const map = new Map<string, DailyBar>()
    for (const item of data ?? []) map.set(item.date, item)
    return map
  }, [data])

  if (!data || data.length === 0) return null

  return (
    <button
      type="button"
      onClick={onClickStrip}
      className="flex-shrink-0 flex border-b border-slate-100 bg-emerald-50/30 hover:bg-emerald-50/60 transition-colors overflow-hidden select-none cursor-pointer w-full text-left"
      style={{ height: 24 }}
      title="Ver detalle de tarifas"
    >
      {/* Fixed label (matches HABITACIONES column) */}
      <div
        className="flex-shrink-0 flex items-center px-3 border-r border-slate-100 bg-emerald-50/40"
        style={{ width: columnWidth }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
          BAR / día
        </span>
      </div>

      {/* Per-day rate values — synced with grid scroll via direct DOM mutation.
          El parent (TimelineScheduler) aplica translate3d sobre innerRef
          en cada scroll event sin pasar por React state — bypass del
          reconciliation para 60fps fluido (Apple Calendar pattern). */}
      <div className="flex-1 overflow-hidden relative">
        <div
          ref={innerRef}
          className="absolute top-0 left-0 h-full"
          style={{ willChange: 'transform' }}
        >
          {virtualColumns.map((vc) => {
            const dateKey = vc.date.toISOString().slice(0, 10)
            const bar = barByDate.get(dateKey)
            const display = bar
              ? bar.bar >= 1000
                ? `$${(bar.bar / 1000).toFixed(bar.bar >= 10000 ? 0 : 1)}k`
                : `$${bar.bar.toLocaleString()}`
              : '—'
            return (
              <div
                key={vc.key}
                className="absolute top-0 flex items-center justify-center"
                style={{
                  left: vc.start,
                  width: vc.size,
                  height: '100%',
                  borderRight: '1px solid rgba(16,185,129,0.08)',
                }}
              >
                <span
                  className="font-mono tabular-nums"
                  style={{
                    fontSize: dayWidth >= 40 ? 11 : 9,
                    fontWeight: 600,
                    color: 'rgba(4,120,87,0.85)',
                    letterSpacing: '-0.01em',
                  }}
                  title={bar ? `${bar.currency} ${bar.bar.toLocaleString()}` : 'Sin tarifa configurada'}
                >
                  {display}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </button>
  )
}
