/**
 * useStayUpdatedSSE — Sprint EDIT-RESERVATION
 *
 * Suscribe el componente al stream SSE central (useSSE) y emite un toggle
 * `staleByOtherSession: boolean` cuando llega un evento `stay:updated` o
 * `stay:note:created` que afecta a `stayId` Y fue disparado por OTRO actor.
 *
 * Patrón Google Docs presence (lite): el cliente no fuerza refresh — muestra
 * banner para que el usuario decida (preservar trabajo en curso vs. ver lo
 * último). Apple HIG: "system status visible, respect user agency".
 *
 * Performance:
 *   - 1 listener piggyback sobre el SSE global ya abierto (no abre socket nuevo).
 *   - Filtro temprano por stayId — cualquier evento de otra reserva se descarta.
 *   - Filtro por actorId — no muestra banner por mis propias escrituras.
 */
import { useState, useEffect, useCallback } from 'react'
import type { SseEvent } from '@zenix/shared'
import { useSSE } from '@/hooks/useSSE'

interface UseStayUpdatedSSEOpts {
  stayId:        string | null
  currentUserId: string | null
  /** Si true, el banner se reinicia (típicamente al refetchear/cerrar/abrir). */
  reset?: number  // change este número para resetear (e.g. Date.now() de último refetch)
}

interface UseStayUpdatedSSEResult {
  /** True si una sesión EXTERNA escribió esta stay desde el último reset. */
  staleByOtherSession: boolean
  /** Limpiar el flag manualmente (después de refresh acción del user). */
  dismiss: () => void
}

export function useStayUpdatedSSE({
  stayId, currentUserId, reset,
}: UseStayUpdatedSSEOpts): UseStayUpdatedSSEResult {
  const [staleByOtherSession, setStale] = useState(false)

  // Reset cuando cambia el prop reset (e.g., cuando re-fetcheas).
  useEffect(() => { setStale(false) }, [reset, stayId])

  useSSE((event: SseEvent) => {
    if (!stayId) return
    if (event.type !== 'stay:updated'
        && event.type !== 'stay:note:created'
        && event.type !== 'stay:note:updated') return

    const data = event.data as { stayId?: string; actorId?: string }
    if (data.stayId !== stayId) return
    // Ignora mis propias escrituras — el optimistic update + refetch local
    // ya cubrió el cambio.
    if (data.actorId && currentUserId && data.actorId === currentUserId) return

    setStale(true)
  })

  const dismiss = useCallback(() => setStale(false), [])

  return { staleByOtherSession, dismiss }
}
