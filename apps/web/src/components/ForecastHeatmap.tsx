/**
 * ForecastHeatmap — Fase 2 RATES-METRICS extendido (cierre 2026-06-06).
 *
 * Vista de 28 días (4 semanas × 7 días) con celdas color-coded según ocupación
 * proyectada (on-the-books AS-OF hoy). Hover muestra rooms + revenue + occ%.
 *
 * Complementario a PickupSection — no lo reemplaza. La diferencia:
 *   · PickupSection: "qué CAMBIÓ en los últimos N días" (granular, vertical)
 *   · ForecastHeatmap: "DÓNDE está la demanda en las próximas 4 semanas"
 *                      (big picture, escaneable en <1s, NN/g pre-attentive Treisman 1980)
 *
 * Color scale (sequential single-hue, evita conflicto con §31 semantic colors).
 * Cloudbeds + Mews + RoomRaccoon pattern:
 *   · 0%       → slate-50 (neutro, "noche futura sin captura")
 *   · 1-39%    → slate-100 (open availability — demand cold)
 *   · 40-59%   → amber-100 / 200 (warming up)
 *   · 60-74%   → emerald-200 (healthy pace)
 *   · 75-89%   → emerald-400 (strong demand — considerar subir tarifa)
 *   · ≥90%     → emerald-600 (sold-out risk — revenue management peak)
 *
 * Justificación visual:
 *   · Treisman 1980 — color codificación pre-attentive (lectura en <200ms)
 *   · WCAG 1.4.1 — color + número siempre redundante (occ% visible en cada cell)
 *   · Mehrabian-Russell 1974 — emerald high arousal positiva = "negocio caliente"
 *
 * Honesto con datos faltantes: si no hay forward snapshot para una noche, la
 * celda queda slate-50 con texto "—". Sin overpromise — el primer mes del
 * cliente puede mostrar varias celdas vacías hasta que el scheduler nocturno
 * complete su primer ciclo.
 */
import { useState } from 'react'
import { CalendarRange, Info } from 'lucide-react'
import { usePace, type PaceRow } from '@/hooks/useMetrics'

const SPANISH_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // L-M-X-J-V-S-D (Spain/LATAM Sunday-as-last)
const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const HORIZON_DAYS = 28
const WEEKS = 4

interface HeatmapCell {
  date: Date
  isoDate: string
  data: PaceRow | undefined
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getUTCDay() // 0=Sun..6=Sat
  const offset = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + offset)
  r.setUTCHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function formatDayMonth(d: Date): string {
  return `${d.getUTCDate()} ${SPANISH_MONTHS[d.getUTCMonth()]}`
}

function occupancyTone(occ: number | undefined): {
  bg: string
  text: string
  label: string
} {
  if (occ == null) return { bg: 'bg-slate-50', text: 'text-slate-300', label: 'sin datos' }
  if (occ < 1) return { bg: 'bg-slate-50', text: 'text-slate-400', label: 'vacío' }
  if (occ < 40) return { bg: 'bg-slate-100', text: 'text-slate-600', label: 'cold' }
  if (occ < 60) return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'warming' }
  if (occ < 75) return { bg: 'bg-emerald-200', text: 'text-emerald-900', label: 'healthy' }
  if (occ < 90) return { bg: 'bg-emerald-400', text: 'text-emerald-950', label: 'strong' }
  return { bg: 'bg-emerald-600', text: 'text-white', label: 'peak' }
}

