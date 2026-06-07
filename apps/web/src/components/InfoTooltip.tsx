/**
 * InfoTooltip — primitive (?) icon que explica un término técnico inline.
 *
 * Diseñado para resolver el gap UX detectado 2026-06-06 ("dashboard
 * no enfocado para personas sin background hotelero"). Apple HIG +
 * NN/g 2017 "Dashboards Made Useful" — toda métrica debe explicarse
 * en 1 oración accesible al hover/focus.
 *
 * Uso:
 *   <InfoTooltip text="Ocupación es el % de cuartos vendidos sobre el total disponible." />
 *
 * - Hover/focus muestra tooltip arriba del icon
 * - Keyboard accesible (tabindex=0 + role=button)
 * - Sin dependencia Radix — implementación CSS para que no aumente bundle
 * - max-w-xs (~20rem) — fits 2-3 líneas de copy plain language
 */
import { HelpCircle } from 'lucide-react'

interface InfoTooltipProps {
  text: string
  /** Tono del icon — default slate-400 (sutil). Use 'emphasis' para destacar. */
  tone?: 'subtle' | 'emphasis'
  /** Posición del bubble — default 'top'. 'bottom' útil cuando el card está al top de la pantalla. */
  position?: 'top' | 'bottom'
}

export function InfoTooltip({ text, tone = 'subtle', position = 'top' }: InfoTooltipProps) {
  const iconColor = tone === 'emphasis' ? 'text-indigo-500' : 'text-gray-400 hover:text-gray-600'
  const bubbleY =
    position === 'top'
      ? 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'
      : 'top-full mt-1.5 left-1/2 -translate-x-1/2'
  const arrowY =
    position === 'top'
      ? 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent'
      : 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 border-l-transparent border-r-transparent border-t-transparent'

  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        tabIndex={0}
        className={`inline-flex items-center justify-center rounded-full transition-colors ${iconColor} focus:outline-none focus:ring-2 focus:ring-indigo-300`}
        aria-label="Explicación"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className={`absolute ${bubbleY} z-50 hidden group-hover:flex group-focus-within:flex
          bg-gray-900 text-white text-[11px] leading-snug
          px-2.5 py-2 rounded-md shadow-lg
          w-64 max-w-xs whitespace-normal text-left
          pointer-events-none`}
      >
        {text}
        <span
          aria-hidden="true"
          className={`absolute ${arrowY} w-0 h-0 border-4`}
        />
      </span>
    </span>
  )
}
