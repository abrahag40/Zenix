/**
 * Tests para `groupByRoom` (D18 / Sprint 8I).
 *
 * Aunque el helper vive en apps/mobile/src/features/housekeeping/api/groupByRoom.ts,
 * lo testeamos aquí porque mobile usa jest-expo (RN transform stack) que requiere
 * mucha config para pruebas TS puras. La lógica es pura — copiamos el código
 * inline para validar el algoritmo.
 *
 * Cobertura:
 *   - Auto-detect: ≥2 tasks del mismo room → group; <2 → flat
 *   - Counters agregados sobre TODO el día (no solo la section)
 *   - Sort dentro del room por bed label ASC
 *   - Empty input
 *   - roomBorderColor determinístico
 */

// Re-implementamos las funciones aquí para evitar import cross-package del helper mobile
type Task = {
  id: string
  status: string
  unit?: { label?: string; room?: { id: string; number: string } }
}

function buildRoomCounters(allDayTasks: Task[]) {
  const map = new Map<string, { salidasDone: number; salidasTotal: number; cleaningsDone: number; cleaningsTotal: number }>()
  for (const t of allDayTasks) {
    const roomId = t.unit?.room?.id
    if (!roomId) continue
    const cur = map.get(roomId) ?? { salidasDone: 0, salidasTotal: 0, cleaningsDone: 0, cleaningsTotal: 0 }
    cur.salidasTotal += 1
    cur.cleaningsTotal += 1
    if (t.status !== 'PENDING' && t.status !== 'CANCELLED') cur.salidasDone += 1
    if (t.status === 'DONE' || t.status === 'VERIFIED') cur.cleaningsDone += 1
    map.set(roomId, cur)
  }
  return map
}

function groupByRoom(sectionTasks: Task[], allDayTasks: Task[]) {
  const counters = buildRoomCounters(allDayTasks)
  const byRoom = new Map<string, Task[]>()
  for (const t of sectionTasks) {
    const roomId = t.unit?.room?.id
    if (!roomId) continue
    if (!byRoom.has(roomId)) byRoom.set(roomId, [])
    byRoom.get(roomId)!.push(t)
  }
  const groups: any[] = []
  const flatTasks: Task[] = []
  for (const [roomId, roomTasks] of byRoom.entries()) {
    if (roomTasks.length < 2) {
      flatTasks.push(...roomTasks)
      continue
    }
    const sorted = [...roomTasks].sort((a, b) =>
      (a.unit?.label ?? '').localeCompare(b.unit?.label ?? ''),
    )
    const counter = counters.get(roomId) ?? { salidasDone: 0, salidasTotal: 0, cleaningsDone: 0, cleaningsTotal: 0 }
    groups.push({ roomId, roomNumber: sorted[0].unit?.room?.number ?? '—', sectionTasks: sorted, shouldGroup: true, ...counter })
  }
  return { groups, flatTasks }
}

