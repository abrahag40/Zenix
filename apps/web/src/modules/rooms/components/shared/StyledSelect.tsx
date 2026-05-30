/**
 * StyledSelect — Dropdown ZaharDev in-house para enums de baja cardinalidad.
 *
 * Patrón visual idéntico al CountryCombobox (single source de estilo de
 * inputs de selección en Zenix) pero SIN search bar — pensado para listas
 * de 2-10 opciones (género, tipo de documento, prioridad, etc.).
 *
 * Sprint CHECK-IN C1.11 (2026-05-29). Justificación vs native `<select>`:
 *   - Native select no se puede tematizar al 100% (dropdown OS-controlled).
 *   - Inconsistencia visual con CountryCombobox rompe NN/g H4 Consistency.
 *   - Apple HIG Inputs prefiere custom dropdown cuando hay design system.
 *
 * Tech:
 *   - Radix Popover para el dropdown panel (nesting nativo, focus mgmt).
 *   - Keyboard navigation: ArrowUp/Down, Enter para seleccionar, Esc cierra.
 *   - Mismo pattern de hover/focus que CountryCombobox.
 */
import { useState, useRef, useEffect } from 'react'
import { Popover } from 'radix-ui'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StyledSelectOption = {
  value: string
  label: string
  /** opcional: icono emoji o JSX a la izquierda del label */
  icon?: React.ReactNode
  /** opcional: descripción secundaria pequeña debajo del label */
  hint?: string
}

interface Props {
  /** Valor actualmente seleccionado (matcha contra option.value). */
  value: string
  onChange: (value: string) => void
  options: StyledSelectOption[]
  placeholder?: string
  /** Mostrar borde de error rojo. */
  hasError?: boolean
  disabled?: boolean
  /** Auto-focus al trigger en mount (útil con `editing` state). */
  autoFocus?: boolean
  /** CHECK-IN C1.18 — counter para retriggear shake animation cuando
   *  hasError. Cambio del valor = animación replays. Estándar Zenix. */
  shakeNonce?: number
}

export function StyledSelect({
  value, onChange, options, placeholder = 'Seleccionar…',
  hasError, disabled, autoFocus, shakeNonce = 0,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selected = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value)
      setActiveIdx(idx >= 0 ? idx : 0)
    }
  }, [open, value, options])

  function handleKey(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, options.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const o = options[activeIdx]
        if (o) {
          onChange(o.value)
          setOpen(false)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          key={hasError ? `err-${shakeNonce}` : 'ok'}
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onKeyDown={handleKey}
          className={cn(
            'w-full h-9 inline-flex items-center justify-between gap-2',
            'rounded-md border bg-white px-3 text-sm text-left',
            'transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
            hasError ? 'border-red-400 shake-x' : 'border-slate-200 hover:border-slate-300',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 min-w-0">
              {selected.icon && <span className="shrink-0 leading-none">{selected.icon}</span>}
              <span className="truncate text-slate-900">{selected.label}</span>
            </span>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
          <ChevronDown className={cn(
            'h-4 w-4 text-slate-400 shrink-0 transition-transform',
            open && 'rotate-180',
          )} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-[1000] min-w-[var(--radix-popover-trigger-width)] rounded-md border border-slate-200 bg-white shadow-lg p-1 max-h-[300px] overflow-y-auto"
          align="start"
          sideOffset={4}
          onKeyDown={handleKey}
        >
          {options.map((o, idx) => {
            const isSelected = o.value === value
            const isActive   = idx === activeIdx
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-sm text-left',
                  isActive && !isSelected && 'bg-slate-100',
                  isSelected && 'bg-emerald-50 text-emerald-800',
                  !isActive && !isSelected && 'hover:bg-slate-50',
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {o.icon && <span className="shrink-0 leading-none">{o.icon}</span>}
                  <span className="flex flex-col min-w-0">
                    <span className="truncate font-medium">{o.label}</span>
                    {o.hint && <span className="text-[11px] text-slate-500 truncate">{o.hint}</span>}
                  </span>
                </span>
                {isSelected && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
              </button>
            )
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
