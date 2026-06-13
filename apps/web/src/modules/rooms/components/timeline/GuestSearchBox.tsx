import { useEffect, useRef, useState } from 'react'
import { Search, X, Loader2, User, Phone, Hash, BedDouble } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useGuestStaySearch } from '../../hooks/useGuestStays'
import type { GuestSearchResult, GuestSearchStatus } from '../../api/guest-stays.api'

/**
 * GuestSearchBox — buscador global de reservas del calendario.
 *
 * Busca por nombre / teléfono / email / bookingRef / ID de reserva OTA
 * (channexBookingId) sin límite de fechas (backend `GET /v1/guest-stays/search`).
 * Debounce 250ms. Al elegir un resultado, el padre navega el calendario a la
 * fecha de la reserva y abre su ficha (BookingDetailSheet).
 *
 * Antes este input era un placeholder decorativo (sin value/onChange/handler).
 */

const STATUS_META: Record<GuestSearchStatus, { label: string; cls: string }> = {
  ARRIVING:    { label: 'Por llegar', cls: 'bg-sky-50 text-sky-700' },
  IN_HOUSE:    { label: 'En casa',     cls: 'bg-emerald-50 text-emerald-700' },
  CHECKED_OUT: { label: 'Salió',       cls: 'bg-slate-100 text-slate-600' },
  NO_SHOW:     { label: 'No-show',     cls: 'bg-rose-50 text-rose-700' },
  CANCELLED:   { label: 'Cancelada',   cls: 'bg-rose-50 text-rose-700' },
}

function fmtDateRange(checkinIso: string, checkoutIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
  const ci = new Date(checkinIso).toLocaleDateString('es-MX', opts)
  const co = new Date(checkoutIso).toLocaleDateString('es-MX', opts)
  return `${ci} → ${co}`
}

interface GuestSearchBoxProps {
  onSelect: (result: GuestSearchResult) => void
}

export function GuestSearchBox({ onSelect }: GuestSearchBoxProps) {
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounce 250ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 250)
    return () => clearTimeout(t)
  }, [value])

  const { data: results = [], isFetching } = useGuestStaySearch(debounced)
  const showDropdown = open && debounced.trim().length >= 2

  // Reset active highlight when results change
  useEffect(() => setActive(0), [results])

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function choose(r: GuestSearchResult) {
    onSelect(r)
    setOpen(false)
    setValue('')
    setDebounced('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || results.length === 0) {
      if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} className="flex-1 max-w-md mx-auto relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Buscar por nombre, teléfono o ID de reserva OTA…"
        className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 text-sm"
        aria-label="Buscar reservas"
      />
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); setDebounced(''); setOpen(false) }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Limpiar búsqueda"
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-11 z-50 rounded-lg border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)] overflow-hidden">
          {results.length === 0 && !isFetching && (
            <div className="px-3 py-6 text-center text-sm text-slate-500">
              Sin coincidencias para “{debounced.trim()}”.
            </div>
          )}
          {results.length === 0 && isFetching && (
            <div className="px-3 py-6 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </div>
          )}
          {results.length > 0 && (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r, i) => {
                const st = STATUS_META[r.status]
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(r)}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 ${i === active ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex-shrink-0 mt-0.5">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 text-sm truncate">{r.guestName}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                          {r.roomNumber && (
                            <span className="inline-flex items-center gap-1"><BedDouble className="h-3 w-3" />Hab. {r.roomNumber}</span>
                          )}
                          <span>{fmtDateRange(r.checkinAt, r.checkoutAt)}</span>
                          {r.guestPhone && (
                            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.guestPhone}</span>
                          )}
                        </div>
                        {/* Prioriza el código de la OTA (Booking/Expedia number)
                            que el personal reconoce; cae a bookingRef interno. */}
                        {(r.otaReservationCode || r.bookingRef) && (
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-400 truncate">
                            <Hash className="h-3 w-3 flex-shrink-0" />
                            {r.otaName && <span className="capitalize text-slate-500">{r.otaName}</span>}
                            <span className="font-mono truncate text-slate-500">{r.otaReservationCode || r.bookingRef}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
