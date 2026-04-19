import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown } from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { usePropertyStore } from '../store/property'
import type { PropertyDto } from '@zenix/shared'

/**
 * PropertySwitcher — left-header control for choosing which property
 * the rest of the UI is scoped to.
 *
 * Design grounded in:
 *   · Shopify Polaris Combobox — "Move selected items to the top of
 *     the list"  (polaris-react.shopify.com/components/selection-and-input/combobox)
 *   · Mews Multi-Property product docs — properties are grouped "by
 *     brand, region and other attributes" for chains
 *     (mews.com/en/products/multi-property-management)
 *   · Oracle OPERA Cloud — chain/property hierarchy
 *     (oracle.com/hospitality/opera-property-services)
 *   · NN/G "Dropdowns: Design Guidelines" — long flat dropdowns hurt
 *     scanability; use grouping (nngroup.com/articles/drop-down-menus)
 *
 * Behavior
 *   1. The currently active property is pinned at the top of the list
 *      under a "Actual" header, with a checkmark (Polaris pattern).
 *   2. The rest of the properties are grouped by their `region` field
 *      whenever ≥2 regions are present. With a single region, headers
 *      are hidden (avoids visual noise when there's nothing to group).
 *   3. Every row shows the property name as primary text and
 *      "city · region" as secondary muted text (inline disambiguation
 *      — Slack/Google account-picker convention). Same-name properties
 *      in different regions read differently without scanning.
 *
 * Notes
 *   · Selecting a property writes it to the persisted propertyStore
 *     and calls `queryClient.clear()` so every scoped page refetches.
 *   · When the user only has one property (typical for small hotels),
 *     the switcher renders as an uninteractive label.
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

  const active = properties.find((p) => p.id === activePropertyId) ?? properties[0]

  // Keep the persisted name aligned with the server — if someone
  // renames the property or the persisted id points at a retired
  // property, fall back to the user's home property or the first one
  // returned by the API.
  useEffect(() => {
    if (!properties.length) return
    const valid = properties.find((p) => p.id === activePropertyId)
    if (!valid) {
      const fallback =
        properties.find((p) => p.id === user?.propertyId) ?? properties[0]
      setActiveProperty(fallback.id, fallback.name)
    } else if (valid.name !== activePropertyName) {
      setActiveProperty(valid.id, valid.name)
    }
  }, [properties, activePropertyId, activePropertyName, user?.propertyId, setActiveProperty])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Build the grouped list: the active property sits under "Actual",
  // every other property is bucketed by its region (or "Sin región"
  // when no region is set). Region buckets only render a header when
  // ≥2 regions exist in the rest of the list.
  const groups = useMemo(() => {
    const rest = properties.filter((p) => p.id !== active?.id)
    const byRegion = new Map<string, PropertyDto[]>()
    for (const p of rest) {
      const key = p.region?.trim() || 'Sin región'
      const bucket = byRegion.get(key) ?? []
      bucket.push(p)
      byRegion.set(key, bucket)
    }
    // Sort region names alphabetically; within each, sort properties by name.
    const sortedRegions = Array.from(byRegion.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, items]) => ({
        region,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
    return { active, rest, groups: sortedRegions }
  }, [properties, active])

  const showRegionHeaders = groups.groups.length >= 2
  const multiProperty = properties.length > 1

  function handleSelect(p: PropertyDto) {
    if (p.id === activePropertyId) {
      setOpen(false)
      return
    }
    setActiveProperty(p.id, p.name)
    qc.clear()
    setOpen(false)
  }

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
        <div
          className="absolute top-full left-0 mt-1 min-w-[280px] max-w-[360px] bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
          role="listbox"
        >
          {/* Pinned: the active property */}
          {active && (
            <>
              <SectionHeader label="Actual" />
              <PropertyRow property={active} active onSelect={handleSelect} />
            </>
          )}

          {/* Grouped rest */}
          {groups.groups.map((g) => (
            <div key={g.region}>
              {showRegionHeaders && <SectionHeader label={g.region} />}
              {g.items.map((p) => (
                <PropertyRow
                  key={p.id}
                  property={p}
                  active={false}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold bg-slate-50 border-b border-slate-100">
      {label}
    </div>
  )
}

function PropertyRow({
  property,
  active,
  onSelect,
}: {
  property: PropertyDto
  active: boolean
  onSelect: (p: PropertyDto) => void
}) {
  const secondary = [property.city, property.region].filter(Boolean).join(' · ')
  return (
    <button
      onClick={() => onSelect(property)}
      className={`flex items-start gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors ${
        active
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
      role="option"
      aria-selected={active}
    >
      <span className={`w-4 mt-0.5 text-center text-indigo-600 ${active ? '' : 'invisible'}`}>
        <Check className="h-3.5 w-3.5 inline" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${active ? 'font-medium' : ''}`}>{property.name}</span>
        {secondary && (
          <span className="block text-xs text-slate-400 truncate">{secondary}</span>
        )}
      </span>
    </button>
  )
}
