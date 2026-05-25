/**
 * CityPicker — autocomplete con LATAM cities catalog.
 *
 * UX: input + dropdown filtrado en tiempo real con keyboard nav.
 * Pattern Linear/Notion autocomplete.
 *
 * Datos: stub `latam-cities.ts` con ~60 ciudades top LATAM tourist.
 * Day 15+: swap a Google Places API con place_id estructurado. Stub
 * y Places API exponen el MISMO contrato (CityRow) — el swap es
 * transparente al UI.
 *
 * Out-of-catalog: input libre permitido — Day 15+ se persiste con
 * `cityId=null` + `cityFreeText` + se reconcilia luego al activar.
 */
import { useMemo, useRef, useState, useEffect } from 'react'
import { Search, MapPin, Check } from 'lucide-react'
import { searchCities, findCityById, type CityRow } from '../../data/latam-cities'
import { cn } from '@/lib/utils'
import { Caption, Subhead } from '../../design-system'

interface CityPickerProps {
  countryCode: string
  cityId: string | undefined
  /** Si el user escribió libre y no está en catálogo. */
  freeText?: string
  onSelect: (city: { cityId: string | null; freeText: string; displayName: string }) => void
}

export function CityPicker({ countryCode, cityId, freeText, onSelect }: CityPickerProps) {
  const selected = useMemo(() => (cityId ? findCityById(cityId) : undefined), [cityId])

  const [query, setQuery] = useState(selected ? selected.name : freeText ?? '')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const candidates = useMemo(() => searchCities(query, countryCode), [query, countryCode])

  // Click outside cierra
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Si el query no matches el selected name, marca como free text
        if (selected && query !== selected.name) {
          onSelect({ cityId: null, freeText: query.trim(), displayName: query.trim() })
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, query, selected, onSelect])

  const handleSelect = (city: CityRow) => {
    onSelect({ cityId: city.id, freeText: '', displayName: city.name })
    setQuery(city.name)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Subhead tone="secondary" className="block mb-1.5">
        Ciudad
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
              setHighlightIdx((i) => Math.min(candidates.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightIdx((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const target = candidates[highlightIdx]
              if (target) handleSelect(target)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder="Tulum, Cartagena, Cusco..."
          className="w-full pl-9 pr-3 h-10 rounded-lg border border-slate-300 text-[14px] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
        />
        {selected && query === selected.name && (
          <Check className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600" />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-20 rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)] overflow-hidden">
          {candidates.length === 0 ? (
            <div className="p-3">
              <Caption tone="tertiary" className="block">
                Sin matches en el catálogo. Tu texto "{query}" se guardará como
                ciudad libre (Day 15+ reconcilia con Google Places).
              </Caption>
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {candidates.map((c, idx) => {
                const isSelected = cityId === c.id
                const isHighlighted = idx === highlightIdx
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={cn(
                        'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors',
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
                          isSelected ? 'text-violet-600' : 'text-slate-400',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-slate-900 truncate">
                          {c.name}
                        </div>
                        <Caption tone="tertiary" className="block leading-tight">
                          {c.region} · {c.countryCode}
                          {c.tags && c.tags.length > 0 && (
                            <span className="ml-1 text-slate-400">
                              · {c.tags.slice(0, 2).join(', ')}
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
              {candidates.length} de catálogo LATAM
            </Caption>
            <Caption tone="quaternary" className="text-[10px]">
              Day 15+: Google Places API
            </Caption>
          </div>
        </div>
      )}
    </div>
  )
}
