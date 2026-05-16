import { useState } from 'react'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, AlertTriangle, User, Building2, Globe, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GuestStayBlock } from '../../types/timeline.types'
import type { CancelStayInput } from '../../hooks/useGuestStays'

interface CancelReservationDialogProps {
  stay: GuestStayBlock
  isPending: boolean
  onClose: () => void
  onConfirm: (data: CancelStayInput) => void
}

type Initiator = CancelStayInput['initiator']

const INITIATORS: { value: Initiator; label: string; description: string; icon: React.ReactNode; chipClass: string }[] = [
  { value: 'GUEST',       label: 'El huésped',                  description: 'El cliente llamó/escribió para cancelar', icon: <User className="h-4 w-4" />,        chipClass: 'bg-emerald-100 text-emerald-700' },
  { value: 'HOTEL',       label: 'El hotel',                    description: 'Cancelación iniciada por el establecimiento (overbooking, mantenimiento)', icon: <Building2 className="h-4 w-4" />, chipClass: 'bg-amber-100 text-amber-700' },
  { value: 'OTA',         label: 'La OTA',                      description: 'Booking, Expedia, Airbnb canceló desde su plataforma', icon: <Globe className="h-4 w-4" />,       chipClass: 'bg-violet-100 text-violet-700' },
  { value: 'ADMIN_ERROR', label: 'Error administrativo',        description: 'Esta reserva fue creada por error (habitación equivocada, duplicado, etc.)', icon: <AlertCircle className="h-4 w-4" />, chipClass: 'bg-orange-100 text-orange-700' },
]

const REASON_SUGGESTIONS: Record<Initiator, string[]> = {
  GUEST:       ['Plan de viaje cambió', 'Problemas de salud', 'Cambio de fechas', 'Otra reserva'],
  HOTEL:       ['Overbooking — reubicado', 'Habitación fuera de servicio', 'Decisión gerencial'],
  OTA:         ['Tarjeta rechazada por OTA', 'Guest canceló en OTA', 'Política de cancelación OTA'],
  ADMIN_ERROR: ['Habitación incorrecta', 'Fechas incorrectas', 'Reserva duplicada', 'Nombre incorrecto'],
  SYSTEM:      [],
}

export function CancelReservationDialog({
  stay,
  isPending,
  onClose,
  onConfirm,
}: CancelReservationDialogProps) {
  const [initiator, setInitiator] = useState<Initiator | null>(null)
  const [reasonCode, setReasonCode] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [step, setStep] = useState<1 | 2>(1)

  const nights = differenceInDays(stay.checkOut, stay.checkIn)
  const total = Number(stay.totalAmount ?? stay.ratePerNight * nights)
  const isAdminError = initiator === 'ADMIN_ERROR'

  function handleSubmit() {
    if (!initiator) return
    if (isAdminError && step === 1) {
      setStep(2)
      return
    }
    onConfirm({
      initiator,
      reasonCode: reasonCode || undefined,
      reason: reason.trim() || reasonCode || undefined,
    })
  }

  const canConfirm = !!initiator && (!isAdminError || step === 2)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header stripe rojo apagado */}
        <div className="h-1.5 bg-rose-500/70" />

        <div className="p-5 space-y-4">
          {/* Title + close */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 leading-snug">
                Cancelar reserva
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdminError && step === 2
                  ? 'Confirmar cancelación por error administrativo'
                  : 'Esta acción mueve la reserva al archivo. La habitación queda disponible.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1 rounded hover:bg-slate-100"
              aria-label="Cerrar"
              disabled={isPending}
            >
              <X size={18} />
            </button>
          </div>

          {/* Resumen de la reserva — Norman 1988 reversibility */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Huésped</span>
              <span className="font-medium text-slate-800">{stay.guestName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Habitación</span>
              <span className="font-medium text-slate-800">{stay.roomNumber ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Fechas</span>
              <span className="font-medium text-slate-800 tabular-nums">
                {format(stay.checkIn, 'd MMM', { locale: es })} → {format(stay.checkOut, 'd MMM', { locale: es })}
                {' '}({nights}n)
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Monto</span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {stay.currency} {total.toLocaleString()}
              </span>
            </div>
          </div>

          {step === 1 && (
            <>
              {/* ¿Quién cancela? — obligatorio */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  ¿Quién cancela? *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {INITIATORS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setInitiator(opt.value); setReasonCode(''); setReason('') }}
                      className={`flex flex-col items-start gap-1 px-3 py-2 rounded-lg border text-left transition-all ${
                        initiator === opt.value
                          ? 'border-slate-900 bg-slate-50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-1.5 py-0.5 rounded ${opt.chipClass}`}>
                        {opt.icon}
                        {opt.label}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-tight">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {initiator && initiator !== 'SYSTEM' && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Motivo (opcional)
                    </label>
                    <select
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-slate-400 focus:ring-0"
                    >
                      <option value="">Sin motivo específico</option>
                      {REASON_SUGGESTIONS[initiator].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                      <option value="OTHER">Otro (especificar abajo)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Notas adicionales (opcional)
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Información adicional, referencias de email, etc."
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-slate-400 focus:ring-0 resize-none"
                    />
                  </div>
                </>
              )}

              {/* Mensaje informativo sobre restore */}
              {initiator && (
                <div className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>
                    {initiator === 'HOTEL' || initiator === 'ADMIN_ERROR' ? (
                      <>Esta cancelación se puede <strong>restaurar dentro de 7 días</strong> si la habitación sigue disponible.</>
                    ) : (
                      <>Cancelaciones del huésped o de OTA <strong>no se pueden restaurar</strong>. Si vuelve a querer venir, crea una reserva nueva.</>
                    )}
                  </span>
                </div>
              )}
            </>
          )}

          {step === 2 && isAdminError && (
            <div className="space-y-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-orange-900">
                    Confirmar cancelación por error administrativo
                  </p>
                  <ul className="text-xs text-orange-800 space-y-1 leading-relaxed">
                    <li>• NO se cobrará penalty al huésped</li>
                    <li>• NO se contará como cancelación real en los reportes</li>
                    <li>• Se podrá restaurar durante 7 días si lo necesitas</li>
                    <li>• Se registra en la bitácora de auditoría con tu usuario</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => step === 2 ? setStep(1) : onClose()}
              disabled={isPending}
            >
              {step === 2 ? 'Atrás' : 'Cancelar acción'}
            </Button>
            <Button
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleSubmit}
              disabled={!canConfirm || isPending}
            >
              {isPending ? 'Procesando…' : (
                step === 2 ? 'Confirmar' : (isAdminError ? 'Continuar' : 'Confirmar cancelación')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
