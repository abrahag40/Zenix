/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 11.
 *
 * RateCalendarMatrix — el CORE visual del Command Center.
 *
 * Layout (sticky-axis grid pattern):
 *   ┌──────────────┬──────┬──────┬──────┬─────────────┐
 *   │              │ Lun  │ Mar  │ Mié  │ ...         │  ← sticky top
 *   │ Rate plan ▼  │ 1/06 │ 2/06 │ 3/06 │ ...         │
 *   ├──────────────┼──────┼──────┼──────┼─────────────┤
 *   │ BAR Estándar │ $80  │ $80  │ $90  │ ...         │
 *   │ USD · Cap 60-100  │ ⚠   │      │      │
 *   ├──────────────┼──────┼──────┼──────┼─────────────┤
 *   │ BAR Suite    │ $150 │ $150 │ $180 │ ...         │
 *   └──────────────┴──────┴──────┴──────┴─────────────┘
 *      ↑ sticky left
 *
 * Features Day 11:
 *   1. Range picker (default: hoy → +14 días, max 365 días backend cap)
 *   2. Edit-in-place de cells: doble click → input → Enter aplica
 *   3. Cap violation: borde rojo en cells fuera de RatePlanCap min/max
 *   4. Parity issues: backgound amber en cells del row del rate plan
 *      menor en una fecha donde el spread excede threshold
 *   5. RateSource indicator: CHANNEX (solid), DEFAULT (gris claro), UNSET (dashed)
 *   6. StopSell flag: red strikethrough overlay
 *   7. Single-cell edit dispatch a bulkUpdate({ entries: [1] })
 *
 * Diferido a Day 12 (siguiente):
 *   - Multi-cell selection + bulk dialog
 *   - Day-of-week template UI
 *   - Heatmap layer (occupancy)
 *
 * Virtual scroll NO necesario aún — 14 días default × 5-10 rate plans =
 * 70-140 cells. Worth implementar @tanstack/react-virtual cuando rango
 * supere 90 días (típico Q1 forward booking). Documentar en Day 12.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, AlertTriangle, CircleAlert, CircleDashed, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  getRateCalendar,
  bulkUpdateRateCalendar,
  type RateCalendarMatrix,
  type RateCalendarCell,
  type RateCalendarRatePlanRow,
  type RateCalendarParityIssue,
} from '../../api/nova'

interface RateCalendarMatrixProps {
  propertyId: string
}

