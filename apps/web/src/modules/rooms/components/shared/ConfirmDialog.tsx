/**
 * ConfirmDialog + useConfirmDialog + useDiscardConfirm
 * Sprint EDIT-RESERVATION iter 5
 *
 * Modal de confirmación genérico reusable. Reemplaza window.confirm con un
 * componente del design system Zenix. Diseñado para soportar cualquier
 * contexto que requiera "pregunta de doble verificación" antes de una acción.
 *
 * Variantes via `tone`:
 *   - 'warning'      — ámbar, advertencia no destructiva (descartar borrador)
 *   - 'destructive'  — rojo, acción irreversible (anular pago, cancelar reserva)
 *   - 'info'         — slate, decisión neutra (confirmar selección)
 *   - 'success'      — esmerald, acción positiva (aplicar cambio)
 *
 * API:
 *   <ConfirmDialog open title message tone onConfirm onCancel /> — uso directo
 *   const { request, dialog } = useConfirmDialog({...})           — hook + JSX
 *   const { requestClose, dialogElement } = useDiscardConfirm({...}) — preset
 *                                                                   "descartar"
 *
 * Tech: Radix Dialog primitive. Nesting nativo sobre otros dialogs Radix.
 * Sin animaciones (decisión 2026-05-17 — instant feedback para confirmaciones).
 */
import { useCallback, useState, type ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DialogActions, type DialogActionTone } from './DialogActions'

export type ConfirmTone = 'warning' | 'destructive' | 'info' | 'success'

/**
 * Mapea el `ConfirmTone` (semántico para confirmaciones) al `DialogActionTone`
 * (semántico para el par de botones). El stripe + icono del header sigue
 * usando ConfirmTone; sólo el botón primario delega tono a DialogActions.
 *   warning      → warning  (descartar — ámbar)
 *   destructive  → destructive
 *   info         → info
 *   success      → primary  (acción positiva → emerald)
 */
function toneToActionTone(t: ConfirmTone): DialogActionTone {
  if (t === 'success') return 'primary'
  // warning conserva su intención "destructiva-suave" (descartar borrador) —
  // se mapeaba históricamente a rosa; ahora se respeta el ámbar de DialogActions
  // para coherencia visual con el stripe del propio dialog.
  return t
}

interface ToneConfig {
  stripe: string
  iconBg: string
  iconBorder: string
  iconColor: string
  Icon: typeof AlertTriangle
  confirmBg: string
}

const TONE_CONFIG: Record<ConfirmTone, ToneConfig> = {
  warning: {
    stripe:    'bg-amber-500/80',
    iconBg:    'bg-amber-100',
    iconBorder:'border-amber-200',
    iconColor: 'text-amber-700',
    Icon:      AlertTriangle,
    confirmBg: 'bg-rose-600 hover:bg-rose-700',
  },
  destructive: {
    stripe:    'bg-rose-500/80',
    iconBg:    'bg-rose-100',
    iconBorder:'border-rose-200',
    iconColor: 'text-rose-700',
    Icon:      XCircle,
    confirmBg: 'bg-rose-600 hover:bg-rose-700',
  },
  info: {
    stripe:    'bg-slate-400/80',
    iconBg:    'bg-slate-100',
    iconBorder:'border-slate-200',
    iconColor: 'text-slate-700',
    Icon:      Info,
    confirmBg: 'bg-slate-700 hover:bg-slate-800',
  },
  success: {
    stripe:    'bg-emerald-500/80',
    iconBg:    'bg-emerald-100',
    iconBorder:'border-emerald-200',
    iconColor: 'text-emerald-700',
    Icon:      CheckCircle2,
    confirmBg: 'bg-emerald-600 hover:bg-emerald-700',
  },
}

export interface ConfirmDialogProps {
  open: boolean
  /** Encabezado breve, una línea — Apple HIG: dile al usuario QUÉ acción. */
  title: string
  /** Mensaje explicativo, 1-2 oraciones — dile QUÉ va a pasar / qué pierde. */
  message: ReactNode
  /** Etiqueta del botón confirmativo — verbo imperativo: "Descartar", "Anular"... */
  confirmLabel?: string
  /** Etiqueta del botón cancelativo. */
  cancelLabel?: string
  /** Tono visual — afecta stripe, icono y color del botón confirmativo. */
  tone?: ConfirmTone
  /** Icono custom override (opcional). */
  icon?: ReactNode
  /** Disable buttons mientras una mutación está pending. */
  isPending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'warning',
  icon,
  isPending = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const config = TONE_CONFIG[tone]
  const IconCmp = config.Icon

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => { if (!o && !isPending) onCancel() }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-zenix-modal="true"
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          data-zenix-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-xs bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className={cn('h-1 shrink-0', config.stripe)} />

