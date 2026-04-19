import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Building2, Check } from 'lucide-react'
import { api } from '../api/client'
import { usePropertyStore } from '../store/property'
import type { PropertyDto } from '@zenix/shared'

/**
 * SettingsScopeBanner — embedded scope indicator for per-property
 * settings pages.
 *
 * The global top-bar PropertySwitcher is hidden under /settings/* so
 * the user isn't confused about what switching does. Some settings
 * (habitaciones, personal, propiedad) are property-scoped though, and
 * the user still needs a way to pick which property they're editing.
 *
 * This banner, rendered at the top of SettingsPage, serves both roles:
 *   1. Indicator — "Editando: Hotel Tulum · Riviera Maya" is always
 *      visible while the user is inside settings. Mode awareness at
 *      the point of action (NN/G "Modes in User Interfaces": use
 *      strong visual signals, and redundant indicators when slips
 *      carry consequences — nngroup.com/articles/modes).
 *   2. Switcher — clicking the banner opens the same property picker
 *      as the top-bar one, so the user can change what they're editing
 *      without leaving the page.
 *
 * When the organization only has one property, the banner renders as
 * a non-interactive label (no dropdown arrow).
 */
export function SettingsScopeBanner() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activePropertyId   = usePropertyStore((s) => s.activePropertyId)
  const activePropertyName = usePropertyStore((s) => s.activePropertyName)
  const setActiveProperty  = usePropertyStore((s) => s.setActiveProperty)
  const qc = useQueryClient()

  const { data: properties = [] } = useQuery<PropertyDto[]>({
    queryKey: ['properties-mine'],
    queryFn: () => api.get<PropertyDto[]>('/properties'),
    staleTime: 5 * 60 * 1000,
  })

  const active = properties.find((p) => p.id === activePropertyId) ?? properties[0]
  const multiProperty = properties.length > 1

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function handleSelect(p: PropertyDto) {
    if (p.id === activePropertyId) {
      setOpen(false)
      return
    }
    setActiveProperty(p.id, p.name)
    qc.clear()
    setOpen(false)
  }

  const secondary = active
    ? [active.city, active.region].filter(Boolean).join(' · ')
    : ''

  const label = active?.name || activePropertyName || '—'

  return (
    <div
      ref={ref}
      className="relative rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 flex items-start gap-3"
      role="status"
      aria-live="polite"
    >
      <Building2 className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-indigo-800/80 font-medium leading-tight uppercase tracking-wider">
          Editando configuración de
        </p>
        <button
          onClick={() => multiProperty && setOpen((o) => !o)}
          className={`mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-900 ${
            multiProperty ? 'hover:text-indigo-700 cursor-pointer' : 'cursor-default'
          }`}
          aria-haspopup={multiProperty ? 'listbox' : undefined}
          aria-expanded={multiProperty ? open : undefined}
        >
          <span className="truncate">{label}</span>
          {multiProperty && (
            <ChevronDown
              className={`h-3.5 w-3.5 text-indigo-500 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          )}
        </button>
        {secondary && (
          <p className="text-xs text-indigo-700/70 mt-0.5 truncate">{secondary}</p>
        )}
      </div>

      {open && multiProperty && (
        <div className="absolute top-full left-0 mt-1 min-w-[280px] max-w-[360px] bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {properties
            .slice()
            .sort((a, b) => {
              // Selected first, everything else alphabetical.
              if (a.id === activePropertyId) return -1
              if (b.id === activePropertyId) return 1
              return a.name.localeCompare(b.name)
            })
            .map((p) => {
              const isActive = p.id === activePropertyId
              const secondaryRow = [p.city, p.region].filter(Boolean).join(' · ')
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className={`flex items-start gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  role="option"
                  aria-selected={isActive}
                >
                  <span
                    className={`w-4 mt-0.5 text-center text-indigo-600 ${
                      isActive ? '' : 'invisible'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5 inline" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${isActive ? 'font-medium' : ''}`}>
                      {p.name}
                    </span>
                    {secondaryRow && (
                      <span className="block text-xs text-slate-400 truncate">
                        {secondaryRow}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}
