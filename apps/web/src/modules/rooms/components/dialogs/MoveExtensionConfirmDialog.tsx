import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRight, Moon, MoveRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MoveExtensionConfirmDialogProps {
  newRoomNumber: string
  nights: number
  checkIn: Date
  checkOut: Date
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}

export function MoveExtensionConfirmDialog({
  newRoomNumber,
  nights,
  checkIn,
  checkOut,
  isPending,
  onClose,
  onConfirm,
}: MoveExtensionConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header stripe — emerald (extension colour) */}
        <div className="h-1.5 bg-emerald-500" />

        <div className="p-6 space-y-5">
          {/* Title */}
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-600">
              <MoveRight size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 leading-snug">
                Mover extensión a Hab.&nbsp;{newRoomNumber}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                La reserva original no se modifica
              </p>
            </div>
          </div>

          {/* Extension period summary */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Período de extensión</span>
              <span className="flex items-center gap-1.5 font-medium text-gray-800 tabular-nums">
                {format(checkIn, 'd MMM', { locale: es })}
                <ArrowRight size={12} className="text-gray-400" />
                {format(checkOut, 'd MMM', { locale: es })}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Noches de extensión</span>
              <span className="flex items-center gap-1 font-semibold text-emerald-700">
                <Moon size={13} />
                {nights}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Nueva habitación</span>
              <span className="font-semibold text-gray-900">Hab. {newRoomNumber}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending ? 'Moviendo…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
