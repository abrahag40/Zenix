import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Minus, RefreshCw, Save, AlertTriangle } from 'lucide-react'
import { api } from '@/api/client'
import { usePropertyStore } from '@/store/property'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface FxCurrent {
  base: string
  quote: string
  official: { rate: number; effectiveDate: string; fetchedAt: string; source: string } | null
  internal: { rate: number; validFrom: string; spreadFromOfficial: number | null } | null
  deltaPercent: number | null
}

/**
 * FxSection — Settings UI para gestionar el override comercial del hotel.
 *
 * Caso de uso: el hotel cobra al guest un USD/MXN distinto al oficial Banxico
 * (spread comercial). Este formulario permite al supervisor:
 *   - Ver el oficial Banxico (read-only) con fecha y delta vs interno
 *   - Setear el rate interno: absoluto o como spread relativo al oficial
 *   - Definir vigencia (validFrom/validTo opcional)
 *   - Trigger manual refresh del Banxico (admin debugging)
 *
 * Sprint Rates 3-LEVEL Fase C — FX-CORE.
 */
export function FxSection({ isSupervisor }: { isSupervisor: boolean }) {
  const propertyId = usePropertyStore((s) => s.activePropertyId)
  const qc = useQueryClient()

  const [base, setBase] = useState('USD')
  const [quote, setQuote] = useState('MXN')

  const { data, isLoading, refetch } = useQuery<FxCurrent>({
    queryKey: ['fx-current', propertyId, base, quote],
    queryFn: () => api.get(`/v1/fx/current?propertyId=${propertyId}&base=${base}&quote=${quote}`),
    enabled: !!propertyId,
    staleTime: 60_000,
  })

  // Form state
  const [mode, setMode] = useState<'absolute' | 'spread'>('absolute')
  const [rateInput, setRateInput] = useState('')
  const [spreadInput, setSpreadInput] = useState('')
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [validTo, setValidTo] = useState('')

  // Init form from existing data
  useEffect(() => {
    if (data?.internal) {
      setRateInput(String(data.internal.rate))
      if (data.internal.spreadFromOfficial != null) {
        setMode('spread')
        setSpreadInput((data.internal.spreadFromOfficial * 100).toFixed(2))
      }
    }
  }, [data?.internal])

  const computedRate = mode === 'spread' && data?.official
    ? Number((data.official.rate * (1 + Number(spreadInput) / 100)).toFixed(4))
    : Number(rateInput) || 0

  const saveMut = useMutation({
    mutationFn: (payload: {
      baseCurrency: string
      quoteCurrency: string
      rate: number
      spreadFromOfficial?: number
      validFrom?: string
      validTo?: string
    }) =>
      api.post(`/v1/fx/override?propertyId=${propertyId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fx-current', propertyId] })
      toast.success('Tipo de cambio interno actualizado')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'No se pudo guardar')
    },
  })

  const refreshMut = useMutation({
    mutationFn: () => api.post('/v1/fx/refresh-banxico', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fx-current', propertyId] })
      toast.success('Refresh Banxico disparado')
    },
  })

  function handleSave() {
    if (!computedRate || computedRate <= 0) {
      toast.error('Rate inválido')
      return
    }
    saveMut.mutate({
      baseCurrency:       base,
      quoteCurrency:      quote,
      rate:               computedRate,
      spreadFromOfficial: mode === 'spread' ? Number(spreadInput) / 100 : undefined,
      validFrom:          validFrom ? new Date(validFrom).toISOString() : undefined,
      validTo:            validTo ? new Date(validTo).toISOString() : undefined,
    })
  }

  if (!propertyId) {
    return <div className="text-sm text-slate-500">Selecciona una propiedad.</div>
  }

  return (
    <div className="space-y-6">
      {/* Estado actual */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Estado actual</h2>
            <p className="text-xs text-slate-500 mt-0.5">Comparación oficial vs interno</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-200 rounded"
            >
              <option>USD</option>
              <option>EUR</option>
            </select>
            <span className="text-slate-400 text-xs">→</span>
            <select
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="px-2 py-1 text-xs border border-slate-200 rounded"
            >
              <option>MXN</option>
              <option>USD</option>
            </select>
          </div>
        </header>

        {isLoading ? (
          <div className="text-xs text-slate-400">Cargando…</div>
        ) : !data?.official && !data?.internal ? (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Sin datos. Configura el override abajo o dispara un refresh manual.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Banxico oficial
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">
                  ${data.official?.rate.toFixed(2) ?? '—'}
                </span>
                <span className="text-xs text-slate-400">{quote}</span>
              </div>
              <p className="text-[10px] text-slate-400">
                {data.official ? `Vigente ${format(new Date(data.official.effectiveDate), 'd MMM yyyy', { locale: es })}` : 'Sin datos'}
              </p>
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Hotel interno
                </div>
                {data.deltaPercent != null && <DeltaChip delta={data.deltaPercent} />}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-emerald-700 tabular-nums">
                  ${data.internal?.rate.toFixed(2) ?? '—'}
                </span>
                <span className="text-xs text-emerald-600/70">{quote}</span>
              </div>
              <p className="text-[10px] text-emerald-700/70">
                {data.internal
                  ? `Vigente desde ${format(new Date(data.internal.validFrom), 'd MMM yyyy', { locale: es })}`
                  : 'Sin override — el sistema usaría el oficial'}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 text-[11px] text-slate-400">
          <span>Auto-refresh Banxico diario 13:00 CST · SF43718 (FIX)</span>
          {isSupervisor && (
            <button
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
              className="inline-flex items-center gap-1 hover:text-slate-600 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${refreshMut.isPending ? 'animate-spin' : ''}`} />
              {refreshMut.isPending ? 'Refrescando…' : 'Refrescar manual'}
            </button>
          )}
        </div>
      </section>

      {/* Form override */}
      {isSupervisor && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <header>
            <h2 className="text-sm font-semibold text-slate-900">Editar override interno</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Crea una nueva entrada con vigencia desde la fecha indicada.
            </p>
          </header>

          {/* Mode toggle */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-fit">
            <button
              onClick={() => setMode('absolute')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                mode === 'absolute' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'
              }`}
            >
              Rate absoluto
            </button>
            <button
              onClick={() => setMode('spread')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                mode === 'spread' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'
              }`}
              disabled={!data?.official}
            >
              Spread sobre oficial
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {mode === 'absolute' ? (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Rate (1 {base} = ? {quote})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="17.50"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:border-slate-400 focus:ring-0 font-mono tabular-nums"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Spread vs Banxico (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={spreadInput}
                  onChange={(e) => setSpreadInput(e.target.value)}
                  placeholder="-5.00"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:border-slate-400 focus:ring-0 font-mono tabular-nums"
                />
                <p className="text-[10px] text-slate-400">
                  Resultado: ${computedRate.toFixed(4)} {quote}
                  {' · '}negativo = hotel cobra menos (descuento al guest)
                </p>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Vigente desde
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:border-slate-400 focus:ring-0"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Vigente hasta (opcional)
              </label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full md:w-1/2 px-3 py-2 text-sm border border-slate-200 rounded-md focus:border-slate-400 focus:ring-0"
              />
              <p className="text-[10px] text-slate-400">
                Si lo dejas vacío, el override es vigente indefinidamente hasta que crees uno nuevo.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saveMut.isPending || !computedRate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saveMut.isPending ? 'Guardando…' : 'Guardar override'}
            </Button>
          </div>
        </section>
      )}

      <div className="text-[11px] text-slate-400 italic">
        Las cancelaciones, refunds y emisiones CFDI usan el rate oficial Banxico del día de la operación
        (CFF Art. 20). El override interno aplica para quotes al guest y cobros front-desk.
      </div>
    </div>
  )
}

function DeltaChip({ delta }: { delta: number }) {
  const abs = Math.abs(delta)
  const Icon = delta > 0.1 ? TrendingUp : delta < -0.1 ? TrendingDown : Minus
  const bg = abs < 0.5 ? 'bg-slate-100 text-slate-600'
           : abs < 3   ? 'bg-blue-50 text-blue-700'
           :             'bg-amber-50 text-amber-700'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${bg}`}>
      <Icon className="h-2.5 w-2.5" />
      {delta > 0 ? '+' : ''}{delta.toFixed(2)}%
    </span>
  )
}
