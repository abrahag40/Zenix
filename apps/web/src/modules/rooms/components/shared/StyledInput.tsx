/**
 * StyledInput — Text input ZaharDev in-house.
 *
 * Mismo lenguaje visual que `StyledSelect` y `CountryCombobox` — single
 * source de estilo de inputs en Zenix. h-9, rounded-md, border-slate-200,
 * focus ring emerald-300, hover border slate-300.
 *
 * Sprint CHECK-IN C1.12 (2026-05-29). NN/g H4 Consistency: todos los
 * controles de form (input/select/combobox) deben tener mismo height,
 * border-radius, padding y feedback states.
 *
 * Wrap del `<input>` HTML nativo: pasa todos los props extra al input
 * (placeholder, value, onChange, type, maxLength, onBlur, autoFocus, etc).
 */
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
  /** CHECK-IN C1.18 — counter para retriggear shake cuando hasError.
   *  Cambio del valor = animación replays. Estándar Zenix system-wide. */
  shakeNonce?: number
}

export const StyledInput = forwardRef<HTMLInputElement, Props>(
  function StyledInput({ className, hasError, shakeNonce = 0, ...props }, ref) {
    return (
      <input
        // key: cuando hasError cambia o shakeNonce incrementa, el input
        // se remonta y la animación shake corre fresh (caso retry click).
        key={hasError ? `err-${shakeNonce}` : 'ok'}
        ref={ref}
        {...props}
        className={cn(
          'w-full h-9 rounded-md border bg-white px-3 text-sm text-slate-900',
          'placeholder:text-slate-400 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
          hasError ? 'border-red-400 shake-x' : 'border-slate-200 hover:border-slate-300',
          props.disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      />
    )
  },
)
