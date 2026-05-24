/**
 * ChannexRoomSuggesterService — scoring + suggestion tests.
 *
 * Pure scoreCandidate tested in isolation + e2e suggest() flow tested with
 * Prisma + AvailabilityService mocks.
 */

import { Test } from '@nestjs/testing'
import { AvailabilityService } from '../../../pms/availability/availability.service'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexRoomSuggesterService } from './channex-room-suggester.service'

describe('ChannexRoomSuggesterService.scoreCandidate (pure)', () => {
  const ref = {
    floor: 2,
    category: 'PRIVATE',
    capacity: 2,
    roomTypeId: 'rt-standard',
    channexRoomTypeId: 'chx-rt-standard',
  }

  it('match perfecto: misma channexRoomTypeId + roomType + categoría + capacidad + piso + AVAILABLE = 100', () => {
    const { score, reasons } = ChannexRoomSuggesterService.scoreCandidate(ref, {
      floor: 2,
      category: 'PRIVATE',
      capacity: 2,
      status: 'AVAILABLE',
      roomTypeId: 'rt-standard',
      channexRoomTypeId: 'chx-rt-standard',
    })
    expect(score).toBe(100) // 30 + 25 + 15 + 15 + 10 + 5
    expect(reasons.map((r) => r.kind)).toEqual(
      expect.arrayContaining([
        'SAME_CHANNEX_ROOM_TYPE',
        'SAME_ROOM_TYPE',
        'SAME_CATEGORY',
        'SAME_CAPACITY',
        'SAME_FLOOR',
        'READY_NOW',
      ]),
    )
  })

  it('cama exacta gana, cama mayor pasa filtro pero NO suma score (2026-05-22 refinement)', () => {
    // Escenario: guest reservó cuarto sencillo (capacity=1). Algoritmo debe
    // priorizar OTROS sencillos sobre dobles, pero permitir doble si no hay
    // sencillos disponibles — con label honesto del mismatch.
    const singleRef = { ...ref, capacity: 1 }
    const otherSingle = ChannexRoomSuggesterService.scoreCandidate(singleRef, {
      floor: 2,
      category: 'PRIVATE',
      capacity: 1, // exact match (sencilla → sencilla)
      status: 'DIRTY',
      roomTypeId: null,
      channexRoomTypeId: null,
    })
    const upgradeDouble = ChannexRoomSuggesterService.scoreCandidate(singleRef, {
      floor: 2,
      category: 'PRIVATE',
      capacity: 2, // upgrade (sencilla → doble) — NO debe sumar score
      status: 'DIRTY',
      roomTypeId: null,
      channexRoomTypeId: null,
    })

    // Single match: +15 capacity + 15 category + 10 floor = 40
    // Double upgrade: 0 capacity + 15 category + 10 floor = 25
    expect(otherSingle.score).toBe(40)
    expect(upgradeDouble.score).toBe(25)
    expect(otherSingle.score - upgradeDouble.score).toBe(15) // diff completo

    // Double SÍ aparece con label honesto del mismatch para guiar al supervisor
    const upgradeReason = upgradeDouble.reasons.find((r) => r.kind === 'LARGER_CAPACITY')
    expect(upgradeReason).toBeDefined()
    expect(upgradeReason?.label).toContain('Distinto tipo de cama')
    expect(upgradeReason?.weight).toBe(0)
  })

  it('cat. distinta SHARED vs PRIVATE → cero puntos categoría', () => {
    const { score } = ChannexRoomSuggesterService.scoreCandidate(ref, {
      floor: 2,
      category: 'SHARED', // diff
      capacity: 2,
      status: 'AVAILABLE',
      roomTypeId: null,
      channexRoomTypeId: null,
    })
    // Score: 0 (channex) + 0 (roomType) + 0 (category) + 15 (capacity) + 10 (floor) + 5 (AVAILABLE) = 30
    expect(score).toBe(30)
  })

  it('reference sin channexRoomTypeId → no puntúa aunque candidate sí lo tenga', () => {
    const refNoChannex = { ...ref, channexRoomTypeId: null }
    const { reasons } = ChannexRoomSuggesterService.scoreCandidate(refNoChannex, {
      floor: 2,
      category: 'PRIVATE',
      capacity: 2,
      status: 'AVAILABLE',
      roomTypeId: 'rt-standard',
      channexRoomTypeId: 'chx-rt-standard',
    })
    expect(reasons.find((r) => r.kind === 'SAME_CHANNEX_ROOM_TYPE')).toBeUndefined()
  })
})

