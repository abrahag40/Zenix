/**
 * PropertyPicker — dropdown custom moderno reemplaza el <select> nativo.
 *
 * Inspirado en Apple HIG pull-down + Linear / Notion pickers:
 *   - Trigger: pill con icon + name + chevron sutil
 *   - Panel: rounded-xl, shadow elevation +2, max-h con scroll
 *   - Cada row: icon-cuadrado tipográfico + nombre + subtitle (type)
 *   - Selected: check verde + bg-emerald-50/60 muted
 *   - Keyboard: ↑↓ navigate, Enter select, Escape close
 *   - Search inline si > 5 properties (futuro Day 12 cuando haya cadenas grandes)
 *   - Click outside cierra
 *
 * Diferente al TenantSwitcher (que cambia ORG cliente) — este cambia
 * Property DENTRO de la org acting.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Search, Hotel, Home, Mountain, Trees, Leaf } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PropertyRow } from '../../api/nova'

export interface PropertyPickerProps {
  properties: PropertyRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  isLoading?: boolean
  /** Min width del trigger. Default 240px. */
  minWidth?: number
}

// Map PropertyType → icon visual. Subtle differentiation.
const TYPE_ICONS: Record<string, LucideIcon> = {
  HOTEL: Hotel,
  HOSTAL: Home,
  BOUTIQUE: Building2,
  GLAMPING: Trees,
  ECO_LODGE: Leaf,
  VACATION_RENTAL: Home,
}

function iconFor(type: string | null | undefined): LucideIcon {
  if (!type) return Building2
  return TYPE_ICONS[type] ?? Building2
}

function prettyType(type: string | null | undefined): string {
  if (!type) return 'Property'
  const map: Record<string, string> = {
    HOTEL: 'Hotel',
    HOSTAL: 'Hostal',
    BOUTIQUE: 'Hotel boutique',
    GLAMPING: 'Glamping',
    ECO_LODGE: 'Eco-lodge',
    VACATION_RENTAL: 'Rental',
  }
  return map[type] ?? type
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

export function PropertyPicker({
  properties,
  selectedId,
  onSelect,
  isLoading = false,
  minWidth = 240,
}: PropertyPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState<number>(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => properties.find((p) => p.id === selectedId) ?? null,
    [properties, selectedId],
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return properties
    const q = query.trim().toLowerCase()
    return properties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.type ?? '').toLowerCase().includes(q),
    )
  }, [properties, query])

  // Click outside closes
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Reset highlight when filter changes or panel opens
  useEffect(() => {
    if (open) {
      // Highlight current selection si existe en filtered
      const idx = filtered.findIndex((p) => p.id === selectedId)
      setHighlightIdx(idx >= 0 ? idx : 0)
    } else {
      setQuery('')
      setHighlightIdx(-1)
    }
  }, [open, filtered, selectedId])

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || highlightIdx < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-pp-idx="${highlightIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = filtered[highlightIdx]
      if (target) {
        onSelect(target.id)
        setOpen(false)
        triggerRef.current?.focus()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  // ── Trigger render ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-slate-400 text-[13px]"
        style={{ minWidth }}
      >
        <Building2 className="h-3.5 w-3.5 animate-pulse" aria-hidden />
        <span>Cargando properties...</span>
      </div>
    )
  }

  if (properties.length === 0) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-dashed border-amber-300 bg-amber-50/60 text-amber-700 text-[13px]"
        style={{ minWidth }}
      >
        <Building2 className="h-3.5 w-3.5" aria-hidden />
        <span>Sin properties</span>
      </div>
    )
  }

  const Icon = iconFor(selected?.type)
  const showSearch = properties.length > 5

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {/* Trigger pill */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? `Property: ${selected.name}` : 'Selecciona property'}
        className={
          'group inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full border text-[13px] font-medium transition-all ' +
          (open
            ? 'border-emerald-400 bg-emerald-50/80 text-emerald-900 ring-2 ring-emerald-100'
            : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50')
        }
        style={{ minWidth }}
      >
        <span
          className={
            'inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors flex-shrink-0 ' +
            (open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200')
          }
        >
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        <span className="flex-1 text-left truncate">
          {selected?.name ?? 'Elige property'}
        </span>
        <ChevronDown
          className={
            'h-3.5 w-3.5 flex-shrink-0 transition-transform duration-150 ' +
            (open ? 'rotate-180 text-emerald-700' : 'text-slate-400')
          }
          aria-hidden
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label="Properties"
          className="absolute right-0 mt-2 z-30 w-[320px] rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="px-3 pt-2.5 pb-2 border-b border-slate-100">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Cambiar property
            </div>
          </div>

          {/* Search */}
          {showSearch && (
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="relative">
                <Search
                  className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  aria-hidden
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Buscar..."
                  autoFocus
                  className="w-full pl-7 pr-2 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 focus:bg-white"
                />
              </div>
            </div>
          )}

          {/* List */}
          <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-slate-500">
                Sin resultados para "{query}"
              </div>
            ) : (
              filtered.map((p, idx) => {
                const PIcon = iconFor(p.type)
                const isSelected = p.id === selectedId
                const isHighlight = idx === highlightIdx
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-pp-idx={idx}
                    onClick={() => {
                      onSelect(p.id)
                      setOpen(false)
                      triggerRef.current?.focus()
                    }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={
                      'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ' +
                      (isHighlight
                        ? 'bg-slate-100'
                        : isSelected
                          ? 'bg-emerald-50/60'
                          : 'hover:bg-slate-50')
                    }
                  >
                    {/* Type icon avatar */}
                    <div
                      className={
                        'flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-semibold flex-shrink-0 ' +
                        (isSelected
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600')
                      }
                    >
                      <PIcon className="h-3.5 w-3.5" aria-hidden />
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div
                        className={
                          'text-[13px] font-semibold truncate leading-tight ' +
                          (isSelected ? 'text-emerald-900' : 'text-slate-900')
                        }
                      >
                        {p.name}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight mt-0.5 flex items-center gap-1.5">
                        <span>{prettyType(p.type)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono text-[10px] text-slate-400 truncate">
                          {p.id.length > 24 ? p.id.slice(0, 8) + '…' + p.id.slice(-6) : p.id}
                        </span>
                      </div>
                    </div>

                    {/* Check */}
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" aria-hidden />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer hint */}
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex items-center justify-between">
              <span>
                {filtered.length} property{filtered.length !== 1 ? 'ies' : ''}
                {query && properties.length !== filtered.length && (
                  <span className="text-slate-500"> de {properties.length}</span>
                )}
              </span>
              <span className="hidden sm:inline">
                <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-mono">↑↓</kbd>
                <span className="ml-1">navegar</span>
                <kbd className="ml-2 px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-mono">⏎</kbd>
                <span className="ml-1">elegir</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
