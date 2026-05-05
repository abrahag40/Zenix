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
            '/tasks?status=PENDING,READY,UNASSIGNED,IN_PROGRESS,PAUSED,DONE',
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
        const { syncQueue } = get()
        if (syncQueue.length === 0) return

        const remaining: SyncOperation[] = []

        for (const op of syncQueue) {
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

        set({ syncQueue: remaining })

        // Re-fetch to get server state after sync
        if (remaining.length < syncQueue.length) {
          await get().fetchTasks()
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
