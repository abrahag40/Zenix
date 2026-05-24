/**
 * ChannexOutboundWorker — cert AP-2.2 + AP-2.3 + Test 12 coverage.
 *
 * Cubre:
 *   · Happy path: PENDING → IN_PROGRESS → SUCCEEDED + pushAvailability call
 *   · Dispatch by kind: AVAILABILITY → pushAvailability, RATES_RESTRICTIONS → pushRestrictions
 *   · Token bucket exhausted → DEFERRED (NO attempt counter increment, NO Gateway call)
 *   · 429 → FAILED con backoff min 60s
 *   · 500 → FAILED con exp backoff 2^attempts
 *   · 401 → DEAD_LETTER inmediato + AppNotif
 *   · 400 → DEAD_LETTER inmediato (bad payload terminal)
 *   · attempts >= 5 → DEAD_LETTER + AppNotif
 *   · row missing / SUCCEEDED → skip silente
 *   · empty pickup → no-op
 *   · running guard → segundo tick concurrente noop
 */

import { Test } from '@nestjs/testing'
import { ChannexGateway, ChannexHttpError } from '../channex.gateway'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexOutboundNotifService } from './channex-outbound-notif.service'
import { ChannexOutboundWorker } from './channex-outbound-worker.service'
import { ChannexTokenBucketService } from './channex-token-bucket.service'

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'out-1',
    propertyId: 'p1',
    kind: 'AVAILABILITY' as const,
    payload: {
      entries: [
        { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 3 },
      ],
    },
    attempts: 0,
    status: 'PENDING' as const,
    ...overrides,
  }
}

