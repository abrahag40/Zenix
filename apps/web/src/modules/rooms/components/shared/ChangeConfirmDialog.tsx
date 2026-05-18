/**
 * ChangeConfirmDialog — Sprint EDIT-RESERVATION
 *
 * Dialog reusable para confirmar cambios significativos con diff side-by-side
 * "Antes / Después" + razón obligatoria + approval condicional post-checkin.
 *
 * Casos de uso:
 *   - paxCount edit en cualquier fase: muestra diff, pide razón si != PRE_CHECKIN
 *   - ratePerNight edit pre-checkin: diff + razón opcional
 *   - ratePerNight edit post-checkin: diff + razón + managerApprovalCode obligatorios
 *
 * Patrón Apple HIG: confirmation dialog para acciones con consecuencia
 * económica/operativa. Modal centrado, max-w-md, mismo lenguaje visual que
 * CancelReservationDialog + ConfirmCheckinDialog (consistencia §38).
 *
 * Performance: useDiscardConfirm (modal Zenix) + Radix Dialog nesting. Sin
 * portals adicionales — Sheet padre permanece visible debajo (semi-bloqueo).
 */
import { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDiscardConfirm } from './ConfirmDialog'
import { DialogActions } from './DialogActions'

export interface ChangeConfirmDialogProps {
  open: boolean
  /** Resolución del usuario: true = confirmó, false = canceló. */
  onResolve: (
    confirmed: boolean,
    extras?: { reason?: string; managerApprovalCode?: string; managerApprovalReason?: string },
  ) => void

  /** Título del dialog (ej. "Cambiar tarifa por noche"). */
  title: string
  /** Descripción corta debajo del título (opcional). */
  subtitle?: string

  /** Etiqueta del campo (ej. "Tarifa por noche", "Personas"). */
  fieldLabel: string
  /** Valor actual formateado para display. */
  beforeDisplay: string
  /** Nuevo valor formateado para display. */
  afterDisplay: string

  /** Cambio derivado opcional (ej. "Total: USD 360 → USD 540 (+USD 180)"). */
  derivedSummary?: string
  /** Highlight semántico del cambio: 'increase' | 'decrease' | 'neutral'. */
  changeKind?: 'increase' | 'decrease' | 'neutral'

  /** Si true, la razón es campo obligatorio (validación). */
  requireReason?: boolean

  /** Si true, expone bloque de aprobación de manager (post-checkin policy). */
  requireApproval?: boolean
}

