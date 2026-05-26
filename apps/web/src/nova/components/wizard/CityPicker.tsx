/**
 * CityPicker — autocomplete híbrido catálogo LATAM + Nominatim (OpenStreetMap).
 *
 * Flujo:
 *   1. Local instant match (LATAM_CITIES, ~85 ciudades top, accent-insensitive)
 *   2. Si query ≥3 chars + pocos locales → fetch a Nominatim (free, no key)
 *   3. Merge results: locales primero, OSM completa cobertura (cualquier
 *      pueblo / localidad LATAM incluyendo Querétaro, Tequisquiapan, etc.)
 *
 * Hierarchy display: "Localidad · Ciudad · Estado · País" cuando viene de OSM.
 *
 * Out-of-catalog free text: si user typea algo que no matches y blurea,
 * se persiste como cityFreeText sin cityId. Reconcilable después.
 *
 * UX patterns:
 *   · Debounce 250ms — evita request bursts mientras typea (Hick 1952)
 *   · Loading indicator durante fetch — NN/g feedback H1
 *   · AbortController — cancela in-flight si user sigue escribiendo
 *   · Keyboard nav (Arrow Up/Down/Enter/Esc) — Apple HIG
 */
import { useEffect, useRef, useState } from 'react'
import { Search, MapPin, Check, Loader2 } from 'lucide-react'
import { searchCitiesHybrid, type CitySearchResult } from '../../data/city-search'
import { findCityById } from '../../data/latam-cities'
import { cn } from '@/lib/utils'
import { Caption, Subhead } from '../../design-system'

interface CityPickerProps {
  countryCode: string
  cityId: string | undefined
  /** Si el user escribió libre y no está en catálogo. */
  freeText?: string
  onSelect: (city: { cityId: string | null; freeText: string; displayName: string }) => void
}

const DEBOUNCE_MS = 250

export function CityPicker({ countryCode, cityId, freeText, onSelect }: CityPickerProps) {
  const selectedFromCatalog = cityId && !cityId.startsWith('osm_') ? findCityById(cityId) : undefined

  const [query, setQuery] = useState(selectedFromCatalog ? selectedFromCatalog.name : freeText ?? '')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [results, setResults] = useState<CitySearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [externalUsed, setExternalUsed] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Debounced search effect
  useEffect(() => {
    if (!open) return
    // Cancel previous in-flight
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchCitiesHybrid(query, countryCode, controller.signal)
        setResults(res)
        setExternalUsed(res.some((r) => r.source === 'osm'))
        setHighlightIdx(0)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Network failure ya degradó a local-only en searchCitiesHybrid
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, countryCode, open])

  // Click outside cierra + commit free text si aplica
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Si no hay selección catálogo Y query no-vacío → commit como freetext
        if (!cityId && query.trim().length > 0) {
          onSelect({ cityId: null, freeText: query.trim(), displayName: query.trim() })
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, query, cityId, onSelect])

  const handleSelect = (city: CitySearchResult) => {
    // Para OSM, persistimos id 'osm_<id>' + freeText con hierarchy label
    // (preserve display string sin necesidad de re-fetch en otro componente).
    onSelect({
      cityId: city.id,
      freeText: city.source === 'osm' ? city.hierarchyLabel : '',
      displayName: city.hierarchyLabel,
    })
    setQuery(city.name)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Subhead tone="secondary" className="block mb-1.5">
        Ciudad / Localidad
      </Subhead>
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setHighlightIdx(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open) {
              if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault()
                setOpen(true)
              }
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlightIdx((i) => Math.min(results.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightIdx((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const target = results[highlightIdx]
              if (target) handleSelect(target)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder="Tulum, Querétaro, Tequisquiapan…"
          autoComplete="off"
          className="w-full pl-9 pr-9 h-10 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
        />
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
        ) : cityId && selectedFromCatalog && query === selectedFromCatalog.name ? (
          <Check className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600" />
        ) : null}
      </div>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-20 rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)] overflow-hidden">
          {results.length === 0 && !loading ? (
            <div className="p-4">
              <Caption tone="tertiary" className="block">
                {query.trim().length < 3
                  ? 'Escribe al menos 3 letras para buscar.'
                  : `Sin matches para "${query.trim()}". Si el lugar existe pero no aparece, simplemente continúa — el texto se guardará como ciudad libre.`}
              </Caption>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((c, idx) => {
                const isSelected = cityId === c.id
                const isHighlighted = idx === highlightIdx
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={cn(
                        'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                        isHighlighted
                          ? 'bg-slate-100'
                          : isSelected
                            ? 'bg-violet-50/60'
                            : 'hover:bg-slate-50',
                      )}
                    >
                      <MapPin
                        className={cn(
                          'h-3.5 w-3.5 mt-0.5 flex-shrink-0',
                          isSelected
                            ? 'text-violet-600'
                            : c.source === 'osm'
                              ? 'text-sky-500'
                              : 'text-slate-400',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 truncate">
                          {c.locality ? `${c.locality}, ${c.name}` : c.name}
                        </div>
                        <Caption tone="tertiary" className="block leading-tight">
                          {c.region}
                          {c.countryDisplay ? ` · ${c.countryDisplay}` : ` · ${c.countryCode}`}
                          {c.source === 'osm' && (
                            <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] uppercase tracking-wide bg-sky-50 text-sky-700 border border-sky-100">
                              OSM
                            </span>
                          )}
                        </Caption>
                      </div>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <Caption tone="quaternary" className="text-[10px]">
              {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
              {externalUsed && ' · catálogo LATAM + OpenStreetMap'}
              {!externalUsed && results.length > 0 && ' · catálogo LATAM'}
            </Caption>
            <Caption tone="quaternary" className="text-[10px]">
              País → Estado → Ciudad → Localidad
            </Caption>
          </div>
        </div>
      )}
    </div>
  )
}
