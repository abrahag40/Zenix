// TODO(sprint8-pricing): cuando Sprint 8 esté activo, mostrar también ratePlanId y
// commissionRate de la habitación destino para OTAs. Ver CLAUDE.md §Sprint 8.
import { useState } from 'react'
import { startOfDay, format, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRightLeft, Check, X, Calendar, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GuestStayBlock, FlatRow, RoomTypeGroup } from '../../types/timeline.types'

interface MoveRoomDialogProps {
  stay: GuestStayBlock
  groups: (RoomTypeGroup & { collapsed: boolean })[]
  flatRows: FlatRow[]
  stays: GuestStayBlock[]
  /** True when the guest is IN_HOUSE — enables effective-date picker */
  isInHouse?: boolean
  isPending: boolean
  onClose: () => void
  onConfirm: (newRoomId: string, effectiveDate?: Date) => void
}

export function MoveRoomDialog({
  stay,
  groups,
  stays,
  isInHouse = false,
  isPending,
  onClose,
  onConfirm,
}: MoveRoomDialogProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  const today = startOfDay(new Date())
  const checkIn  = startOfDay(new Date(stay.checkIn))
  const checkOut = startOfDay(new Date(stay.checkOut))

  // Effective-date picker — default to today, range [today, checkOut - 1]
  const maxEffectiveDate = format(addDays(checkOut, -1), 'yyyy-MM-dd')
  const [effectiveDateStr, setEffectiveDateStr] = useState(format(today, 'yyyy-MM-dd'))

  function isRoomOccupied(roomId: string): string | null {
    const conflict = stays.find(s => {
      if (s.id === stay.id) return false
      if (s.roomId !== roomId) return false
      if (s.actualCheckout) return false
      const sIn  = startOfDay(new Date(s.checkIn))
      const sOut = startOfDay(new Date(s.checkOut))
      return sOut > checkIn && sIn < checkOut
    })
    return conflict ? conflict.guestName : null
  }

  const roomsFlat = groups.flatMap(g =>
    g.rooms.map(r => ({ ...r, groupName: g.name, baseRate: g.baseRate, currency: g.currency }))
  )

  // Current room's base rate for delta calculation
  const currentRoom = roomsFlat.find(r => r.id === stay.roomId)
  const currentRate = stay.ratePerNight

  // getRateDelta is currently unused — rate delta is rendered inline per room.
  // Kept as a utility for Sprint 7B (ExtendNewRoom step) which will call it.
  function _getRateDelta(targetBaseRate: number) {
    const diff = targetBaseRate - currentRate
    if (diff > 0) return { sign: '+' as const, amount: diff }
    if (diff < 0) return { sign: '-' as const, amount: Math.abs(diff) }
    return { sign: '=' as const, amount: 0 }
  }

  function handleConfirm() {
    if (!selectedRoomId) return
    const effectiveDate = isInHouse ? parseISO(effectiveDateStr) : undefined
    onConfirm(selectedRoomId, effectiveDate)
  }

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '80vh', animation: 'var(--animate-spring-in)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <ArrowRightLeft className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Cambiar habitación</p>
              <p className="text-[11px] text-slate-400">
                {stay.guestName} · {format(checkIn, 'd MMM', { locale: es })} – {format(checkOut, 'd MMM', { locale: es })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Effective date picker — only for IN_HOUSE guests */}
        {isInHouse && (
          <div className="px-5 pt-3 pb-1 shrink-0">
            <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] font-medium text-slate-500 mb-1">Fecha efectiva del cambio</p>
                <input
                  type="date"
                  value={effectiveDateStr}
                  min={format(today, 'yyyy-MM-dd')}
                  max={maxEffectiveDate}
                  onChange={e => setEffectiveDateStr(e.target.value)}
                  className="text-sm font-semibold text-slate-800 bg-transparent border-none outline-none w-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 text-right shrink-0">
                El 95% de los<br />casos: hoy
              </p>
            </div>
          </div>
        )}

        {/* Room list — overscroll-behavior and will-change promote to GPU layer,
            eliminating jank on mid-length lists during scroll */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-1"
          style={{ overscrollBehavior: 'contain', willChange: 'scroll-position' }}
        >
          {roomsFlat.map((room) => {
            const isCurrent  = room.id === stay.roomId
            const conflictGuest = isRoomOccupied(room.id)
            const isDisabled = isCurrent || !!conflictGuest
            const isSelected = selectedRoomId === room.id

            // Rate delta for this room vs current stay rate
            const rateDiff = room.baseRate - currentRate
            const hasRateDelta = !isCurrent && rateDiff !== 0

            return (
              <button
                key={room.id}
                disabled={isDisabled}
                onClick={() => setSelectedRoomId(room.id)}
                style={{ contain: 'layout style paint' }}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all',
                  'border',
                  isSelected
                    ? 'border-emerald-400 bg-emerald-50'
                    : isDisabled
                    ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-50'
                    : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 cursor-pointer',
                )}
              >
                {/* Room number badge */}
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0',
                    isSelected
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-slate-200 text-slate-500'
                      : 'bg-slate-100 text-slate-700',
                  )}
                >
                  {room.number}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-semibold truncate',
                    isSelected ? 'text-emerald-800' : 'text-slate-700',
                  )}>
                    Hab. {room.number}
                    {isCurrent && (
                      <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        actual
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {room.groupName}
                    {conflictGuest && (
                      <span className="text-amber-600"> · Ocupada por {conflictGuest}</span>
                    )}
                  </p>
                </div>

                {/* Rate info + delta — NNGroup F-pattern: visible in right column */}
                {!isCurrent && !conflictGuest && (
                  <div className="shrink-0 text-right">
                    <p className={cn(
                      'text-xs font-mono font-semibold',
                      isSelected ? 'text-emerald-700' : 'text-slate-600',
                    )}>
                      {room.currency} {room.baseRate.toLocaleString()}/n
                    </p>
                    {hasRateDelta && (
                      <p className={cn(
                        'text-[10px] font-semibold flex items-center justify-end gap-0.5 mt-0.5',
                        rateDiff > 0 ? 'text-orange-500' : 'text-emerald-600',
                      )}>
                        {rateDiff > 0
                          ? <TrendingUp className="h-2.5 w-2.5" />
                          : <TrendingDown className="h-2.5 w-2.5" />
                        }
                        {rateDiff > 0 ? '+' : '−'}{room.currency} {Math.abs(rateDiff).toLocaleString()}/n
                      </p>
                    )}
                  </div>
                )}

                {/* Selected check */}
                {isSelected && (
                  <div className="w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center shrink-0 ml-1">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2.5 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
            disabled={!selectedRoomId || isPending}
            onClick={handleConfirm}
          >
            {isPending ? 'Moviendo...' : 'Confirmar cambio'}
          </Button>
        </div>
      </div>
    </div>
  )
}
