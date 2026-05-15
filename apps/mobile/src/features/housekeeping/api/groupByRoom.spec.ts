/**
 * QA-α — Cobertura de `groupByRoom.ts`
 *
 * Tests unitarios de las reglas D18 §60 (Mobile Hub Recamarista):
 *   - Auto-detect: ≥2 tasks del mismo roomId → renderizar como acordeón
 *   - Counters DUAL agregados per-room (salidasDone/Total + cleaningsDone/Total)
 *   - Sort dentro de grupo: por bed/unit label ASC (predictable, física)
 *   - Insertion order across grupos preserva urgency input
 *   - Color border determinístico por roomId (Gestalt similarity)
 *
 * Estos son los invariantes que el recepcionista + recamarista observa en
 * cada turno — un bug aquí degrada operación en piloto.
 */
import { buildRoomCounters, groupByRoom, roomBorderColor } from './groupByRoom'
import type { CleaningTaskDto } from '@zenix/shared'

// Helper minimal — solo los campos que groupByRoom mira (unit.room.id + unit.label + status)
function task(
  partial: Partial<CleaningTaskDto> & {
    id: string
    status?: CleaningTaskDto['status']
    roomId?: string
    roomNumber?: string
    bedLabel?: string
  },
): CleaningTaskDto {
  const { id, status = 'PENDING', roomId = 'room-1', roomNumber = '101', bedLabel = 'A', ...rest } = partial
  return {
    id,
    unitId: `unit-${id}`,
    checkoutId: null,
    assignedToId: null,
    status: status as any,
    taskType: 'CHECKOUT' as any,
    requiredCapability: 'CLEAN' as any,
    priority: 'NORMAL' as any,
    hasSameDayCheckIn: false,
    startedAt: null,
    finishedAt: null,
    verifiedAt: null,
    verifiedById: null,
    createdAt: '2026-05-15T00:00:00Z',
    updatedAt: '2026-05-15T00:00:00Z',
    scheduledFor: null,
    carryoverFromDate: null,
    carryoverFromTaskId: null,
    autoAssignmentRule: null,
    cancelledReason: null,
    cancelledAt: null,
    extensionFlag: null,
    unit: {
      id: `unit-${id}`,
      label: bedLabel,
      room: {
        id: roomId,
        number: roomNumber,
      } as any,
    } as any,
    ...rest,
  } as CleaningTaskDto
}

describe('buildRoomCounters', () => {
  it('cuenta total per-room desde la lista completa del día', () => {
    const allDay = [
      task({ id: 't1', roomId: 'r-101' }),
      task({ id: 't2', roomId: 'r-101' }),
      task({ id: 't3', roomId: 'r-102' }),
    ]
    const counters = buildRoomCounters(allDay)
    expect(counters.get('r-101')?.salidasTotal).toBe(2)
    expect(counters.get('r-101')?.cleaningsTotal).toBe(2)
    expect(counters.get('r-102')?.salidasTotal).toBe(1)
  })

  it('cuenta como "salida done" cualquier status distinto de PENDING o CANCELLED', () => {
    const allDay = [
      task({ id: 't1', roomId: 'r-1', status: 'PENDING' }),
      task({ id: 't2', roomId: 'r-1', status: 'UNASSIGNED' }),
      task({ id: 't3', roomId: 'r-1', status: 'READY' }),
      task({ id: 't4', roomId: 'r-1', status: 'IN_PROGRESS' }),
      task({ id: 't5', roomId: 'r-1', status: 'DONE' }),
      task({ id: 't6', roomId: 'r-1', status: 'CANCELLED' }),
    ]
    const counters = buildRoomCounters(allDay)
    // PENDING + CANCELLED no cuentan → 4 de 6
    expect(counters.get('r-1')?.salidasDone).toBe(4)
    expect(counters.get('r-1')?.salidasTotal).toBe(6)
  })

  it('cuenta como "cleaning done" solo DONE y VERIFIED', () => {
    const allDay = [
      task({ id: 't1', roomId: 'r-1', status: 'READY' }),
      task({ id: 't2', roomId: 'r-1', status: 'IN_PROGRESS' }),
      task({ id: 't3', roomId: 'r-1', status: 'DONE' }),
      task({ id: 't4', roomId: 'r-1', status: 'VERIFIED' }),
    ]
    const counters = buildRoomCounters(allDay)
    expect(counters.get('r-1')?.cleaningsDone).toBe(2)
    expect(counters.get('r-1')?.cleaningsTotal).toBe(4)
  })

  it('ignora tareas sin unit.room.id (defensive)', () => {
    const tasksWithoutRoom: CleaningTaskDto[] = [
      task({ id: 't1', roomId: 'r-1' }),
      { ...task({ id: 't2' }), unit: undefined } as any,
    ]
    const counters = buildRoomCounters(tasksWithoutRoom)
    expect(counters.size).toBe(1)
    expect(counters.get('r-1')?.salidasTotal).toBe(1)
  })
})

