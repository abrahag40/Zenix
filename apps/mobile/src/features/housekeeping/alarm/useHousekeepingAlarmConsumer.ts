/**
 * useHousekeepingAlarmConsumer — escucha SSE 'task:ready' y llama
 * alarmService.show() cuando el evento corresponde al housekeeper actual.
 *
 * Responsabilidad única: traducir el evento SSE al AlarmPayload genérico
 * y delegarlo al sistema centralizado de alarmas.
 *
 * Llamar desde app/_layout.tsx (o cualquier componente raíz) una sola vez.
 * Para agregar un nuevo módulo de alarma (mantenimiento, etc.) crear un
 * hook análogo y agregarlo al mismo sitio.
 *
 * Filtros aplicados:
 *   - Solo HOUSEKEEPER (recepcionistas ven el evento en su dashboard web)
 *   - Solo si assignedToId === currentUser.id
 *
 * Doble mecanismo de disparo:
 *   1. SSE push (primario, inmediato) — dispara cuando el evento llega.
 *   2. Task store watcher (fallback) — si el evento SSE se perdió por
 *      reconexión, este watch captura la tarea READY cuando el store
 *      se actualiza. Cooldown de 2 min evita re-disparo inmediato
 *      tras acknowledgment; permite re-disparar en ciclos test (≥1 min).
 */

import { useEffect, useRef } from 'react'
import { router } from 'expo-router'
import { CleaningStatus } from '@zenix/shared'
import { useAuthStore } from '../../../store/auth'
import { useTaskStore } from '../../../store/tasks'
import { registerSseConsumer } from '../../../api/useGlobalSSEListener'
import { alarmService } from '../../../notifications/alarmService'
import type { AlarmPayload } from '../../../notifications/types'

/** Prevent immediate re-show after acknowledgment. 2 min covers test cycles ≥ 1 min. */
const RESHOW_COOLDOWN_MS = 2 * 60 * 1000

function buildAlarmPayload(
  taskId: string,
  roomNumber: string,
  hasSameDayCheckIn: boolean,
  carryoverFromDate: string | null | undefined,
): AlarmPayload {
  const hasCarryover = !!carryoverFromDate
  const isDoubleUrgent = hasSameDayCheckIn && hasCarryover

  const accent = isDoubleUrgent ? '#F87171' : hasSameDayCheckIn ? '#FBBF24' : '#34D399'

  const badges: AlarmPayload['badges'] = []
  if (isDoubleUrgent) {
    badges.push({ text: '🔴⚠️ Doble urgente', tint: '#F87171' })
  } else {
    if (hasSameDayCheckIn) badges.push({ text: '🔴 Hoy entra', tint: '#FBBF24' })
    if (hasCarryover)      badges.push({ text: '⚠️ De ayer', tint: '#F59E0B' })
  }

  const urgentSuffix    = hasSameDayCheckIn ? ' · Hoy entra huésped 🔴' : ''
  const carryoverSuffix = hasCarryover      ? ' · De ayer ⚠️'           : ''

  return {
    id:     taskId,
    module: 'housekeeping',

    sectionLabel: 'HABITACIÓN LISTA PARA LIMPIAR',
    entityLabel:  'Hab.',
    entityValue:  roomNumber,
    caption:
      'Recepción acaba de confirmar la salida del huésped. ' +
      'Cuando estés en ruta, desliza abajo para silenciar la alarma.',
    badges,
    accent,

    notificationTitle:    '🔔 Habitación lista para limpiar',
    notificationBody:     `Hab. ${roomNumber}${urgentSuffix}${carryoverSuffix}`,
    notificationChannelId: 'task-alarm',

    onAcknowledge: () => router.replace('/(app)/trabajo'),
  }
}

export function useHousekeepingAlarmConsumer(): void {
  const user = useAuthStore((s) => s.user)
  const tasks = useTaskStore((s) => s.tasks)

  // Tracks the last time we showed an alarm per taskId.
  // Prevents immediate re-show after acknowledgment while allowing
  // re-firing after RESHOW_COOLDOWN_MS (covers test alarm cycles).
  const lastShownAt = useRef(new Map<string, number>())

  // ── Mechanism 1: SSE push (primary, immediate) ────────────────────
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

      lastShownAt.current.set(d.taskId, Date.now())
      alarmService.show(
        buildAlarmPayload(d.taskId, d.roomNumber, !!d.hasSameDayCheckIn, d.carryoverFromDate),
      )
    })
  }, [user?.id, user?.role])

  // ── Mechanism 2: Task store watcher (fallback for missed SSE events) ─
  // Fires whenever the task list changes (e.g. after SSE reconnect triggers
  // fetchTasks). Shows alarm for any READY task not in cooldown.
  useEffect(() => {
    if (!user?.id || user.role !== 'HOUSEKEEPER') return
    if (alarmService.getCurrent()) return  // alarm already active

    const readyTask = tasks.find(
      (t) => t.status === CleaningStatus.READY && t.assignedToId === user.id,
    )
    if (!readyTask) return

    const roomNumber = readyTask.unit?.room?.number
    if (!roomNumber) return

    const lastShown = lastShownAt.current.get(readyTask.id) ?? 0
    if (Date.now() - lastShown < RESHOW_COOLDOWN_MS) return

    lastShownAt.current.set(readyTask.id, Date.now())
    alarmService.show(
      buildAlarmPayload(
        readyTask.id,
        roomNumber,
        readyTask.hasSameDayCheckIn,
        readyTask.carryoverFromDate,
      ),
    )
  }, [tasks, user?.id, user?.role])
}
