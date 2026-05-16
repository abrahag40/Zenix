import { useState } from 'react'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, AlertTriangle, User, Building2, Globe, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
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
  { value: 'GUEST',       label: 'Huésped',     description: 'El cliente llamó o escribió para cancelar', icon: <User className="h-3.5 w-3.5" />,        chipClass: 'bg-emerald-100 text-emerald-700' },
  { value: 'HOTEL',       label: 'Hotel',       description: 'Cancelación iniciada por el establecimiento (overbooking, mantenimiento)', icon: <Building2 className="h-3.5 w-3.5" />, chipClass: 'bg-amber-100 text-amber-700' },
  { value: 'OTA',         label: 'OTA',         description: 'Booking, Expedia, Airbnb canceló desde su plataforma', icon: <Globe className="h-3.5 w-3.5" />,       chipClass: 'bg-violet-100 text-violet-700' },
  { value: 'ADMIN_ERROR', label: 'Error admin.', description: 'Esta reserva fue creada por error (hab equivocada, duplicado, etc.)', icon: <AlertCircle className="h-3.5 w-3.5" />, chipClass: 'bg-orange-100 text-orange-700' },
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
  const [showDetails, setShowDetails] = useState(false)

  const nights = differenceInDays(stay.checkOut, stay.checkIn)
  const total = Number(stay.totalAmount ?? stay.ratePerNight * nights)
  const isAdminError = initiator === 'ADMIN_ERROR'

  // Dirty-state detection — Apple HIG: confirm before discarding work.
  // "pristine" = nada seleccionado / sin texto. Cerrar silencioso es OK.
  const isDirty = initiator !== null || reasonCode !== '' || reason.trim() !== '' || step === 2

  function handleCloseRequest() {
    if (isPending) return
    if (!isDirty) {
      onClose()
      return
    }
    // Confirm nativo — ligero, accesible, sin sub-dialog que duplique modal
    const ok = window.confirm('¿Descartar los datos ingresados? La cancelación no se aplicará.')
    if (ok) onClose()
  }

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleCloseRequest() }}
      onKeyDown={(e) => { if (e.key === 'Escape') handleCloseRequest() }}
      tabIndex={-1}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header stripe rojo apagado */}
        <div className="h-1 bg-rose-500/70 flex-shrink-0" />

        <div className="px-5 pt-4 pb-3 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 leading-tight">
              {step === 2 && isAdminError ? 'Confirmar error administrativo' : 'Cancelar reserva'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {step === 2 && isAdminError
                ? 'Sin penalty, restaurable 7 días'
                : 'La habitación queda disponible'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseRequest}
            className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1 rounded hover:bg-slate-100"
            aria-label="Cerrar"
            disabled={isPending}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 pb-4 space-y-3">
          {/* Resumen compacto — 2 filas en vez de 4 */}
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="font-medium text-slate-800 truncate pr-2">{stay.guestName}</span>
              <span className="text-slate-500 tabular-nums flex-shrink-0">Hab. {stay.roomNumber ?? '—'}</span>
            </div>
            <div className="flex justify-between items-baseline text-slate-600 tabular-nums">
              <span>{format(stay.checkIn, 'd MMM', { locale: es })} → {format(stay.checkOut, 'd MMM', { locale: es })} ({nights}n)</span>
              <span className="font-semibold text-slate-800">{stay.currency} {total.toLocaleString()}</span>
            </div>
          </div>

          {step === 1 && (
            <>
              {/* Initiator cards — 2x2 compactas, descripciones en tooltip */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  ¿Quién cancela? *
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {INITIATORS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.description}
                      onClick={() => { setInitiator(opt.value); setReasonCode(''); setReason('') }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                        initiator === opt.value
                          ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900/10'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <span className={`flex items-center justify-center h-5 w-5 rounded ${opt.chipClass}`}>
                        {opt.icon}
                      </span>
                      <span className="text-xs font-medium text-slate-800">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Progressive disclosure — Apple HIG: ocultar campos opcionales */}
              {initiator && initiator !== 'SYSTEM' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    className="w-full flex items-center justify-between text-[11px] font-medium text-slate-500 hover:text-slate-700 px-1 py-1"
                  >
                    <span>{showDetails ? 'Ocultar detalles' : 'Agregar motivo o notas (opcional)'}</span>
                    {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  {showDetails && (
                    <div className="space-y-2 pt-1">
                      <select
                        value={reasonCode}
                        onChange={(e) => setReasonCode(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:border-slate-400 focus:ring-0"
                      >
                        <option value="">Sin motivo específico</option>
                        {REASON_SUGGESTIONS[initiator].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                        <option value="OTHER">Otro (especificar abajo)</option>
                      </select>

                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Notas adicionales, referencias…"
                        rows={2}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:border-slate-400 focus:ring-0 resize-none"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Hint sutil sobre restore — línea, no bloque */}
              {initiator && (
                <p className="flex items-start gap-1.5 text-[11px] text-slate-500 leading-snug">
                  <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                  {initiator === 'HOTEL' || initiator === 'ADMIN_ERROR'
                    ? 'Restaurable dentro de 7 días desde el archivo.'
                    : 'Una vez confirmada no se podrá restaurar (si vuelve, crea reserva nueva).'}
                </p>
              )}
            </>
          )}

          {step === 2 && isAdminError && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-[11px] text-orange-900 space-y-1 leading-relaxed">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> Confirmar error administrativo
              </p>
              <ul className="text-orange-800 space-y-0.5 pl-1">
                <li>• NO se cobra penalty</li>
                <li>• NO cuenta como cancelación real</li>
                <li>• Restaurable 7 días</li>
                <li>• Queda registrado con tu usuario</li>
              </ul>
            </div>
          )}
        </div>

        {/* Actions footer — fixed bottom */}
        <div className="flex gap-2 px-5 pb-4 pt-1 flex-shrink-0 border-t border-slate-100 mt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => step === 2 ? setStep(1) : handleCloseRequest()}
            disabled={isPending}
          >
            {step === 2 ? 'Atrás' : 'Cancelar acción'}
          </Button>
          <Button
            size="sm"
            className="flex-1 text-xs bg-rose-600 hover:bg-rose-700 text-white"
            onClick={handleSubmit}
            disabled={!canConfirm || isPending}
          >
            {isPending ? 'Procesando…' : (
              step === 2 ? 'Confirmar' : (isAdminError ? 'Continuar' : 'Confirmar')
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
