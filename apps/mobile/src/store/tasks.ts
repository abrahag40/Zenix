import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import type { CleaningTaskDto, SyncOperation } from '@zenix/shared'
import { CleaningStatus } from '@zenix/shared'
import { api } from '../api/client'

interface TaskStore {
  tasks: CleaningTaskDto[]
  loading: boolean
  syncQueue: SyncOperation[]

  fetchTasks: () => Promise<void>
  startTask: (taskId: string) => Promise<void>
  pauseTask: (taskId: string) => Promise<void>
  resumeTask: (taskId: string) => Promise<void>
  /** payload opcional con el snapshot del checklist completado.
   *  Persiste en TaskLog.metadata para reportes (Sprint 8K). */
  endTask: (taskId: string, payload?: { checklist?: Array<{ id: string; label: string; completed: boolean }> }) => Promise<void>
  flushQueue: () => Promise<void>
}

function applyOptimistic(
  tasks: CleaningTaskDto[],
  taskId: string,
  patch: Partial<CleaningTaskDto>,
): CleaningTaskDto[] {
  return tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
}

/** BUG #4 fix — módulo-level lock para evitar flushQueue concurrente. */
let flushInFlight = false

/** Stable signature de una SyncOperation para diff-vs-overwrite. */
function sigOf(op: SyncOperation): string {
  return `${op.type}:${op.taskId}:${op.timestamp}`
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      loading: false,
      syncQueue: [],

      fetchTasks: async () => {
        set({ loading: true })
        try {
          const tasks = await api.get<CleaningTaskDto[]>(
            // Incluye VERIFIED — la tarea verificada se mantiene visible en
            // la lista bajo "Finalizadas" con badge "Verificada", en vez de
            // desaparecer. Cumple Nielsen H1 (visibility of system status):
            // el housekeeper SIEMPRE sabe qué le pasó a su trabajo del día.
            '/tasks?status=PENDING,READY,UNASSIGNED,IN_PROGRESS,PAUSED,DONE,VERIFIED',
          )
          set({ tasks, loading: false })
        } catch {
          set({ loading: false })
        }
      },

      startTask: async (taskId) => {
        // Snapshot the original task BEFORE applying the optimistic update.
        // Required to revert if the server rejects (409 Conflict — e.g. user
        // already has another IN_PROGRESS task). Without this, the app keeps
        // showing two tasks as IN_PROGRESS even though the second one was
        // refused, leading to a permanently broken UI state until refetch.
        const original = get().tasks.find((t) => t.id === taskId)

        set((s) => ({
          tasks: applyOptimistic(s.tasks, taskId, { status: CleaningStatus.IN_PROGRESS, startedAt: new Date().toISOString() }),
        }))

        const netState = await NetInfo.fetch()
        if (netState.isConnected) {
          try {
            await api.patch(`/tasks/${taskId}/start`)
          } catch (err) {
            // Rollback on rejection — restore the prior status/startedAt.
            if (original) {
              set((s) => ({
                tasks: applyOptimistic(s.tasks, taskId, {
                  status: original.status,
                  startedAt: original.startedAt,
                }),
              }))
            }
            throw err
          }
        } else {
          const op: SyncOperation = {
            id: `${Date.now()}-start-${taskId}`,
            type: 'START_TASK',
            taskId,
            timestamp: new Date().toISOString(),
            retryCount: 0,
          }
          set((s) => ({ syncQueue: [...s.syncQueue, op] }))
        }
      },

      pauseTask: async (taskId) => {
        set((s) => ({
          tasks: applyOptimistic(s.tasks, taskId, { status: CleaningStatus.PAUSED }),
        }))

        const netState = await NetInfo.fetch()
        if (netState.isConnected) {
          await api.patch(`/tasks/${taskId}/pause`)
        } else {
          const op: SyncOperation = {
            id: `${Date.now()}-pause-${taskId}`,
            type: 'PAUSE_TASK',
            taskId,
            timestamp: new Date().toISOString(),
            retryCount: 0,
          }
          set((s) => ({ syncQueue: [...s.syncQueue, op] }))
        }
      },

      resumeTask: async (taskId) => {
        // Snapshot for rollback if backend rejects (409 — another task active).
        const original = get().tasks.find((t) => t.id === taskId)

        set((s) => ({
          tasks: applyOptimistic(s.tasks, taskId, { status: CleaningStatus.IN_PROGRESS }),
        }))

        const netState = await NetInfo.fetch()
        if (netState.isConnected) {
          try {
            await api.patch(`/tasks/${taskId}/resume`)
          } catch (err) {
            if (original) {
              set((s) => ({
                tasks: applyOptimistic(s.tasks, taskId, { status: original.status }),
              }))
            }
            throw err
          }
        } else {
          const op: SyncOperation = {
            id: `${Date.now()}-resume-${taskId}`,
            type: 'RESUME_TASK',
            taskId,
            timestamp: new Date().toISOString(),
            retryCount: 0,
          }
          set((s) => ({ syncQueue: [...s.syncQueue, op] }))
        }
      },

      endTask: async (taskId, payload) => {
        set((s) => ({
          tasks: applyOptimistic(s.tasks, taskId, { status: CleaningStatus.DONE, finishedAt: new Date().toISOString() }),
        }))

        const netState = await NetInfo.fetch()
        if (netState.isConnected) {
          await api.patch(`/tasks/${taskId}/end`, payload ?? {})
        } else {
          const op: SyncOperation & { payload?: any } = {
            id: `${Date.now()}-end-${taskId}`,
            type: 'END_TASK',
            taskId,
            timestamp: new Date().toISOString(),
            retryCount: 0,
            payload,
          } as any
          set((s) => ({ syncQueue: [...s.syncQueue, op] }))
        }
      },

      flushQueue: async () => {
        // BUG #4 fix 2026-06-04 — concurrent-safe + no-overwrite.
        //
        // Pre-prod testing detectó dos races simultáneos:
        //   1. Si `flushQueue` se invoca 2 veces concurrente (NetInfo
        //      onChange + retry timer), ambas leen el mismo snapshot y
        //      ambas re-procesan las mismas ops → server recibe duplicados.
        //   2. Si el HK añade una op NUEVA durante un flush (taps "Start"),
        //      la op queda en queue → al cerrar `set({ syncQueue: remaining })`
        //      sobreescribe la queue eliminando la op nueva.
        //
        // Fix: módulo-level `inFlight` flag + diff vs overwrite.
        if (flushInFlight) return
        flushInFlight = true
        try {
          const snapshot = get().syncQueue
          if (snapshot.length === 0) return

          const remaining: SyncOperation[] = []
          for (const op of snapshot) {
            try {
              if (op.type === 'START_TASK') {
                await api.patch(`/tasks/${op.taskId}/start`)
              } else if (op.type === 'PAUSE_TASK') {
                await api.patch(`/tasks/${op.taskId}/pause`)
              } else if (op.type === 'RESUME_TASK') {
                await api.patch(`/tasks/${op.taskId}/resume`)
              } else if (op.type === 'END_TASK') {
                await api.patch(`/tasks/${op.taskId}/end`, (op as any).payload ?? {})
              }
            } catch {
              if (op.retryCount < 5) {
                remaining.push({ ...op, retryCount: op.retryCount + 1 })
              }
            }
          }

          // Diff vs overwrite: preserva ops añadidas DURANTE el flush.
          // Filtra del current `syncQueue` las ops del snapshot que ya
          // procesamos exitosamente (no en `remaining`), conservando las
          // restantes (incluidas las nuevas).
          set((s) => {
            const processedIds = new Set(snapshot.map((o) => sigOf(o)))
            const remainingIds = new Set(remaining.map((o) => sigOf(o)))
            const next = s.syncQueue.filter((o) => {
              const id = sigOf(o)
              // Si la op estaba en snapshot Y NO está en remaining, fue procesada → drop.
              if (processedIds.has(id) && !remainingIds.has(id)) return false
              return true
            })
            // Agregar las que entraron a retry (con su retryCount++).
            for (const r of remaining) {
              if (!next.some((o) => sigOf(o) === sigOf(r))) next.push(r)
            }
            return { syncQueue: next }
          })

          // Re-fetch si procesamos al menos una op exitosa.
          if (remaining.length < snapshot.length) {
            await get().fetchTasks()
          }
        } finally {
          flushInFlight = false
        }
      },
    }),
    {
      name: 'hk-tasks',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ tasks: state.tasks, syncQueue: state.syncQueue }),
    },
  ),
)
