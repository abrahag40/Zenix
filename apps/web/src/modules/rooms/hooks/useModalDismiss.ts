import { useCallback, useEffect } from 'react'

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
 * Uso:
 *   const { requestClose, onBackdropClick } = useModalDismiss({
 *     isDirty: hasUnsavedChanges,
 *     onClose: () => setOpen(false),
 *   })
 *
 *   <div className="fixed inset-0 z-50" onClick={onBackdropClick}>
 *     <button onClick={requestClose}>X</button>
 *   </div>
 */
export function useModalDismiss(opts: {
  /** True si el form tiene cambios. Puede ser función para evaluación lazy. */
  isDirty: boolean | (() => boolean)
  /** Callback final cuando el cierre se confirma. */
  onClose: () => void
  /** Mensaje de confirmación al intentar cerrar con cambios. */
  confirmMessage?: string
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
}) {
  const { isDirty, onClose, confirmMessage, disabled = false, enableEscape = true } = opts

  const requestClose = useCallback(() => {
    if (disabled) return
    const dirty = typeof isDirty === 'function' ? isDirty() : isDirty
    if (!dirty) {
      onClose()
      return
    }
    const ok = window.confirm(confirmMessage ?? '¿Descartar los cambios? La acción no se aplicará.')
    if (ok) onClose()
  }, [disabled, isDirty, onClose, confirmMessage])

  useEffect(() => {
    if (!enableEscape) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enableEscape, requestClose])

  /** Adjunto a la capa de backdrop. Solo dispara si el target es el backdrop mismo. */
  const onBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) requestClose()
    },
    [requestClose],
  )

  return { requestClose, onBackdropClick }
}
