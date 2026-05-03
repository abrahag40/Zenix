/**
 * IncomingTaskAlarmHost — escucha SSE 'task:ready' a nivel global y
 * dispara el overlay IncomingTaskAlarm cuando el evento corresponde
 * al usuario actual.
 *
 * Mounted a nivel root (app/_layout.tsx) para que la alarma aparezca
 * sin importar en qué tab/screen esté el usuario.
 *
 * Filtros:
 *   - Solo dispara si event.data.assignedToId === currentUserId
 *   - Solo dispara si role === 'HOUSEKEEPER' (recepcionistas no
 *     necesitan vibración por cada habitación lista — ya lo ven en
 *     su dashboard)
 *   - Si ya hay una alarma activa, ignora el nuevo evento (queueing
 *     no aplica — el HK acknowledge la actual primero, luego viene
 *     la siguiente al hacer pull-to-refresh o por SSE)
 */

import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useAuthStore } from '../../../store/auth'
import { registerSseConsumer } from '../../../api/useGlobalSSEListener'
import { IncomingTaskAlarm, type IncomingTaskInfo } from './IncomingTaskAlarm'

export function IncomingTaskAlarmHost() {
  const user = useAuthStore((s) => s.user)
  const [activeAlarm, setActiveAlarm] = useState<IncomingTaskInfo | null>(null)

  // Fire OS system notification when alarm becomes active; dismiss when acknowledged.
  // This ensures the user sees a banner + hears the OS sound even when the
  // app is backgrounded or the screen just woke up.
  useEffect(() => {
    if (!activeAlarm) {
      void Notifications.dismissAllNotificationsAsync()
      return
    }
    const urgentSuffix = activeAlarm.hasSameDayCheckIn ? ' · Hoy entra huésped 🔴' : ''
    const carryoverSuffix = activeAlarm.hasCarryover ? ' · De ayer ⚠️' : ''
    void Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Habitación lista para limpiar',
        body: `Hab. ${activeAlarm.roomNumber}${urgentSuffix}${carryoverSuffix}`,
        sound: true,
        data: { taskId: activeAlarm.taskId, type: 'task:ready' },
        ...(Platform.OS === 'android' ? { channelId: 'task-alarm' } : {}),
      },
      trigger: null, // fire immediately
    })
  }, [activeAlarm])

  useEffect(() => {
    if (!user?.id || user.role !== 'HOUSEKEEPER') return
    return registerSseConsumer(['task:ready'], (event) => {
      const d = event.data as {
        taskId?: string
        roomNumber?: string
        assignedToId?: string
        hasSameDayCheckIn?: boolean
        carryoverFromDate?: string | null
      }
      if (!d.assignedToId || d.assignedToId !== user.id) return
      if (!d.taskId || !d.roomNumber) return
      // If alarm already active, ignore — the HK must ACK the current one first.
      setActiveAlarm((prev) => prev ?? {
        taskId: d.taskId!,
        roomNumber: d.roomNumber!,
        hasSameDayCheckIn: !!d.hasSameDayCheckIn,
        hasCarryover: !!d.carryoverFromDate,
      })
    })
  }, [user?.id, user?.role])

  const handleAcknowledge = () => {
    setActiveAlarm(null)
    router.replace('/(app)/trabajo')
  }

  return (
    <IncomingTaskAlarm
      task={activeAlarm}
      onAcknowledge={handleAcknowledge}
    />
  )
}
