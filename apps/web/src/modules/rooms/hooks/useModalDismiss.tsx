import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'

/**
 * Estándar de cierre para todos los modales/drawers de Zenix.
 *
 * Apple HIG — Sheets / Modals:
 *   - Permitir cierre con click fuera y tecla Esc.
 *   - "Prevent accidental dismissal when work is in progress" → si el
 *     formulario tiene cambios, pedir confirmación antes de descartar.
 *
 * SwiftUI equivalente: `.sheet { content }.interactiveDismissDisabled(isDirty)`
 *   + `.confirmationDialog` cuando se intenta cerrar con cambios.
 *
 * 2026-05-17 — Refactor: el prompt de "descartar cambios" usa el `ConfirmDialog`
 * canónico Zenix (§117), no `window.confirm` nativo. El navegador modal:
 *   - rompe consistencia visual del sistema
 *   - bloquea el JS thread
 *   - no respeta Apple HIG (estilo OS, no app)
 *   - no soporta nesting sobre Radix dialogs (jumps to top of stack)
 * El caller DEBE renderizar el `dialogElement` retornado para que el confirm
 * sea visible. Pattern idéntico a `useDiscardConfirm` (que internamente usa
 * el mismo ConfirmDialog).
 *
 * Uso:
 *   const { requestClose, onBackdropClick, dialogElement } = useModalDismiss({
 *     isDirty: hasUnsavedChanges,
 *     onClose: () => setOpen(false),
 *   })
 *
 *   return (
 *     <>
 *       <div className="fixed inset-0 z-50" onClick={onBackdropClick}>
 *         <button onClick={requestClose}>X</button>
 *       </div>
 *       {dialogElement}
 *     </>
 *   )
 *
 * Si `isDirty` siempre será false (modal sin form), `dialogElement` es null
 * y puedes omitir renderizarlo — el hook degrada a no-op de confirmación.
 */
export function useModalDismiss(opts: {
  /** True si el form tiene cambios. Puede ser función para evaluación lazy. */
  isDirty: boolean | (() => boolean)
  /** Callback final cuando el cierre se confirma. */
  onClose: () => void
  /** Título del modal de confirmación. Default "Descartar cambios". */
  confirmTitle?: string
  /** Mensaje de confirmación al intentar cerrar con cambios. */
  confirmMessage?: string
  /** Label del botón confirmativo. Default "Descartar". */
  confirmLabel?: string
  /**
   * Si true, ignora todos los intentos de cierre (ej. mientras la mutación
   * está en pending — evita race condition con request-en-vuelo).
   */
  disabled?: boolean
  /**
   * Si false (default true), no registra el listener de Esc. Útil para
   * drawers anidados que no deben capturar Esc del padre.
   */
  enableEscape?: boolean
}): {
  requestClose: () => void
  onBackdropClick: (e: React.MouseEvent) => void
  /** JSX del modal de confirmación. Renderizar siempre que `isDirty` pueda ser true. */
  dialogElement: ReactElement | null
} {
  const {
    isDirty,
    onClose,
    confirmTitle = 'Descartar cambios',
    confirmMessage = 'Tienes cambios sin guardar en este modal. Si continúas, se descartarán.',
    confirmLabel = 'Descartar',
    disabled = false,
    enableEscape = true,
  } = opts

  const [promptOpen, setPromptOpen] = useState(false)

  const requestClose = useCallback(() => {
    if (disabled) return
    const dirty = typeof isDirty === 'function' ? isDirty() : isDirty
    if (!dirty) {
      onClose()
      return
    }
    // Abrir nuestro ConfirmDialog en lugar de window.confirm — pattern §117.
    setPromptOpen(true)
  }, [disabled, isDirty, onClose])

  useEffect(() => {
    if (!enableEscape) return
    function handler(e: KeyboardEvent) {
      // Si el prompt de descartar está abierto, Esc lo cierra a él (no al
      // modal padre) — el ConfirmDialog tiene su propio onOpenChange.
      if (promptOpen) return
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enableEscape, requestClose, promptOpen])

  /** Adjunto a la capa de backdrop. Solo dispara si el target es el backdrop mismo. */
  const onBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) requestClose()
    },
    [requestClose],
  )

  const dialogElement = promptOpen ? (
    <ConfirmDialog
      open={promptOpen}
      title={confirmTitle}
      message={confirmMessage}
      confirmLabel={confirmLabel}
      cancelLabel="Seguir editando"
      tone="warning"
      onCancel={() => setPromptOpen(false)}
      onConfirm={() => {
        setPromptOpen(false)
        onClose()
      }}
    />
  ) : null

  return { requestClose, onBackdropClick, dialogElement }
}