describe('groupByRoom — auto-detect threshold', () => {
  it('agrupa rooms con ≥2 tasks en la section (shouldGroup=true)', () => {
    const sectionTasks = [
      task({ id: 't1', roomId: 'r-1', bedLabel: 'A' }),
      task({ id: 't2', roomId: 'r-1', bedLabel: 'B' }),
    ]
    const { groups, flatTasks } = groupByRoom(sectionTasks, sectionTasks)
    expect(groups).toHaveLength(1)
    expect(groups[0].shouldGroup).toBe(true)
    expect(groups[0].sectionTasks).toHaveLength(2)
    expect(flatTasks).toHaveLength(0)
  })

  it('NO agrupa rooms con 1 sola task — quedan flat (zero overhead)', () => {
    const sectionTasks = [
      task({ id: 't1', roomId: 'r-1', bedLabel: 'A' }),
      task({ id: 't2', roomId: 'r-2', bedLabel: 'A' }),
    ]
    const { groups, flatTasks } = groupByRoom(sectionTasks, sectionTasks)
    expect(groups).toHaveLength(0)
    expect(flatTasks).toHaveLength(2)
  })

  it('mezcla grupos y flat correctamente en la misma section', () => {
    const sectionTasks = [
      task({ id: 't1', roomId: 'r-1', bedLabel: 'A' }), // → group with t2
      task({ id: 't2', roomId: 'r-1', bedLabel: 'B' }),
      task({ id: 't3', roomId: 'r-2', bedLabel: 'A' }), // → flat (alone)
      task({ id: 't4', roomId: 'r-3', bedLabel: 'A' }), // → group with t5
      task({ id: 't5', roomId: 'r-3', bedLabel: 'B' }),
    ]
    const { groups, flatTasks } = groupByRoom(sectionTasks, sectionTasks)
    expect(groups).toHaveLength(2)
    expect(flatTasks).toHaveLength(1)
    expect(flatTasks[0].id).toBe('t3')
  })
})

describe('groupByRoom — sort dentro del grupo', () => {
  it('ordena tasks del room por bed label ASC (refleja física, predictable)', () => {
    const sectionTasks = [
      task({ id: 't-b', roomId: 'r-1', bedLabel: 'B' }),
      task({ id: 't-a', roomId: 'r-1', bedLabel: 'A' }),
      task({ id: 't-c', roomId: 'r-1', bedLabel: 'C' }),
    ]
    const { groups } = groupByRoom(sectionTasks, sectionTasks)
    expect(groups[0].sectionTasks.map((t) => t.unit?.label)).toEqual(['A', 'B', 'C'])
  })

  it('respeta locale-compare con números (A-1, A-2, A-10 en orden natural)', () => {
    const sectionTasks = [
      task({ id: 't10', roomId: 'r-1', bedLabel: 'A-10' }),
      task({ id: 't1', roomId: 'r-1', bedLabel: 'A-1' }),
      task({ id: 't2', roomId: 'r-1', bedLabel: 'A-2' }),
    ]
    const { groups } = groupByRoom(sectionTasks, sectionTasks)
    // localeCompare default — A-1, A-10, A-2 (lexico). Documenta el behavior actual.
    const labels = groups[0].sectionTasks.map((t) => t.unit?.label)
    expect(labels[0]).toBe('A-1')
    // A-10 < A-2 en lexico ASCII → este test documenta limitación.
    // Si el equipo decide cambiar a sort numérico, este test debe actualizarse.
    expect(labels).toEqual(['A-1', 'A-10', 'A-2'])
  })
})

describe('groupByRoom — insertion order across grupos', () => {
  it('preserva el orden de aparición del primer task de cada room (urgency externa)', () => {
    // sectionTasks ya viene pre-ordenada por urgency externa (mismo día llegada, etc.)
    // groupByRoom debe respetar ese orden cuando emite los grupos.
    const sectionTasks = [
      task({ id: 'urgent-room-3', roomId: 'r-3', bedLabel: 'A' }), // r-3 aparece primero
      task({ id: 'urgent-room-3-b', roomId: 'r-3', bedLabel: 'B' }),
      task({ id: 'less-urgent-room-1', roomId: 'r-1', bedLabel: 'A' }),
      task({ id: 'less-urgent-room-1-b', roomId: 'r-1', bedLabel: 'B' }),
    ]
    const { groups } = groupByRoom(sectionTasks, sectionTasks)
    expect(groups.map((g) => g.roomId)).toEqual(['r-3', 'r-1'])
  })
})

describe('groupByRoom — counters agregados', () => {
  it('counters en el grupo reflejan TODO el cuarto (no solo esta section)', () => {
    // Esta section solo contiene tasks PENDING del room.
    // allDay tiene tasks adicionales del MISMO room en otras priority sections,
    // unas ya hechas. El counter debe agregar todo.
    const sectionTasks = [
      task({ id: 't1', roomId: 'r-1', bedLabel: 'A', status: 'PENDING' }),
      task({ id: 't2', roomId: 'r-1', bedLabel: 'B', status: 'PENDING' }),
    ]
    const allDay = [
      ...sectionTasks,
      task({ id: 't3', roomId: 'r-1', bedLabel: 'C', status: 'DONE' }),
      task({ id: 't4', roomId: 'r-1', bedLabel: 'D', status: 'VERIFIED' }),
    ]
    const { groups } = groupByRoom(sectionTasks, allDay)
    expect(groups[0].salidasTotal).toBe(4)
    expect(groups[0].cleaningsDone).toBe(2) // DONE + VERIFIED
    expect(groups[0].cleaningsTotal).toBe(4)
  })
})

describe('roomBorderColor — determinístico (Gestalt similarity, D18 regla 4)', () => {
  it('mismo roomId → siempre mismo color', () => {
    expect(roomBorderColor('room-abc')).toBe(roomBorderColor('room-abc'))
  })

  it('color pertenece a la paleta (no se sale del set ROOM_BORDER_PALETTE)', () => {
    const PALETTE = [
      '#94A3B8', '#A78BFA', '#FB923C', '#22D3EE',
      '#FB7185', '#A3E635', '#FBBF24', '#818CF8',
    ]
    for (const id of ['room-1', 'cuid-xyz', 'r-9999-deeply-nested', '']) {
      expect(PALETTE).toContain(roomBorderColor(id))
    }
  })
})
