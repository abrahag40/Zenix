/**
 * Tests para `aggregateCleaningStatusByRoom` (Sprint 9 / D14-D17).
 *
 * Función pura — sin Prisma, sin Nest. Solo lógica de prioridad.
 *
 * Cobertura:
 *   - PRIVATE room: 1 task → status mapea 1:1
 *   - SHARED room (dorm): N tasks → gana el más activo
 *   - Empty input → empty map
 *   - Status desconocido → fallback rank 0 (no rompe)
 *   - Múltiples rooms en una sola llamada → cada room aislada
 *   - Orden de prioridad: IN_PROGRESS > READY > DONE > PAUSED > VERIFIED > UNASSIGNED > PENDING
 */
import { aggregateCleaningStatusByRoom } from './guest-stays.service'

describe('aggregateCleaningStatusByRoom (Sprint 9)', () => {
  it('PRIVATE room — single task maps 1:1', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'IN_PROGRESS', unit: { roomId: 'room-1' } },
    ])
    expect(result.get('room-1')).toBe('IN_PROGRESS')
    expect(result.size).toBe(1)
  })

  it('SHARED room — IN_PROGRESS gana sobre READY', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'READY',       unit: { roomId: 'dorm-1' } },
      { status: 'IN_PROGRESS', unit: { roomId: 'dorm-1' } },
      { status: 'PENDING',     unit: { roomId: 'dorm-1' } },
    ])
    expect(result.get('dorm-1')).toBe('IN_PROGRESS')
  })

  it('SHARED room — READY gana sobre DONE/PAUSED/PENDING', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'DONE',     unit: { roomId: 'dorm-2' } },
      { status: 'PAUSED',   unit: { roomId: 'dorm-2' } },
      { status: 'PENDING',  unit: { roomId: 'dorm-2' } },
      { status: 'READY',    unit: { roomId: 'dorm-2' } },
    ])
    expect(result.get('dorm-2')).toBe('READY')
  })

  it('SHARED room — DONE gana sobre VERIFIED (housekeeping pendiente de validación)', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'VERIFIED', unit: { roomId: 'dorm-3' } },
      { status: 'DONE',     unit: { roomId: 'dorm-3' } },
    ])
    expect(result.get('dorm-3')).toBe('DONE')
  })

  it('VERIFIED gana sobre UNASSIGNED/PENDING (cycle complete signal)', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'UNASSIGNED', unit: { roomId: 'r' } },
      { status: 'PENDING',    unit: { roomId: 'r' } },
      { status: 'VERIFIED',   unit: { roomId: 'r' } },
    ])
    expect(result.get('r')).toBe('VERIFIED')
  })

  it('múltiples rooms — cada uno con su propia agregación independiente', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'PENDING',     unit: { roomId: 'room-A' } },
      { status: 'IN_PROGRESS', unit: { roomId: 'room-B' } },
      { status: 'READY',       unit: { roomId: 'room-B' } },
      { status: 'DONE',        unit: { roomId: 'room-C' } },
    ])
    expect(result.get('room-A')).toBe('PENDING')
    expect(result.get('room-B')).toBe('IN_PROGRESS')
    expect(result.get('room-C')).toBe('DONE')
    expect(result.size).toBe(3)
  })

  it('input vacío → mapa vacío', () => {
    expect(aggregateCleaningStatusByRoom([]).size).toBe(0)
  })

  it('status desconocido (rank 0) — no sobrescribe uno conocido', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'PENDING', unit: { roomId: 'r' } },
      { status: 'WEIRD_FUTURE_STATUS' as any, unit: { roomId: 'r' } },
    ])
    expect(result.get('r')).toBe('PENDING')
  })

  it('PAUSED gana sobre VERIFIED (housekeeper en pausa, atención mayor)', () => {
    const result = aggregateCleaningStatusByRoom([
      { status: 'VERIFIED', unit: { roomId: 'r' } },
      { status: 'PAUSED',   unit: { roomId: 'r' } },
    ])
    expect(result.get('r')).toBe('PAUSED')
  })

  it('orden de inserción no afecta el resultado', () => {
    const orders = [
      ['PENDING', 'READY', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'READY', 'PENDING'],
      ['READY', 'IN_PROGRESS', 'PENDING'],
    ]
    for (const order of orders) {
      const tasks = order.map((s) => ({ status: s, unit: { roomId: 'r' } }))
      expect(aggregateCleaningStatusByRoom(tasks).get('r')).toBe('IN_PROGRESS')
    }
  })
})
