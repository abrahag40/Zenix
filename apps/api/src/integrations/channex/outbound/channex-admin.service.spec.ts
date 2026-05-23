/**
 * ChannexAdminService — Day 6 observability snapshot tests.
 *
 * Cobertura:
 *   · getStatus retorna counts agrupados por status (outbound + inbound)
 *   · Token bucket snapshot per kind incluido
 *   · DEAD_LETTER lists (top 10) outbound + inbound
 *   · Conflict open count
 *   · fullSync next eligible = lastRunAt + 23h
 *   · Property settings ausente → defaults sensatos
 */

import { Test } from '@nestjs/testing'
import { ChannexAdminService } from './channex-admin.service'
import { ChannexTokenBucketService } from './channex-token-bucket.service'
import { PrismaService } from '../../../prisma/prisma.service'

function makePrismaMock() {
  return {
    channexOutboundQueue: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    channexOutbox: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    channexWebhookLog: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    guestStay: {
      count: jest.fn().mockResolvedValue(0),
    },
    propertySettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  }
}

describe('ChannexAdminService.getStatus', () => {
  let svc: ChannexAdminService
  let prisma: ReturnType<typeof makePrismaMock>
  let bucket: ChannexTokenBucketService

  beforeEach(async () => {
    prisma = makePrismaMock()
    bucket = new ChannexTokenBucketService()
    const mod = await Test.createTestingModule({
      providers: [
        ChannexAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChannexTokenBucketService, useValue: bucket },
      ],
    }).compile()
    svc = mod.get(ChannexAdminService)
  })

  it('counts agrupados por status — outbound + inbound', async () => {
    prisma.channexOutboundQueue.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 3 } },
      { status: 'SUCCEEDED', _count: { _all: 10 } },
      { status: 'DEAD_LETTER', _count: { _all: 1 } },
    ])
    prisma.channexOutbox.groupBy.mockResolvedValue([
      { status: 'SUCCEEDED', _count: { _all: 25 } },
    ])

    const result = await svc.getStatus('p1')

    expect(result.outbound.byStatus).toEqual({
      PENDING: 3,
      IN_PROGRESS: 0,
      SUCCEEDED: 10,
      FAILED: 0,
      DEAD_LETTER: 1,
    })
    expect(result.inbound.byStatus.SUCCEEDED).toBe(25)
  })

  it('DEAD_LETTER lists incluyen error message + attempts', async () => {
    prisma.channexOutboundQueue.findMany.mockResolvedValue([
      {
        id: 'dl-1',
        kind: 'AVAILABILITY',
        attempts: 5,
        lastError: 'HTTP 500: Channex internal error',
        processedAt: new Date('2026-05-22T15:00:00Z'),
        createdAt: new Date('2026-05-22T14:00:00Z'),
      },
    ])

    const result = await svc.getStatus('p1')

    expect(result.outbound.deadLetters).toHaveLength(1)
    expect(result.outbound.deadLetters[0]).toEqual({
      id: 'dl-1',
      kind: 'AVAILABILITY',
      attempts: 5,
      lastError: 'HTTP 500: Channex internal error',
      processedAt: new Date('2026-05-22T15:00:00Z'),
      createdAt: new Date('2026-05-22T14:00:00Z'),
    })
  })

  it('token bucket snapshot incluido per kind', async () => {
    // Consumir 3 tokens AVAILABILITY antes de snapshot
    bucket.consume('p1', 'AVAILABILITY')
    bucket.consume('p1', 'AVAILABILITY')
    bucket.consume('p1', 'AVAILABILITY')

    const result = await svc.getStatus('p1')

    expect(result.outbound.tokenBucket.availability.tokensRemaining).toBe(7)
    expect(result.outbound.tokenBucket.availability.windowConsumed).toBe(3)
    expect(result.outbound.tokenBucket.availability.capacity).toBe(10)
    // RATES_RESTRICTIONS sin consumir → full 10/10
    expect(result.outbound.tokenBucket.ratesRestrictions.tokensRemaining).toBe(10)
  })

  it('conflict count viene de guestStay.count', async () => {
    prisma.guestStay.count.mockResolvedValue(3)

    const result = await svc.getStatus('p1')

    expect(result.conflicts.openCount).toBe(3)
  })

  it('fullSync.nextEligibleAt = lastRunAt + 23h', async () => {
    const lastSync = new Date('2026-05-22T10:00:00Z')
    prisma.propertySettings.findUnique.mockResolvedValue({
      channexPropertyId: 'chx-p1',
      channexPullLastRunAt: null,
      channexLastFullSyncAt: lastSync,
      channexFullSyncWindowStart: 3,
      channexFullSyncWindowEnd: 5,
      timezone: 'America/Cancun',
    })

    const result = await svc.getStatus('p1')

    expect(result.fullSync.lastRunAt).toEqual(lastSync)
    const expectedNext = new Date(lastSync.getTime() + 23 * 60 * 60 * 1000)
    expect(result.fullSync.nextEligibleAt).toEqual(expectedNext)
    expect(result.fullSync.windowStart).toBe(3)
    expect(result.fullSync.windowEnd).toBe(5)
  })

  it('fullSync.lastRunAt null → nextEligibleAt null (nunca corrió)', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue({
      channexPropertyId: 'chx-p1',
      channexPullLastRunAt: null,
      channexLastFullSyncAt: null,
      channexFullSyncWindowStart: 3,
      channexFullSyncWindowEnd: 5,
      timezone: 'America/Cancun',
    })

    const result = await svc.getStatus('p1')

    expect(result.fullSync.lastRunAt).toBeNull()
    expect(result.fullSync.nextEligibleAt).toBeNull()
  })

  it('settings ausente → defaults sensatos (no crash)', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue(null)

    const result = await svc.getStatus('p-orphan')

    expect(result.channexPropertyId).toBeNull()
    expect(result.timezone).toBeNull()
    expect(result.fullSync.windowStart).toBe(3) // default
    expect(result.fullSync.windowEnd).toBe(5)
  })

  it('lastWebhookAt + lastWebhookEvent incluidos cuando existe webhook', async () => {
    prisma.channexWebhookLog.findFirst.mockResolvedValue({
      receivedAt: new Date('2026-05-22T16:00:00Z'),
      eventType: 'booking_new',
    })
    prisma.channexWebhookLog.count.mockResolvedValue(42)

    const result = await svc.getStatus('p1')

    expect(result.inbound.webhookCount24h).toBe(42)
    expect(result.inbound.lastWebhookAt).toEqual(new Date('2026-05-22T16:00:00Z'))
    expect(result.inbound.lastWebhookEvent).toBe('booking_new')
  })
})
