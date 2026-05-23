/**
 * ChannexOutboundBuilderService — Sprint OUTBOUND-CERT Day 1.
 *
 * Cobertura:
 *   · Event listener channex.availability.changed → row AVAILABILITY priority 100
 *   · Event listener channex.restriction.updated → row RATES_RESTRICTIONS priority 50
 *   · Dedup vía payloadHash <5s window
 *   · Hash determinístico (sorted keys) — misma data, mismo hash
 *   · payload.entries vacío → no-op
 *   · Cross-event isolation: avail no contamina restriction queue
 */

import { Test } from '@nestjs/testing'
import { ChannexOutboundBuilderService } from './channex-outbound-builder.service'
import { PrismaService } from '../../../prisma/prisma.service'

function makePrismaMock() {
  return {
    channexOutboundQueue: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'queue-1' }),
    },
  }
}

describe('ChannexOutboundBuilderService', () => {
  let svc: ChannexOutboundBuilderService
  let prisma: ReturnType<typeof makePrismaMock>

  beforeEach(async () => {
    prisma = makePrismaMock()
    const mod = await Test.createTestingModule({
      providers: [
        ChannexOutboundBuilderService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    svc = mod.get(ChannexOutboundBuilderService)
  })

  describe('@OnEvent channex.availability.changed', () => {
    it('persiste row AVAILABILITY con priority 100', async () => {
      await svc.onAvailabilityChanged({
        propertyId: 'p1',
        entries: [
          { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 3 },
        ],
      })

      const call = prisma.channexOutboundQueue.create.mock.calls[0][0]
      expect(call.data.kind).toBe('AVAILABILITY')
      expect(call.data.priority).toBe(100)
      expect(call.data.status).toBe('PENDING')
      expect(call.data.payload).toEqual({
        entries: [
          { propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 3 },
        ],
      })
      expect(call.data.payloadHash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex
    })

    it('entries vacío → no-op (no insert)', async () => {
      await svc.onAvailabilityChanged({ propertyId: 'p1', entries: [] })
      expect(prisma.channexOutboundQueue.create).not.toHaveBeenCalled()
    })
  })

  describe('@OnEvent channex.restriction.updated', () => {
    it('persiste row RATES_RESTRICTIONS con priority 50', async () => {
      await svc.onRestrictionUpdated({
        propertyId: 'p1',
        entries: [
          { propertyId: 'p1', ratePlanId: 'rp1', date: '2026-06-01', rate: 250 },
        ],
      })

      const call = prisma.channexOutboundQueue.create.mock.calls[0][0]
      expect(call.data.kind).toBe('RATES_RESTRICTIONS')
      expect(call.data.priority).toBe(50)
    })
  })

  describe('dedup (anti-flood AP-2.x)', () => {
    it('skip si row con mismo payloadHash existe PENDING <5s', async () => {
      prisma.channexOutboundQueue.findFirst.mockResolvedValueOnce({ id: 'queue-existing' })

      const result = await svc.enqueue({
        propertyId: 'p1',
        kind: 'AVAILABILITY',
        priority: 100,
        payload: { entries: [{ propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 3 }] },
      })

      expect(result.deduped).toBe(true)
      expect(result.outboxId).toBeNull()
      expect(prisma.channexOutboundQueue.create).not.toHaveBeenCalled()
    })

    it('NO dedup si el row anterior está SUCCEEDED o FAILED (nuevo intento)', async () => {
      // findFirst no encuentra PENDING/IN_PROGRESS (los terminados no cuentan)
      prisma.channexOutboundQueue.findFirst.mockResolvedValue(null)

      await svc.enqueue({
        propertyId: 'p1',
        kind: 'AVAILABILITY',
        priority: 100,
        payload: { entries: [{ propertyId: 'p1', roomTypeId: 'rt1', date: '2026-06-01', availability: 3 }] },
      })

      expect(prisma.channexOutboundQueue.create).toHaveBeenCalled()
    })
  })

  describe('hashPayload (determinismo + cross-kind isolation)', () => {
    it('mismo input → mismo hash', () => {
      const h1 = ChannexOutboundBuilderService.hashPayload(
        'AVAILABILITY',
        'p1',
        { entries: [{ a: 1, b: 2 }] },
      )
      const h2 = ChannexOutboundBuilderService.hashPayload(
        'AVAILABILITY',
        'p1',
        { entries: [{ a: 1, b: 2 }] },
      )
      expect(h1).toBe(h2)
    })

    it('orden de keys irrelevante (sorted normalization)', () => {
      const h1 = ChannexOutboundBuilderService.hashPayload(
        'AVAILABILITY',
        'p1',
        { entries: [{ a: 1, b: 2 }] },
      )
      const h2 = ChannexOutboundBuilderService.hashPayload(
        'AVAILABILITY',
        'p1',
        { entries: [{ b: 2, a: 1 }] },
      )
      expect(h1).toBe(h2)
    })

    it('kind distinto → hash distinto (avail no colisiona con restriction)', () => {
      const h1 = ChannexOutboundBuilderService.hashPayload(
        'AVAILABILITY',
        'p1',
        { entries: [{ x: 1 }] },
      )
      const h2 = ChannexOutboundBuilderService.hashPayload(
        'RATES_RESTRICTIONS',
        'p1',
        { entries: [{ x: 1 }] },
      )
      expect(h1).not.toBe(h2)
    })

    it('propertyId distinto → hash distinto', () => {
      const h1 = ChannexOutboundBuilderService.hashPayload(
        'AVAILABILITY',
        'p1',
        { entries: [{ x: 1 }] },
      )
      const h2 = ChannexOutboundBuilderService.hashPayload(
        'AVAILABILITY',
        'p2',
        { entries: [{ x: 1 }] },
      )
      expect(h1).not.toBe(h2)
    })
  })
})
