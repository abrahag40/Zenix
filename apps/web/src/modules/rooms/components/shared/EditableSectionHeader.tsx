/**
 * EditableSectionHeader — Sprint EDIT-RESERVATION iter 3
 *
 * Header sticky reusable para tabs/secciones con bulk-edit mode.
 *
 * Justificación de diseño:
 *   · Apple HIG "Edit/Done": el toggle y su contraparte (Cancelar/Guardar)
 *     ocupan la MISMA posición visual. Reciprocidad = predictability.
 *   · NN/g "Sticky headers preserve action context as user navigates content."
 *     — el usuario nunca necesita scroll para encontrar el save.
 *   · Mews/Cloudbeds confirman el pattern en reservation inspectors.
 *
 * Diseño visual:
 *   · Sticky top-0 dentro del scroll del tab.
 *   · Backdrop blur sutil (95% opacity) para legibilidad sobre cualquier fondo
 *     que pase por debajo (iOS-style frosted glass).
 *   · z-10 para superponerse a tarjetas inferiores sin tapar dialogs (z-50+).
 *   · Border-b para separar visualmente del content scrolleable.
 *
 * Estados:
 *   · disabled (canEdit=false) → sin botón, solo título (e.g. reserva cancelada).
 *   · idle (no editMode)       → [✎ Editar] a la derecha.
 *   · editing                  → [Cancelar] [✓ Guardar] a la derecha.
 *   · saving                   → ambos botones disabled, "Guardando…" en CTA.
 */
import { Check, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  editMode: boolean
  canEdit: boolean
  isSaving?: boolean
  /** Botón Editar disabled (tooltip explica por qué). */
  disabledReason?: string
  onEnterEdit: () => void
  onCancel:    () => void
  onSave:      () => void
  /** Etiqueta opcional del CTA — default "Guardar cambios". */
  saveLabel?: string
  /** Tono del save button — emerald (default) o amber (cambios con impacto). */
  saveTone?: 'emerald' | 'amber'
}

export function EditableSectionHeader({
  title, editMode, canEdit, isSaving = false,
  disabledReason,
  onEnterEdit, onCancel, onSave,
  saveLabel = 'Guardar cambios',
  saveTone = 'emerald',
}: Props) {
  return (
    <div
      className={cn(
        // Sticky dentro del padre overflow-y-auto. -mx-4 -mt-4 cancela el
        // padding del TabsContent → header span full width.
        // Apple Notes/Reminders header height ~28-30px → py-1.5 + content = ~28px.
        'sticky top-0 z-10 -mx-4 -mt-4 px-4 py-1.5 mb-2',
        'bg-white/95 backdrop-blur-sm',
        'border-b border-slate-100',
        'flex items-center justify-between gap-2 min-h-[28px]',
      )}
    >
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
        {title}
      </span>

      {!editMode && (
        canEdit ? (
          <button
            type="button"
            onClick={onEnterEdit}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium',
              'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50',
              'transition-colors motion-reduce:transition-none',
            )}
            aria-label={`Editar ${title.toLowerCase()}`}
          >
            <Pencil className="h-3 w-3" />
            Editar
          </button>
        ) : disabledReason ? (
          <span className="text-[10px] text-slate-400 italic truncate" title={disabledReason}>
            {disabledReason}
          </span>
        ) : null
      )}

      {editMode && (
        <div className="flex gap-1.5 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="h-7 px-2.5 text-[11px]"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className={cn(
              'h-7 px-2.5 text-[11px] text-white',
              saveTone === 'emerald' && 'bg-emerald-600 hover:bg-emerald-700',
              saveTone === 'amber'   && 'bg-amber-600   hover:bg-amber-700',
            )}
          >
            {isSaving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Guardando…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Check className="h-3 w-3" />
                {saveLabel}
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