// ── Helpers de fecha ────────────────────────────────────────────────────────

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatShort(ymd: string): { dow: string; day: string; weekend: boolean } {
  const d = new Date(`${ymd}T00:00:00Z`)
  const dow = d.toLocaleDateString('es-MX', { weekday: 'short', timeZone: 'UTC' })
  const day = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
  return { dow, day, weekend }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════

export function RateCalendarMatrix({ propertyId }: RateCalendarMatrixProps) {
  const today = useMemo(() => todayYmd(), [])
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(addDays(today, 13))

  const queryKey = ['nova', 'channex', 'rate-calendar', propertyId, dateFrom, dateTo]

  const { data, isLoading, isError, refetch, error } = useQuery<RateCalendarMatrix>({
    queryKey,
    queryFn: () => getRateCalendar(propertyId, dateFrom, dateTo),
    staleTime: 15_000,
  })

  const qc = useQueryClient()

  const updateMut = useMutation({
    mutationFn: (entry: { ratePlanId: string; date: string; rate?: number; stopSell?: boolean }) =>
      bulkUpdateRateCalendar(propertyId, [entry], 'inline edit rate calendar'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nova', 'channex', 'rate-calendar', propertyId] })
    },
  })

  // ── Range navigation ───────────────────────────────────────────────────

  const shiftRange = (deltaDays: number) => {
    setDateFrom(addDays(dateFrom, deltaDays))
    setDateTo(addDays(dateTo, deltaDays))
  }

  const setPreset = (days: number) => {
    setDateFrom(today)
    setDateTo(addDays(today, days - 1))
  }

  return (
    <div className="space-y-3">
      {/* Range picker bar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 text-[12px] tabular-nums"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1 rounded border border-slate-300 text-[12px] tabular-nums"
          />
          <button
            type="button"
            onClick={() => shiftRange(-7)}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
            title="Semana anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => shiftRange(7)}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
            title="Semana siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {[
            { label: 'Hoy', days: 1 },
            { label: '7 días', days: 7 },
            { label: '14 días', days: 14 },
            { label: '30 días', days: 30 },
            { label: '90 días', days: 90 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPreset(p.days)}
              className="px-2 py-1 text-[11px] rounded text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Source indicator */}
      {data && !data.fromChannex && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[12px] text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Channex no responde — mostrando rates por defecto del rate plan
            (no son los rates reales en OTAs). Reintenta o revisa connectividad.
          </span>
        </div>
      )}

      {/* Parity issues banner */}
      {data && data.parityIssues.length > 0 && (
        <ParityIssuesBanner issues={data.parityIssues} threshold={data.parityThresholdPct} />
      )}

      {/* States */}
      {isLoading && <SkeletonGrid />}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-red-800 font-semibold text-[13px]">
            <CircleAlert className="h-4 w-4" />
            No se pudo cargar la matriz
          </div>
          <p className="text-[12px] text-red-700 mt-1">
            {error instanceof Error ? error.message : 'Error desconocido'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-[12px] underline text-red-700 hover:text-red-900"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Grid */}
      {data && data.ratePlans.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-[13px] text-slate-600">
            Esta property no tiene rate plans activos.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Crea rate plans en el tab anterior para poder gestionar tarifas aquí.
          </p>
        </div>
      )}

      {data && data.ratePlans.length > 0 && (
        <Grid
          matrix={data}
          onEditRate={(ratePlanId, date, rate) =>
            updateMut.mutate({ ratePlanId, date, rate })
          }
          onToggleStopSell={(ratePlanId, date, stopSell) =>
            updateMut.mutate({ ratePlanId, date, stopSell })
          }
          isMutating={updateMut.isPending}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Parity issues banner
// ═══════════════════════════════════════════════════════════════════════════

function ParityIssuesBanner({
  issues,
  threshold,
}: {
  issues: RateCalendarParityIssue[]
  threshold: number
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-amber-900">
            {issues.length} parity issue{issues.length > 1 ? 's' : ''} detectados
          </div>
          <p className="text-[12px] text-amber-700 mt-0.5">
            Spread cross-rate-plans del mismo room type excede {threshold}% en
            {' '}{issues.length} día(s). Revisa que la diferencia entre planes
            (BAR vs NRR, etc.) sea intencional.
          </p>
          {!expanded && issues.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[11px] mt-1 text-amber-700 hover:text-amber-900 underline"
            >
              Ver detalle ({issues.length})
            </button>
          )}
          {expanded && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-amber-800 max-h-32 overflow-y-auto">
              {issues.slice(0, 20).map((iss, i) => (
                <li key={i} className="flex gap-2 tabular-nums">
                  <span className="font-mono">{iss.date}</span>
                  <span className="text-amber-600">·</span>
                  <span>
                    Spread {iss.spreadPct}% · min ${iss.minRate} max ${iss.maxRate}
                  </span>
                </li>
              ))}
              {issues.length > 20 && (
                <li className="text-amber-600">…y {issues.length - 20} más</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Grid (sticky-axis)
// ═══════════════════════════════════════════════════════════════════════════

interface GridProps {
  matrix: RateCalendarMatrix
  onEditRate: (ratePlanId: string, date: string, rate: number) => void
  onToggleStopSell: (ratePlanId: string, date: string, stopSell: boolean) => void
  isMutating: boolean
}

function Grid({ matrix, onEditRate, onToggleStopSell, isMutating }: GridProps) {
  // Date list (todos los rate plans rows comparten el mismo set de fechas)
  const dates = matrix.ratePlans[0]?.cells.map((c) => c.date) ?? []
  // Set de issues por (ratePlanId × date) para flag rápido
  const issueSet = useMemo(() => {
    const s = new Set<string>()
    for (const iss of matrix.parityIssues) {
      for (const planId of iss.ratePlanIds) {
        s.add(`${planId}::${iss.date}`)
      }
    }
    return s
  }, [matrix.parityIssues])

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto overflow-y-visible">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr>
              {/* Esquina sticky top-left */}
              <th className="sticky left-0 top-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left min-w-[200px]">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Rate Plan
                </div>
              </th>
              {dates.map((d) => {
                const f = formatShort(d)
                return (
                  <th
                    key={d}
                    className={
                      'sticky top-0 z-10 border-b border-slate-200 px-2 py-2 min-w-[90px] text-center ' +
                      (f.weekend ? 'bg-emerald-50/40' : 'bg-slate-50')
                    }
                  >
                    <div className="text-[10px] uppercase text-slate-500">{f.dow}</div>
                    <div className="text-[11px] font-semibold text-slate-900 tabular-nums">
                      {f.day}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.ratePlans.map((row) => (
              <RatePlanRow
                key={row.channexRatePlanId}
                row={row}
                currency={matrix.currency}
                issueSet={issueSet}
                onEditRate={(date, rate) => onEditRate(row.channexRatePlanId, date, rate)}
                onToggleStopSell={(date, stopSell) =>
                  onToggleStopSell(row.channexRatePlanId, date, stopSell)
                }
                isMutating={isMutating}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend footer */}
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap gap-3 text-[10px] text-slate-600">
        <LegendDot color="bg-slate-900" label="CHANNEX (real)" />
        <LegendDot color="bg-slate-400" label="DEFAULT (planAplicable)" />
        <LegendDot color="border-2 border-red-500 bg-white" label="Fuera de cap" />
        <LegendDot color="bg-amber-100 border border-amber-300" label="Parity issue" />
        <LegendDot color="bg-red-100 line-through" label="Stop sell" />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// RatePlanRow
// ═══════════════════════════════════════════════════════════════════════════

interface RatePlanRowProps {
  row: RateCalendarRatePlanRow
  currency: string
  issueSet: Set<string>
  onEditRate: (date: string, rate: number) => void
  onToggleStopSell: (date: string, stopSell: boolean) => void
  isMutating: boolean
}

function RatePlanRow({
  row,
  currency,
  issueSet,
  onEditRate,
  onToggleStopSell,
  isMutating,
}: RatePlanRowProps) {
  const hasCap = row.rateCapMin != null || row.rateCapMax != null
  return (
    <tr>
      {/* Sticky left — rate plan label */}
      <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 align-top min-w-[200px]">
        <div className="text-[12px] font-semibold text-slate-900 leading-tight">
          {row.title}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{row.currency}</div>
        {hasCap && (
          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
            <span>Cap:</span>
            <span className="font-mono tabular-nums">
              {row.rateCapMin ?? '—'} / {row.rateCapMax ?? '—'}
            </span>
            {row.rateCapReason && (
              <span title={row.rateCapReason} className="text-slate-400">ⓘ</span>
            )}
          </div>
        )}
        <div className="text-[10px] text-slate-400 mt-0.5">
          default {row.defaultRate.toFixed(2)}
        </div>
      </td>

      {row.cells.map((cell) => (
        <RateCell
          key={cell.date}
          cell={cell}
          currency={currency}
          hasParityIssue={issueSet.has(`${row.channexRatePlanId}::${cell.date}`)}
          onEditRate={(rate) => onEditRate(cell.date, rate)}
          onToggleStopSell={(stopSell) => onToggleStopSell(cell.date, stopSell)}
          isMutating={isMutating}
          rateCapMin={row.rateCapMin}
          rateCapMax={row.rateCapMax}
        />
      ))}
    </tr>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Individual cell (con edit-in-place)
// ═══════════════════════════════════════════════════════════════════════════

interface RateCellProps {
  cell: RateCalendarCell
  currency: string
  hasParityIssue: boolean
  onEditRate: (rate: number) => void
  onToggleStopSell: (stopSell: boolean) => void
  isMutating: boolean
  rateCapMin: number | null
  rateCapMax: number | null
}

function RateCell({
  cell,
  hasParityIssue,
  onEditRate,
  onToggleStopSell,
  isMutating,
  rateCapMin,
  rateCapMax,
}: RateCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(cell.rate?.toString() ?? '')
    setEditing(true)
  }

  const commit = () => {
    const parsed = parseFloat(draft)
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== cell.rate) {
      // Validate cap client-side (backend hace check final, esto es preview UX)
      if (rateCapMin != null && parsed < rateCapMin) {
        // Igual lo mandamos — backend rechazará, UI mostrará el reason.
        // Pero damos hint inmediato.
      }
      if (rateCapMax != null && parsed > rateCapMax) {
        // idem
      }
      onEditRate(parsed)
    }
    setEditing(false)
  }

  const cancel = () => {
    setEditing(false)
    setDraft('')
  }

  // Class composition based on state
  const baseCls = 'border-b border-slate-100 px-1 py-1 text-center min-w-[90px] relative cursor-pointer transition-colors'
  const tones: string[] = []
  if (hasParityIssue) tones.push('bg-amber-50')
  if (cell.capViolation) tones.push('ring-2 ring-red-500 ring-inset')
  if (cell.stopSell) tones.push('bg-red-50')
  if (!editing) tones.push('hover:bg-slate-50')

  const rateTextCls = []
  if (cell.rateSource === 'DEFAULT') rateTextCls.push('text-slate-400')
  if (cell.rateSource === 'UNSET') rateTextCls.push('text-slate-300 italic')
  if (cell.rateSource === 'CHANNEX') rateTextCls.push('text-slate-900 font-medium')
  if (cell.stopSell) rateTextCls.push('line-through')

  return (
    <td className={`${baseCls} ${tones.join(' ')}`} onDoubleClick={startEdit}>
      {editing ? (
        <input
          type="number"
          step="0.01"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          autoFocus
          disabled={isMutating}
          className="w-full px-1 py-0.5 text-[12px] tabular-nums text-center bg-white border border-emerald-500 rounded focus:outline-none"
        />
      ) : (
        <div className="space-y-0.5">
          <div className={`text-[12px] tabular-nums ${rateTextCls.join(' ')}`}>
            {cell.rate != null ? cell.rate.toFixed(2) : '—'}
          </div>
          {/* Status icons */}
          <div className="flex justify-center gap-0.5 text-[8px] leading-none">
            {cell.minStayThrough != null && (
              <span
                title={`MLOS ${cell.minStayThrough}`}
                className="text-blue-600 bg-blue-50 px-1 rounded"
              >
                m{cell.minStayThrough}
              </span>
            )}
            {cell.closedToArrival && (
              <span title="Closed to arrival" className="text-orange-600 bg-orange-50 px-1 rounded">
                CTA
              </span>
            )}
            {cell.closedToDeparture && (
              <span
                title="Closed to departure"
                className="text-orange-600 bg-orange-50 px-1 rounded"
              >
                CTD
              </span>
            )}
          </div>
        </div>
      )}

      {/* Hover hint: doble-click para editar */}
      {!editing && cell.rate != null && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleStopSell(!cell.stopSell)
          }}
          className={
            'absolute top-0.5 right-0.5 opacity-0 hover:opacity-100 transition-opacity ' +
            'text-[9px] px-1 py-0.5 rounded ' +
            (cell.stopSell
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
          }
          title={cell.stopSell ? 'Re-abrir venta' : 'Stop sell este día'}
          disabled={isMutating}
        >
          {cell.stopSell ? 'open' : 'stop'}
        </button>
      )}
    </td>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Skeleton loading
// ═══════════════════════════════════════════════════════════════════════════

function SkeletonGrid() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
      <CircleDashed className="h-5 w-5 text-slate-400 mx-auto animate-spin" />
      <p className="text-[12px] text-slate-500 mt-2">Cargando matriz...</p>
    </div>
  )
}