describe('ChannexRoomSuggesterService.suggest (integration with DB+availability)', () => {
  let svc: ChannexRoomSuggesterService
  let prisma: {
    guestStay: { findUnique: jest.Mock }
    room: { findMany: jest.Mock }
  }
  let availability: { check: jest.Mock }

  beforeEach(async () => {
    prisma = {
      guestStay: { findUnique: jest.fn() },
      room: { findMany: jest.fn() },
    }
    availability = { check: jest.fn() }
    const mod = await Test.createTestingModule({
      providers: [
        ChannexRoomSuggesterService,
        { provide: PrismaService, useValue: prisma },
        { provide: AvailabilityService, useValue: availability },
      ],
    }).compile()
    svc = mod.get(ChannexRoomSuggesterService)
  })

  it('rankea correctamente y retorna top 3', async () => {
    prisma.guestStay.findUnique.mockResolvedValue({
      id: 'stay-1',
      propertyId: 'prop-1',
      roomId: 'room-current',
      checkinAt: new Date('2026-06-01T21:30:00Z'),
      scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
      paxCount: 2,
      room: {
        id: 'room-current',
        number: 'A1',
        floor: 2,
        category: 'PRIVATE',
        capacity: 2,
        roomTypeId: 'rt-standard',
        channexRoomTypeId: 'chx-rt-std',
      },
    })

    prisma.room.findMany.mockResolvedValue([
      // perfect match
      {
        id: 'r-perfect',
        number: 'A2',
        floor: 2,
        category: 'PRIVATE',
        capacity: 2,
        status: 'AVAILABLE',
        roomTypeId: 'rt-standard',
        channexRoomTypeId: 'chx-rt-std',
        roomType: { id: 'rt-standard', name: 'Standard', code: 'STD' },
      },
      // good (same type, diff floor, dirty)
      {
        id: 'r-good',
        number: 'B1',
        floor: 1,
        category: 'PRIVATE',
        capacity: 2,
        status: 'DIRTY',
        roomTypeId: 'rt-standard',
        channexRoomTypeId: 'chx-rt-std',
        roomType: { id: 'rt-standard', name: 'Standard', code: 'STD' },
      },
      // ok (different category — shared)
      {
        id: 'r-ok',
        number: 'C1',
        floor: 2,
        category: 'SHARED',
        capacity: 2,
        status: 'AVAILABLE',
        roomTypeId: 'rt-dorm',
        channexRoomTypeId: null,
        roomType: { id: 'rt-dorm', name: 'Dorm', code: 'DRM' },
      },
      // weak (upgrade, diff floor + type)
      {
        id: 'r-weak',
        number: 'D1',
        floor: 3,
        category: 'PRIVATE',
        capacity: 4,
        status: 'AVAILABLE',
        roomTypeId: 'rt-suite',
        channexRoomTypeId: 'chx-rt-suite',
        roomType: { id: 'rt-suite', name: 'Suite', code: 'STE' },
      },
    ])
    // All 4 rooms available for the dates
    availability.check.mockResolvedValue({ available: true, conflicts: [], checkedChannex: false })

    const result = await svc.suggest('stay-1')

    expect(result).toHaveLength(3)
    expect(result[0].roomId).toBe('r-perfect') // best
    expect(result[0].score).toBe(100)
    expect(result[1].roomId).toBe('r-good') // same type, diff floor + dirty
    // 3rd between r-ok and r-weak — r-ok has more matches
  })

  it('filtra rooms no available para las fechas', async () => {
    prisma.guestStay.findUnique.mockResolvedValue({
      id: 'stay-1',
      propertyId: 'prop-1',
      roomId: 'room-current',
      checkinAt: new Date('2026-06-01T21:30:00Z'),
      scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
      paxCount: 2,
      room: {
        id: 'room-current',
        number: 'A1',
        floor: 2,
        category: 'PRIVATE',
        capacity: 2,
        roomTypeId: 'rt-standard',
        channexRoomTypeId: 'chx-rt-std',
      },
    })
    prisma.room.findMany.mockResolvedValue([
      {
        id: 'r-busy',
        number: 'A2',
        floor: 2,
        category: 'PRIVATE',
        capacity: 2,
        status: 'AVAILABLE',
        roomTypeId: 'rt-standard',
        channexRoomTypeId: 'chx-rt-std',
        roomType: { id: 'rt-standard', name: 'Standard', code: 'STD' },
      },
    ])
    availability.check.mockResolvedValue({
      available: false,
      conflicts: [{ source: 'LOCAL_STAY', id: 'x', label: 'x', from: new Date(), to: new Date() }],
      checkedChannex: false,
    })

    const result = await svc.suggest('stay-1')
    expect(result).toHaveLength(0)
  })

  it('rooms con capacity < paxCount no son candidatos (filtro hard)', async () => {
    prisma.guestStay.findUnique.mockResolvedValue({
      id: 'stay-1',
      propertyId: 'prop-1',
      roomId: 'room-current',
      checkinAt: new Date('2026-06-01T21:30:00Z'),
      scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
      paxCount: 3,
      room: {
        id: 'room-current',
        number: 'A1',
        floor: 2,
        category: 'PRIVATE',
        capacity: 3,
        roomTypeId: null,
        channexRoomTypeId: null,
      },
    })
    prisma.room.findMany.mockResolvedValue([]) // empty because filter excluded all

    const result = await svc.suggest('stay-1')

    expect(result).toEqual([])
    // Verify the prisma query asked for capacity >= 3
    const call = prisma.room.findMany.mock.calls[0][0]
    expect(call.where.capacity).toEqual({ gte: 3 })
  })

  it('stay no existe → array vacío', async () => {
    prisma.guestStay.findUnique.mockResolvedValue(null)
    const result = await svc.suggest('stay-missing')
    expect(result).toEqual([])
  })
})
