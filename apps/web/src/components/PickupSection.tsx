/**
 * PickupSection — Fase 2 RATES-METRICS / D-METRICS3 (2026-06-04).
 *
 * Muestra el pickup por noche futura: cuántas habitaciones y revenue nuevo entraron
 * en los últimos N días, comparado con el snapshot AS-OF (hoy − N).
 *
 * Honesto con el estado del histórico:
 *   - Si `comparedTo` no tiene snapshot (primera captura), todo el on-the-books
 *     aparece como "pickup nuevo". El componente lo señaliza con un banner.
 *   - El pace YoY (vs same-time-last-year) requiere ≥365 días de captura — hasta
 *     entonces se muestra un placeholder explicativo.
 */
import { useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Info, TrendingUp, History } from 'lucide-react'
import { usePickup, usePace, type PickupRow } from '@/hooks/useMetrics'
import { InfoTooltip } from '@/components/InfoTooltip'

const DAYS_AGO_PRESETS = [1, 3, 7, 14, 30]
const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function formatDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SPANISH_MONTHS[m - 1]}`
}

function formatMoney(n: number, ccy: string): string {
  return `${ccy} ${Math.round(n).toLocaleString()}`
}

export function PickupSection({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const [daysAgo, setDaysAgo] = useState(7)
  const { data, isLoading, isError } = usePickup(propertyId, daysAgo, 14, isSupervisor)
  const pace = usePace(propertyId, 30, isSupervisor)

  if (!isSupervisor || isError) return null
  if (isLoading || !data) {
    return <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-400">Cargando pickup…</div>
  }
  if (data.series.length === 0) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-700">Pickup & Pace</p>
        <p className="text-xs text-gray-400 mt-1">
          Sin captura forward aún. El cron nocturno la generará automáticamente; el supervisor también puede
          dispararla manualmente desde la consola.
        </p>
      </section>
    )
  }

  const totals = data.series.reduce(
    (acc, r) => {
      acc.rooms += r.roomsPickup
      acc.revenue += r.revenuePickup
      return acc
    },
    { rooms: 0, revenue: 0 },
  )
  const ccy = data.series[0]?.baseCurrency ?? 'USD'
  const sameAsOf = data.asOfDate.slice(0, 10) === data.comparedTo.slice(0, 10)
  // Cuando comparedTo no tiene snapshot, el motor restó 0 → pickup === roomsOnBooks
  // para TODOS los rows con ventas. Si NINGÚN row con ventas tiene un delta distinto a
  // su total, asumimos que no hay histórico para este daysAgo.
  const rowsWithSales = data.series.filter((r) => r.roomsOnBooks > 0)
  const histShallow =
    rowsWithSales.length > 0 && rowsWithSales.every((r) => r.roomsPickup === r.roomsOnBooks)
  const paceHasStly = (pace.data?.series ?? []).some((r) => r.stlyRoomsOnBooks != null)

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-indigo-600" /> Pickup & Pace
          <InfoTooltip text="Pickup = cuántas reservas nuevas entraron en los últimos N días. Te dice si la demanda se está calentando o enfriando. Pace = comparación con el mismo momento del año pasado (se activa cuando tengas 1 año de historia)." />
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Pickup</span>
          {DAYS_AGO_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDaysAgo(n)}
              className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${
                daysAgo === n
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {(sameAsOf || histShallow) && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {sameAsOf
              ? 'Aún no hay snapshot del período comparado (es el primer día de captura). El delta empieza a ser real desde mañana.'
              : 'Histórico aún insuficiente para este pickup. Hoy el delta refleja todo lo on-the-books — los días por venir mostrarán el incremento real.'}
          </span>
        </div>
      )}

      {/* Narrativa plain-language */}
      {!sameAsOf && !histShallow && (
        <p className="text-[12px] text-gray-600 leading-relaxed -mt-2">
          {totals.rooms > 0
            ? `Entraron ${totals.rooms} habitaciones nuevas (${formatMoney(totals.revenue, ccy)}) en los últimos ${daysAgo} días. Demanda ${totals.rooms >= 5 ? 'caliente' : 'tibia'}.`
            : totals.rooms < 0
              ? `Se cancelaron ${Math.abs(totals.rooms)} reservas en los últimos ${daysAgo} días — más cancels que altas. Revisa si hay un patrón.`
              : `Cero movimiento neto en los últimos ${daysAgo} días. Sin altas, sin cancels.`}
        </p>
      )}

      {/* Totales del pickup */}
      <div className="grid grid-cols-2 gap-3">
        <Totals icon={ArrowUpRight} label={`Hab. nuevas · últimos ${daysAgo}d`} value={`+${totals.rooms}`} tone="emerald" />
        <Totals
          icon={ArrowUpRight}
          label={`Revenue nuevo · últimos ${daysAgo}d`}
          value={`+${formatMoney(totals.revenue, ccy)}`}
          tone="emerald"
        />
      </div>

      {/* Series por noche futura — max-w controla el sprawl horizontal en
          cards anchas (fix 2026-06-07: blanco gigante entre contenido y badges). */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">
          Por noche · próximas 14 noches
        </p>
        <div className="space-y-1 max-w-md">
          {data.series.map((r) => (
            <PickupRow key={r.stayDate} row={r} ccy={ccy} />
          ))}
        </div>
      </div>

      {/* Pace YoY */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 flex items-center gap-1">
            <History className="h-3 w-3" /> Pace YoY · vs mismo momento año anterior
          </p>
        </div>
        {paceHasStly ? (
          <div className="space-y-1">
            {(pace.data?.series ?? []).slice(0, 7).map((r) => {
              const occ = r.occupancyPercent
              const stly = r.stlyOccupancyPercent ?? 0
              const diff = occ - stly
              return (
                <div key={r.stayDate} className="flex items-center gap-2 text-[11px] tabular-nums">
                  <span className="w-16 text-gray-500">{formatDay(r.stayDate)}</span>
                  <span className="w-20 text-gray-900">Hoy {occ.toFixed(0)}%</span>
                  <span className="w-24 text-gray-400">STLY {stly.toFixed(0)}%</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      diff > 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : diff < 0
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    {diff > 0 ? '+' : ''}
                    {diff.toFixed(0)} pts
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2.5 text-[11px] text-gray-600 flex gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
            <span>
              Pace YoY requiere ≥365 días de captura forward. Hoy aún no hay snapshot de same-time-last-year — el
              indicador se activa automáticamente al cumplir 1 año desde el primer captura ({pace.data?.stlyAsOfDate?.slice(0, 10)}).
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function Totals({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ArrowUpRight
  label: string
  value: string
  tone: 'emerald' | 'rose'
}) {
  const cls = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center justify-center h-6 w-6 rounded ${cls}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-semibold text-gray-900 mt-1.5 tabular-nums">{value}</p>
    </div>
  )
}

function PickupRow({ row, ccy }: { row: PickupRow; ccy: string }) {
  const positive = row.roomsPickup > 0
  const negative = row.roomsPickup < 0
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : null
  const badgeCls = positive
    ? 'bg-emerald-50 text-emerald-700'
    : negative
      ? 'bg-rose-50 text-rose-700'
      : 'bg-gray-50 text-gray-400'
  return (
    // Layout: flex compacto con gap fijo — sin `1fr` que expandía la columna
    // central y dejaba un blanco gigante en cards anchas (reportado 2026-06-07).
    <div className="flex items-center gap-3 text-[11px] tabular-nums">
      <span className="text-gray-500 w-[60px] flex-shrink-0">{formatDay(row.stayDate)}</span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-gray-900 font-medium">{row.roomsOnBooks}</span>
        <span className="text-gray-400">hab.</span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-400">{row.occupancyPercent.toFixed(0)}%</span>
      </div>
      <span className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5 justify-center w-[72px] flex-shrink-0 ${badgeCls}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {row.roomsPickup > 0 ? '+' : ''}
        {row.roomsPickup}
      </span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] text-right w-[88px] flex-shrink-0 ${badgeCls}`}>
        {row.revenuePickup > 0 ? '+' : ''}
        {formatMoney(row.revenuePickup, ccy)}
      </span>
    </div>
  )
}
