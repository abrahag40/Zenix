/**
 * DialogActions — par canónico Cancelar / Confirmar para TODOS los modales Zenix.
 *
 * Decisión §123 (post-debate consistencia, 2026-05-17): cada modal del sistema
 * monta su footer de acciones a través de este componente. NO permitir `<Button>`
 * directos para Cancel/Confirm en footers de dialog — la inconsistencia visual
 * (heights, paddings, variants, tonos) erosiona la confianza del usuario y
 * viola NN/g H4 (consistency & standards). Pattern Apple HIG / Material 3.
 *
 * Anatomía:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  [ Cancelar (outline) ]    [ Confirmar (solid) ]    │
 *   │   ← secondary (left)        ← primary (right)        │
 *   └──────────────────────────────────────────────────────┘
 *
 * Reglas (no negociable):
 *   1. Cancelar SIEMPRE a la izquierda, Confirmar a la derecha (Western reading
 *      flow + Apple HIG; el primary action es el "destino" del gesto).
 *   2. Misma altura (h-9 = 36px ≥ 44pt iOS effective tap target con padding).
 *   3. text-xs uniforme (NO mezclar text-xs y text-sm en el mismo footer).
 *   4. Cancelar = variant outline (NO ghost — el border evita "perderse" en
 *      cards con bg-slate-50/amber-50; ghost solo para tertiary actions inline).
 *   5. Confirmar = solid coloreado por tone (primary emerald / destructive red /
 *      warning amber / info slate). Mapea 1:1 a ConfirmDialog tones (§117).
 *   6. Loading state: spinner inline + label dinámico (e.g. "Registrando…").
 *      Cancel SIEMPRE deshabilitado durante pending (HTTP standard §122
 *      garantiza terminal state — el band-aid "Cancel durante pending" está
 *      explícitamente prohibido).
 *   7. Icon opcional a la izquierda del label, h-3.5 w-3.5 (proporción
 *      icon:text = 0.875 ≈ ratio dorado para legibilidad de UI compacta).
 *
 * Migración: dialogs nuevos lo usan day 1. Dialogs viejos migran gradualmente
 * — buscar `variant="outline"` + `Cancelar` adjacent a action button.
 */
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export type DialogActionTone = 'primary' | 'destructive' | 'warning' | 'info'

interface Props {
  /** Callback al hacer click en Cancelar (también disparado por Esc / backdrop si el modal lo soporta). */
  onCancel: () => void
  /** Callback al hacer click en Confirmar. Puede retornar Promise — usar `isPending` para loading state. */
  onConfirm: () => void
  /** Texto del botón primary. Verbo en infinitivo siempre — "Registrar pago", "Guardar foto", "Anular movimiento". */
  confirmLabel: string
  /** Texto durante pending. Default deriva: "Registrar pago" → "Registrando…". Pasar custom si la derivación no aplica. */
  confirmPendingLabel?: string
  /** Texto del botón secondary. Default "Cancelar". Excepción: AlertDialog destructivo puede usar "Continuar editando". */
  cancelLabel?: string
  /** Tono del primary. Mapea a tonos ConfirmDialog (§117). Default 'primary' (emerald). */
  tone?: DialogActionTone
  /** Mientras true, ambos botones disabled, primary muestra spinner + pendingLabel. */
  isPending?: boolean
  /** Disabled del primary independiente de isPending (e.g. form inválido). NO afecta Cancel. */
  confirmDisabled?: boolean
  /** Icono opcional a la izquierda del label primary. */
  confirmIcon?: LucideIcon
  /** Override className del container (NO de los botones — esos son canónicos). */
  className?: string
  /**
   * Modo de ancho de los botones:
   *   - 'stretch' (default): cada botón usa flex-1, par ocupa todo el ancho.
   *     Use en footers que sólo contienen acciones.
   *   - 'auto': ancho natural según contenido + min-w del primary.
   *     Use cuando el footer también tiene contenido a la izquierda (ej:
   *     línea de auditoría USALI/CFDI en ConfirmCheckinDialog).
   */
  widthMode?: 'stretch' | 'auto'
}

const TONE_CLASSES: Record<DialogActionTone, string> = {
  primary:     'bg-emerald-600 hover:bg-emerald-700 text-white',
  destructive: 'bg-red-600     hover:bg-red-700     text-white',
  warning:     'bg-amber-600   hover:bg-amber-700   text-white',
  info:        'bg-slate-700   hover:bg-slate-800   text-white',
}

/**
 * Deriva el pending label desde el confirm label.
 * "Registrar pago" → "Registrando…"
 * "Guardar foto"   → "Guardando…"
 * "Anular"         → "Anulando…"
 * Fallback genérico si no se reconoce el patrón.
 */
function derivePendingLabel(label: string): string {
  const lower = label.toLowerCase().trim()
  const first = lower.split(/\s+/)[0]
  const stems: Record<string, string> = {
    registrar: 'Registrando…',
    guardar:   'Guardando…',
    anular:    'Anulando…',
    cancelar:  'Cancelando…',
    confirmar: 'Confirmando…',
    eliminar:  'Eliminando…',
    aplicar:   'Aplicando…',
    cargar:    'Cargando…',
    marcar:    'Procesando…',
    extender:  'Extendiendo…',
    mover:     'Moviendo…',
    restaurar: 'Restaurando…',
    enviar:    'Enviando…',
    cobrar:    'Procesando…',
    procesar:  'Procesando…',
  }
  return stems[first] ?? 'Procesando…'
}

export function DialogActions({
  onCancel, onConfirm,
  confirmLabel, confirmPendingLabel,
  cancelLabel = 'Cancelar',
  tone = 'primary',
  isPending = false,
  confirmDisabled = false,
  confirmIcon: Icon,
  className,
  widthMode = 'stretch',
}: Props) {
  const pendingLabel = confirmPendingLabel ?? derivePendingLabel(confirmLabel)
  const stretch = widthMode === 'stretch'

  return (
    <div className={cn('flex gap-2 items-center', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCancel}
        disabled={isPending}
        className={cn('text-xs h-9', stretch && 'flex-1')}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onConfirm}
        disabled={isPending || confirmDisabled}
        className={cn(
          'text-xs h-9',
          stretch ? 'flex-1' : 'min-w-[160px]',
          TONE_CLASSES[tone],
        )}
      >
        {Icon && !isPending && <Icon className="h-3.5 w-3.5 mr-1.5" />}
        {isPending ? pendingLabel : confirmLabel}
      </Button>
    </div>
  )
}
