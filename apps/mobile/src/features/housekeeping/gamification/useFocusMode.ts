/**
 * useFocusMode — protección del flow state durante limpieza activa.
 *
 * Justificación (Csikszentmihalyi 1990):
 *   El flow state requiere ausencia de interrupciones. Cuando el HK
 *   está limpiando una habitación, abrir la app y ver tabs colgando
 *   distrae. Apple Health "Mindful Sessions" oculta toda la chrome
 *   UI durante la sesión activa por la misma razón.
 *
 * Comportamiento:
 *   - Detecta tareas en IN_PROGRESS asignadas al usuario actual
 *   - Cuando hay al menos una → focus mode activo
 *   - El tab layout puede leer este hook y ocultar tabBar
 *   - El push handler puede silenciar notificaciones no-críticas
 *
 * Privacy: no expone qué tarea — solo el booleano.
 */

import { useMemo } from 'react'
import { CleaningStatus } from '@zenix/shared'
import { useTaskStore } from '../../../store/tasks'
import { useAuthStore } from '../../../store/auth'

export interface FocusModeState {
  /** True if the staff has at least one IN_PROGRESS or PAUSED task. */
  isFocused: boolean
  /** Number of tasks currently active. Useful for "1 of 3" labels. */
  activeCount: number
  /** First task id — Sprint 9 can route directly to it from the focus banner. */
  primaryTaskId: string | null
  /** Pre-formatted "Limpiando · Hab. 203" for the focus banner. */
  primaryRoomLabel: string | null
}

export function useFocusMode(): FocusModeState {
  const userId = useAuthStore((s) => s.user?.id)
  const tasks = useTaskStore((s) => s.tasks)

  return useMemo(() => {
    if (!userId) return EMPTY
    const active = tasks.filter(
      (t) =>
        t.assignedToId === userId &&
        (t.status === CleaningStatus.IN_PROGRESS ||
          t.status === CleaningStatus.PAUSED),
    )
    if (active.length === 0) return EMPTY

    const primary = active[0]
    const roomNum = primary.unit?.room?.number
    const isPaused = primary.status === CleaningStatus.PAUSED
    const verb = isPaused ? 'Pausada' : 'Limpiando'
    return {
      isFocused: true,
      activeCount: active.length,
      primaryTaskId: primary.id,
      primaryRoomLabel: roomNum ? `${verb} · Hab. ${roomNum}` : verb,
    }
  }, [userId, tasks])
}

const EMPTY: FocusModeState = {
  isFocused: false,
  activeCount: 0,
  primaryTaskId: null,
  primaryRoomLabel: null,
}
