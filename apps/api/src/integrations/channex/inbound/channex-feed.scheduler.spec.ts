/**
 * ChannexFeedScheduler — D-CHX6 reconciliation tests.
 *
 * Cubre:
 *   - tick vacío: feed retorna [] → no enqueue, propertiesTouched=0
 *   - tick con revisions: enqueue via acceptDelivery + actualiza pullLastRunAt
 *   - dedup: acceptDelivery retorna outboxId=null → revisionsDeduped++
 *   - orphan property (PropertySettings ausente) → skip + log
 *   - paginación: 2 páginas, segunda termina con meta.total alcanzado
 *   - gateway disabled → no-op
 *   - running guard previene overlap si el tick anterior aún corre
 *   - error de Channex → log, no crash, otros revisions del tick aún cuentan
 */

import { Test } from '@nestjs/testing'
import { ChannexGateway, ChannexHttpError } from '../channex.gateway'
import { PrismaService } from '../../../prisma/prisma.service'
import { ChannexInboundService } from './channex-inbound.service'
import { ChannexFeedScheduler } from './channex-feed.scheduler'

function makeRevision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rev-1',
    property_id: 'prop-1',
    booking_id: 'book-1',
    status: 'new',
    arrival_date: '2026-06-01',
    departure_date: '2026-06-04',
    rooms: [],
    ...overrides,
  }
}