describe('ChannexOutboundWorker', () => {
  let worker: ChannexOutboundWorker
  let prisma: {
    channexOutboundQueue: { findUnique: jest.Mock; update: jest.Mock }
    property: { findUnique: jest.Mock }
    guestStay: { updateMany: jest.Mock }
    $queryRaw: jest.Mock
  }
  let gateway: {
    pushAvailability: jest.Mock
    pushRestrictions: jest.Mock
    cancelBookingAtChannex: jest.Mock
  }
  let bucket: { consume: jest.Mock }
  let notif: { raiseDeadLetter: jest.Mock }

  beforeEach(async () => {
    prisma = {
      channexOutboundQueue: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      property: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      guestStay: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    }
    gateway = {
      pushAvailability: jest.fn().mockResolvedValue(undefined),
      pushRestrictions: jest.fn().mockResolvedValue(undefined),
      cancelBookingAtChannex: jest.fn().mockResolvedValue({ ok: true, status: 200 }),
    }
    bucket = {
      consume: jest.fn().mockReturnValue({ ok: true }),
    }
    notif = {
      raiseDeadLetter: jest.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    }

    const mod = await Test.createTestingModule({
      providers: [
        ChannexOutboundWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: ChannexGateway, useValue: gateway },
        { provide: ChannexTokenBucketService, useValue: bucket },
        { provide: ChannexOutboundNotifService, useValue: notif },
      ],
    }).compile()
    worker = mod.get(ChannexOutboundWorker)
  })

  it('happy: AVAILABILITY → pushAvailability + SUCCEEDED', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow())

    const result = await worker.drain()

    expect(result.picked).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(gateway.pushAvailability).toHaveBeenCalledTimes(1)
    expect(gateway.pushRestrictions).not.toHaveBeenCalled()

    // 2 updates: IN_PROGRESS, then SUCCEEDED
    const statuses = prisma.channexOutboundQueue.update.mock.calls.map((c) => c[0].data.status)
    expect(statuses).toContain('IN_PROGRESS')
    expect(statuses).toContain('SUCCEEDED')
  })

  it('dispatch by kind: RATES_RESTRICTIONS → pushRestrictions', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-2' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(
      makeRow({
        kind: 'RATES_RESTRICTIONS',
        payload: { entries: [{ propertyId: 'p1', ratePlanId: 'rp1', date: '2026-06-01', rate: 250 }] },
      }),
    )

    await worker.drain()

    expect(gateway.pushRestrictions).toHaveBeenCalledTimes(1)
    expect(gateway.pushAvailability).not.toHaveBeenCalled()
  })

  it('dispatch by kind: BOOKING_CANCEL → cancelBookingAtChannex + stay sync timestamp (Sprint CHANNEX-UX-E2-E3)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-cancel-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(
      makeRow({
        id: 'out-cancel-1',
        kind: 'BOOKING_CANCEL',
        payload: {
          channexBookingId: 'chx-booking-xyz',
          stayId: 'stay-1',
          channexOtaName: 'booking_com',
          reason: 'Huésped solicitó',
        },
      }),
    )

    const result = await worker.drain()

    expect(result.succeeded).toBe(1)
    expect(gateway.cancelBookingAtChannex).toHaveBeenCalledWith('chx-booking-xyz', 'Huésped solicitó')
    expect(gateway.pushAvailability).not.toHaveBeenCalled()
    expect(gateway.pushRestrictions).not.toHaveBeenCalled()
    // Chip post-push: stay.channexLastSyncAt actualizado para BookingDetailSheet
    expect(prisma.guestStay.updateMany).toHaveBeenCalledWith({
      where: { id: 'stay-1' },
      data: { channexLastSyncAt: expect.any(Date) },
    })
  })

  it('BOOKING_CANCEL sin reason → cancelBookingAtChannex con reason undefined', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-cancel-2' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(
      makeRow({
        id: 'out-cancel-2',
        kind: 'BOOKING_CANCEL',
        payload: {
          channexBookingId: 'chx-booking-abc',
          stayId: 'stay-2',
          channexOtaName: 'expedia',
          reason: null,
        },
      }),
    )

    await worker.drain()

    expect(gateway.cancelBookingAtChannex).toHaveBeenCalledWith('chx-booking-abc', undefined)
  })

  it('BOOKING_CANCEL → 404 terminal (Channex booking ya purged) → DEAD_LETTER + AppNotif', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-cancel-3' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(
      makeRow({
        id: 'out-cancel-3',
        kind: 'BOOKING_CANCEL',
        payload: {
          channexBookingId: 'chx-booking-purged',
          stayId: 'stay-3',
          channexOtaName: 'airbnb',
          reason: null,
        },
      }),
    )
    gateway.cancelBookingAtChannex.mockRejectedValueOnce(
      new ChannexHttpError('cancelBookingAtChannex chx-booking-purged HTTP 404: Not Found', 404),
    )

    const result = await worker.drain()

    expect(result.deadLetter).toBe(1)
    expect(notif.raiseDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'BOOKING_CANCEL',
        httpStatus: 404,
      }),
    )
    // El stay NO debe marcarse synced si el push falló
    expect(prisma.guestStay.updateMany).not.toHaveBeenCalled()
  })

  it('token bucket exhausted → DEFERRED (no Gateway call, no attempt counter++)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow({ attempts: 0 }))
    bucket.consume.mockReturnValue({ ok: false, retryAfterMs: 30_000 })

    const result = await worker.drain()

    expect(result.deferred).toBe(1)
    expect(result.succeeded).toBe(0)
    expect(gateway.pushAvailability).not.toHaveBeenCalled()

    // Only ONE update (deferred reschedule) — no IN_PROGRESS, no attempt++
    expect(prisma.channexOutboundQueue.update).toHaveBeenCalledTimes(1)
    const update = prisma.channexOutboundQueue.update.mock.calls[0][0]
    expect(update.data.status).toBe('PENDING')
    expect(update.data.nextAttemptAt).toBeInstanceOf(Date)
    // attempts NO se incrementa
    expect(update.data.attempts).toBeUndefined()
  })

  it('429 → FAILED con backoff min 60s', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow({ attempts: 1 }))
    gateway.pushAvailability.mockRejectedValue(new ChannexHttpError('rate limit', 429))

    const before = Date.now()
    const result = await worker.drain()

    expect(result.failed).toBe(1)
    const failedUpdate = prisma.channexOutboundQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'FAILED',
    )
    expect(failedUpdate).toBeDefined()
    const nextAttempt = failedUpdate?.[0].data.nextAttemptAt as Date
    const delaySec = (nextAttempt.getTime() - before) / 1000
    expect(delaySec).toBeGreaterThanOrEqual(60) // min 60s per Channex docs
    expect(delaySec).toBeLessThanOrEqual(65)
  })

  it('500 → FAILED con exp backoff 2^attempts s', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow({ attempts: 2 }))
    gateway.pushAvailability.mockRejectedValue(new ChannexHttpError('boom', 500))

    const before = Date.now()
    await worker.drain()

    const failedUpdate = prisma.channexOutboundQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'FAILED',
    )
    const nextAttempt = failedUpdate?.[0].data.nextAttemptAt as Date
    const delaySec = (nextAttempt.getTime() - before) / 1000
    // 2^3 = 8s backoff (attempts 2+1=3 después del increment)
    expect(delaySec).toBeGreaterThanOrEqual(7.5)
    expect(delaySec).toBeLessThanOrEqual(9)
  })

  it('401 → DEAD_LETTER inmediato + AppNotif (api-key broken)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow({ attempts: 0 }))
    gateway.pushAvailability.mockRejectedValue(new ChannexHttpError('unauth', 401))

    const result = await worker.drain()

    expect(result.deadLetter).toBe(1)
    const dlUpdate = prisma.channexOutboundQueue.update.mock.calls.find(
      (c) => c[0].data.status === 'DEAD_LETTER',
    )
    expect(dlUpdate).toBeDefined()
    expect(notif.raiseDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        propertyId: 'p1',
        httpStatus: 401,
        attempts: 1,
      }),
    )
  })

  it('400 → DEAD_LETTER inmediato (bad payload, no retry)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow({ attempts: 0 }))
    gateway.pushAvailability.mockRejectedValue(new ChannexHttpError('invalid', 400))

    const result = await worker.drain()

    expect(result.deadLetter).toBe(1)
    expect(notif.raiseDeadLetter).toHaveBeenCalled()
  })

  it('attempts >= 5 (exhausted) → DEAD_LETTER aunque sea transient 5xx', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow({ attempts: 4 }))
    gateway.pushAvailability.mockRejectedValue(new ChannexHttpError('boom', 500))

    const result = await worker.drain()

    expect(result.deadLetter).toBe(1)
    expect(notif.raiseDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 5, httpStatus: 500 }),
    )
  })

  it('row missing → skip silente (concurrent worker pickeó primero)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-gone' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(null)

    const result = await worker.drain()
    expect(result.succeeded).toBe(1) // counted as success no-op
    expect(gateway.pushAvailability).not.toHaveBeenCalled()
  })

  it('row SUCCEEDED already → skip', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }])
    prisma.channexOutboundQueue.findUnique.mockResolvedValue(makeRow({ status: 'SUCCEEDED' }))

    const result = await worker.drain()
    expect(result.succeeded).toBe(1)
    expect(gateway.pushAvailability).not.toHaveBeenCalled()
  })

  it('empty queue → no-op (no update, no Gateway)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([])

    const result = await worker.drain()

    expect(result.picked).toBe(0)
    expect(gateway.pushAvailability).not.toHaveBeenCalled()
    expect(prisma.channexOutboundQueue.update).not.toHaveBeenCalled()
  })

  it('running guard: dos drain concurrentes → segundo noop sin hacer queries', async () => {
    // Simulamos que el primer drain queda en flight (queryRaw nunca resuelve)
    let resolveFirst: (rows: unknown[]) => void = () => {}
    prisma.$queryRaw.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = res
        }),
    )

    const first = worker.drain()
    const secondResult = await worker.drain()

    expect(secondResult.picked).toBe(0)

    // Finish first
    resolveFirst([])
    await first
  })
})
