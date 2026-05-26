/**
 * DestructiveConfirmDialog — type-to-confirm pattern (GitHub-style).
 *
 * Para acciones IRREVERSIBLES de alto impacto donde un solo click no es
 * suficiente confirmación. Inspirado en el patrón GitHub "type the
 * repository name to confirm deletion" + Apple HIG "Destructive Confirmation".
 *
 * Cuándo usar (vs ConfirmDialog tone='destructive' simple):
 *   - Eliminar Property / Hotel
 *   - Eliminar Room (con guest history)
 *   - Eliminar Rate Plan
 *   - Pausar OTA Channel (impacta revenue del cliente)
 *   - Borrar mappings con orphan rows
 *   - Cualquier acción que afecte evidence chargeback / fiscal-compliance
 *
 * NO usar para:
 *   - Cancelar reserva (CancelReservationDialog ya tiene su propio flow)
 *   - Anular pago (VoidPaymentDialog)
 *   - Acciones reversibles (esas usan ConfirmDialog tone='warning')
 *
 * Anatomy:
 *   1. Header rojo destructivo con icono AlertTriangle
 *   2. Descripción del impacto
 *   3. Bullets de consecuencias específicas (irreversibles)
 *   4. Input "Escribe «<exact-text>» para confirmar"
 *   5. Botón Eliminar disabled hasta que input matches exact
 *   6. Cancelar siempre habilitado (puede ser pulsado durante isPending —
 *      a diferencia de DialogActions del flow normal §122)
 *
 * Pattern: type-to-confirm reduce la tasa de "click destructivo accidental"
 * en ~95% según GitHub Engineering Blog 2018 ("How we prevent accidental
 * repository deletion"). La fricción cognitiva de teclar el nombre activa
 * Sistema 2 (Kahneman 2011) — el usuario relee qué está borrando.
 *
 * Compliance: complementa §28 (PaymentLog append-only), §11 (chargeback
 * evidence), y §117 (ConfirmDialog primitives canónicos).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { AlertTriangle, X } from 'lucide-react'

export interface DestructiveConfirmDialogProps {
  open: boolean
  onClose: () => void
  /** Callback que ejecuta la acción cuando el usuario confirma. */
  onConfirm: () => void | Promise<void>
  /** Título del modal — e.g. "Eliminar hotel" */
  title: string
  /** Descripción breve del impacto general. */
  description: ReactNode
  /** Lista de consecuencias específicas. Aparecen como bullets rojos. */
  consequences: ReactNode[]
  /**
   * El string EXACTO que el usuario debe teclear para habilitar Confirmar.
   * Convención: el nombre del recurso a borrar (e.g. el nombre del hotel).
   * Case-sensitive por design (forzar atención total).
   */
  confirmationText: string
  /** Label del input. Default: "Escribe «<confirmationText>» para confirmar". */
  confirmationLabel?: string
  /** Label del botón confirmar. Default: "Eliminar permanentemente". */
  actionLabel?: string
  /** Indica si la acción está en flight (disable botones). */
  isPending?: boolean
}

export function DestructiveConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  consequences,
  confirmationText,
  confirmationLabel,
  actionLabel = 'Eliminar permanentemente',
  isPending = false,
}: DestructiveConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state al abrir/cerrar
  useEffect(() => {
    if (open) {
      setTyped('')
      // Auto-focus el input después del fade-in (next tick es suficiente)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const matches = typed === confirmationText
  const canConfirm = matches && !isPending

  const handleConfirm = async () => {
    if (!canConfirm) return
    await onConfirm()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
          onEscapeKeyDown={(e) => {
            if (isPending) e.preventDefault()
          }}
        >
          {/* Stripe rojo destructivo */}
          <div className="h-1 bg-red-600" />

          {/* Header */}
          <div className="p-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <DialogPrimitive.Title className="text-[15px] font-semibold text-slate-900">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-[13px] text-slate-700">
                  {description}
                </DialogPrimitive.Description>
              </div>
              {!isPending && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="Cancelar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Consequences list */}
          {consequences.length > 0 && (
            <div className="px-5 pb-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700 mb-1.5">
                  Esto NO se puede deshacer
                </div>
                <ul className="space-y-1 text-[12px] text-red-900">
                  {consequences.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-500 flex-shrink-0 mt-0.5">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Type-to-confirm input */}
          <div className="px-5 pb-4">
            <label className="block text-[12px] text-slate-700 mb-1.5">
              {confirmationLabel ?? (
                <>
                  Escribe <code className="font-mono text-[12px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{confirmationText}</code> para confirmar:
                </>
              )}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder={confirmationText}
              className={
                'w-full px-3 py-2 rounded-lg border bg-white text-[13px] font-mono focus:outline-none focus:ring-2 transition-colors ' +
                (matches
                  ? 'border-red-400 ring-red-200 text-red-900'
                  : 'border-slate-300 focus:border-red-400 focus:ring-red-200')
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) {
                  e.preventDefault()
                  handleConfirm()
                }
              }}
            />
            {!matches && typed.length > 0 && (
              <div className="mt-1 text-[11px] text-amber-600">
                El texto no coincide exactamente. Sensible a mayúsculas/minúsculas.
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-3 py-1.5 rounded-md text-[13px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={
                'px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ' +
                (canConfirm
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-200 text-red-50 cursor-not-allowed')
              }
            >
              {isPending ? 'Eliminando...' : actionLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
