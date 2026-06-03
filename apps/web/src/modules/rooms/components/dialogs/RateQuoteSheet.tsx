import { useState, useMemo } from 'react'
import { format, addDays, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Calendar as CalendarIcon, Users, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRateQuoteGrid } from '../../hooks/useRates'
import { useModalDismiss } from '../../hooks/useModalDismiss'

/**
 * Cap UX del rango: rango > 14d genera una tabla horizontal de 14+ columnas
 * que no cabe en el sheet (640px max-width). Cualquier rango mayor degrada
 * a scroll horizontal gigante con tipografía minúscula — anti-UX.
 *
 * Pattern Mews/Cloudbeds: side panel quote = 7-14d window. Para >14d,
 * usar el reporte "Rate Calendar" full-page (sprint v1.0.3 REPORTS-CORE).
 *
 * Hard cap aquí impide al usuario meterse en ese estado degradado.
 */
const MAX_NIGHTS = 14

interface RateQuoteSheetProps {
  open: boolean
  propertyId: string
  initialFrom?: Date
  initialTo?: Date
  onClose: () => void
}

/**
 * Nivel 3 — Rate Quote Sheet (side panel).
 *
 * Pattern: equivalente al Opera F5 Rate Lookup pero accesible en 1 click
 * desde el calendar (vs 5 clicks en Opera). Resuelve el "phone call quick
 * quote" caso de uso de los Mews users sin la fricción documentada.
 *
 * Vista: grid roomTypes × días con rate. Selector de rango de fechas
 * arriba (default = today → +3). Total estimado al final.
 *
 * v1.0.0 muestra solo BAR base. v1.0.1 PAY-CORE agregará:
 * - rate plans selector (BAR vs Promo vs Corporate)
 * - pax count selector (precios diferenciales)
 * - FX conversion (USD ↔ MXN con Banxico + override hotel)
 */