export function ChangeConfirmDialog({
  open,
  onResolve,
  title, subtitle,
  fieldLabel,
  beforeDisplay, afterDisplay,
  derivedSummary,
  changeKind = 'neutral',
  requireReason = false,
  requireApproval = false,
}: ChangeConfirmDialogProps) {
  const [reason, setReason] = useState('')
  const [managerCode, setManagerCode] = useState('')
  const [managerReason, setManagerReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset state cada vez que se abre — el padre lo monta/desmonta condicionalmente.
  useEffect(() => {
    if (open) {
      setReason('')
      setManagerCode('')
      setManagerReason('')
      setSubmitting(false)
    }
  }, [open])

  const isDirty =
    reason.trim() !== '' ||
    managerCode.trim() !== '' ||
    managerReason.trim() !== ''

  const { requestClose, dialogElement: discardPrompt } = useDiscardConfirm({
    isDirty,
    onConfirmDiscard: () => onResolve(false),
    disabled: submitting,
    title: 'Descartar cambio',
    message: 'El cambio NO se aplicará. ¿Continuar?',
    confirmLabel: 'Descartar',
  })

  const reasonValid    = !requireReason || reason.trim().length > 0
  const approvalValid  = !requireApproval ||
    (managerCode.trim().length > 0 && managerReason.trim().length > 0)
  const canConfirm     = reasonValid && approvalValid && !submitting

  function handleConfirm() {
    if (!canConfirm) return
    setSubmitting(true)
    onResolve(true, {
      reason: reason.trim() || undefined,
      managerApprovalCode: requireApproval ? managerCode.trim() : undefined,
      managerApprovalReason: requireApproval ? managerReason.trim() : undefined,
    })
    // El padre decide si cerrar o no (lo hace al success del mutation).
  }

  // Radix Dialog nesting — focus scope + portal + dismiss native.
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) requestClose() }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="change-confirm-title"
          className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
        {/* Stripe ámbar — cambio significativo, no destructivo (no rojo). */}
        <div className="h-1 bg-amber-500/80 shrink-0" />

        {/* Header */}
        <header className="px-5 pt-4 pb-3 flex items-start justify-between shrink-0">
          <div>
            <h2 id="change-confirm-title" className="text-base font-semibold text-slate-900 leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700 -mr-1 -mt-1 p-1 rounded hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </header>

        {/* Body */}
        <div className="overflow-y-auto px-5 pb-4 space-y-3.5">
          {/* Diff side-by-side — Apple HIG: comparison view */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {fieldLabel}
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              <DiffColumn label="Antes" value={beforeDisplay} tone="neutral" />
              <div className="flex items-center justify-center text-slate-300 text-lg">
                →
              </div>
              <DiffColumn label="Después" value={afterDisplay} tone={changeKind} />
            </div>
          </div>

          {derivedSummary && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
              {derivedSummary}
            </p>
          )}

          {/* Razón */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Razón {requireReason && <span className="text-rose-500">*</span>}
              {!requireReason && (
                <span className="font-normal normal-case text-slate-400 ml-1">
                  (opcional, queda en audit log)
                </span>
              )}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 240))}
              rows={2}
              maxLength={240}
              placeholder="Tarifa OTA capturada mal al crear, descuento promo no aplicado…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm
                         text-slate-800 placeholder:text-slate-400 resize-none
                         focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            {requireReason && !reasonValid && reason.length === 0 && (
              <p className="text-[11px] text-rose-600">Razón obligatoria para este cambio</p>
            )}
          </div>

          {/* Approval block — solo post-checkin (rate/pax) */}
          {requireApproval && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                <ShieldCheck className="h-3.5 w-3.5" />
                Aprobación del manager
              </p>
              <p className="text-[11px] text-amber-800 leading-snug">
                Cambios post-checkin requieren código + razón del manager (audit
                contra disputas Visa CRR §5.9.2).
              </p>
              <input
                type="text"
                value={managerCode}
                onChange={(e) => setManagerCode(e.target.value)}
                placeholder="Código del manager *"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <input
                type="text"
                value={managerReason}
                onChange={(e) => setManagerReason(e.target.value.slice(0, 200))}
                placeholder="Motivo de la aprobación *"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {!approvalValid && (managerCode || managerReason) && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Completa código y motivo
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogActions
          onCancel={requestClose}
          onConfirm={handleConfirm}
          confirmLabel="Confirmar cambio"
          confirmPendingLabel="Aplicando…"
          confirmIcon={Check}
          tone="warning"
          isPending={submitting}
          confirmDisabled={!canConfirm}
          className="px-5 pb-4 pt-2 shrink-0 border-t border-slate-100"
        />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      {discardPrompt}
    </DialogPrimitive.Root>
  )
}

function DiffColumn({
  label, value, tone,
}: {
  label: string
  value: string
  tone: 'increase' | 'decrease' | 'neutral'
}) {
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2 flex flex-col gap-1',
      tone === 'neutral' && 'border-slate-200 bg-slate-50',
      tone === 'increase' && 'border-amber-300 bg-amber-50',
      tone === 'decrease' && 'border-emerald-300 bg-emerald-50',
    )}>
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className={cn(
        'text-base font-bold tabular-nums leading-tight',
        tone === 'neutral' && 'text-slate-800',
        tone === 'increase' && 'text-amber-800',
        tone === 'decrease' && 'text-emerald-800',
      )}>
        {value}
      </span>
    </div>
  )
}
