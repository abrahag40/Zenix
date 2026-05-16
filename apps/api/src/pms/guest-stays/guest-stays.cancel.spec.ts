/**
 * guest-stays.cancel.spec.ts — Sprint CANCEL-ARCHIVE
 *
 * Tests del módulo cancel/restore. Cubre los 11 puntos del DoD del manual.
 */

import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { GuestStaysService } from './guest-stays.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { EmailService } from '../../common/email/email.service'
import { StayJourneyService } from '../stay-journeys/stay-journeys.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import { NotificationCenterService } from '../../notification-center/notification-center.service'
import { AssignmentService } from '../../assignment/assignment.service'
import { PushService } from '../../notifications/push.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { AvailabilityService } from '../availability/availability.service'

const ORG_ID = 'org-test-1'
const PROPERTY_ID = 'property-test-1'
const ROOM_ID = 'room-test-1'
const STAY_ID = 'stay-test-1'
const ACTOR_ID = 'staff-1'

const FUTURE_CHECKIN = new Date('2026-06-01T18:00:00.000Z')
const FUTURE_CHECKOUT = new Date('2026-06-04T12:00:00.000Z')

function makeStay(overrides: Record<string, unknown> = {}) {
  return {
    id: STAY_ID,
    organizationId: ORG_ID,
    propertyId: PROPERTY_ID,
    roomId: ROOM_ID,
    guestName: 'Ana García',
    currency: 'USD',
    ratePerNight: new Prisma.Decimal(120),
    totalAmount: new Prisma.Decimal(360),
    amountPaid: new Prisma.Decimal(0),
    checkinAt: FUTURE_CHECKIN,
    scheduledCheckout: FUTURE_CHECKOUT,
    actualCheckout: null,
    actualCheckin: null,
    noShowAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelInitiator: null,
    deletedAt: null,
    stayJourney: null,
    room: {
      id: ROOM_ID,
      status: 'AVAILABLE',
      property: { settings: { timezone: 'America/Mexico_City' } },
    },
    ...overrides,
  }
}

