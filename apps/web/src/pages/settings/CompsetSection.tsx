/**
 * CompsetSection — Settings → Compset (Fase 3 chunk 2).
 *
 * Selección manual de 3-7 competidores (D-COMPSET2: no auto-radius en MVP —
 * boutique compite por posicionamiento, no por proximidad). Sync diario está
 * automatizado via cron; botón "Sincronizar ahora" para refresh manual.
 *
 * Disclaimer permanente per D-COMPSET7.
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Info, Plus, Trash2, RefreshCw, MapPin, PencilLine, Save, X } from 'lucide-react'
import {
  useCompetitors,
  useAddCompetitor,
  useDeactivateCompetitor,
  useSearchHotel,
  useSearchProviderStatus,
  useRefreshCompset,
  useSubmitManualSnapshot,
  useCompsetDashboard,
} from '@/hooks/useCompset'
import { usePropertyStore } from '@/store/property'

const MAX_COMPETITORS = 7

export function CompsetSection({ isSupervisor }: { isSupervisor: boolean }) {
  const propertyId = usePropertyStore((s) => s.activePropertyId) ?? ''
  const { data: competitors = [], isLoading } = useCompetitors(propertyId, isSupervisor)
  const refresh = useRefreshCompset(propertyId)
  const deactivate = useDeactivateCompetitor(propertyId)
  const [showAdd, setShowAdd] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)

  if (!isSupervisor) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500">
        El compset solo es visible para supervisores (datos sensibles para posicionamiento comercial).
      </div>
    )
  }

  const handleRefresh = async () => {
    try {
      const res = await refresh.mutateAsync()
      toast.success(`Compset actualizado: ${res.ok} ok / ${res.failed} fallidos`)
    } catch (e) {
      toast.error('No pude refrescar el compset. Reintenta en unos minutos.')
    }
  }

  return (
    <section className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Tu compset</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              3 a {MAX_COMPETITORS} competidores que el revenue manager elige a mano. Refresh diario automático (04:00 UTC).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setShowManualEntry((v) => !v)}
              disabled={competitors.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              <PencilLine className="h-3.5 w-3.5" />
              Capturar tarifas semanales
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refresh.isPending || competitors.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Refresh sintético (stub adapter) hasta que llegue Lighthouse partnership o decisión legal sobre scraping"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
              Stub refresh
            </button>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              disabled={competitors.length >= MAX_COMPETITORS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar competidor
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Datos best-effort, refresh diario. Precios públicos. Nunca compartas estos datos fuera de tu equipo
            de revenue management.
          </span>
        </div>

        {showAdd && <AddCompetitorForm propertyId={propertyId} onClose={() => setShowAdd(false)} />}
        {showManualEntry && (
          <ManualRateEntry
            propertyId={propertyId}
            competitors={competitors}
            onClose={() => setShowManualEntry(false)}
          />
        )}

        {isLoading ? (
          <p className="mt-4 text-sm text-gray-400">Cargando…</p>
        ) : competitors.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Sin competidores aún. Agrega entre 3 y 7 hoteles que compiten directo con tu posicionamiento.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-md">
            {competitors.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                    {c.starRating && (
                      <span className="text-[10px] text-amber-600">{'★'.repeat(Math.round(Number(c.starRating)))}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{c.address ?? `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}`}</span>
                    {c.guestRating && <span>· {Number(c.guestRating).toFixed(1)}/10</span>}
                    {c.roomCount && <span>· {c.roomCount} hab.</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Quitar ${c.name} del compset?`)) deactivate.mutate(c.id)
                  }}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title="Quitar del compset"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function AddCompetitorForm({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const add = useAddCompetitor(propertyId)
  const { data: results = [], isLoading } = useSearchHotel(propertyId, query, query.length >= 2)
  const { data: provider } = useSearchProviderStatus(propertyId)
  const realProvider = provider?.available === true

  return (
    <div className="mt-4 border border-gray-200 rounded-md p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-700">Buscar hotel</p>
        {provider && (
          realProvider ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Google Places · sesgo geo a tu zona
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Búsqueda real deshabilitada — pide al admin activar GOOGLE_PLACES_API_KEY
            </span>
          )
        )}
      </div>
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={realProvider ? 'Nombre del hotel…' : 'Activa Google Places para buscar'}
        disabled={!realProvider}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
      />
      {query.length >= 2 && realProvider && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {isLoading && <p className="text-xs text-gray-400">Buscando…</p>}
          {results.map((r) => (
            <button
              key={r.externalId}
              type="button"
              onClick={async () => {
                try {
                  await add.mutateAsync({
                    name: r.name,
                    externalId: r.externalId,
                    externalSource: r.externalSource,
                    externalUrl: r.externalUrl,
                    latitude: r.latitude,
                    longitude: r.longitude,
                    address: r.address,
                    roomCount: r.roomCount,
                    starRating: r.starRating ?? undefined,
                    reviewCount: null,
                  })
                  toast.success(`${r.name} agregado al compset`)
                  onClose()
                } catch (e: any) {
                  toast.error(e?.message ?? 'No pude agregar el competidor')
                }
              }}
              className="w-full text-left px-3 py-2 text-xs bg-white border border-gray-100 rounded hover:border-indigo-300"
            >
              <div className="font-medium text-gray-900">{r.name}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{r.address ?? `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}`}</div>
            </button>
          ))}
          {!isLoading && results.length === 0 && <p className="text-xs text-gray-400">Sin resultados.</p>}
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

const HORIZON_DAYS = 14
const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

interface Competitor { id: string; name: string }

function ManualRateEntry({
  propertyId,
  competitors,
  onClose,
}: {
  propertyId: string
  competitors: Competitor[]
  onClose: () => void
}) {
  const dates = useMemo(() => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    return Array.from({ length: HORIZON_DAYS }, (_, i) => new Date(today.getTime() + i * 86400000))
  }, [])
  const dateKeys = dates.map((d) => d.toISOString().slice(0, 10))
  // Pre-load lo más reciente que ya estaba en dashboard para no obligar a re-tipear cada semana.
  const { data: dash } = useCompsetDashboard(propertyId, true)
  const initial = useMemo(() => {
    const map: Record<string, Record<string, string>> = {}
    for (const c of competitors) {
      map[c.id] = {}
      const existing = dash?.competitors.find((d) => d.id === c.id)
      for (const k of dateKeys) {
        const r = existing?.ratesByDate?.[k]
        map[c.id][k] = r?.lowestRate != null ? String(r.lowestRate) : ''
      }
    }
    return map
  }, [competitors, dash, dateKeys.join(',')])
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>(initial)
  const [currency, setCurrency] = useState('USD')
  const submit = useSubmitManualSnapshot(propertyId)

  // Re-sync if competitors change while panel open
  useMemo(() => setGrid(initial), [initial])

  const handleSave = async () => {
    const entries = competitors
      .map((c) => {
        const ratesByDate: Record<string, { lowestRate: number; currency: string; availability: boolean }> = {}
        for (const k of dateKeys) {
          const raw = (grid[c.id]?.[k] ?? '').trim()
          if (raw === '') continue
          const n = Number(raw)
          if (!Number.isFinite(n) || n < 0) continue
          ratesByDate[k] = { lowestRate: n, currency, availability: true }
        }
        return { competitorId: c.id, ratesByDate }
      })
      .filter((e) => Object.keys(e.ratesByDate).length > 0)
    if (entries.length === 0) {
      toast.error('No capturaste tarifas. Llena al menos una celda.')
      return
    }
    try {
      const res = await submit.mutateAsync(entries)
      toast.success(`Captura guardada: ${res.created} competidores · ${res.skipped} saltados`)
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'No pude guardar la captura')
    }
  }

  return (
    <div className="mt-4 border border-emerald-200 rounded-md p-3 bg-emerald-50/50">
      <div className="flex items-start justify-between mb-2 gap-3">
        <div>
          <p className="text-xs font-medium text-emerald-900">Captura semanal de tarifas del compset</p>
          <p className="text-[10px] text-emerald-700 mt-0.5">
            Tipea el "lowest available rate" que ves en Booking.com o tu STAR Report. Deja en blanco las noches sin
            data — no las inventes.
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-emerald-700 hover:text-emerald-900" title="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <label className="text-[10px] text-emerald-800">Moneda</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="text-[11px] border border-emerald-200 rounded px-2 py-0.5 bg-white"
        >
          <option value="USD">USD</option>
          <option value="MXN">MXN</option>
          <option value="EUR">EUR</option>
        </select>
      </div>

      <div className="overflow-x-auto bg-white border border-emerald-100 rounded">
        <table className="text-[11px] tabular-nums">
          <thead>
            <tr className="border-b border-emerald-100">
              <th className="text-left px-2 py-1.5 text-emerald-900 font-medium sticky left-0 bg-white z-10">Hotel</th>
              {dates.map((d) => (
                <th key={d.toISOString()} className="px-1.5 py-1.5 text-emerald-700 font-medium whitespace-nowrap">
                  {d.getUTCDate()} {SPANISH_MONTHS[d.getUTCMonth()]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {competitors.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1 text-gray-900 sticky left-0 bg-white z-10 whitespace-nowrap max-w-[140px] truncate">{c.name}</td>
                {dateKeys.map((k) => (
                  <td key={k} className="px-1 py-0.5">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={grid[c.id]?.[k] ?? ''}
                      onChange={(e) =>
                        setGrid((prev) => ({
                          ...prev,
                          [c.id]: { ...prev[c.id], [k]: e.target.value },
                        }))
                      }
                      placeholder="—"
                      className="w-16 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-gray-700 hover:text-gray-900"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={submit.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {submit.isPending ? 'Guardando…' : 'Guardar captura'}
        </button>
      </div>
    </div>
  )
}
