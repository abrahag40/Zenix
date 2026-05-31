/**
 * GroupSwapPickerDialog — Sprint CHECK-IN C3.1 v5 (2026-05-30).
 *
 * Picker modal para seleccionar a qué huésped del grupo intercambiar
 * habitación. Pattern WhatsApp Forward / Mercado Libre "Seleccionar" /
 * iOS Contact Picker.
 *
 * Escala a grupos de cualquier tamaño:
 *  · 2-5 siblings → lista directa sin search
 *  · 6+ siblings → search bar autocompletable visible
 *  · ≥20 siblings → scrolleable con virtualización (futuro si se requiere)
 *
 * Diseño coherente con design system Zenix:
 *  · Radix Dialog primitives (mismo wrapper que ConfirmDialog)
 *  · Stripe emerald + icon header + DialogActions footer (sin botones ad-hoc)
 *  · StyledInput para search (CLAUDE.md §123)
 *  · Tipografía y spacing del sistema (no inventar)
 */
import { useMemo, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ArrowLeftRight, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StyledInput } from '../shared/StyledInput'
import type { GuestStayBlock } from '../../types/timeline.types'

interface GroupSwapPickerDialogProps {
  open: boolean
  onClose: () => void
  /** Stay desde donde se invoca el swap (current sheet stay). */
  currentStay: {
    id: string
    guestName: string
    roomNumber?: string | null
  } | null
  /** Siblings del mismo ReservationGroup (excluye current). */
  siblings: GuestStayBlock[]
  /** Callback al seleccionar un sibling para intercambio. */
  onPick: (sibling: { id: string; guestName: string; roomNumber?: string | null }) => void
}

/** Threshold a partir del cual el search bar es visible upfront. */
const SEARCH_THRESHOLD = 6

export function GroupSwapPickerDialog({
  open, onClose, currentStay, siblings, onPick,
}: GroupSwapPickerDialogProps) {
  const [query, setQuery] = useState('')

  // Solo siblings swappables — bloqueados (cancelled/no-show/checkedout)
  // se filtran fuera porque el endpoint los rechazaría.
  const swappable = useMemo(
    () => siblings.filter((s) => !s.cancelledAt && !s.noShowAt && !s.actualCheckout),
    [siblings],
  )

  const filtered = useMemo(() => {
    const sorted = [...swappable].sort(
      (a, b) => (a.groupRoomIndex ?? 99) - (b.groupRoomIndex ?? 99),
    )
    if (!query.trim()) return sorted
    const q = query.toLowerCase().trim()
    return sorted.filter(
      (s) =>
        s.guestName.toLowerCase().includes(q) ||
        (s.roomNumber ?? '').toLowerCase().includes(q),
    )
  }, [swappable, query])

  if (!currentStay) return null

  const showSearch = swappable.length >= SEARCH_THRESHOLD

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => { if (!o) { setQuery(''); onClose() } }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="group-swap-picker-title"
          className="fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        >
          <div className="h-1 shrink-0 bg-emerald-500" />

          {/* Header coherente con ConfirmDialog */}
          <div className="px-5 pt-5 pb-3 shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full border bg-emerald-50 border-emerald-200 flex items-center justify-center shrink-0">
                <Users className="h-[18px] w-[18px] text-emerald-700" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogPrimitive.Title
                  id="group-swap-picker-title"
                  className="text-[15px] font-semibold text-slate-900 leading-tight tracking-[-0.005em]"
                >
                  Cambiar habitación de {currentStay.guestName}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                  Selecciona con qué huésped del grupo intercambiar la <strong>Hab. {currentStay.roomNumber ?? '—'}</strong>.
                </DialogPrimitive.Description>
              </div>
            </div>
          </div>

          {/* Search (cuando aplica) */}
          {showSearch && (
            <div className="px-5 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <StyledInput
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o habitación…"
                  autoFocus
                  className="pl-9"
                />
              </div>
            </div>
          )}

          {/* Lista de siblings — scrolleable cuando excede max-height */}
          <div className="px-5 pb-3 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate-500">
                {query
                  ? 'Sin resultados'
                  : 'No hay otros huéspedes intercambiables en este grupo'}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((sibling) => (
                  <button
                    key={sibling.id}
                    type="button"
                    onClick={() => onPick({
                      id: sibling.id,
                      guestName: sibling.guestName,
                      roomNumber: sibling.roomNumber,
                    })}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left',
                      'bg-white border border-slate-200',
                      'hover:border-emerald-400 hover:bg-emerald-50',
                      'active:scale-[0.98] transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
                    )}
                  >
                    <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-600 shrink-0 tabular-nums">
                      {sibling.roomNumber ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-900 leading-tight truncate">
                        {sibling.guestName}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Hab. {sibling.roomNumber ?? '—'}
                      </div>
                    </div>
                    <ArrowLeftRight className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={2.5} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer minimal — solo cancelar (el confirm viene del swap dialog) */}
          <div className="px-5 py-3 border-t border-slate-100 shrink-0 bg-slate-50/40">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'w-full h-9 rounded-md border border-slate-200 bg-white',
                'text-sm font-medium text-slate-700',
                'hover:bg-slate-100 hover:border-slate-300 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
              )}
            >
              Cancelar
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
