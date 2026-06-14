/**
 * Tests Sprint 2 — núcleo PURO de validación + detección de empalmes (DoD).
 */
import { detectCollisions, rangesOverlap, type OccupancyClaim } from './collision/collision-detector'
import { normalizeReservation, normalizeStatus } from './validation/normalize-reservation'
import { matchRoom, type ZenixRoomLite } from './validation/room-matcher'
import { findDuplicateGuests } from './validation/guest-dedup'
import { MigrationRowStatus } from '@zenix/shared'
import type { MigrationReservationDto } from '@zenix/shared'

const claim = (ref: string, key: string, ci: string, co: string, shared = false): OccupancyClaim =>
  ({ ref, resourceKey: key, shared, checkIn: ci, checkOut: co })

describe('rangesOverlap (half-open)', () => {
  it('solape parcial → true', () => expect(rangesOverlap('2026-06-01', '2026-06-05', '2026-06-03', '2026-06-08')).toBe(true))
  it('back-to-back (fin==inicio) → false', () => expect(rangesOverlap('2026-06-01', '2026-06-03', '2026-06-03', '2026-06-05')).toBe(false))
  it('disjuntos → false', () => expect(rangesOverlap('2026-06-01', '2026-06-03', '2026-06-10', '2026-06-12')).toBe(false))
  it('contención → true', () => expect(rangesOverlap('2026-06-01', '2026-06-10', '2026-06-03', '2026-06-05')).toBe(true))
})

describe('CollisionDetector ★ (D-MIG3)', () => {
  it('0 empalmes cuando no hay solapes', () => {
    const c = detectCollisions([
      claim('1', 'room:A', '2026-06-01', '2026-06-03'),
      claim('2', 'room:A', '2026-06-03', '2026-06-05'), // back-to-back
      claim('3', 'room:B', '2026-06-01', '2026-06-10'),
    ])
    expect(c).toHaveLength(0)
  })

  it('empalme exacto misma habitación → ROOM_OVERLAP', () => {
    const c = detectCollisions([
      claim('1', 'room:101', '2026-06-20', '2026-06-22'),
      claim('2', 'room:101', '2026-06-20', '2026-06-23'),
    ])
    expect(c).toHaveLength(1)
    expect(c[0].type).toBe('ROOM_OVERLAP')
    expect(c[0].refs).toEqual(['1', '2'])
  })

  it('dorm: dos camas DISTINTAS, mismas fechas → NO empalme', () => {
    const c = detectCollisions([
      claim('1', 'label:dorm a - bed 1', '2026-03-05', '2026-03-08', true),
      claim('2', 'label:dorm a - bed 2', '2026-03-05', '2026-03-08', true),
    ])
    expect(c).toHaveLength(0)
  })

  it('dorm: MISMA cama, fechas que solapan → BED_OVERLAP', () => {
    const c = detectCollisions([
      claim('1', 'label:dorm a - bed 1', '2026-03-05', '2026-03-08', true),
      claim('2', 'label:dorm a - bed 1', '2026-03-06', '2026-03-09', true),
    ])
    expect(c).toHaveLength(1)
    expect(c[0].type).toBe('BED_OVERLAP')
  })

  it('dorm: misma cama, fechas DISJUNTAS → NO empalme', () => {
    const c = detectCollisions([
      claim('1', 'label:dorm a - bed 1', '2026-01-12', '2026-01-15', true),
      claim('2', 'label:dorm a - bed 1', '2026-03-05', '2026-03-08', true),
    ])
    expect(c).toHaveLength(0)
  })

  it('staging-vs-existente → marca existing=true', () => {
    const c = detectCollisions(
      [claim('row-1', 'room:101', '2026-06-20', '2026-06-22')],
      [claim('existing:abc', 'room:101', '2026-06-21', '2026-06-25')],
    )
    expect(c).toHaveLength(1)
    expect(c[0].existing).toBe(true)
    expect(c[0].refs).toEqual(['row-1', 'existing:abc'])
  })

  it('ignora claims sin recurso o sin fechas', () => {
    const c = detectCollisions([
      claim('1', '', '2026-06-01', '2026-06-05'),
      claim('2', 'room:A', '', ''),
    ])
    expect(c).toHaveLength(0)
  })

  it('triple empalme misma habitación → detecta los pares solapados', () => {
    const c = detectCollisions([
      claim('1', 'room:A', '2026-06-01', '2026-06-10'),
      claim('2', 'room:A', '2026-06-02', '2026-06-04'),
      claim('3', 'room:A', '2026-06-05', '2026-06-08'),
    ])
    // 1∩2, 1∩3 solapan; 2∩3 no (back-to-back/disjuntos) → 2 conflictos
    expect(c).toHaveLength(2)
  })
})

