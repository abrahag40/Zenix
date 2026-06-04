/**
 * QA-α — useFocusMode: detección del estado "limpiando" (flow state).
 *
 * Ancla a research-housekeeping-hub.md §1.3 (Csikszentmihalyi flow) +
 * Apple HIG "Mindful Sessions" pattern.
 *
 * Cubre:
 *  1. Sin user logueado → estado vacío
 *  2. Sin tareas asignadas → estado vacío
 *  3. Tarea IN_PROGRESS del user → focus mode con label "Limpiando · Hab. X"
 *  4. Tarea PAUSED del user → label "Pausada · Hab. X"
 *  5. Múltiples tareas activas → count correcto + primary es la primera
 *  6. Tareas IN_PROGRESS de OTRO user → no entran en focus mode (scope-safe)
 *  7. Tareas DONE/READY del user → ignoradas
 *  8. Tarea sin unit.room → fallback al verbo solo (sin "Hab. X")
 */

// Stores deben mockearse ANTES del import del hook.
const mockAuthState: { user: { id: string } | null } = { user: { id: 'staff-1' } }
const mockTaskState: { tasks: any[] } = { tasks: [] }

jest.mock('../../../store/auth', () => ({
  useAuthStore: <T,>(selector: (s: typeof mockAuthState) => T) => selector(mockAuthState),
}))
jest.mock('../../../store/tasks', () => ({
  useTaskStore: <T,>(selector: (s: typeof mockTaskState) => T) => selector(mockTaskState),
}))

import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { CleaningStatus } from '@zenix/shared'
import { useFocusMode, type FocusModeState } from './useFocusMode'

/** Minimal renderHook impl on top of react-test-renderer (avoids dep on @testing-library/react-native). */
function renderHook<T>(callback: () => T) {
  const ref: { current: T | null } = { current: null }
  function Probe() {
    ref.current = callback()
    return null
  }
  let renderer: TestRenderer.ReactTestRenderer
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe))
  })
  return {
    get result() {
      return { current: ref.current as T }
    },
    unmount: () => act(() => renderer.unmount()),
  }
}

const makeTask = (
  override: Partial<{ id: string; assignedToId: string; status: CleaningStatus; roomNumber: string | null }>,
) => ({
  id: override.id ?? `t-${Math.random().toString(36).slice(2, 6)}`,
  assignedToId: override.assignedToId ?? 'staff-1',
  status: override.status ?? CleaningStatus.IN_PROGRESS,
  unit: override.roomNumber === null ? null : { room: { number: override.roomNumber ?? '101' } },
})

describe('useFocusMode — flow state detection', () => {
  beforeEach(() => {
    mockAuthState.user = { id: 'staff-1' }
    mockTaskState.tasks = []
  })

  it('sin user logueado → estado vacío', () => {
    mockAuthState.user = null
    mockTaskState.tasks = [makeTask({ assignedToId: 'staff-1', status: CleaningStatus.IN_PROGRESS })]
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(false)
    expect(result.current.activeCount).toBe(0)
    expect(result.current.primaryTaskId).toBeNull()
  })

  it('sin tareas → estado vacío', () => {
    mockTaskState.tasks = []
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(false)
  })

  it('tarea IN_PROGRESS del user → focus mode con label "Limpiando · Hab. X"', () => {
    mockTaskState.tasks = [makeTask({ id: 't1', status: CleaningStatus.IN_PROGRESS, roomNumber: '203' })]
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(true)
    expect(result.current.activeCount).toBe(1)
    expect(result.current.primaryTaskId).toBe('t1')
    expect(result.current.primaryRoomLabel).toBe('Limpiando · Hab. 203')
  })

  it('tarea PAUSED → label "Pausada · Hab. X"', () => {
    mockTaskState.tasks = [makeTask({ id: 't2', status: CleaningStatus.PAUSED, roomNumber: '105' })]
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(true)
    expect(result.current.primaryRoomLabel).toBe('Pausada · Hab. 105')
  })

  it('múltiples tareas activas → activeCount = N + primary es la primera', () => {
    mockTaskState.tasks = [
      makeTask({ id: 'a', status: CleaningStatus.IN_PROGRESS, roomNumber: '101' }),
      makeTask({ id: 'b', status: CleaningStatus.PAUSED, roomNumber: '102' }),
      makeTask({ id: 'c', status: CleaningStatus.IN_PROGRESS, roomNumber: '103' }),
    ]
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(true)
    expect(result.current.activeCount).toBe(3)
    expect(result.current.primaryTaskId).toBe('a')
  })

  it('tareas IN_PROGRESS de OTRO user → ignoradas (scope-safe)', () => {
    mockTaskState.tasks = [
      makeTask({ id: 'x', assignedToId: 'staff-OTHER', status: CleaningStatus.IN_PROGRESS, roomNumber: '999' }),
    ]
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(false)
    expect(result.current.activeCount).toBe(0)
  })

  it('tareas en otros estados (READY, DONE) → ignoradas', () => {
    mockTaskState.tasks = [
      makeTask({ id: 'r', status: CleaningStatus.READY, roomNumber: '201' }),
      makeTask({ id: 'd', status: CleaningStatus.DONE, roomNumber: '202' }),
      makeTask({ id: 'v', status: CleaningStatus.VERIFIED, roomNumber: '203' }),
    ]
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(false)
  })

  it('tarea sin unit.room → label fallback solo con verbo', () => {
    mockTaskState.tasks = [
      makeTask({ id: 'noroom', status: CleaningStatus.IN_PROGRESS, roomNumber: null }),
    ]
    const { result } = renderHook(() => useFocusMode())
    expect(result.current.isFocused).toBe(true)
    expect(result.current.primaryRoomLabel).toBe('Limpiando')
  })
})
