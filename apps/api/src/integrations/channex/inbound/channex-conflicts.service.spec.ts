/**
 * ChannexConflictsService — D-CHX5 resolution surface tests.
 *
 * Cubre:
 *   - listConflicts retorna stays con channexConflict=true + cancelledAt=null
 *   - MOVE_ROOM con availability ok → updates roomId + clears flag + audit
 *   - MOVE_ROOM con availability fail → ConflictException
 *   - MOVE_ROOM al mismo room → rechaza
 *   - CANCEL_LOCAL → soft-cancel + audit + libera room + NO outbound call
 *   - CANCEL_AT_OTA happy → soft-cancel + outbound PUT Channex
 *   - CANCEL_AT_OTA falla outbound → local cancel committed + audit error
 *   - MARK_REVIEWED → solo clear flag + audit
 *   - stay no encontrada → NotFoundException
 *   - stay sin flag → ConflictException
 */

import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { AvailabilityService } from '../../../pms/availability/availability.service'
import { TenantContextService } from '../../../common/tenant-context.service'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexGateway, ChannexHttpError } from '../channex.gateway'
import { NotificationsService } from '../../../notifications/notifications.service'
import { ChannexConflictsService } from './channex-conflicts.service'

function makeStay(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stay-1',
    organizationId: 'org-1',
    propertyId: 'prop-1',
    roomId: 'room-a1',
    guestName: 'Maria Garcia',
    checkinAt: new Date('2026-06-01T21:30:00Z'),
    scheduledCheckout: new Date('2026-06-04T16:00:00Z'),
    amountPaid: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal('450.00'),
    currency: 'USD',
    paymentModel: 'HOTEL_COLLECT',
    notes: null,
    channexBookingId: 'book-1',
    channexOtaName: 'Booking.com',
    channexConflict: true,
    channexLastSyncAt: new Date('2026-05-22T18:00:00Z'),
    cancelledAt: null,
    room: { id: 'room-a1', number: 'A1', status: 'OCCUPIED', category: 'PRIVATE' },
    ...overrides,
  }
}