describe('GuestStaysService — cancel-archive', () => {
  let service: GuestStaysService

  const prismaMock = {
    guestStay: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    room: { update: jest.fn() },
    staySegment: { updateMany: jest.fn() },
    stayJourney: { update: jest.fn() },
    stayJourneyEvent: { create: jest.fn() },
    guestStayLog: { create: jest.fn() },
    $transaction: jest.fn((fnOrArr: unknown) => {
      if (typeof fnOrArr === 'function') {
        return (fnOrArr as (tx: typeof prismaMock) => unknown)(prismaMock)
      }
      return Promise.resolve(fnOrArr)
    }),
  }

  const tenantMock = { getOrganizationId: jest.fn().mockReturnValue(ORG_ID) }
  const eventsMock = { emit: jest.fn() }
  const availabilityMock = {
    notifyRelease: jest.fn().mockResolvedValue(undefined),
    notifyReservation: jest.fn().mockResolvedValue(undefined),
    check: jest.fn().mockResolvedValue({ available: true, conflicts: [] }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestStaysService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TenantContextService, useValue: tenantMock },
        { provide: EventEmitter2, useValue: eventsMock },
        { provide: EmailService, useValue: { send: jest.fn() } },
        { provide: StayJourneyService, useValue: { recordEvent: jest.fn() } },
        { provide: ChannexGateway, useValue: { pushInventory: jest.fn(), notifyRelease: jest.fn() } },
        { provide: NotificationCenterService, useValue: { send: jest.fn().mockResolvedValue(undefined) } },
        { provide: AssignmentService, useValue: { autoAssign: jest.fn().mockResolvedValue(undefined) } },
        { provide: PushService, useValue: { sendToStaff: jest.fn().mockResolvedValue(undefined), sendBatch: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: AvailabilityService, useValue: availabilityMock },
      ],
    }).compile()

    service = module.get<GuestStaysService>(GuestStaysService)
    jest.clearAllMocks()
  })

  // ── cancelStay ────────────────────────────────────────────────────────────

  describe('cancelStay', () => {
    it('cancela una reserva futura sin journey — happy path GUEST initiator', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      const result = await service.cancelStay(STAY_ID, ACTOR_ID, {
        initiator: 'GUEST',
        reason: 'Plan de viaje cambió',
      })

      expect(result.ok).toBe(true)
      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelInitiator: 'GUEST',
            cancelReason: 'Plan de viaje cambió',
            cancelledById: ACTOR_ID,
            requiresFiscalReview: false, // amountPaid=0 → no fiscal review
          }),
        }),
      )
      expect(prismaMock.guestStayLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'CANCELLED',
            actorId: ACTOR_ID,
          }),
        }),
      )
    })

    it('marca requiresFiscalReview=true si hubo pago y no es ADMIN_ERROR', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ amountPaid: new Prisma.Decimal(120) }),
      )

      await service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'GUEST' })

      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresFiscalReview: true }),
        }),
      )
    })

    it('NO marca fiscal review si initiator es ADMIN_ERROR (no hubo operación real)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ amountPaid: new Prisma.Decimal(120) }),
      )

      await service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'ADMIN_ERROR' })

      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresFiscalReview: false }),
        }),
      )
    })

    it('rechaza si la stay ya está cancelada (idempotencia)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ cancelledAt: new Date() }),
      )

      await expect(
        service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'GUEST' }),
      ).rejects.toThrow(ConflictException)
    })

    it('rechaza si la stay tiene check-in confirmado (huésped en casa)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ actualCheckin: new Date() }),
      )

      await expect(
        service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'GUEST' }),
      ).rejects.toThrow('check-in')
    })

    it('rechaza si la stay tiene checkout (departed)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ actualCheckout: new Date() }),
      )

      await expect(
        service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'HOTEL' }),
      ).rejects.toThrow('checkout')
    })

    it('rechaza si la stay es no-show', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ noShowAt: new Date() }),
      )

      await expect(
        service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'GUEST' }),
      ).rejects.toThrow('no-show')
    })

    it('cascade journey + segments si la stay tiene journey', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ stayJourney: { id: 'journey-1' } }),
      )

      await service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'GUEST' })

      expect(prismaMock.staySegment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ journeyId: 'journey-1' }),
          data: { status: 'CANCELLED' },
        }),
      )
      expect(prismaMock.stayJourney.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      )
    })

    it('emite stay.cancelled event', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())
      await service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'OTA' })
      expect(eventsMock.emit).toHaveBeenCalledWith(
        'stay.cancelled',
        expect.objectContaining({ stayId: STAY_ID, initiator: 'OTA' }),
      )
    })

    it('persiste metadata extensible (string fields + JSON, sin migration)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())
      await service.cancelStay(STAY_ID, ACTOR_ID, {
        initiator: 'OTA',
        cancelledFromChannel: 'CHANNEX_WEBHOOK',
        metadata: { otaCancelCode: 'BDC_GUEST_REQUEST', refundAmount: 250 },
      })
      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelledFromChannel: 'CHANNEX_WEBHOOK',
            cancelMetadata: { otaCancelCode: 'BDC_GUEST_REQUEST', refundAmount: 250 },
          }),
        }),
      )
    })
  })

  // ── restoreStay ───────────────────────────────────────────────────────────

  describe('restoreStay', () => {
    function makeCancelledStay(initiator: string, cancelledDaysAgo: number) {
      const cancelledAt = new Date(Date.now() - cancelledDaysAgo * 86_400_000)
      return makeStay({ cancelledAt, cancelInitiator: initiator, cancelReason: 'test' })
    }

    it('restaura cancelación ADMIN_ERROR dentro de 7 días', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeCancelledStay('ADMIN_ERROR', 2))

      const result = await service.restoreStay(STAY_ID, ACTOR_ID)

      expect(result.ok).toBe(true)
      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelledAt: null,
            cancelInitiator: null,
          }),
        }),
      )
      expect(prismaMock.guestStayLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: 'RESTORED' }),
        }),
      )
    })

    it('restaura cancelación HOTEL dentro de 7 días', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeCancelledStay('HOTEL', 5))
      const result = await service.restoreStay(STAY_ID, ACTOR_ID)
      expect(result.ok).toBe(true)
    })

    it('rechaza restore si initiator es GUEST (mejor crear reserva nueva)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeCancelledStay('GUEST', 1))
      await expect(service.restoreStay(STAY_ID, ACTOR_ID)).rejects.toThrow(
        /hotel o por error administrativo/,
      )
    })

    it('rechaza restore si initiator es OTA', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeCancelledStay('OTA', 1))
      await expect(service.restoreStay(STAY_ID, ACTOR_ID)).rejects.toThrow(ConflictException)
    })

    it('rechaza restore si pasaron más de 7 días', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeCancelledStay('ADMIN_ERROR', 8))
      await expect(service.restoreStay(STAY_ID, ACTOR_ID)).rejects.toThrow(/7 días/)
    })

    it('rechaza restore si habitación ya está ocupada por otro huésped en esas fechas', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeCancelledStay('ADMIN_ERROR', 1))
      availabilityMock.check.mockResolvedValueOnce({
        available: false,
        conflicts: [{ label: 'Otro Huésped', source: 'LOCAL_STAY' }],
      })
      await expect(service.restoreStay(STAY_ID, ACTOR_ID)).rejects.toThrow(/ocupada/)
    })

    it('rechaza si la stay no está cancelada', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())
      await expect(service.restoreStay(STAY_ID, ACTOR_ID)).rejects.toThrow(/no está cancelada/)
    })

    it('emite stay.restored event', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeCancelledStay('HOTEL', 1))
      await service.restoreStay(STAY_ID, ACTOR_ID)
      expect(eventsMock.emit).toHaveBeenCalledWith(
        'stay.restored',
        expect.objectContaining({ stayId: STAY_ID }),
      )
    })
  })

  // ── 404 ──────────────────────────────────────────────────────────────────
  it('cancelStay lanza 404 si la stay no existe', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(null)
    await expect(
      service.cancelStay(STAY_ID, ACTOR_ID, { initiator: 'GUEST' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('restoreStay lanza 404 si la stay no existe', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(null)
    await expect(service.restoreStay(STAY_ID, ACTOR_ID)).rejects.toThrow(NotFoundException)
  })
})
