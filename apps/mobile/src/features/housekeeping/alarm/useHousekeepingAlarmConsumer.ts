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

import { useEffect } from 'react'
import { router } from 'expo-router'
import { CleaningStatus } from '@zenix/shared'
import { useAuthStore } from '../../../store/auth'
import { useTaskStore } from '../../../store/tasks'
import { registerSseConsumer } from '../../../api/useGlobalSSEListener'
import { alarmService } from '../../../notifications/alarmService'
import type { AlarmPayload } from '../../../notifications/types'

/** Cooldown post-acknowledgment para no re-disparar la misma tarea.
 *  10 min: cubre ciclos de test (>1min) y reload accidental sin re-fire. */
const RESHOW_COOLDOWN_MS = 10 * 60 * 1000

/** Ventana de "tarea reciente" para Mechanism 2 (fallback).
 *  Solo dispara alarma para tareas creadas en los últimos 5 min — si la
 *  tarea es más vieja, asumimos que SSE ya la procesó (el usuario ya la
 *  vio o la silenció). Sin esta ventana, un reload de Mi día disparaba
 *  cascada de alarmas viejas (issue reportado por usuario). */
const RECENT_TASK_WINDOW_MS = 5 * 60 * 1000

/** Module-level cooldown Map — persiste entre remounts del componente.
 *  Antes era useRef → se reseteaba al recargar Mi día → todas las tareas
 *  volvían a ser elegibles → alarmas en cascada. Module-level lo evita
 *  durante la sesión del app (se resetea solo en restart de Metro). */
const lastShownAt = new Map<string, number>()

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

      // Respeta cooldown también en el path SSE — evita doble disparo si
      // el server emite duplicados o si Mechanism 2 ya la disparó.
      const lastShown = lastShownAt.get(d.taskId) ?? 0
      if (Date.now() - lastShown < RESHOW_COOLDOWN_MS) return

      lastShownAt.set(d.taskId, Date.now())
      alarmService.show(
        buildAlarmPayload(d.taskId, d.roomNumber, !!d.hasSameDayCheckIn, d.carryoverFromDate),
      )
    })
  }, [user?.id, user?.role])

  // ── Mechanism 2: Task store watcher (fallback for missed SSE events) ─
  // Caso de uso: app cerrada cuando llegó el evento SSE → al abrirse,
  // fetchTasks() detecta una task READY recién creada y dispara la alarma.
  //
  // CRÍTICO — solo procesa tareas RECIENTES (<5 min):
  //   - Sin esta ventana, un reload de Mi día disparaba cascada de alarmas
  //     viejas (cada cambio de tasks fire-aba la siguiente READY que aún no
  //     estaba en cooldown).
  //   - Con SSE funcionando bien (commit bcdb72a), las tareas viejas YA
  //     fueron disparadas o silenciadas por el usuario — no requieren
  //     re-disparo.
  //
  // Cooldown module-level (lastShownAt fuera del hook) → persiste entre
  // remounts. Antes useRef → se reseteaba al recargar Mi día → re-fire.
  useEffect(() => {
    if (!user?.id || user.role !== 'HOUSEKEEPER') return
    if (alarmService.getCurrent()) return  // alarm already active

    const now = Date.now()

    // Filtrar tareas recientes + en READY + asignadas al usuario.
    // Sort DESC por createdAt — la más reciente refleja el último checkout.
    const readyTasks = tasks
      .filter((t) => t.status === CleaningStatus.READY && t.assignedToId === user.id)
      .filter((t) => now - new Date(t.createdAt).getTime() < RECENT_TASK_WINDOW_MS)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Pick la primera que NO esté en cooldown (module-level, persiste).
    const readyTask = readyTasks.find((t) => {
      const lastShown = lastShownAt.get(t.id) ?? 0
      return now - lastShown >= RESHOW_COOLDOWN_MS
    })
    if (!readyTask) return

    const roomNumber = readyTask.unit?.room?.number
    if (!roomNumber) return

    lastShownAt.set(readyTask.id, now)
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