          <div className="px-5 pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-8 h-8 rounded-full border flex items-center justify-center shrink-0',
                config.iconBg, config.iconBorder,
              )}>
                {icon ?? <IconCmp className={cn('h-4 w-4', config.iconColor)} />}
              </div>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title
                  id="confirm-dialog-title"
                  className="text-sm font-semibold text-slate-900 leading-tight"
                >
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-slate-600 mt-1 leading-snug">
                  {message}
                </DialogPrimitive.Description>
              </div>
            </div>
          </div>

          <DialogActions
            onCancel={onCancel}
            onConfirm={onConfirm}
            confirmLabel={confirmLabel}
            cancelLabel={cancelLabel}
            tone={toneToActionTone(tone)}
            isPending={isPending}
            className="px-5 pb-4 pt-3 border-t border-slate-100"
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ── Hook genérico — para cualquier confirm dialog imperativo ─────────────────

interface UseConfirmDialogOpts extends Omit<ConfirmDialogProps, 'open' | 'onConfirm' | 'onCancel'> {
  /** Callback cuando el usuario CONFIRMA. */
  onConfirm: () => void
  /** Callback opcional cuando cancela (default: cierra el prompt sin más). */
  onCancel?: () => void
}

/**
 * Hook reusable que devuelve un trigger `request()` + el JSX del dialog.
 * El parent llama `request()` cuando quiere abrir el confirm; el hook maneja
 * el state interno. Útil para casos one-off como "¿eliminar item?" sin
 * boilerplate de useState manual.
 */
export function useConfirmDialog(opts: UseConfirmDialogOpts) {
  const { onConfirm, onCancel, isPending, ...dialogProps } = opts
  const [open, setOpen] = useState(false)

  const request = useCallback(() => setOpen(true), [])
  const close = useCallback(() => {
    setOpen(false)
    onCancel?.()
  }, [onCancel])

  const dialog = (
    <ConfirmDialog
      {...dialogProps}
      open={open}
      isPending={isPending}
      onCancel={close}
      onConfirm={() => {
        setOpen(false)
        onConfirm()
      }}
    />
  )

  return { request, close, dialog }
}

// ── Preset — "descartar cambios" para forms dirty ────────────────────────────

interface UseDiscardConfirmOpts {
  isDirty: boolean | (() => boolean)
  /** Llamado cuando el usuario CONFIRMA descartar (o si no había dirty). */
  onConfirmDiscard: () => void
  /** Si la mutación está pending, no permite close (evita race). */
  disabled?: boolean
  /** Customización opcional del prompt. */
  title?: string
  message?: ReactNode
  confirmLabel?: string
}

/**
 * Preset del useConfirmDialog para el caso "el form tiene cambios sin guardar".
 * El parent llama `requestClose()` (en lugar de cerrar directo); el hook
 * decide si mostrar el prompt o cerrar sin preguntar (form clean).
 */
export function useDiscardConfirm(opts: UseDiscardConfirmOpts) {
  const {
    isDirty, onConfirmDiscard, disabled,
    title = 'Descartar cambios',
    message = 'Los cambios no se guardarán. ¿Continuar?',
    confirmLabel = 'Descartar',
  } = opts
  const [promptOpen, setPromptOpen] = useState(false)

  const requestClose = useCallback(() => {
    if (disabled) return
    const dirty = typeof isDirty === 'function' ? isDirty() : isDirty
    if (!dirty) {
      onConfirmDiscard()
      return
    }
    setPromptOpen(true)
  }, [disabled, isDirty, onConfirmDiscard])

  const dialogElement = (
    <ConfirmDialog
      open={promptOpen}
      tone="warning"
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel="Seguir editando"
      onCancel={() => setPromptOpen(false)}
      onConfirm={() => {
        setPromptOpen(false)
        onConfirmDiscard()
      }}
    />
  )

  return { requestClose, dialogElement }
}
