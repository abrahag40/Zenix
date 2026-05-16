import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, RotateCcw, User, Building2, Globe, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCancelledStays, useRestoreStay } from '../../hooks/useGuestStays'

interface CancelledTodayDrawerProps {
  open: boolean
  propertyId: string
  onClose: () => void
}

const INITIATOR_META: Record<string, { label: string; icon: React.ReactNode; chipClass: string }> = {
  GUEST:       { label: 'Huésped',  icon: <User className="h-3 w-3" />,        chipClass: 'bg-emerald-100 text-emerald-700' },
  HOTEL:       { label: 'Hotel',    icon: <Building2 className="h-3 w-3" />,   chipClass: 'bg-amber-100 text-amber-700' },
  OTA:         { label: 'OTA',      icon: <Globe className="h-3 w-3" />,       chipClass: 'bg-violet-100 text-violet-700' },
  ADMIN_ERROR: { label: 'Admin err.', icon: <AlertCircle className="h-3 w-3" />, chipClass: 'bg-orange-100 text-orange-700' },
  SYSTEM:      { label: 'Sistema',  icon: <AlertCircle className="h-3 w-3" />, chipClass: 'bg-slate-100 text-slate-700' },
}

const RESTORE_WINDOW_DAYS = 7

export function CancelledTodayDrawer({ open, propertyId, onClose }: CancelledTodayDrawerProps) {
  const todayISO = new Date()
  todayISO.setHours(0, 0, 0, 0)
  const { data, isLoading } = useCancelledStays(propertyId, { since: todayISO.toISOString(), limit: 50 })
  const restoreMut = useRestoreStay(propertyId)

  if (!open) return null

  const rows = (data?.rows ?? []) as Array<{
    id: string
    guestName: string
    checkinAt: string
    scheduledCheckout: string
    cancelledAt: string
    cancelInitiator?: string
    cancelReason?: string
    cancelReasonCode?: string
    totalAmount: string | number
    currency: string
    room: { number: string }
  }>

  return (
    <div className="fixed inset-0 z-40 flex items-end" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-12 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Canceladas hoy</h2>
            <p className="text-xs text-slate-500">{rows.length} reserva{rows.length !== 1 ? 's' : ''} cancelada{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && <div className="text-sm text-slate-400 text-center py-6">Cargando…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-6">
              No hay cancelaciones registradas hoy.
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const initiator = row.cancelInitiator ?? 'GUEST'
              const meta = INITIATOR_META[initiator] ?? INITIATOR_META.GUEST
              const cancelledAt = new Date(row.cancelledAt)
              const elapsedDays = (Date.now() - cancelledAt.getTime()) / 86_400_000
              const canRestore = (initiator === 'HOTEL' || initiator === 'ADMIN_ERROR') && elapsedDays <= RESTORE_WINDOW_DAYS
              return (
                <li key={row.id} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-slate-800 truncate">{row.guestName}</span>
                      <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.chipClass}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums flex items-center gap-2">
                      <span>Hab. {row.room.number}</span>
                      <span>·</span>
                      <span>{format(new Date(row.checkinAt), 'd MMM', { locale: es })} → {format(new Date(row.scheduledCheckout), 'd MMM', { locale: es })}</span>
                      <span>·</span>
                      <span>{row.currency} {Number(row.totalAmount).toLocaleString()}</span>
                    </div>
                    {(row.cancelReasonCode || row.cancelReason) && (
                      <div className="text-[11px] text-slate-400 mt-0.5 italic truncate">
                        {row.cancelReasonCode ?? row.cancelReason}
                      </div>
                    )}
                  </div>
                  {canRestore && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => restoreMut.mutate(row.id)}
                      disabled={restoreMut.isPending}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restaurar
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
