/**
 * SwapRoomsConfirmDialog — Sprint CHECK-IN C3.1 v5 (2026-05-30).
 *
 * Confirma intercambio atómico de habitaciones entre 2 stays.
 *
 * Diseño coherente con design system Zenix (CLAUDE.md §117 ConfirmDialog +
 * §123 DialogActions): mismo wrapper Radix Dialog + stripe + icon header
 * + DialogActions footer canónico. NO renderiza botones ad-hoc.
 *
 * El body es un preview vertical con frases naturales en español para
 * recepcionistas LATAM (low-literacy friendly): "Juan García se va a la
 * Hab. 102" en lugar de notación técnica con flechas y line-through.
 */
import { useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ArrowDown, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DialogActions } from '../shared/DialogActions'

interface SwapRoomsConfirmDialogProps {
  open: boolean
  onClose: () => void
  currentStay: {
    id: string
    guestName: string
    roomNumber?: string | null
  } | null
  targetStay: {
    id: string
    guestName: string
    roomNumber?: string | null
  } | null
  isPending?: boolean
  onConfirm: (reason?: string) => void
}

export function SwapRoomsConfirmDialog({
  open, onClose, currentStay, targetStay, isPending, onConfirm,
}: SwapRoomsConfirmDialogProps) {
  const [reason, setReason] = useState('')
  const [showReason, setShowReason] = useState(false)

  if (!currentStay || !targetStay) return null

  const handleConfirm = () => {
    if (isPending) return
    onConfirm(reason.trim() || undefined)
  }

  const handleClose = () => {
    if (isPending) return
    setReason('')
    setShowReason(false)
    onClose()
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => { if (!o && !isPending) handleClose() }}
    >
      <DialogPrimitive.Portal>
        {/* Overlay canónico — mismo backdrop-blur que ConfirmDialog */}
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="swap-rooms-dialog-title"
          className="fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Stripe — emerald (primary tone del system) */}
          <div className="h-1 shrink-0 bg-emerald-500" />

          {/* Header — mismo layout que ConfirmDialog: icon + title + description */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full border bg-emerald-50 border-emerald-200 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="h-[18px] w-[18px] text-emerald-700" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogPrimitive.Title
                  id="swap-rooms-dialog-title"
                  className="text-[15px] font-semibold text-slate-900 leading-tight tracking-[-0.005em]"
                >
                  ¿Cambiar habitación?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                  Los dos huéspedes intercambian habitación de forma inmediata.
                </DialogPrimitive.Description>
              </div>
            </div>
          </div>

          {/* Body — preview vertical con frases naturales */}
          <div className="px-5 pb-3 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1">
                {currentStay.guestName}
              </p>
              <p className="text-[14px] font-semibold text-slate-900 leading-tight">
                se va a la <span className="text-emerald-700 font-bold">Hab. {targetStay.roomNumber ?? '—'}</span>
              </p>
            </div>

            <div className="flex justify-center">
              <ArrowDown className="h-4 w-4 text-slate-400" strokeWidth={2} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1">
                {targetStay.guestName}
              </p>
              <p className="text-[14px] font-semibold text-slate-900 leading-tight">
                se va a la <span className="text-emerald-700 font-bold">Hab. {currentStay.roomNumber ?? '—'}</span>
              </p>
            </div>
          </div>

          {/* Razón opcional — collapsible, no obliga lectura.
              C3.1 v7: link alineado a la derecha (user feedback). */}
          <div className="px-5 pb-3">
            {!showReason ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowReason(true)}
                  className="text-[11.5px] text-slate-500 hover:text-emerald-700 underline underline-offset-2"
                >
                  + Agregar razón (opcional)
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] block">
                  Razón <span className="text-slate-400 normal-case font-normal">· para audit</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. huésped pidió planta baja"
                  maxLength={120}
                  autoFocus
                  className={cn(
                    'w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900',
                    'placeholder:text-slate-400 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
                    'hover:border-slate-300',
                  )}
                />
              </div>
            )}
          </div>

          {/* Footer — DialogActions canónico (CLAUDE.md §123). Tone primary
              porque swap es acción positiva (no destructive ni warning). */}
          <DialogActions
            onCancel={handleClose}
            onConfirm={handleConfirm}
            confirmLabel="Cambiar habitación"
            cancelLabel="Cancelar"
            tone="primary"
            isPending={isPending}
            className="px-5 pb-4 pt-3 border-t border-slate-100"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
