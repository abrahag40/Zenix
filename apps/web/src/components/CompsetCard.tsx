/**
 * CompsetCard — Fase 3 chunk 2. Mi posición vs el compset + eventos del período.
 *
 * Reglas no-negociables:
 *   · D-COMPSET6: SUPERVISOR-only (caller gates + backend 403 fail-soft).
 *   · D-COMPSET7: disclaimer permanente "best-effort, refresh diario".
 *
 * Lectura del gráfico: para las próximas 14 noches, muestra mi rate (placeholder
 * hasta wire con RatesService getRateQuoteGrid) vs la mediana del compset + min/max.
 * Eventos locales del período se listan abajo como context.
 */
import { useMemo } from 'react'
import { Info, AlertTriangle, Calendar } from 'lucide-react'
import { useCompsetDashboard, useLocalEvents } from '@/hooks/useCompset'

const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function formatDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${SPANISH_MONTHS[m - 1]}`
}

export function CompsetCard({ propertyId, isSupervisor }: { propertyId: string; isSupervisor: boolean }) {
  const { data, isLoading, isError } = useCompsetDashboard(propertyId, isSupervisor)
  const { from, to } = useMemo(() => {
    const t = new Date(); t.setUTCHours(0, 0, 0, 0)
    return { from: t, to: new Date(t.getTime() + 14 * 86400000) }
  }, [])
  const events = useLocalEvents(propertyId, from, to, isSupervisor)

  if (!isSupervisor || isError) return null
  if (isLoading || !data) {
    return <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-400">Cargando compset…</div>
  }
  if (data.competitors.length === 0) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-700">Compset</p>
        <p className="text-xs text-gray-400 mt-1">{data.disclaimer}</p>
      </section>
    )
  }

  // Construir matriz [stayDate → { rates: number[], compsCounted }]
  const dates = uniqueSortedDates(data.competitors)
  const matrix = dates.map((iso) => {
    const rates: number[] = []
    let availableCount = 0
    for (const c of data.competitors) {
      const r = c.ratesByDate?.[iso]
      if (r && r.lowestRate != null) {
        rates.push(r.lowestRate)
        if (r.availability) availableCount += 1
      }
    }
    rates.sort((a, b) => a - b)
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : null
    return { iso, rates, median, min: rates[0] ?? null, max: rates.length ? rates[rates.length - 1] : null, availableCount }
  })

  const ccy = firstCurrency(data.competitors) ?? 'USD'
  const hasStubWarning = data.competitors.some((c) => c.warnings.some((w) => w.includes('STUB')))

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-800">Compset · próximas 14 noches</h2>
        <span className="text-[10px] text-gray-400">
          {data.competitors.length} hoteles · {data.disclaimer.split('Última')[1] ? 'Última' + data.disclaimer.split('Última')[1] : ''}
        </span>
      </div>

      {hasStubWarning && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Datos sintéticos (StubAdapter) — el scraping real Playwright se habilita en chunk 3 después del
            review legal de anti-bot (D-COMPSET5).
          </span>
        </div>
      )}

      {/* Heatmap simple: por noche min/median/max */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-1.5 font-medium">Noche</th>
              <th className="py-1.5 font-medium">Mín.</th>
              <th className="py-1.5 font-medium">Mediana</th>
              <th className="py-1.5 font-medium">Máx.</th>
              <th className="py-1.5 font-medium">Disp.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {matrix.map((m) => (
              <tr key={m.iso}>
                <td className="py-1 text-gray-500">{formatDay(m.iso)}</td>
                <td className="py-1 text-gray-900">{m.min != null ? `${ccy} ${Math.round(m.min)}` : '—'}</td>
                <td className="py-1 text-gray-900 font-medium">{m.median != null ? `${ccy} ${Math.round(m.median)}` : '—'}</td>
                <td className="py-1 text-gray-500">{m.max != null ? `${ccy} ${Math.round(m.max)}` : '—'}</td>
                <td className="py-1 text-gray-400">{m.availableCount}/{data.competitors.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Eventos locales del período */}
      {(events.data?.events ?? []).length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Eventos en el período
          </p>
          <div className="space-y-1.5">
            {(events.data?.events ?? []).slice(0, 5).map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    ev.demandImpact === 'EXTREME'
                      ? 'bg-rose-50 text-rose-700'
                      : ev.demandImpact === 'HIGH'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  {ev.demandImpact}
                </span>
                <span className="text-gray-900 font-medium truncate">{ev.name}</span>
                <span className="text-gray-400 ml-auto">{formatDay(ev.startDate)} → {formatDay(ev.endDate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-[10px] text-gray-500 flex gap-2 mt-2">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>{data.disclaimer}</span>
      </div>
    </section>
  )
}

function uniqueSortedDates(competitors: { ratesByDate: Record<string, unknown> | null | undefined }[]): string[] {
  const set = new Set<string>()
  for (const c of competitors) {
    for (const k of Object.keys(c.ratesByDate ?? {})) set.add(k)
  }
  return Array.from(set).sort().slice(0, 14)
}

function firstCurrency(competitors: { ratesByDate: Record<string, { currency?: string } | null> }[]): string | null {
  for (const c of competitors) {
    for (const v of Object.values(c.ratesByDate ?? {})) {
      if (v?.currency) return v.currency
    }
  }
  return null
}