describe('normalizeReservation', () => {
  const ctx = { defaultCurrency: 'MXN' }
  const base: MigrationReservationDto = { sourceId: 'R1', guestName: 'A B', checkIn: '2026-06-01', checkOut: '2026-06-03' }

  it('OK + aplica moneda default', () => {
    const n = normalizeReservation(base, ctx)
    expect(n.status).toBe(MigrationRowStatus.OK)
    expect(n.reservation.currency).toBe('MXN')
    expect(n.occupies).toBe(true)
  })
  it('checkout <= checkin → ERROR BAD_DATE + no ocupa', () => {
    const n = normalizeReservation({ ...base, checkOut: '2026-06-01' }, ctx)
    expect(n.status).toBe(MigrationRowStatus.ERROR)
    expect(n.issues[0].type).toBe('BAD_DATE')
    expect(n.occupies).toBe(false)
  })
  it('sin fechas → ERROR MISSING_DATES', () => {
    const n = normalizeReservation({ ...base, checkIn: '', checkOut: '' }, ctx)
    expect(n.status).toBe(MigrationRowStatus.ERROR)
  })
  it('monto negativo → WARN NEGATIVE_AMOUNT', () => {
    const n = normalizeReservation({ ...base, totalAmount: -500 }, ctx)
    expect(n.status).toBe(MigrationRowStatus.WARN)
  })
  it('cancelada/no-show no ocupa inventario', () => {
    expect(normalizeReservation({ ...base, status: 'Cancelled' }, ctx).occupies).toBe(false)
    expect(normalizeReservation({ ...base, status: 'No Show' }, ctx).occupies).toBe(false)
  })
  it('normalizeStatus mapea variantes', () => {
    expect(normalizeStatus('Checked Out')).toBe('CHECKED_OUT')
    expect(normalizeStatus('Confirmed')).toBe('ARRIVING')
    expect(normalizeStatus(undefined)).toBe('ARRIVING')
  })
})

describe('matchRoom', () => {
  const rooms: ZenixRoomLite[] = [
    { id: 'r101', number: '101', category: 'PRIVATE' },
    { id: 'rdormA', number: 'Dorm A', category: 'SHARED' },
  ]
  it('empareja por número exacto (privada)', () => {
    const m = matchRoom('101', 'Standard', rooms)
    expect(m).toMatchObject({ roomId: 'r101', matched: true, shared: false })
  })
  it('dorm: empareja por prefijo antes del separador + shared=true', () => {
    const m = matchRoom('Dorm A - Bed 1', 'Dorm 6', rooms)
    expect(m.roomId).toBe('rdormA')
    expect(m.shared).toBe(true)
    expect(m.resourceKey).toBe('dorm a - bed 1') // clave distingue camas
  })
  it('sin match → matched=false (NO_ROOM_MATCH upstream)', () => {
    const m = matchRoom('999', 'X', rooms)
    expect(m.matched).toBe(false)
    expect(m.roomId).toBeNull()
  })
})

describe('findDuplicateGuests', () => {
  it('agrupa por email (≥2) e ignora únicos', () => {
    const rows: MigrationReservationDto[] = [
      { sourceId: '1', guestName: 'A', guestEmail: 'dup@x.com', checkIn: '', checkOut: '' },
      { sourceId: '2', guestName: 'A', guestEmail: 'dup@x.com', checkIn: '', checkOut: '' },
      { sourceId: '3', guestName: 'B', guestEmail: 'uniq@x.com', checkIn: '', checkOut: '' },
    ]
    const groups = findDuplicateGuests(rows, (_r, i) => String(i))
    expect(groups).toHaveLength(1)
    expect(groups[0].refs).toEqual(['0', '1'])
  })
})