function makePrismaMock() {
  const tx = {
    guestStay: { update: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
    guestStayLog: { create: jest.fn().mockResolvedValue({}) },
    room: { update: jest.fn().mockResolvedValue({}) },
  }
  return {
    tx,
    guestStay: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    guestStayLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    room: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  }
}

describe('ChannexConflictsService', () => {
  let svc: ChannexConflictsService
  let prisma: ReturnType<typeof makePrismaMock>
  let tenant: { getPropertyId: jest.Mock; getOrganizationId: jest.Mock }
  let availability: { check: jest.Mock }
  let gateway: { cancelBookingAtChannex: jest.Mock }
  let notifications: { emit: jest.Mock }

  beforeEach(async () => {
    prisma = makePrismaMock()
    tenant = {
      getPropertyId: jest.fn().mockReturnValue('prop-1'),
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    }
    availability = { check: jest.fn() }
    gateway = { cancelBookingAtChannex: jest.fn() }
    notifications = { emit: jest.fn() }

    const mod = await Test.createTestingModule({
      providers: [
        ChannexConflictsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenant },
        { provide: AvailabilityService, useValue: availability },
        { provide: ChannexGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile()
    svc = mod.get(ChannexConflictsService)
  })

  describe('listConflicts', () => {
    it('retorna stays con channexConflict=true (excluye cancelled)', async () => {
      prisma.guestStay.findMany.mockResolvedValue([makeStay()])
      const result = await svc.listConflicts()
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        stayId: 'stay-1',
        channexBookingId: 'book-1',
        channexOtaName: 'Booking.com',
        roomNumber: 'A1',
      })
      expect(prisma.guestStay.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channexConflict: true,
            cancelledAt: null,
            organizationId: 'org-1',
            propertyId: 'prop-1',
          }),
        }),
      )
    })
  })

  describe('resolve guards', () => {
    it('stay no existe → NotFoundException', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(null)
      await expect(
        svc.resolve('stay-x', 'actor-1', { kind: 'MARK_REVIEWED' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('stay sin flag conflict → ConflictException', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay({ channexConflict: false }))
      await expect(
        svc.resolve('stay-1', 'actor-1', { kind: 'MARK_REVIEWED' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('stay ya cancelled → ConflictException', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(
        makeStay({ cancelledAt: new Date(), channexConflict: true }),
      )
      await expect(
        svc.resolve('stay-1', 'actor-1', { kind: 'MARK_REVIEWED' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('MOVE_ROOM', () => {
    it('happy: update roomId + clear flag + audit', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())
      prisma.room.findFirst.mockResolvedValue({ id: 'room-b2', number: 'B2' })
      availability.check.mockResolvedValue({ available: true, conflicts: [], checkedChannex: false })

      const result = await svc.resolve('stay-1', 'actor-1', {
        kind: 'MOVE_ROOM',
        newRoomId: 'room-b2',
      })

      expect(result).toEqual({
        kind: 'moved',
        stayId: 'stay-1',
        newRoomId: 'room-b2',
        newRoomNumber: 'B2',
      })
      const updateCall = prisma.tx.guestStay.update.mock.calls[0][0]
      expect(updateCall.data).toEqual({ roomId: 'room-b2', channexConflict: false })
      // Audit log
      const logCall = prisma.tx.guestStayLog.create.mock.calls[0][0]
      expect(logCall.data.event).toBe('CONFLICT_RESOLVED')
      expect(logCall.data.metadata.action).toBe('MOVE_ROOM')
      expect(logCall.data.metadata.previousRoomNumber).toBe('A1')
      expect(logCall.data.metadata.newRoomNumber).toBe('B2')
    })

    it('rechaza si destino es el mismo room', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())
      await expect(
        svc.resolve('stay-1', 'actor-1', { kind: 'MOVE_ROOM', newRoomId: 'room-a1' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('rechaza si availability check falla', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())
      prisma.room.findFirst.mockResolvedValue({ id: 'room-b2', number: 'B2' })
      availability.check.mockResolvedValue({
        available: false,
        conflicts: [{ source: 'LOCAL_STAY', id: 'x', label: 'x', from: new Date(), to: new Date() }],
        checkedChannex: false,
      })
      await expect(
        svc.resolve('stay-1', 'actor-1', { kind: 'MOVE_ROOM', newRoomId: 'room-b2' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('rechaza si destino no existe', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())
      prisma.room.findFirst.mockResolvedValue(null)
      await expect(
        svc.resolve('stay-1', 'actor-1', { kind: 'MOVE_ROOM', newRoomId: 'room-x' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('CANCEL_LOCAL', () => {
    it('soft-cancel + audit + room AVAILABLE (no outbound call)', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())

      const result = await svc.resolve('stay-1', 'actor-1', {
        kind: 'CANCEL_LOCAL',
        reason: 'guest no-show via OTA',
      })

      expect(result.kind).toBe('cancelled')
      expect((result as { propagatedToChannex: boolean }).propagatedToChannex).toBe(false)
      expect(gateway.cancelBookingAtChannex).not.toHaveBeenCalled()

      const cancelCall = prisma.tx.guestStay.update.mock.calls[0][0]
      expect(cancelCall.data.cancelInitiator).toBe('HOTEL')
      expect(cancelCall.data.cancelledFromChannel).toBe('PMS_DIRECT')
      expect(cancelCall.data.channexConflict).toBe(false)
      // Room flipped to AVAILABLE
      expect(prisma.tx.room.update).toHaveBeenCalledWith({
        where: { id: 'room-a1' },
        data: { status: 'AVAILABLE' },
      })
    })

    it('amountPaid > 0 → requiresFiscalReview=true', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(
        makeStay({ amountPaid: new Prisma.Decimal('100.00') }),
      )
      await svc.resolve('stay-1', 'actor-1', { kind: 'CANCEL_LOCAL' })
      const cancelCall = prisma.tx.guestStay.update.mock.calls[0][0]
      expect(cancelCall.data.requiresFiscalReview).toBe(true)
    })
  })

  describe('CANCEL_AT_OTA', () => {
    it('happy: cancel local + outbound PUT Channex OK', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())
      gateway.cancelBookingAtChannex.mockResolvedValue({ ok: true, status: 200 })

      const result = await svc.resolve('stay-1', 'actor-1', {
        kind: 'CANCEL_AT_OTA',
        reason: 'manager review',
      })

      expect(result.kind).toBe('cancelled')
      expect((result as { propagatedToChannex: boolean }).propagatedToChannex).toBe(true)
      expect((result as { channexAck: boolean }).channexAck).toBe(true)
      expect(gateway.cancelBookingAtChannex).toHaveBeenCalledWith('book-1', 'manager review')
    })

    it('outbound Channex falla → local cancel commit + audit del error', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())
      gateway.cancelBookingAtChannex.mockRejectedValue(new ChannexHttpError('500 boom', 500))

      const result = await svc.resolve('stay-1', 'actor-1', { kind: 'CANCEL_AT_OTA' })

      expect(result.kind).toBe('cancelled')
      expect((result as { channexAck: boolean }).channexAck).toBe(false)
      expect((result as { channexError: string | null }).channexError).toContain('500 boom')
      // Local cancel committed (tx.guestStay.update was called)
      expect(prisma.tx.guestStay.update).toHaveBeenCalled()
      // Audit log for the propagation failure (called OUTSIDE the tx)
      const failLog = prisma.guestStayLog.create.mock.calls.find(
        (c) => c[0].data.event === 'CHANNEX_PROPAGATION_FAILED',
      )
      expect(failLog).toBeDefined()
      expect(failLog?.[0].data.metadata.httpStatus).toBe(500)
    })
  })

  describe('MARK_REVIEWED', () => {
    it('solo clear flag + audit', async () => {
      prisma.guestStay.findFirst.mockResolvedValue(makeStay())

      const result = await svc.resolve('stay-1', 'actor-1', {
        kind: 'MARK_REVIEWED',
        reason: 'verified by phone',
      })

      expect(result).toEqual({ kind: 'marked_reviewed', stayId: 'stay-1' })
      const updateCall = prisma.tx.guestStay.update.mock.calls[0][0]
      expect(updateCall.data).toEqual({ channexConflict: false })
      // NO cancel write
      expect(updateCall.data).not.toHaveProperty('cancelledAt')
    })
  })
})
