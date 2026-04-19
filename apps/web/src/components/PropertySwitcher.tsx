import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { usePropertyStore } from '../store/property'
import type { PropertyDto } from '@zenix/shared'

/**
 * PropertySwitcher — left-side control on every app top bar.
 *
 * Shows the name of the property currently being viewed. Clicking opens
 * a dropdown with every property under the same organization; selecting
 * one updates the propertyStore and flushes the React Query cache so the
 * timeline, dashboard, and every scoped page refetch against the new
 * property.
 *
 * The switcher only appears as interactive when the user has access to
 * more than one property (supervisor role / multi-property orgs). With a
 * single property it renders as a plain label.
 *
 * Backend note: the PMS endpoints accept `propertyId` as a query param,
 * and TenantGuard gates access by organizationId only, so switching
 * within the same org doesn't require a new JWT.
 */
export function PropertySwitcher() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { user } = useAuthStore()
  const activePropertyId   = usePropertyStore((s) => s.activePropertyId)
  const activePropertyName = usePropertyStore((s) => s.activePropertyName)
  const setActiveProperty  = usePropertyStore((s) => s.setActiveProperty)
  const qc = useQueryClient()

  const { data: properties = [] } = useQuery<PropertyDto[]>({
    queryKey: ['properties-mine'],
    queryFn: () => api.get<PropertyDto[]>('/properties'),
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })

  // Sync the store with whichever property the user actually has access to.
  // If `activePropertyId` still points at a property that no longer exists
  // (e.g. retired seed), fall back to the first one returned by the API.
  useEffect(() => {
    if (!properties.length) return
    const valid = properties.find((p) => p.id === activePropertyId)
    if (!valid) {
      const fallback = properties.find((p) => p.id === user?.propertyId) ?? properties[0]
      setActiveProperty(fallback.id, fallback.name)
    } else if (valid.name !== activePropertyName) {
      // Names can drift after an admin rename — keep the label fresh.
      setActiveProperty(valid.id, valid.name)
    }
  }, [properties, activePropertyId, activePropertyName, user?.propertyId, setActiveProperty])

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const active = properties.find((p) => p.id === activePropertyId) ?? properties[0]
  const multiProperty = properties.length > 1

  function handleSelect(p: PropertyDto) {
    if (p.id === activePropertyId) {
      setOpen(false)
      return
    }
    setActiveProperty(p.id, p.name)
    // Flush everything — different property means a different room list,
    // different guest stays, different checkouts, etc.
    qc.clear()
    setOpen(false)
  }

  // Label priority:
  //   1. The currently active property's `name` from /properties (source of truth).
  //   2. A previously persisted name (from localStorage on reload).
  //   3. "Cargando sucursal…" while we wait — better than flashing the raw
  //      property UUID from the JWT.
  const label = active?.name || activePropertyName || 'Cargando sucursal…'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => multiProperty && setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-sm font-semibold text-slate-800 transition-colors ${
          multiProperty ? 'hover:text-slate-600 cursor-pointer' : 'cursor-default'
        }`}
        title={multiProperty ? 'Cambiar sucursal' : undefined}
        aria-haspopup={multiProperty ? 'listbox' : undefined}
        aria-expanded={multiProperty ? open : undefined}
      >
        <span className="truncate max-w-[220px]">{label}</span>
        {multiProperty && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {open && multiProperty && (
        <div className="absolute top-full left-0 mt-1 min-w-[220px] bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {properties.map((p) => {
            const isActive = p.id === activePropertyId
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p)}
                className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`w-4 text-center text-indigo-600 ${isActive ? '' : 'invisible'}`}>
                  ✓
                </span>
                <span className="truncate">{p.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
