/**
 * stay-journeys.service.spec.ts
 *
 * Tests unitarios para StayJourneyService.
 * Patrón: mocks de Prisma con jest.fn(), $transaction ejecuta callback con prismaMock.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { StayJourneyService } from './stay-journeys.service'
import { PrismaService } from '../../prisma/prisma.service'
// CI-RESCUE 2026-05-15: deps que el service tomó pero el spec no proveía
import { NotificationsService } from '../../notifications/notifications.service'
import { AvailabilityService } from '../availability/availability.service'
import { AssignmentService } from '../../assignment/assignment.service'

// ─── Builders ────────────────────────────────────────────────────────────────

function makeSegment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seg-1',
    journeyId: 'journey-1',
    roomId: 'room-1',
    checkIn: new Date('2026-04-01T00:00:00.000Z'),
    checkOut: new Date('2026-04-07T00:00:00.000Z'),
    status: 'ACTIVE',
    locked: false,
    reason: 'ORIGINAL',
    rateSnapshot: 90,
    nights: [],
    room: { id: 'room-1', number: '101' },
    ...overrides,
  }
}

function makeJourney(segments: ReturnType<typeof makeSegment>[] = [makeSegment()]) {
  return {
    id: 'journey-1',
    organizationId: 'org-1',
    propertyId: 'prop-1',
    guestStayId: 'stay-1',
    guestName: 'Test Guest',
    guestEmail: null,
    status: 'ACTIVE',
    journeyCheckIn: new Date('2026-04-01T00:00:00.000Z'),
    journeyCheckOut: new Date('2026-04-07T00:00:00.000Z'),
    segments,
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('StayJourneyService', () => {
  let service: StayJourneyService

  const prismaMock = {
    stayJourney: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    staySegment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    segmentNight: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    stayJourneyEvent: {
      create: jest.fn(),
    },
    // CI-RESCUE: deps adicionales que el service usa (createRoomChangeTasks, etc.)
    unit: { findMany: jest.fn().mockResolvedValue([]) },
    cleaningTask: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    guestStay: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn) => fn(prismaMock)),
  }

  const eventsMock = { emit: jest.fn() }

  // CI-RESCUE 2026-05-15 — availability mock movido a scope para permitir
  // que tests específicos (extendSameRoom/extendNewRoom solapamiento) lo
  // sobrescriban con `available: false` y validen el guard de conflict.
  const availabilityMock = {
    check: jest.fn().mockResolvedValue({ available: true, conflicts: [] }),
    checkAvailability: jest.fn().mockResolvedValue([]),
    notifyRelease: jest.fn().mockResolvedValue(undefined),
    notifyReservation: jest.fn().mockResolvedValue(undefined),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StayJourneyService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EventEmitter2, useValue: eventsMock },
        { provide: NotificationsService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: AvailabilityService, useValue: availabilityMock },
        { provide: AssignmentService, useValue: { autoAssign: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile()

    service = module.get<StayJourneyService>(StayJourneyService)
    jest.clearAllMocks()
    // Reset availability default — tests que validan solapamiento sobrescriben con `false`.
    availabilityMock.check.mockResolvedValue({ available: true, conflicts: [] })

    // CI-RESCUE — fake timers anclados a 2026-04-01 (antes de toda la data
    // del spec). Sin esto, los tests con `effectiveDate: '2026-04-12'`
    // serían en el pasado real (mayo 2026+) y el guard
    // `isBefore(effectiveDate, today)` los rechazaría incorrectamente.
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ─── extendSameRoom ─────────────────────────────────────────────────────────

  describe('extendSameRoom', () => {
    it('crea segmento con reason EXTENSION_SAME_ROOM', async () => {
      // Arrange
      const segment = makeSegment()
      const journey = makeJourney([segment])
      const newSegment = makeSegment({
        id: 'seg-2',
        checkIn: new Date('2026-04-07T00:00:00.000Z'),
        checkOut: new Date('2026-04-10T00:00:00.000Z'),
        reason: 'EXTENSION_SAME_ROOM',
      })

      prismaMock.stayJourney.findUnique.mockResolvedValue(journey)
      prismaMock.staySegment.findFirst.mockResolvedValue(null) // no overlap
      prismaMock.staySegment.create.mockResolvedValue(newSegment)
      prismaMock.segmentNight.createMany.mockResolvedValue({ count: 3 })
      prismaMock.stayJourney.update.mockResolvedValue({})
      prismaMock.stayJourneyEvent.create.mockResolvedValue({})

      // Act
      const result = await service.extendSameRoom({
        journeyId: 'journey-1',
        newCheckOut: '2026-04-10',
        actorId: 'actor-1',
      })

      // Assert
      expect(prismaMock.staySegment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'EXTENSION_SAME_ROOM' }) }),
      )
      expect(result.id).toBe('seg-2')
    })

    it('lanza BadRequestException si newCheckOut <= checkOut actual', async () => {
      // Arrange
      const segment = makeSegment({ checkOut: new Date('2026-04-07T00:00:00.000Z') })
      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))

      // Act & Assert — misma fecha que checkOut
      await expect(
        service.extendSameRoom({
          journeyId: 'journey-1',
          newCheckOut: '2026-04-07', // igual al checkOut actual
          actorId: 'actor-1',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('lanza ConflictException si hay solapamiento de habitación', async () => {
      // CI-RESCUE 2026-05-15 — rewritten. Service migró de hacer
      // `staySegment.findFirst` directo a usar `AvailabilityService.check()`.
      // Override del mock para reportar conflict (este es el contrato actual).
      const segment = makeSegment()
      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))
      availabilityMock.check.mockResolvedValueOnce({
        available: false,
        conflicts: [{ stayId: 'other-stay', roomId: 'room-1' }],
      })

      await expect(
        service.extendSameRoom({
          journeyId: 'journey-1',
          newCheckOut: '2026-04-10',
          actorId: 'actor-1',
        }),
      ).rejects.toThrow(ConflictException)
    })
  })

  // ─── extendNewRoom ──────────────────────────────────────────────────────────

  describe('extendNewRoom', () => {
    it('crea segmento con reason EXTENSION_NEW_ROOM en la nueva habitación', async () => {
      // Arrange
      const segment = makeSegment()
      const newSegment = makeSegment({
        id: 'seg-2',
        roomId: 'room-2',
        reason: 'EXTENSION_NEW_ROOM',
      })

      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))
      prismaMock.staySegment.findFirst.mockResolvedValue(null)
      prismaMock.staySegment.create.mockResolvedValue(newSegment)
      prismaMock.segmentNight.createMany.mockResolvedValue({ count: 3 })
      prismaMock.stayJourney.update.mockResolvedValue({})
      prismaMock.stayJourneyEvent.create.mockResolvedValue({})

      // Act
      const result = await service.extendNewRoom({
        journeyId: 'journey-1',
        newRoomId: 'room-2',
        newCheckOut: '2026-04-10',
        actorId: 'actor-1',
      })

      // Assert
      expect(prismaMock.staySegment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: 'EXTENSION_NEW_ROOM',
            roomId: 'room-2',
          }),
        }),
      )
      expect(result.id).toBe('seg-2')
    })

    it('lanza ConflictException si la nueva habitación no está disponible', async () => {
      // CI-RESCUE 2026-05-15 — mismo patrón que extendSameRoom: el guard de
      // disponibilidad ahora usa AvailabilityService.check (no staySegment).
      const segment = makeSegment()
      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))
      availabilityMock.check.mockResolvedValueOnce({
        available: false,
        conflicts: [{ stayId: 'blocking-stay', roomId: 'room-2' }],
      })

      await expect(
        service.extendNewRoom({
          journeyId: 'journey-1',
          newRoomId: 'room-2',
          newCheckOut: '2026-04-10',
          actorId: 'actor-1',
        }),
      ).rejects.toThrow(ConflictException)
    })
  })

  // ─── executeMidStayRoomMove ─────────────────────────────────────────────────

  describe('executeMidStayRoomMove', () => {
    it('cierra segmento actual con status COMPLETED y locked true', async () => {
      // Arrange
      const segment = makeSegment()
      const newSegment = makeSegment({ id: 'seg-2', roomId: 'room-2', reason: 'ROOM_MOVE' })

      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))
      prismaMock.staySegment.findFirst.mockResolvedValue(null)
      prismaMock.segmentNight.updateMany.mockResolvedValue({ count: 0 })
      prismaMock.segmentNight.deleteMany.mockResolvedValue({ count: 3 })
      prismaMock.staySegment.update.mockResolvedValue({})
      prismaMock.staySegment.create.mockResolvedValue(newSegment)
      prismaMock.segmentNight.createMany.mockResolvedValue({ count: 3 })
      prismaMock.stayJourneyEvent.create.mockResolvedValue({})

      // Act
      await service.executeMidStayRoomMove({
        journeyId: 'journey-1',
        newRoomId: 'room-2',
        effectiveDate: '2026-04-12', // futuro
        actorId: 'actor-1',
      })

      // Assert
      expect(prismaMock.staySegment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'seg-1' },
          data: expect.objectContaining({ status: 'COMPLETED', locked: true }),
        }),
      )
    })

    it('crea nuevo segmento con reason ROOM_MOVE', async () => {
      // Arrange
      const segment = makeSegment()
      const newSegment = makeSegment({ id: 'seg-2', roomId: 'room-2', reason: 'ROOM_MOVE' })

      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))
      prismaMock.staySegment.findFirst.mockResolvedValue(null)
      prismaMock.segmentNight.updateMany.mockResolvedValue({ count: 0 })
      prismaMock.segmentNight.deleteMany.mockResolvedValue({ count: 3 })
      prismaMock.staySegment.update.mockResolvedValue({})
      prismaMock.staySegment.create.mockResolvedValue(newSegment)
      prismaMock.segmentNight.createMany.mockResolvedValue({ count: 3 })
      prismaMock.stayJourneyEvent.create.mockResolvedValue({})

      // Act
      const result = await service.executeMidStayRoomMove({
        journeyId: 'journey-1',
        newRoomId: 'room-2',
        effectiveDate: '2026-04-12',
        actorId: 'actor-1',
      })

      // Assert
      expect(prismaMock.staySegment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: 'ROOM_MOVE', roomId: 'room-2' }),
        }),
      )
      expect(result.id).toBe('seg-2')
    })

    it('lanza BadRequestException si effectiveDate es en el pasado', async () => {
      // Arrange
      const segment = makeSegment()
      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))

      // Act & Assert
      await expect(
        service.executeMidStayRoomMove({
          journeyId: 'journey-1',
          newRoomId: 'room-2',
          effectiveDate: '2026-01-01', // pasado
          actorId: 'actor-1',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('lanza BadRequestException si newRoomId === roomId actual', async () => {
      // Arrange
      const segment = makeSegment({ roomId: 'room-1' })
      prismaMock.stayJourney.findUnique.mockResolvedValue(makeJourney([segment]))

      // Act & Assert
      await expect(
        service.executeMidStayRoomMove({
          journeyId: 'journey-1',
          newRoomId: 'room-1', // misma habitación
          effectiveDate: '2026-04-12',
          actorId: 'actor-1',
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ─── confirmSegmentMove (Sprint MOVE-CONFIRM 2026-05-18) ──────────────────
  describe('confirmSegmentMove', () => {
    function makeJourneyWithMove() {
      const original = makeSegment({
        id: 'seg-original',
        roomId: 'room-1',
        reason: 'ORIGINAL',
        status: 'COMPLETED',
        checkIn: new Date('2026-04-01T00:00:00.000Z'),
        checkOut: new Date('2026-04-04T00:00:00.000Z'),
      })
      const moveSegment = makeSegment({
        id: 'seg-move',
        roomId: 'room-2',
        reason: 'ROOM_MOVE',
        status: 'ACTIVE',
        checkIn: new Date('2026-04-04T00:00:00.000Z'),
        checkOut: new Date('2026-04-07T00:00:00.000Z'),
        moveConfirmedAt: null,
      })
      const journey = makeJourney([original, moveSegment])
      // El método usa findUnique con include — devolvemos shape completo
      return {
        ...moveSegment,
        journey: {
          ...journey,
          guestStay: {
            id: 'stay-1',
            cancelledAt: null,
            noShowAt: null,
            actualCheckout: null,
            propertyId: 'prop-1',
          },
          segments: [original, moveSegment],
        },
      }
    }

    it('confirma move + crea audit event + promueve task PENDING → READY', async () => {
      const segmentWithIncludes = makeJourneyWithMove()
      prismaMock.staySegment.findUnique.mockResolvedValue(segmentWithIncludes as never)
      prismaMock.staySegment.update.mockResolvedValue({})
      prismaMock.stayJourneyEvent.create.mockResolvedValue({})
      // unit.findMany para promoteRoomChangeTaskToReady
      prismaMock.unit.findMany.mockResolvedValue([{ id: 'unit-1' }])
      // findFirst encuentra PENDING task existente
      prismaMock.cleaningTask.findFirst = jest.fn().mockResolvedValue({
        id: 'pending-task',
        status: 'PENDING',
      })
      prismaMock.cleaningTask.update = jest.fn().mockResolvedValue({})
      prismaMock.taskLog = { create: jest.fn().mockResolvedValue({}) } as never

      jest.useFakeTimers().setSystemTime(new Date('2026-04-04T10:00:00Z'))
      const result = await service.confirmSegmentMove('seg-move', 'actor-1')

      expect(result.previousRoomId).toBe('room-1')
      expect(prismaMock.staySegment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'seg-move' },
          data: expect.objectContaining({
            moveConfirmedAt: expect.any(Date),
            moveConfirmedById: 'actor-1',
          }),
        }),
      )
      // PENDING → READY
      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith({
        where: { id: 'pending-task' },
        data: { status: 'READY' },
      })
      jest.useRealTimers()
    })

    it('rechaza si segment.reason es ORIGINAL (no aplica mudanza física)', async () => {
      const segment = {
        ...makeSegment({ reason: 'ORIGINAL', status: 'ACTIVE', moveConfirmedAt: null }),
        journey: {
          ...makeJourney(),
          guestStay: { id: 's', cancelledAt: null, noShowAt: null, actualCheckout: null, propertyId: 'p' },
          segments: [],
        },
      }
      prismaMock.staySegment.findUnique.mockResolvedValue(segment as never)

      await expect(
        service.confirmSegmentMove('seg-1', 'actor-1'),
      ).rejects.toThrow(BadRequestException)
    })

    it('rechaza si segment ya tiene moveConfirmedAt (idempotency)', async () => {
      const segment = {
        ...makeSegment({
          reason: 'ROOM_MOVE',
          status: 'ACTIVE',
          moveConfirmedAt: new Date('2026-04-04T10:00:00Z'),
        }),
        journey: {
          ...makeJourney(),
          guestStay: { id: 's', cancelledAt: null, noShowAt: null, actualCheckout: null, propertyId: 'p' },
          segments: [],
        },
      }
      prismaMock.staySegment.findUnique.mockResolvedValue(segment as never)

      await expect(
        service.confirmSegmentMove('seg-1', 'actor-1'),
      ).rejects.toThrow(ConflictException)
    })

    it('rechaza si segment.checkIn es futuro (no se puede confirmar move adelantado)', async () => {
      const segment = {
        ...makeSegment({
          reason: 'EXTENSION_NEW_ROOM',
          status: 'ACTIVE',
          checkIn: new Date('2030-01-01T00:00:00Z'),
          moveConfirmedAt: null,
        }),
        journey: {
          ...makeJourney(),
          guestStay: { id: 's', cancelledAt: null, noShowAt: null, actualCheckout: null, propertyId: 'p' },
          segments: [],
        },
      }
      prismaMock.staySegment.findUnique.mockResolvedValue(segment as never)

      jest.useFakeTimers().setSystemTime(new Date('2026-04-04T10:00:00Z'))
      await expect(
        service.confirmSegmentMove('seg-1', 'actor-1'),
      ).rejects.toThrow(BadRequestException)
      jest.useRealTimers()
    })
  })
})
