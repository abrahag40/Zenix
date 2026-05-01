/**
 * 🟡 QA-ONLY MOCK DATA — DELETE BEFORE PRODUCTION
 * ════════════════════════════════════════════════════════════════════
 *
 * Hardcoded fallback tasks for housekeeping QA testing.
 *
 * Activates ONLY when:
 *   1. EXPO_PUBLIC_USE_MOCKS=true (set in apps/mobile/.env)
 *   2. AND the API returns empty list (no real tasks for the user)
 *
 * If the backend has real data flowing from the web PMS, those win
 * automatically — these mocks never override real data.
 *
 * Coverage: every priority bucket the Hub renders, including hard-to-
 * reach edge cases (doble urgente, extension sin limpieza, etc).
 *
 * To remove from the codebase entirely: delete this file + the
 * `useMockFallback` import in `useTasks.ts`.
 */

import { CleaningStatus, Priority, CleaningCancelReason, ExtensionFlag } from '@zenix/shared'
import type { CleaningTaskDto } from '@zenix/shared'

const today = new Date()
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
const todayUTC = new Date(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`)
const yesterdayUTC = new Date(`${yesterday.toISOString().slice(0, 10)}T00:00:00.000Z`)

function makeMockTask(overrides: Partial<CleaningTaskDto> & { id: string; roomNumber: string }): CleaningTaskDto {
  const { roomNumber: _rn, id: _id, ...rest } = overrides
  return {
    id: overrides.id,
    unitId: `mock-unit-${overrides.id}`,
    checkoutId: null,
    assignedToId: 'mock-current-user',
    status: CleaningStatus.READY,
    taskType: 'CLEANING' as const,
    requiredCapability: 'CLEANING' as const,
    priority: Priority.MEDIUM,
    hasSameDayCheckIn: false,
    startedAt: null,
    finishedAt: null,
    verifiedAt: null,
    verifiedById: null,
    createdAt: today.toISOString(),
    updatedAt: today.toISOString(),
    scheduledFor: todayUTC.toISOString(),
    carryoverFromDate: null,
    carryoverFromTaskId: null,
    autoAssignmentRule: null,
    cancelledReason: null,
    cancelledAt: null,
    extensionFlag: null,
    unit: {
      id: `mock-unit-${overrides.id}`,
      roomId: `mock-room-${overrides.roomNumber}`,
      label: 'Cama A',
      status: 'DIRTY' as const,
      createdAt: today.toISOString(),
      updatedAt: today.toISOString(),
      room: {
        id: `mock-room-${overrides.roomNumber}`,
        propertyId: 'mock-property',
        number: overrides.roomNumber,
        floor: parseInt(overrides.roomNumber[0], 10) || 1,
        category: 'PRIVATE' as const,
        capacity: 2,
      },
    },
    ...rest,
  } as CleaningTaskDto
}

/**
 * 9 mock tasks covering every section of the Hub:
 *   1. doubleUrgent — carryover + sameDayCheckIn
 *   2. sameDayCheckIn (urgente) ×2
 *   3. carryover de ayer ×2
 *   4. normal — pending departure
 *   5. normal — ready to clean
 *   6. extension WITHOUT_CLEANING (badge ✨)
 *   7. completed (DONE)
 */
export const MOCK_HOUSEKEEPING_TASKS: CleaningTaskDto[] = [
  // ── Doble urgente (carryover + sameDayCheckIn)
  makeMockTask({
    id: 'mock-1',
    roomNumber: '203',
    status: CleaningStatus.READY,
    priority: Priority.URGENT,
    hasSameDayCheckIn: true,
    carryoverFromDate: yesterdayUTC.toISOString(),
    carryoverFromTaskId: 'mock-prev-1',
    autoAssignmentRule: 'COVERAGE_PRIMARY',
  }),
  // ── Hoy entra (urgente)
  makeMockTask({
    id: 'mock-2',
    roomNumber: '101',
    status: CleaningStatus.READY,
    priority: Priority.URGENT,
    hasSameDayCheckIn: true,
  }),
  makeMockTask({
    id: 'mock-3',
    roomNumber: '102',
    status: CleaningStatus.PENDING,
    priority: Priority.URGENT,
    hasSameDayCheckIn: true,
  }),
  // ── Carryover de ayer (no sameDayCheckIn)
  makeMockTask({
    id: 'mock-4',
    roomNumber: '305',
    status: CleaningStatus.READY,
    priority: Priority.URGENT,
    carryoverFromDate: yesterdayUTC.toISOString(),
    carryoverFromTaskId: 'mock-prev-4',
  }),
  makeMockTask({
    id: 'mock-5',
    roomNumber: '306',
    status: CleaningStatus.PENDING,
    priority: Priority.HIGH,
    carryoverFromDate: yesterdayUTC.toISOString(),
    carryoverFromTaskId: 'mock-prev-5',
  }),
  // ── Normal — pending departure (huésped aún ahí)
  makeMockTask({
    id: 'mock-6',
    roomNumber: '210',
    status: CleaningStatus.PENDING,
    priority: Priority.MEDIUM,
  }),
  // ── Normal — ready to clean
  makeMockTask({
    id: 'mock-7',
    roomNumber: '212',
    status: CleaningStatus.READY,
    priority: Priority.MEDIUM,
  }),
  // ── Extension sin limpieza (D12 — badge ✨)
  makeMockTask({
    id: 'mock-8',
    roomNumber: '405',
    status: CleaningStatus.CANCELLED,
    priority: Priority.MEDIUM,
    cancelledReason: CleaningCancelReason.EXTENSION_NO_CLEANING,
    extensionFlag: ExtensionFlag.WITHOUT_CLEANING,
    cancelledAt: today.toISOString(),
  }),
  // ── Completada (DONE)
  makeMockTask({
    id: 'mock-9',
    roomNumber: '215',
    status: CleaningStatus.DONE,
    priority: Priority.MEDIUM,
    startedAt: new Date(today.getTime() - 60 * 60 * 1000).toISOString(),
    finishedAt: new Date(today.getTime() - 20 * 60 * 1000).toISOString(),
  }),
]

/**
 * Toggle controlled by env var. Default OFF in case .env is missing.
 * To activate: set EXPO_PUBLIC_USE_MOCKS=true and restart Metro with --clear.
 */
export const MOCKS_ENABLED = process.env.EXPO_PUBLIC_USE_MOCKS === 'true'