export function RateQuoteSheet({
  open,
  propertyId,
  initialFrom,
  initialTo,
  onClose,
}: RateQuoteSheetProps) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [from, setFrom] = useState<Date>(initialFrom ?? today)
  const [to, setTo] = useState<Date>(initialTo ?? addDays(today, 3))

  const { data, isLoading, isError, error, refetch } = useRateQuoteGrid(propertyId, from, to, undefined, open)
  const { onBackdropClick } = useModalDismiss({ isDirty: false, onClose })

  const nights = Math.max(1, differenceInDays(to, from))
  const exceedsMax = nights > MAX_NIGHTS

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end"
      onClick={onBackdropClick}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-none" />

      {/* Side sheet — slides from right, max-w 640 */}
      <div className="relative z-10 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Accent stripe */}
        <div className="h-1 bg-emerald-500/70 flex-shrink-0" />

        {/* Sticky header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-slate-900 leading-tight">
                Consulta de tarifas
              </h2>
              <p className="text-xs text-slate-500 leading-tight">
                {nights} noche{nights === 1 ? '' : 's'} · {data?.roomTypes.length ?? 0} tipos de habitación
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          {/* Date range selector */}
          <div className="flex items-center gap-2 text-xs">
            <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={from.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value)
                d.setHours(0, 0, 0, 0)
                setFrom(d)
                // Clamp to dentro del rango MAX_NIGHTS y >= from+1
                if (d >= to) setTo(addDays(d, 1))
                if (differenceInDays(to, d) > MAX_NIGHTS) setTo(addDays(d, MAX_NIGHTS))
              }}
              className="px-2 py-1 border border-slate-200 rounded text-xs focus:border-slate-400 focus:ring-0"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={to.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value)
                d.setHours(0, 0, 0, 0)
                if (d <= from) return
                // Hard cap MAX_NIGHTS — UX prevention vs degradation a scroll gigante
                const capped = differenceInDays(d, from) > MAX_NIGHTS ? addDays(from, MAX_NIGHTS) : d
                setTo(capped)
              }}
              max={addDays(from, MAX_NIGHTS).toISOString().slice(0, 10)}
              className="px-2 py-1 border border-slate-200 rounded text-xs focus:border-slate-400 focus:ring-0"
            />
            {/* Quick presets */}
            <div className="flex items-center gap-1 ml-2">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={() => { setFrom(today); setTo(addDays(today, 1)) }}
              >
                Hoy
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={() => { setFrom(today); setTo(addDays(today, 7)) }}
              >
                7d
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={() => { setFrom(today); setTo(addDays(today, MAX_NIGHTS)) }}
              >
                14d
              </Button>
            </div>
          </div>

          {/* Cap notice — feedback informativo (NN/g H1) explicando el límite. */}
          {exceedsMax && (
            <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>
                Rango limitado a {MAX_NIGHTS} días en consulta rápida. Para horizontes más largos usa el reporte
                <span className="text-slate-400"> (Rate Calendar — llega en v1.0.3)</span>.
              </span>
            </div>
          )}
        </div>

        {/* Grid roomTypes × dates */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-xs text-slate-400 gap-2">
              <div className="h-4 w-4 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
              Cargando tarifas…
            </div>
          )}
          {!isLoading && isError && (
            <div className="text-center py-12 px-6 space-y-2">
              <AlertCircle className="h-6 w-6 text-rose-400 mx-auto" />
              <div className="text-sm text-slate-700 font-medium">No se pudieron cargar las tarifas</div>
              <div className="text-xs text-slate-500 max-w-sm mx-auto">
                {(error as Error | null)?.message ?? 'Error de red — verifica tu conexión.'}
              </div>
              <Button size="sm" variant="outline" className="mt-2 text-xs h-8" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {!isLoading && !isError && data && data.roomTypes.length === 0 && (
            <div className="text-center py-12 px-6">
              <div className="text-sm text-slate-500 font-medium mb-1">Sin tipos de habitación configurados</div>
              <div className="text-xs text-slate-400">Configura tipos + tarifas base en Ajustes.</div>
            </div>
          )}
          {!isLoading && !isError && data && data.roomTypes.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50/95 border-b border-slate-100 backdrop-blur">
                <tr>
                  <th className="text-left px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Tipo
                  </th>
                  {data.dates.map((date) => (
                    <th
                      key={date}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-slate-500 tabular-nums whitespace-nowrap"
                    >
                      {format(new Date(date + 'T12:00:00Z'), 'd MMM', { locale: es })}
                    </th>
                  ))}
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50/60">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.roomTypes.map((rt) => {
                  const total = data.dates.reduce((sum, d) => sum + (data.grid[rt.id]?.[d] ?? 0), 0)
                  return (
                    <tr key={rt.id} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3">
                        <div className="font-medium text-slate-800 text-sm leading-tight">{rt.name}</div>
                        <div className="text-[11px] text-slate-500 leading-tight inline-flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" />
                          hasta {rt.maxOccupancy}
                          <span className="text-slate-300 mx-1">·</span>
                          <span className="font-mono">{rt.code}</span>
                        </div>
                      </td>
                      {data.dates.map((d) => (
                        <td
                          key={d}
                          className="text-right px-3 py-3 font-mono tabular-nums text-slate-700 whitespace-nowrap"
                          style={{ fontWeight: 500 }}
                        >
                          ${data.grid[rt.id]?.[d]?.toLocaleString() ?? '—'}
                        </td>
                      ))}
                      <td className="text-right px-4 py-3 font-mono tabular-nums font-semibold text-emerald-700 bg-emerald-50/40">
                        {data.currency} {total.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex-shrink-0">
          <p className="text-[11px] text-slate-500 leading-snug">
            Tarifa base (BAR) sin impuestos.{' '}
            <span className="text-slate-400">Rate plans + IVA + ISH llegan en v1.0.1.</span>
          </p>
        </div>
      </div>
    </div>
  )
}
