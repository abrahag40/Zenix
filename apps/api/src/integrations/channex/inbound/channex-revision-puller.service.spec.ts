/**
 * ChannexRevisionPullerService — Day 2 pull → save → ack orchestration.
 *
 * Cubre: happy path (SUCCEEDED), terminal 404 (DEAD_LETTER), 5xx transient
 * (FAILED con backoff), exhausted attempts (DEAD_LETTER), bare event
 * sin revisionId (SUCCEEDED noop), status no procesable (SKIPPED).
 */

import { Test } from '@nestjs/testing'
import {
  ChannexBookingRevision,
  ChannexGateway,
  ChannexHttpError,
} from '../channex.gateway'
import { ChannexRevisionPullerService } from './channex-revision-puller.service'
import { PrismaService } from '../../../prisma/prisma.service'
import { BookingCancelHandler } from './handlers/booking-cancel.handler'
import { BookingModifyHandler } from './handlers/booking-modify.handler'
import { BookingNewHandler } from './handlers/booking-new.handler'
import { ChannexNotifService } from './channex-notif.service'

function makeRevision(overrides: Partial<ChannexBookingRevision> = {}): ChannexBookingRevision {
  return {
    id: 'rev-1',
    property_id: 'prop-1',
    booking_id: 'book-1',
    status: 'new',
    arrival_date: '2026-06-01',
    departure_date: '2026-06-03',
    currency: 'USD',
    amount: '200.00',
    rooms: [],
    ota_name: 'Booking.com',
    ...overrides,
  }
}