const ROOM_PALETTE = ['#94A3B8', '#A78BFA', '#FB923C', '#22D3EE', '#FB7185', '#A3E635', '#FBBF24', '#818CF8']
function roomBorderColor(roomId: string) {
  let hash = 0
  for (let i = 0; i < roomId.length; i++) hash = (hash + roomId.charCodeAt(i)) % ROOM_PALETTE.length
  return ROOM_PALETTE[hash]
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('groupByRoom (D18)', () => {
  function task(id: string, roomId: string, label = 'Cama 1', status = 'READY'): Task {
    return { id, status, unit: { label, room: { id: roomId, number: roomId } } }
  }

  it('Auto-detect: 1 task del room → flat (sin grupo)', () => {
    const tasks = [task('t1', 'A', 'Cama 1')]
    const result = groupByRoom(tasks, tasks)
    expect(result.groups).toHaveLength(0)
    expect(result.flatTasks).toHaveLength(1)
  })

  it('Auto-detect: ≥2 tasks del mismo room → grupo', () => {
    const tasks = [task('t1', 'A', 'Cama 1'), task('t2', 'A', 'Cama 2')]
    const result = groupByRoom(tasks, tasks)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].sectionTasks).toHaveLength(2)
    expect(result.flatTasks).toHaveLength(0)
  })

  it('Mix: room con 2 + room con 1 → 1 grupo + 1 flat', () => {
    const tasks = [
      task('t1', 'A', 'Cama 1'),
      task('t2', 'A', 'Cama 2'),
      task('t3', 'B', 'Cama 1'),
    ]
    const result = groupByRoom(tasks, tasks)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].roomId).toBe('A')
    expect(result.flatTasks).toHaveLength(1)
    expect(result.flatTasks[0].id).toBe('t3')
  })

  it('Sort dentro del room por label ASC', () => {
    const tasks = [
      task('t1', 'A', 'Cama 3'),
      task('t2', 'A', 'Cama 1'),
      task('t3', 'A', 'Cama 2'),
    ]
    const result = groupByRoom(tasks, tasks)
    expect(result.groups[0].sectionTasks.map((t: any) => t.unit.label))
      .toEqual(['Cama 1', 'Cama 2', 'Cama 3'])
  })

  it('Counter agrega TODO el día, no solo la section', () => {
    // section: solo READY de room A; pero en el día hay 4 tasks de A (2 PENDING + 2 READY)
    const allDayTasks = [
      task('t1', 'A', 'Cama 1', 'READY'),
      task('t2', 'A', 'Cama 2', 'READY'),
      task('t3', 'A', 'Cama 3', 'PENDING'),
      task('t4', 'A', 'Cama 4', 'PENDING'),
    ]
    const sectionTasks = allDayTasks.filter((t) => t.status === 'READY')
    const result = groupByRoom(sectionTasks, allDayTasks)
    expect(result.groups[0].salidasDone).toBe(2)        // 2 READY = ya salieron
    expect(result.groups[0].salidasTotal).toBe(4)       // 4 totales
    expect(result.groups[0].cleaningsDone).toBe(0)      // ninguna terminada
    expect(result.groups[0].cleaningsTotal).toBe(4)
  })

  it('Counter: status DONE/VERIFIED suman a cleaningsDone', () => {
    const tasks = [
      task('t1', 'A', 'C1', 'DONE'),
      task('t2', 'A', 'C2', 'VERIFIED'),
      task('t3', 'A', 'C3', 'IN_PROGRESS'),
      task('t4', 'A', 'C4', 'PENDING'),
    ]
    const result = groupByRoom(tasks, tasks)
    expect(result.groups[0].cleaningsDone).toBe(2)
    expect(result.groups[0].cleaningsTotal).toBe(4)
    expect(result.groups[0].salidasDone).toBe(3)  // todas menos PENDING
  })

  it('CANCELLED no cuenta como salida', () => {
    const tasks = [
      task('t1', 'A', 'C1', 'CANCELLED'),
      task('t2', 'A', 'C2', 'READY'),
    ]
    const result = groupByRoom(tasks, tasks)
    expect(result.groups[0].salidasDone).toBe(1)
  })

  it('Tasks sin room/unit son ignoradas (defensive)', () => {
    const tasks = [
      { id: 't1', status: 'READY', unit: undefined },
      task('t2', 'A', 'C1'),
    ] as any[]
    const result = groupByRoom(tasks, tasks)
    expect(result.groups).toHaveLength(0)
    expect(result.flatTasks).toHaveLength(1)
  })

  it('Empty input → empty result', () => {
    const result = groupByRoom([], [])
    expect(result.groups).toHaveLength(0)
    expect(result.flatTasks).toHaveLength(0)
  })

  it('roomBorderColor es determinístico (same input → same color)', () => {
    expect(roomBorderColor('room-1')).toBe(roomBorderColor('room-1'))
    expect(roomBorderColor('room-X')).toBe(roomBorderColor('room-X'))
  })

  it('roomBorderColor distribuye entre la paleta', () => {
    const colors = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(roomBorderColor)
    const unique = new Set(colors)
    // Al menos 4 colores distintos en 8 IDs (avoids degenerate hash)
    expect(unique.size).toBeGreaterThanOrEqual(4)
  })
})
