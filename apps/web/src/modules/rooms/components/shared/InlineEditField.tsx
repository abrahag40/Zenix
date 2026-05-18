/**
 * InlineEditField — Sprint EDIT-RESERVATION
 *
 * Edit-in-place reusable siguiendo Apple HIG "Direct Manipulation"
 * (Hutchins/Hollan/Norman 1985). Display → click → input → Enter/blur save.
 *
 * Estados:
 *   idle    → texto display, hover muestra lápiz sutil
 *   editing → input con autofocus + select-all
 *   saving  → input disabled + spinner
 *   error   → border rojo + mensaje debajo
 *
 * Keyboard:
 *   Enter   → save
 *   Esc     → revert + idle
 *   Tab     → save + propaga focus al siguiente
 *
 * Performance: 0 re-renders innecesarios. Estado local; sólo notifica al
 * padre vía onSave (que dispara mutation). Sin context, sin Zustand.
 *
 * Apple HIG details aplicados:
 *   - Cursor cambia a text al hover (signifier)
 *   - Hover overlay sutil (no agresivo) — siguiendo iOS Notes pattern
 *   - Lápiz aparece solo en hover, no permanente (evita clutter)
 *   - Animation entrada/salida con --ease-spring (CLAUDE.md curves)
 *   - motion-reduce:duration-0 (WCAG 2.1 / a11y)
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InlineEditFieldProps {
  /** Valor actual (display). */
  value: string | number | null | undefined
  /** Llamado con el nuevo valor cuando el usuario confirma. Debe lanzar si falla
   *  (el componente atrapa el throw y entra en state error). */
  onSave: (newValue: string) => Promise<void> | void
  /** 'text' | 'email' | 'tel' | 'number' — tipo del input. */
  type?: 'text' | 'email' | 'tel' | 'number'
  /** Validación síncrona pre-save. Retorna mensaje de error o null si OK. */
  validate?: (value: string) => string | null
  /** Placeholder cuando value está vacío en display. */
  placeholder?: string
  /** Display formatter (e.g., currency, masking). */
  displayFormat?: (value: string | number | null | undefined) => string
  /** Disabled estado (e.g., post-checkout fiscal lock). */
  disabled?: boolean
  /** Tooltip cuando disabled. */
  disabledReason?: string
  /** Si true, en vez de save inmediato muestra confirmar via prop confirmBeforeSave. */
  requiresConfirmation?: boolean
  /** Si requiresConfirmation: callback que el padre maneja (ej. abre dialog
   *  con diff). Debe retornar true si el usuario confirmó. */
  confirmBeforeSave?: (newValue: string, oldValue: string) => Promise<boolean>
  /** Min/max para type=number. */
  min?: number
  max?: number
  step?: number
  /** ClassNames adicionales. */
  className?: string
  /** Label sr-only para accessibility. */
  ariaLabel?: string
}

export function InlineEditField({
  value,
  onSave,
  type = 'text',
  validate,
  placeholder = '—',
  displayFormat,
  disabled = false,
  disabledReason,
  requiresConfirmation = false,
  confirmBeforeSave,
  min, max, step,
  className,
  ariaLabel,
}: InlineEditFieldProps) {
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayValue = displayFormat ? displayFormat(value) : (value ?? '').toString()
  const currentString = value == null ? '' : String(value)

  // Auto-focus + select-all al entrar en edit. Performance: solo cuando editing
  // se vuelve true, no en cada render.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function enterEdit() {
    if (disabled || saving) return
    setDraft(currentString)
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft('')
    setError(null)
  }

  async function commitEdit() {
    // Si no cambió, salida limpia sin llamar al backend.
    if (draft === currentString) {
      cancelEdit()
      return
    }

    // Validación local antes de servidor (NN/g H5 — error prevention).
    if (validate) {
      const validationError = validate(draft)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    // Si requiere confirmación (rate change, pax, etc.), el padre maneja
    // diálogo con diff. Solo procede si el padre retorna true.
    if (requiresConfirmation && confirmBeforeSave) {
      const confirmed = await confirmBeforeSave(draft, currentString)
      if (!confirmed) {
        cancelEdit()
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setEditing(false)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
    // Tab: dejar comportamiento default + el blur dispara commit.
  }

  // ── Display mode ─────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <button
        type="button"
        onClick={enterEdit}
        disabled={disabled || saving}
        title={disabled ? disabledReason : 'Click para editar'}
        aria-label={ariaLabel ?? 'Editar campo'}
        className={cn(
          'group inline-flex items-center gap-1.5 max-w-full text-left',
          'px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded-md',
          'transition-colors motion-reduce:transition-none',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'hover:bg-slate-100 cursor-text',
          className,
        )}
      >
        <span className={cn(
          'truncate',
          !value && 'text-slate-400 italic',
        )}>
          {displayValue || placeholder}
        </span>
        {!disabled && (
          // Apple HIG signifier: el affordance debe ser perceptible sin
          // requerir hover. 40% opacity por defecto (sutil, no compite con
          // el valor), 100% al hover. Esto resuelve el reporte UX
          // "no sé qué se puede editar".
          <Pencil className="h-3 w-3 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        )}
      </button>
    )
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  return (
    <div className={cn('inline-flex flex-col gap-0.5 max-w-full', className)}>
      <div className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitEdit()}
          onKeyDown={handleKeyDown}
          disabled={saving}
          min={min} max={max} step={step}
          aria-label={ariaLabel ?? 'Campo editable'}
          className={cn(
            'min-w-0 flex-1 px-1.5 py-0.5 rounded-md text-sm',
            'border bg-white outline-none',
            'transition-shadow motion-reduce:transition-none',
            // Apple HIG: sin flechas spinner para inputs numéricos.
            '[-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0',
            error
              ? 'border-rose-400 ring-1 ring-rose-200'
              : 'border-emerald-400 ring-1 ring-emerald-200 focus:ring-emerald-300',
            saving && 'opacity-60',
          )}
        />
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin flex-shrink-0" />
        ) : (
          <>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()} // evita blur del input antes del click
              onClick={() => void commitEdit()}
              aria-label="Guardar"
              className="text-emerald-600 hover:text-emerald-800 p-0.5 rounded hover:bg-emerald-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancelEdit}
              aria-label="Cancelar"
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-rose-600 pl-1 leading-tight">{error}</p>
      )}
    </div>
  )
}