export function ForecastHeatmap({
  propertyId,
  isSupervisor,
}: {
  propertyId: string
  isSupervisor: boolean
}) {
  const { data, isLoading, isError } = usePace(propertyId, HORIZON_DAYS, isSupervisor)
  const [hoverCell, setHoverCell] = useState<HeatmapCell | null>(null)

  if (!isSupervisor || isError) return null
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-400">
        Cargando forecast…
      </div>
    )
  }

  // Index por isoDate para lookup O(1).
  const byDate = new Map<string, PaceRow>()
  for (const r of data.series) {
    byDate.set(r.stayDate.slice(0, 10), r)
  }

  // Genera 4 weeks × 7 days starting from start-of-week-containing-asOfDate.
  const asOf = new Date(data.asOfDate)
  const gridStart = startOfWeekMonday(asOf)
  const weeks: HeatmapCell[][] = []
  for (let w = 0; w < WEEKS; w++) {
    const row: HeatmapCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d)
      const isoDate = date.toISOString().slice(0, 10)
      row.push({ date, isoDate, data: byDate.get(isoDate) })
    }
    weeks.push(row)
  }

  // Stats útiles para el header.
  const withData = data.series.filter((r) => r.roomsOnBooks > 0)
  const peakNight = withData.reduce<PaceRow | undefined>(
    (best, r) => (best == null || r.occupancyPercent > best.occupancyPercent ? r : best),
    undefined,
  )
  const avgOcc =
    data.series.length > 0
      ? data.series.reduce((a, r) => a + r.occupancyPercent, 0) / data.series.length
      : 0

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 relative">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <CalendarRange className="h-4 w-4 text-indigo-600" /> Forecast · próximas 4 semanas
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>
            Ocupación promedio <span className="font-semibold tabular-nums text-gray-800">{avgOcc.toFixed(0)}%</span>
          </span>
          {peakNight && (
            <span>
              · Pico <span className="font-semibold tabular-nums text-gray-800">{peakNight.occupancyPercent.toFixed(0)}%</span> el{' '}
              {formatDayMonth(new Date(peakNight.stayDate))}
            </span>
          )}
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-[42px_repeat(7,1fr)] gap-1 text-[10px] text-gray-400 uppercase tracking-wide">
        <span />
        {SPANISH_DAYS.map((d) => (
          <span key={d} className="text-center font-medium">
            {d}
          </span>
        ))}
      </div>

      {/* 4 weeks grid */}
      <div className="space-y-1">
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-[42px_repeat(7,1fr)] gap-1 items-stretch">
            <span className="text-[10px] text-gray-400 self-center tabular-nums text-right pr-1">
              {formatDayMonth(row[0].date)}
            </span>
            {row.map((cell) => {
              const occ = cell.data?.occupancyPercent
              const tone = occupancyTone(occ)
              const isToday = cell.isoDate === asOf.toISOString().slice(0, 10)
              const isPast = cell.date.getTime() < asOf.getTime() && !isToday
              return (
                <button
                  key={cell.isoDate}
                  type="button"
                  onMouseEnter={() => setHoverCell(cell)}
                  onMouseLeave={() => setHoverCell(null)}
                  onFocus={() => setHoverCell(cell)}
                  onBlur={() => setHoverCell(null)}
                  className={`relative rounded-md h-10 border transition-colors flex flex-col items-center justify-center
                    ${tone.bg} ${tone.text}
                    ${isToday ? 'border-indigo-500 ring-1 ring-indigo-200' : isPast ? 'border-transparent opacity-40' : 'border-transparent hover:ring-1 hover:ring-gray-300'}
                  `}
                  aria-label={`${formatDayMonth(cell.date)}: ${occ != null ? occ.toFixed(0) + '% ocupado' : 'sin datos'}`}
                >
                  <span className="text-[10px] font-medium tabular-nums leading-none">
                    {cell.date.getUTCDate()}
                  </span>
                  <span className="text-[9px] tabular-nums leading-none mt-0.5">
                    {occ != null && occ > 0 ? `${occ.toFixed(0)}%` : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] text-gray-500 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <span>Ocupación:</span>
          <LegendChip color="bg-slate-100" label="<40%" />
          <LegendChip color="bg-amber-100" label="40-59" />
          <LegendChip color="bg-emerald-200" label="60-74" />
          <LegendChip color="bg-emerald-400" label="75-89" />
          <LegendChip color="bg-emerald-600 text-white" label="≥90" />
        </div>
        <span className="text-gray-400 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Snapshot AS-OF {asOf.toISOString().slice(0, 10)}
        </span>
      </div>

      {/* Hover detail (sticky bottom — accessible vía mouse + keyboard focus) */}
      {hoverCell && (
        <div className="absolute left-5 right-5 bottom-3 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 flex items-center justify-between gap-3 shadow-lg pointer-events-none">
          <span className="font-medium">{formatDayMonth(hoverCell.date)}</span>
          {hoverCell.data ? (
            <span className="tabular-nums flex items-center gap-3">
              <span>
                <span className="text-gray-400">Hab. </span>
                {hoverCell.data.roomsOnBooks}
              </span>
              <span>
                <span className="text-gray-400">Ocup. </span>
                {hoverCell.data.occupancyPercent.toFixed(0)}%
              </span>
              {hoverCell.data.stlyOccupancyPercent != null && (
                <span>
                  <span className="text-gray-400">YoY </span>
                  {(hoverCell.data.occupancyPercent - hoverCell.data.stlyOccupancyPercent).toFixed(0)} pts
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">Sin captura forward para esta noche</span>
          )}
        </div>
      )}
    </section>
  )
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