describe('ChannexRevisionPullerService', () => {
  let svc: ChannexRevisionPullerService
  let prisma: {
    channexOutbox: {
      findUnique: jest.Mock
      update: jest.Mock
    }
  }
  let gateway: {
    getBookingRevision: jest.Mock
    ackBookingRevision: jest.Mock
  }
  let bookingNew: { handle: jest.Mock }
  let bookingModify: { handle: jest.Mock }
  let bookingCancel: { handle: jest.Mock }

  beforeEach(async () => {
    prisma = {
      channexOutbox: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    gateway = {
      getBookingRevision: jest.fn(),
      ackBookingRevision: jest.fn(),
    }
    bookingNew = {
      handle: jest.fn().mockResolvedValue({ kind: 'created', stayId: 'stay-1', roomId: 'room-a1' }),
    }
    bookingModify = {
      handle: jest.fn().mockResolvedValue({ kind: 'updated', stayId: 'stay-1', restrictedToSafeFields: false }),
    }
    bookingCancel = {
      handle: jest.fn().mockResolvedValue({ kind: 'cancelled', stayId: 'stay-1' }),
    }
    const channexNotif = {
      raiseConflict: jest.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    }
    // Make prisma.property.findUnique mock-ready for channel event tests
    ;(prisma as unknown as { property: { findUnique: jest.Mock } }).property = {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    }
    const mod = await Test.createTestingModule({
      providers: [
        ChannexRevisionPullerService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChannexGateway, useValue: gateway },
        { provide: BookingNewHandler, useValue: bookingNew },
        { provide: BookingModifyHandler, useValue: bookingModify },
        { provide: BookingCancelHandler, useValue: bookingCancel },
        { provide: ChannexNotifService, useValue: channexNotif },
      ],
    }).compile()
    svc = mod.get(ChannexRevisionPullerService)
  })

  it('happy path: pull → ack → SUCCEEDED', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-1',
      propertyId: 'prop-1',
      eventType: 'booking_new',
      channexRevisionId: 'rev-1',
      attempts: 0,
      status: 'PENDING',
    })
    gateway.getBookingRevision.mockResolvedValue(makeRevision())
    gateway.ackBookingRevision.mockResolvedValue({ acked: true, alreadyAcked: false })

    const result = await svc.processOutboxRow('out-1')

    expect(result.status).toBe('SUCCEEDED')
    expect(gateway.getBookingRevision).toHaveBeenCalledWith('rev-1')
    expect(gateway.ackBookingRevision).toHaveBeenCalledWith('rev-1')

    // 3 updates: IN_PROGRESS, then SUCCEEDED
    const updateCalls = prisma.channexOutbox.update.mock.calls
    expect(updateCalls.find((c) => c[0].data.status === 'IN_PROGRESS')).toBeDefined()
    expect(updateCalls.find((c) => c[0].data.status === 'SUCCEEDED')).toBeDefined()
  })

  it('404 de Channex → DEAD_LETTER (revision purged, no reintentos)', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-1',
      propertyId: 'prop-1',
      eventType: 'booking_new',
      channexRevisionId: 'rev-404',
      attempts: 0,
      status: 'PENDING',
    })
    gateway.getBookingRevision.mockRejectedValue(new ChannexHttpError('not found', 404))

    const result = await svc.processOutboxRow('out-1')

    expect(result.status).toBe('DEAD_LETTER')
    const final = prisma.channexOutbox.update.mock.calls.find(
      (c) => c[0].data.status === 'DEAD_LETTER',
    )
    expect(final).toBeDefined()
    expect(final?.[0].data.lastError).toContain('not found')
  })

  it('500 transient → FAILED con backoff exponencial 2^attempts', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-1',
      propertyId: 'prop-1',
      eventType: 'booking_new',
      channexRevisionId: 'rev-1',
      attempts: 1, // próximo intento será 2
      status: 'FAILED',
    })
    gateway.getBookingRevision.mockRejectedValue(new ChannexHttpError('boom', 500))

    const before = Date.now()
    const result = await svc.processOutboxRow('out-1')

    expect(result.status).toBe('FAILED')
    const final = prisma.channexOutbox.update.mock.calls.find(
      (c) => c[0].data.status === 'FAILED',
    )
    expect(final).toBeDefined()
    // 2^2 = 4 seconds backoff. Allow some slack for clock drift.
    const nextAttempt = final?.[0].data.nextAttemptAt as Date
    const deltaSec = (nextAttempt.getTime() - before) / 1000
    expect(deltaSec).toBeGreaterThanOrEqual(3.5)
    expect(deltaSec).toBeLessThanOrEqual(5)
  })

  it('attempts >= 5 → DEAD_LETTER por exhaustion aunque sea transient', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-1',
      propertyId: 'prop-1',
      eventType: 'booking_new',
      channexRevisionId: 'rev-1',
      attempts: 4, // próximo intento = 5 (último)
      status: 'FAILED',
    })
    gateway.getBookingRevision.mockRejectedValue(new ChannexHttpError('boom', 500))

    const result = await svc.processOutboxRow('out-1')
    expect(result.status).toBe('DEAD_LETTER')
  })

  it('bare event sin revisionId → SUCCEEDED noop (no llama gateway)', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-1',
      propertyId: 'prop-1',
      eventType: 'availability_modify',
      channexRevisionId: null,
      attempts: 0,
      status: 'PENDING',
    })

    const result = await svc.processOutboxRow('out-1')

    expect(result.status).toBe('SUCCEEDED')
    expect(gateway.getBookingRevision).not.toHaveBeenCalled()
    expect(gateway.ackBookingRevision).not.toHaveBeenCalled()
  })

  it('skip cuando outbox row no existe', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue(null)
    const result = await svc.processOutboxRow('out-missing')
    expect(result.status).toBe('SKIPPED')
  })

  it('skip cuando outbox row ya está SUCCEEDED (no re-procesar)', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-1',
      propertyId: 'prop-1',
      eventType: 'booking_new',
      channexRevisionId: 'rev-1',
      attempts: 1,
      status: 'SUCCEEDED',
    })
    const result = await svc.processOutboxRow('out-1')
    expect(result.status).toBe('SKIPPED')
  })

  it('dispatch: revision.status=modified → BookingModifyHandler', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-m',
      propertyId: 'prop-1',
      eventType: 'booking_modification',
      channexRevisionId: 'rev-m',
      attempts: 0,
      status: 'PENDING',
    })
    gateway.getBookingRevision.mockResolvedValue(makeRevision({ id: 'rev-m', status: 'modified' }))
    gateway.ackBookingRevision.mockResolvedValue({ acked: true, alreadyAcked: false })

    const result = await svc.processOutboxRow('out-m')

    expect(result.status).toBe('SUCCEEDED')
    expect(bookingModify.handle).toHaveBeenCalledTimes(1)
    expect(bookingNew.handle).not.toHaveBeenCalled()
    expect(bookingCancel.handle).not.toHaveBeenCalled()
  })

  it('dispatch: revision.status=cancelled → BookingCancelHandler', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-c',
      propertyId: 'prop-1',
      eventType: 'booking_cancellation',
      channexRevisionId: 'rev-c',
      attempts: 0,
      status: 'PENDING',
    })
    gateway.getBookingRevision.mockResolvedValue(
      makeRevision({ id: 'rev-c', status: 'cancelled' }),
    )
    gateway.ackBookingRevision.mockResolvedValue({ acked: true, alreadyAcked: false })

    const result = await svc.processOutboxRow('out-c')

    expect(result.status).toBe('SUCCEEDED')
    expect(bookingCancel.handle).toHaveBeenCalledTimes(1)
    expect(bookingNew.handle).not.toHaveBeenCalled()
    expect(bookingModify.handle).not.toHaveBeenCalled()
  })

  it('handler throw → NO ack y outbox queda FAILED para retry (regla "ack on save")', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-err',
      propertyId: 'prop-1',
      eventType: 'booking_new',
      channexRevisionId: 'rev-err',
      attempts: 0,
      status: 'PENDING',
    })
    gateway.getBookingRevision.mockResolvedValue(makeRevision({ id: 'rev-err' }))
    bookingNew.handle.mockRejectedValueOnce(new Error('DB write failed'))

    const result = await svc.processOutboxRow('out-err')

    expect(result.status).toBe('FAILED')
    // Critical: ack must NOT be called when the handler throws
    expect(gateway.ackBookingRevision).not.toHaveBeenCalled()
  })

  it('ack idempotente: alreadyAcked=true se considera éxito', async () => {
    prisma.channexOutbox.findUnique.mockResolvedValue({
      id: 'out-1',
      propertyId: 'prop-1',
      eventType: 'booking_modify',
      channexRevisionId: 'rev-1',
      attempts: 1,
      status: 'PENDING',
    })
    gateway.getBookingRevision.mockResolvedValue(makeRevision({ status: 'modified' }))
    gateway.ackBookingRevision.mockResolvedValue({ acked: true, alreadyAcked: true })

    const result = await svc.processOutboxRow('out-1')
    expect(result.status).toBe('SUCCEEDED')
  })
})
