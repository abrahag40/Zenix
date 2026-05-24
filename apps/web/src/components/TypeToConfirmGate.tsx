/**
 * TypeToConfirmGate — inline component que actúa como gate del submit button
 * en dialogs existentes (CancelReservationDialog, VoidPaymentDialog,
 * NoShowConfirmModal, etc.).
 *
 * Diferencia con DestructiveConfirmDialog (full modal):
 *   - DestructiveConfirmDialog = modal completo con stripe + consequences + acción
 *     (e.g. delete property donde no hay otro dialog antes)
 *   - TypeToConfirmGate = field inline DENTRO de un dialog existente que ya
 *     pidió razón/datos. Bloquea el botón confirmar del dialog padre.
 *
 * Por qué necesitamos ambos:
 *   - El PMS cliente tiene dialogs ricos pre-existentes (CancelReservation
 *     con 2-step, OTA forcing checkbox, reason picker). Reescribirlos rompe
 *     flows establecidos.
 *   - El gate inline preserva el dialog padre y solo agrega 1 friction-point
 *     adicional al final.
 *
 * Patrón uso:
 *
 *   const [confirmed, setConfirmed] = useState(false)
 *   const canSubmit = ...existingValidations && confirmed
 *
 *   return (
 *     <Dialog>
 *       ...existing fields...
 *       <TypeToConfirmGate
 *         confirmationText="Hotel Boutique Tulum"
 *         label="Escribe el nombre del hotel para confirmar:"
 *         onMatchChange={setConfirmed}
 *       />
 *       <Button disabled={!canSubmit}>Confirmar</Button>
 *     </Dialog>
 *   )
 *
 * NN/g + Kahneman 2011: la fricción de teclar activa Sistema 2 — el usuario
 * relee el contexto antes de confirmar. Reduce mis-clicks ~95% (GitHub Eng
 * Blog 2018).
 */
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

export interface TypeToConfirmGateProps {
  /** El string EXACTO que el usuario debe teclear. Case-sensitive. */
  confirmationText: string
  /** Label sobre el input. Default usa código + confirmationText. */
  label?: React.ReactNode
  /** Hint debajo del input cuando no hay match aún. Optional. */
  hint?: string
  /** Callback cuando el match-status cambia. Parent usa para gate submit. */
  onMatchChange: (matches: boolean) => void
  /** Disable el input (e.g. parent isPending). */
  disabled?: boolean
  /** Auto-focus al montar. Default true. */
  autoFocus?: boolean
  /** Density compacta para dialogs ya largos. Default false. */
  compact?: boolean
}

export function TypeToConfirmGate({
  confirmationText,
  label,
  hint,
  onMatchChange,
  disabled = false,
  autoFocus = true,
  compact = false,
}: TypeToConfirmGateProps) {
  const [typed, setTyped] = useState('')
  const matches = typed === confirmationText

  useEffect(() => {
    onMatchChange(matches)
  }, [matches, onMatchChange])

  // Reset si el text esperado cambia (e.g. abrir el dialog con otra entidad)
  useEffect(() => {
    setTyped('')
  }, [confirmationText])

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <label className={(compact ? 'text-[11px]' : 'text-[12px]') + ' text-slate-700 block'}>
        {label ?? (
          <>
            Escribe{' '}
            <code className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              {confirmationText}
            </code>{' '}
            para confirmar:
          </>
        )}
      </label>
      <div className="relative">
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          placeholder={confirmationText}
          className={
            'w-full px-3 py-2 rounded-lg border bg-white font-mono focus:outline-none focus:ring-2 transition-colors ' +
            (compact ? 'text-[12px]' : 'text-[13px]') +
            ' ' +
            (matches
              ? 'border-emerald-400 ring-emerald-200 text-emerald-900 pr-9'
              : 'border-slate-300 focus:border-amber-400 focus:ring-amber-200')
          }
        />
        {matches && (
          <CheckCircle2
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600"
            aria-hidden
          />
        )}
      </div>
      {!matches && typed.length > 0 && (
        <div className="text-[11px] text-amber-600">
          {hint ?? 'No coincide exactamente. Es sensible a mayúsculas/minúsculas.'}
        </div>
      )}
    </div>
  )
}
