/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * §175 D-NOVA-17 — Impersonation banner persistente.
 *
 * Cuando un PARTNER_MEMBER / PARTNER_ADMIN / PLATFORM_ADMIN opera onBehalfOf
 * un ORG_OWNER, el shell renderiza este stripe AMBER top con:
 *   "Actuando como [Nombre cliente] · razón: [reason] · [Finalizar]"
 *
 * Especificaciones:
 *   - `position: sticky; top: 0; z-index: 50` POR ENCIMA de todo (modales,
 *     drawers, sheets). Sin esto el consultor olvida que está impersonating
 *     y escribe acciones como sí mismo (UX-as-safety §175).
 *   - Color amber-500 background, white text. Contrast WCAG AA.
 *   - Botón Finalizar es destructive — confirma + clear store.
 *   - Mobile-first: en pantallas <640px reduce padding, mantiene un solo
 *     row con truncate.
 *
 * Imports: solo Zustand store. NO depende de routing — vive en root layout.
 */
import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useNovaStore } from '../../store/nova'

export function ImpersonationBanner() {
  const onBehalfOfUserId = useNovaStore((s) => s.onBehalfOfUserId)
  const impersonationReason = useNovaStore((s) => s.impersonationReason)
  const actingOrgName = useNovaStore((s) => s.actingOrgName)
  const stopImpersonation = useNovaStore((s) => s.stopImpersonation)
  const [confirming, setConfirming] = useState(false)

  if (!onBehalfOfUserId) return null

  const handleStop = () => {
    if (!confirming) {
      setConfirming(true)
      // auto-reset confirmation state si no clickea en 4s
      setTimeout(() => setConfirming(false), 4000)
      return
    }
    stopImpersonation()
    setConfirming(false)
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-amber-500 text-white shadow-md"
    >
      <div className="flex items-center gap-3 px-4 py-2 max-w-screen-2xl mx-auto">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 text-[13px] leading-snug">
          <span className="font-semibold">
            Actuando en nombre del cliente{actingOrgName ? ` ${actingOrgName}` : ''}
          </span>
          {impersonationReason && (
            <span className="ml-2 text-amber-50 truncate">
              · razón: <span className="italic">{impersonationReason}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleStop}
          className={
            'flex-shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ' +
            (confirming
              ? 'bg-red-700 hover:bg-red-800 text-white'
              : 'bg-amber-700 hover:bg-amber-800 text-white')
          }
          aria-label={confirming ? 'Confirmar finalizar impersonation' : 'Finalizar impersonation'}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {confirming ? 'Click de nuevo para confirmar' : 'Finalizar'}
        </button>
      </div>
    </div>
  )
}
