/**
 * CompsetSection — Settings → Compset (Fase 3 chunk 2).
 *
 * Selección manual de 3-7 competidores (D-COMPSET2: no auto-radius en MVP —
 * boutique compite por posicionamiento, no por proximidad). Sync diario está
 * automatizado via cron; botón "Sincronizar ahora" para refresh manual.
 *
 * Disclaimer permanente per D-COMPSET7.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Info, Plus, Trash2, RefreshCw, MapPin } from 'lucide-react'
import {
  useCompetitors,
  useAddCompetitor,
  useDeactivateCompetitor,
  useSearchHotel,
  useRefreshCompset,
} from '@/hooks/useCompset'
import { usePropertyStore } from '@/store/property'

const MAX_COMPETITORS = 7

export function CompsetSection({ isSupervisor }: { isSupervisor: boolean }) {
  const propertyId = usePropertyStore((s) => s.activePropertyId) ?? ''
  const { data: competitors = [], isLoading } = useCompetitors(propertyId, isSupervisor)
  const refresh = useRefreshCompset(propertyId)
  const deactivate = useDeactivateCompetitor(propertyId)
  const [showAdd, setShowAdd] = useState(false)

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refresh.isPending || competitors.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
              Sincronizar ahora
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

  return (
    <div className="mt-4 border border-gray-200 rounded-md p-3 bg-gray-50">
      <p className="text-xs font-medium text-gray-700 mb-2">Buscar hotel</p>
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nombre del hotel…"
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {query.length >= 2 && (
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
