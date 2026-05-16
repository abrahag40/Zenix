import { useState, useMemo } from 'react'
import { format, addDays, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRateQuoteGrid } from '../../hooks/useRates'
import { useModalDismiss } from '../../hooks/useModalDismiss'

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

  const { data, isLoading } = useRateQuoteGrid(propertyId, from, to, open)
  const { onBackdropClick } = useModalDismiss({ isDirty: false, onClose })

  const nights = Math.max(1, differenceInDays(to, from))

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
                if (d >= to) setTo(addDays(d, 1))
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
                if (d > from) setTo(d)
              }}
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
            </div>
          </div>
        </div>

        {/* Grid roomTypes × dates */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="text-xs text-slate-400 text-center py-10">Cargando tarifas…</div>
          )}
          {!isLoading && data && data.roomTypes.length === 0 && (
            <div className="text-center py-12 px-6">
              <div className="text-sm text-slate-500 font-medium mb-1">Sin tipos de habitación configurados</div>
              <div className="text-xs text-slate-400">Configura tipos + tarifas base en Ajustes.</div>
            </div>
          )}
          {!isLoading && data && data.roomTypes.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50/95 border-b border-slate-100 backdrop-blur">
                <tr>
                  <th className="text-left px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Tipo
                  </th>
                  {data.dates.map((date) => (
                    <th
                      key={date}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-slate-500 tabular-nums"
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
                          className="text-right px-3 py-3 font-mono tabular-nums text-slate-700"
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
