// TODO(sprint8-pricing): cuando se implemente Sprint 8, reemplazar ratePerNight con
// el rate plan activo y permitir override con razón auditada. Ver CLAUDE.md §Sprint 8.
import { format, differenceInCalendarDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarPlus, Moon, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ExtendConfirmDialogProps {
  guestName: string
  roomNumber?: string
  originalCheckOut: Date
  newCheckOut: Date
  ratePerNight: number
  /** Total amount already charged/billed for the original booking */
  originalTotal?: number
  currency: string
  /** OTA source — if set, show advisory about OTA rate vs local rate */
  source?: string
  otaName?: string
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ExtendConfirmDialog({
  guestName,
  roomNumber,
  originalCheckOut,
  newCheckOut,
  ratePerNight,
  originalTotal,
  currency,
  source,
  otaName,
  isPending,
  onClose,
  onConfirm,
}: ExtendConfirmDialogProps) {
  const daysAdded = differenceInCalendarDays(newCheckOut, originalCheckOut)
  const extensionTotal = ratePerNight * daysAdded
  const accumulatedTotal = originalTotal != null ? originalTotal + extensionTotal : null
  const isOta = source && source !== 'direct' && source !== 'walk-in'

  if (daysAdded <= 0) return null

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      {/* Dialog */}
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ animation: 'var(--animate-spring-in)' }}
      >
        {/* Header */}
        <div className="bg-emerald-50 px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <CalendarPlus className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-base leading-tight">
                Extender estadía
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {guestName}{roomNumber && ` · Hab. ${roomNumber}`}
              </p>
            </div>
          </div>
        </div>

        {/* Dates summary */}
        <div className="px-5 py-4 space-y-3">
          <div className="bg-slate-50 rounded-xl p-3.5 flex items-center justify-between">
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Checkout actual
              </p>
              <p className="text-sm font-bold text-slate-700 mt-1">
                {format(originalCheckOut, 'EEE d MMM', { locale: es })}
              </p>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 rounded-full">
                <Moon className="h-3 w-3 text-emerald-700" />
                <span className="text-xs font-bold text-emerald-700">+{daysAdded}</span>
              </div>
              <div className="w-12 h-px bg-slate-200" />
            </div>

            <div className="text-center">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                Nuevo checkout
              </p>
              <p className="text-sm font-bold text-emerald-700 mt-1">
                {format(newCheckOut, 'EEE d MMM', { locale: es })}
              </p>
            </div>
          </div>

          {/* Additive pricing — Kahneman anchoring + Miller chunking (3 líneas = 3 chunks) */}
          <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-sm">
            {/* Line 1: original sealed */}
            {originalTotal != null && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-emerald-500" />
                  Reserva original
                </span>
                <span className="font-mono text-slate-400 line-through decoration-slate-300">
                  {currency} {originalTotal.toLocaleString()}
                </span>
              </div>
            )}

            {/* Line 2: new delta — this is what the receptionist approves */}
            <div className="flex justify-between items-center">
              <span className="text-slate-700 font-medium">
                + {daysAdded} noche{daysAdded > 1 ? 's' : ''} × {currency} {ratePerNight.toLocaleString()}
              </span>
              <span className="font-bold font-mono text-emerald-700">
                {currency} {extensionTotal.toLocaleString()}
              </span>
            </div>

            {/* Line 3: accumulated total */}
            {accumulatedTotal != null && (
              <>
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                  <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                    Total acumulado
                  </span>
                  <span className="font-bold font-mono text-slate-800">
                    {currency} {accumulatedTotal.toLocaleString()}
                  </span>
                </div>
              </>
            )}

            <p className="text-[10px] text-slate-400 pt-0.5">
              Precio informativo del sistema. Sprint 8 habilitará tarifas por plan y channel manager.
            </p>
          </div>

          {/* OTA advisory — temporary until Sprint 8 (Channex.io channel manager) */}
          {isOta && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">
                  Reserva vía {otaName ?? source}
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                  Próximamente el PMS sincronizará automáticamente con todas las OTAs vía
                  Channel Manager. Por ahora, refleja el cambio en la extranet de {otaName ?? source}.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2.5">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            className={cn(
              'flex-1 bg-emerald-600 hover:bg-emerald-700 text-white',
              'shadow-sm shadow-emerald-200',
            )}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Extendiendo...' : `Extender +${daysAdded}n`}
          </Button>
        </div>
      </div>
    </div>
  )
}