describe('ChannexFeedScheduler', () => {
  let scheduler: ChannexFeedScheduler
  let gateway: {
    enabled: boolean
    listBookingRevisionsFeed: jest.Mock
  }
  let inbound: { acceptDelivery: jest.Mock }
  let prisma: {
    propertySettings: { findFirst: jest.Mock; updateMany: jest.Mock }
  }

  beforeEach(async () => {
    gateway = {
      enabled: true,
      listBookingRevisionsFeed: jest.fn(),
    }
    inbound = {
      acceptDelivery: jest
        .fn()
        .mockResolvedValue({ logId: 'log-1', outboxId: 'outbox-1' }),
    }
    prisma = {
      propertySettings: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ propertyId: 'prop-1' }), // default: known
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const mod = await Test.createTestingModule({
      providers: [
        ChannexFeedScheduler,
        { provide: ChannexGateway, useValue: gateway },
        { provide: ChannexInboundService, useValue: inbound },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    scheduler = mod.get(ChannexFeedScheduler)
  })

  it('tick vacío: feed retorna [] → no enqueue, no update', async () => {
    gateway.listBookingRevisionsFeed.mockResolvedValue({
      revisions: [],
      meta: { total: 0, page: 1, limit: 50 },
    })

    const result = await scheduler.run({ source: 'manual' })

    expect(result.revisionsSeen).toBe(0)
    expect(result.revisionsEnqueued).toBe(0)
    expect(result.propertiesTouched).toBe(0)
    expect(inbound.acceptDelivery).not.toHaveBeenCalled()
    expect(prisma.propertySettings.updateMany).not.toHaveBeenCalled()
  })

  it('tick con 1 revision → enqueue + updatePullLastRunAt', async () => {
    gateway.listBookingRevisionsFeed.mockResolvedValue({
      revisions: [makeRevision()],
      meta: { total: 1, page: 1, limit: 50 },
    })

    const result = await scheduler.run({ source: 'manual' })

    expect(result.revisionsSeen).toBe(1)
    expect(result.revisionsEnqueued).toBe(1)
    expect(result.propertiesTouched).toBe(1)
    expect(inbound.acceptDelivery).toHaveBeenCalledWith({
      propertyId: 'prop-1',
      eventType: 'feed_recovery',
      channexBookingId: 'book-1',
      channexRevisionId: 'rev-1',
      payload: expect.objectContaining({
        event: 'feed_recovery',
        payload: { booking_id: 'book-1', revision_id: 'rev-1' },
      }),
      signatureValid: false,
    })
    expect(prisma.propertySettings.updateMany).toHaveBeenCalledWith({
      where: { propertyId: { in: ['prop-1'] } },
      data: { channexPullLastRunAt: expect.any(Date) },
    })
  })

  it('dedup: acceptDelivery retorna outboxId=null → revisionsDeduped++', async () => {
    gateway.listBookingRevisionsFeed.mockResolvedValue({
      revisions: [makeRevision()],
      meta: { total: 1, page: 1, limit: 50 },
    })
    inbound.acceptDelivery.mockResolvedValueOnce({ logId: 'log-x', outboxId: null })

    const result = await scheduler.run({ source: 'manual' })

    expect(result.revisionsEnqueued).toBe(0)
    expect(result.revisionsDeduped).toBe(1)
    expect(result.revisionsSeen).toBe(1)
  })

  it('orphan property: PropertySettings ausente → skip + count++', async () => {
    gateway.listBookingRevisionsFeed.mockResolvedValue({
      revisions: [makeRevision({ property_id: 'prop-unknown' })],
      meta: { total: 1, page: 1, limit: 50 },
    })
    prisma.propertySettings.findFirst.mockResolvedValueOnce(null)

    const result = await scheduler.run({ source: 'manual' })

    expect(result.orphanProperties).toBe(1)
    expect(result.revisionsEnqueued).toBe(0)
    expect(inbound.acceptDelivery).not.toHaveBeenCalled()
  })

  it('paginación: full page (50) → next page; short page (1) → stop', async () => {
    // Channex pagination semantics: a FULL page (limit reached) implies
    // there may be more; a SHORT page (fewer than limit) is the last.
    const fullPage = Array.from({ length: 50 }, (_, i) =>
      makeRevision({ id: `r${i + 1}`, booking_id: `b${i + 1}` }),
    )
    gateway.listBookingRevisionsFeed
      .mockResolvedValueOnce({
        revisions: fullPage,
        meta: { total: 51, page: 1, limit: 50 },
      })
      .mockResolvedValueOnce({
        revisions: [makeRevision({ id: 'r51', booking_id: 'b51' })],
        meta: { total: 51, page: 2, limit: 50 },
      })

    const result = await scheduler.run({ source: 'manual' })

    expect(gateway.listBookingRevisionsFeed).toHaveBeenCalledTimes(2)
    expect(result.revisionsSeen).toBe(51)
    expect(result.revisionsEnqueued).toBe(51)
  })

  it('short page on first call → stops immediately (no extra HTTP call)', async () => {
    gateway.listBookingRevisionsFeed.mockResolvedValueOnce({
      revisions: [makeRevision()],
      meta: { total: 1, page: 1, limit: 50 },
    })

    await scheduler.run({ source: 'manual' })

    expect(gateway.listBookingRevisionsFeed).toHaveBeenCalledTimes(1)
  })

  it('gateway disabled → no-op (no llamadas, no update)', async () => {
    gateway.enabled = false
    const result = await scheduler.run({ source: 'manual' })
    expect(result.revisionsSeen).toBe(0)
    expect(gateway.listBookingRevisionsFeed).not.toHaveBeenCalled()
  })

  it('error 5xx de Channex: log + result.errors++, sin throw', async () => {
    gateway.listBookingRevisionsFeed.mockRejectedValue(
      new ChannexHttpError('500 boom', 500),
    )

    const result = await scheduler.run({ source: 'manual' })

    expect(result.errors).toBeGreaterThan(0)
    // Did not throw — scheduler is resilient
  })

  it('running guard: dos invocaciones concurrentes → segunda noop', async () => {
    let resolveFirst: (v: { revisions: unknown[]; meta: unknown }) => void = () => {}
    gateway.listBookingRevisionsFeed.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = res
        }),
    )

    const first = scheduler.run({ source: 'manual' })
    const second = scheduler.run({ source: 'manual' })

    // Second should resolve immediately with empty result
    const secondResult = await second
    expect(secondResult.revisionsSeen).toBe(0)

    // Now finish the first
    resolveFirst({ revisions: [], meta: { total: 0, page: 1, limit: 50 } })
    await first
  })
})
