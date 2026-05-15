/**
 * useNotificationAlerts — listener SSE global que dispara sonido + banner
 * para notificaciones URGENT/HIGH cuando llegan en tiempo real.
 *
 * Sprint Mx-1B-W3 W3.5 / §56 D16 — cubre el caso "el usuario no tiene el
 * bell visible" (otra pestaña abierta, scrolled away, en otra página).
 *
 * Acciones por priority:
 *   · URGENT → sound urgent + sonner banner persistent (6s) con action "Ver"
 *   · HIGH   → sound soft + sonner banner 4s con action "Ver"
 *   · MEDIUM → sound soft + sonner toast info 3s sin action
 *   · LOW    → silencioso (solo actualiza badge)
 *
 * El banner respeta §32 CLAUDE.md feedback informativo: título + body +
 * acción explícita ("Ver" abre el GlobalMaintenanceDrawer o navega).
 *
 * Montar UNA sola vez a nivel App.tsx para evitar múltiples listeners.
 */
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSSE } from './useSSE'
import {
  useMaintenanceDrawer,
  parseMaintenanceTicketUrl,
} from '@/store/maintenanceDrawer'

interface NotifNewEvent {
  id: string
  title: string
  body: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  category: string
  actionUrl: string | null
}

export function useNotificationAlerts(): void {
  const openMaintenanceDrawer = useMaintenanceDrawer((s) => s.open)
  // Dedupe: si SSE re-conecta puede repetir el evento. Ignoramos ids ya vistos.
  const seenIds = useRef<Set<string>>(new Set())

  useSSE((event) => {
    if (event.type !== 'notification:new') return
    const data = event.data as NotifNewEvent
    if (!data?.id || seenIds.current.has(data.id)) return
    seenIds.current.add(data.id)

    // Sonido deshabilitado 2026-05-15 — feedback del usuario:
    // "Quitar el sonido en web". El banner sonner queda como único feedback
    // visual de URGENT/HIGH. Si se desea reactivar, restaurar imports y
    // bloque `playNotificationSound(soundLevel)` de notificationSound.ts.

    // Banner — solo URGENT y HIGH (operacionalmente significativos).
    // MEDIUM/LOW van solo al panel sin interrumpir el flujo del usuario.
    if (data.priority !== 'URGENT' && data.priority !== 'HIGH') return

    const isUrgent = data.priority === 'URGENT'
    const onAction = data.actionUrl
      ? () => {
          const id = parseMaintenanceTicketUrl(data.actionUrl!)
          if (id) openMaintenanceDrawer(id)
          // Para otros actionUrl no manejados, sonner cierra el toast solo.
        }
      : undefined

    if (isUrgent) {
      toast.error(data.title, {
        description: data.body,
        duration: 8000,
        action: onAction ? { label: 'Ver', onClick: onAction } : undefined,
      })
    } else {
      toast.warning(data.title, {
        description: data.body,
        duration: 5000,
        action: onAction ? { label: 'Ver', onClick: onAction } : undefined,
      })
    }
  })
}
