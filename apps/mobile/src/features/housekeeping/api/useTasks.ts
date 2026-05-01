/**
 * useTasks — fetcher for housekeeping tasks.
 *
 * Uses the existing useTaskStore (zustand) for now; in Sprint 9+ migrate to
 * TanStack Query for cache + background refetch + optimistic updates.
 *
 * Sort policy mirrors the backend (TasksService.findAll Sprint 8H):
 *   1. hasSameDayCheckIn DESC  → "Hoy entra" arriba
 *   2. carryoverFromDate ASC NULLS LAST → carryover (de ayer) primero
 *   3. priority DESC           → URGENT > HIGH > MEDIUM > LOW
 *   4. createdAt ASC           → FIFO en empates
 */

import { useEffect, useMemo } from 'react'
import { useTaskStore } from '../../../store/tasks'
import { CleaningStatus } from '@zenix/shared'
import type { CleaningTaskDto } from '@zenix/shared'
// 🟡 QA-ONLY MOCK FALLBACK — DELETE BEFORE PRODUCTION
// Activates only when EXPO_PUBLIC_USE_MOCKS=true AND API returns empty.
import { MOCK_HOUSEKEEPING_TASKS, MOCKS_ENABLED } from './__mocks__/mockTasks'

export interface TaskGroups {
  doubleUrgent: CleaningTaskDto[]   // carryover + sameDayCheckIn
  sameDayCheckIn: CleaningTaskDto[]
  carryover: CleaningTaskDto[]
  normal: CleaningTaskDto[]
  done: CleaningTaskDto[]
}

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
}
const STATUS_RANK: Record<CleaningStatus, number> = {
  [CleaningStatus.READY]: 0,
  [CleaningStatus.IN_PROGRESS]: 1,
  [CleaningStatus.PAUSED]: 2,
  [CleaningStatus.PENDING]: 3,
  [CleaningStatus.UNASSIGNED]: 3,
  [CleaningStatus.DONE]: 4,
  [CleaningStatus.VERIFIED]: 5,
  [CleaningStatus.CANCELLED]: 6,
}

function sortTasks(tasks: CleaningTaskDto[]): CleaningTaskDto[] {
  return [...tasks].sort((a, b) => {
    // 1. Double urgent first
    const aDouble = !!a.carryoverFromDate && a.hasSameDayCheckIn
    const bDouble = !!b.carryoverFromDate && b.hasSameDayCheckIn
    if (aDouble !== bDouble) return aDouble ? -1 : 1
    // 2. Same day check-in
    if (a.hasSameDayCheckIn !== b.hasSameDayCheckIn) return a.hasSameDayCheckIn ? -1 : 1
    // 3. Carryover
    if (!!a.carryoverFromDate !== !!b.carryoverFromDate) return a.carryoverFromDate ? -1 : 1
    // 4. Status
    const sDelta = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
    if (sDelta !== 0) return sDelta
    // 5. Priority
    const pDelta = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)
    if (pDelta !== 0) return pDelta
    // 6. Created at
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

/**
 * Group tasks into the 4 priority sections + done section.
 * Mirrors the visual layout designed in plan §7.1.
 */
export function useHousekeepingTasks() {
  const { tasks, loading, fetchTasks } = useTaskStore()

  // Initial fetch on mount.
  useEffect(() => {
    if (tasks.length === 0) fetchTasks()
  }, [])

  const groups = useMemo<TaskGroups>(() => {
    // 🟡 QA-ONLY MOCK FALLBACK — DELETE BEFORE PRODUCTION
    // If API returned no tasks AND mocks are enabled, use the hardcoded set.
    // Note: extension WITHOUT_CLEANING tasks are CANCELLED but kept visible in
    // the mock list — the filter excludes only CANCELLED without extensionFlag
    // so the badge ✨ section can still render in QA.
    const sourceTasks = MOCKS_ENABLED && tasks.length === 0 ? MOCK_HOUSEKEEPING_TASKS : tasks
    const active = sourceTasks.filter(
      (t) => t.status !== CleaningStatus.CANCELLED || t.extensionFlag === 'WITHOUT_CLEANING',
    )
    const sorted = sortTasks(active)

    const doubleUrgent: CleaningTaskDto[] = []
    const sameDayCheckIn: CleaningTaskDto[] = []
    const carryover: CleaningTaskDto[] = []
    const normal: CleaningTaskDto[] = []
    const done: CleaningTaskDto[] = []

    for (const t of sorted) {
      if (t.status === CleaningStatus.DONE || t.status === CleaningStatus.VERIFIED) {
        done.push(t)
      } else if (t.carryoverFromDate && t.hasSameDayCheckIn) {
        doubleUrgent.push(t)
      } else if (t.hasSameDayCheckIn) {
        sameDayCheckIn.push(t)
      } else if (t.carryoverFromDate) {
        carryover.push(t)
      } else {
        normal.push(t)
      }
    }

    return { doubleUrgent, sameDayCheckIn, carryover, normal, done }
  }, [tasks])

  const totalActive =
    groups.doubleUrgent.length +
    groups.sameDayCheckIn.length +
    groups.carryover.length +
    groups.normal.length

  const completedToday = groups.done.length

  return {
    groups,
    totalActive,
    completedToday,
    loading,
    refresh: fetchTasks,
  }
}
