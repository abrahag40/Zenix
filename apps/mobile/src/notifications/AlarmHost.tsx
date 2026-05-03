/**
 * AlarmHost — componente raíz que conecta alarmService con AlarmOverlay
 * y gestiona las notificaciones OS para el caso de pantalla bloqueada.
 *
 * Mounted en app/_layout.tsx (por encima de cualquier tab o screen) para
 * que la alarma aparezca sin importar en qué pantalla esté el usuario.
 *
 * Responsabilidades:
 *   1. Escucha alarmService y mantiene el estado local del alarm activo.
 *   2. Programa/descarta la notificación OS (lock-screen delivery).
 *   3. Renderiza AlarmOverlay con el payload activo.
 *
 * Por qué la notificación OS siempre se programa (no solo en background):
 *   El setNotificationHandler en notifications.ts suprime el banner cuando
 *   la app está activa (shouldShowBanner: false para alarm:true), pero
 *   sigue guardando la notificación en la bandeja. Si el usuario bloquea
 *   el teléfono después de que el alarm se activa, la notificación aparece
 *   en la pantalla de bloqueo automáticamente porque el OS no consultó el
 *   handler — lo consulta solo cuando la app está en primer plano.
 */

import { useCallback, useEffect, useState } from 'react'
import { alarmService } from './alarmService'
import {
  scheduleLocalNotification,
  dismissAllLocalNotifications,
} from './scheduleLocalNotification'
import { AlarmOverlay } from './AlarmOverlay'
import type { AlarmPayload } from './types'

export function AlarmHost() {
  const [activeAlarm, setActiveAlarm] = useState<AlarmPayload | null>(null)

  // Subscribe to alarm service
  useEffect(() => alarmService.subscribe(setActiveAlarm), [])

  // OS notification — scheduled siempre para cubrir el caso de pantalla bloqueada.
  // El notification handler suprime el banner en foreground (ver notifications.ts).
  useEffect(() => {
    if (!activeAlarm) {
      void dismissAllLocalNotifications()
      return
    }
    void scheduleLocalNotification({
      title: activeAlarm.notificationTitle,
      body: activeAlarm.notificationBody,
      data: { alarm: true, module: activeAlarm.module, id: activeAlarm.id },
      channelId: activeAlarm.notificationChannelId,
    })
  }, [activeAlarm])

  const handleAcknowledge = useCallback(() => {
    const alarm = activeAlarm
    alarmService.dismiss()
    alarm?.onAcknowledge()
  }, [activeAlarm])

  return <AlarmOverlay alarm={activeAlarm} onAcknowledge={handleAcknowledge} />
}
