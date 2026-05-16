import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle } from 'lucide-react'
import { api } from '@/api/client'
import { usePropertyStore } from '@/store/property'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface FxCurrent {
  base: string
  quote: string
  official: {
    rate: number
    effectiveDate: string
    fetchedAt: string
    source: string
  } | null
  internal: {
    rate: number
    validFrom: string
    spreadFromOfficial: number | null
  } | null
  deltaPercent: number | null
}

/**
 * FxRateWidget — Dashboard widget mostrando ambos rates Banxico + Hotel.
 *
 * Diseño Apple HIG: hero metric pattern — rates grandes, delta como secondary.
 * Color: delta neutral slate cuando interno < oficial (hotel cobra menos =
 * ofrece descuento al guest), amber cuando excede (hotel cobra más =
 * mark-up). NUNCA verde/rojo (no es positive/negative).
 *
 * Sprint Rates 3-LEVEL 2026-05-16 — Fase C FX-CORE.
 */
export function FxRateWidget({ base = 'USD', quote = 'MXN' }: { base?: string; quote?: string }) {
  const propertyId = usePropertyStore((s) => s.activePropertyId)

  const { data, isLoading } = useQuery<FxCurrent>({
    queryKey: ['fx-current', propertyId, base, quote],
    queryFn: () => api.get(`/v1/fx/current?propertyId=${propertyId}&base=${base}&quote=${quote}`),
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
  })

  if (isLoading || !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
        <div className="h-3 w-24 bg-slate-100 rounded mb-3" />
        <div className="h-6 w-32 bg-slate-100 rounded mb-2" />
        <div className="h-3 w-40 bg-slate-100 rounded" />
      </div>
    )
  }

  const noData = !data.official && !data.internal

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Tipo de cambio HOY
          </h3>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">
            {data.base} → {data.quote}
          </p>
        </div>
        {data.official && (
          <p className="text-[10px] text-slate-400 text-right">
            {format(new Date(data.official.fetchedAt), "HH:mm 'CST'", { locale: es })}
          </p>
        )}
      </div>

      {noData ? (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-xs">Sin datos. Configura Banxico o override hotel.</span>
        </div>
      ) : (
        <>
          {/* Banxico oficial */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Banxico oficial
              </span>
              <span className="text-[10px] text-slate-400 font-mono">SF43718</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                ${data.official?.rate.toFixed(2) ?? '—'}
              </span>
              <span className="text-xs text-slate-400">{data.quote}</span>
            </div>
            {data.official && (
              <p className="text-[10px] text-slate-400">
                Vigente {format(new Date(data.official.effectiveDate), 'd MMM yyyy', { locale: es })}
              </p>
            )}
          </div>

          {/* Hotel interno */}
          <div className="space-y-1 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Hotel interno
              </span>
              {data.deltaPercent != null && (
                <DeltaChip delta={data.deltaPercent} />
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-emerald-700 tabular-nums tracking-tight">
                ${data.internal?.rate.toFixed(2) ?? '—'}
              </span>
              <span className="text-xs text-emerald-600/70">{data.quote}</span>
            </div>
            {data.internal ? (
              <p className="text-[10px] text-slate-400">
                Vigente desde {format(new Date(data.internal.validFrom), 'd MMM', { locale: es })}
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 italic">
                Sin override — el hotel usaría el oficial Banxico
              </p>
            )}
          </div>
        </>
      )}

      <div className="pt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
        <RefreshCw className="h-2.5 w-2.5" />
        Actualización diaria 13:00 CST · Banxico FIX
      </div>
    </div>
  )
}

function DeltaChip({ delta }: { delta: number }) {
  const abs = Math.abs(delta)
  const Icon = delta > 0.1 ? TrendingUp : delta < -0.1 ? TrendingDown : Minus
  const bg = abs < 0.5 ? 'bg-slate-100 text-slate-600' :
             abs < 3 ? 'bg-blue-50 text-blue-700' :
             'bg-amber-50 text-amber-700'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${bg}`}>
      <Icon className="h-2.5 w-2.5" />
      {delta > 0 ? '+' : ''}{delta.toFixed(2)}%
    </span>
  )
}
