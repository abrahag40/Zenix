/**
 * useSSE — Suscripción a eventos SSE.
 *
 * Sprint SSE-RESILIENCE (2026-05-17): refactor a singleton subscriber.
 *
 * Antes: cada llamada a useSSE creaba SU PROPIA EventSource. Con HMR los
 * cleanups racean, los preflights quedan en flight, las connections se
 * acumulan y agotan el pool HTTP/1.1 de Chrome → POSTs colgaban.
 *
 * Ahora: useSSE solo registra un handler en el singleton sseClient. La
 * EventSource real es ÚNICA por tab — múltiples llamadas a useSSE
 * comparten la misma conn. HMR re-monta el subscriber pero la conn
 * persiste → zero accumulation.
 *
 * API pública IDÉNTICA al hook anterior — los call sites NO requieren cambios.
 */
import { useEffect, useRef } from 'react'
import type { SseEvent } from '@zenix/shared'
import { subscribeSse } from '../lib/sseClient'

type Handler = (event: SseEvent) => void

export function useSSE(onEvent: Handler) {
  // Ref pattern para que handler change no force re-subscribe
  // (importante para callers que pasan inline arrow functions).
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    const unsub = subscribeSse((event) => handlerRef.current(event))
    return unsub
  }, [])
}
