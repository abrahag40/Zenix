/**
 * ChannexFullSyncOrchestrator — cert Test 1 + AP-3 mitigation tests.
 *
 * Cobertura:
 *   · Guard 1: out-of-window (local hour != [3, 5)) → skip
 *   · Guard 2: lastSync < 23h ago → skip
 *   · Manual trigger salta guards pero MARCA lastSync (cron no re-dispara)
 *   · Sin channexPropertyId → skip
 *   · Sin rooms con channexRoomTypeId → enqueue vacío
 *   · Multi-room-type aggregation: 3 Standard rooms con misma channexRoomTypeId
 *     → 1 entry por (room_type, date) con availability=3 cuando vacíos
 *   · Stay activo reduce availability: 3 rooms, 1 stay overlap → availability=2
 *   · 2 mensajes separados: AVAILABILITY priority 100, RATES_RESTRICTIONS skip
 *     (until RATES sprint), idempotency marca lastSync incluso si solo se
 *     envió availability.
 */

import { Test } from '@nestjs/testing'
import { ChannexFullSyncOrchestrator } from './channex-full-sync.orchestrator'
import { ChannexOutboundBuilderService } from './channex-outbound-builder.service'
import { PrismaService } from '../../../prisma/prisma.service'

function makePrismaMock() {
  return {
    propertySettings: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    property: { findUnique: jest.fn() },
    room: { findMany: jest.fn().mockResolvedValue([]) },
    guestStay: { findMany: jest.fn().mockResolvedValue([]) },
    staySegment: { findMany: jest.fn().mockResolvedValue([]) },
    roomBlock: { findMany: jest.fn().mockResolvedValue([]) },
  }
}

describe('ChannexFullSyncOrchestrator', () => {
  let svc: ChannexFullSyncOrchestrator
  let prisma: ReturnType<typeof makePrismaMock>
  let builder: { enqueue: jest.Mock }

  beforeEach(async () => {
    prisma = makePrismaMock()
    builder = {
      enqueue: jest.fn().mockResolvedValue({ outboxId: 'queue-1', deduped: false }),
    }
    const mod = await Test.createTestingModule({
      providers: [
        ChannexFullSyncOrchestrator,
        { provide: PrismaService, useValue: prisma },
        { provide: ChannexOutboundBuilderService, useValue: builder },
      ],
    }).compile()
    svc = mod.get(ChannexFullSyncOrchestrator)
  })

  describe('runForPropertyIfDue — 2 guards', () => {
    const baseProperty = {
      propertyId: 'p1',
      timezone: 'America/Cancun',
      channexPropertyId: 'chx-p1',
      channexLastFullSyncAt: null,
      channexFullSyncWindowStart: 3,
      channexFullSyncWindowEnd: 5,
    }

    it('OUT_OF_WINDOW: hora local fuera del [3, 5) → skip', async () => {
      // 14:00 UTC → 09:00 Cancun (UTC-5) → fuera del window 3-5
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 1, 14, 0, 0)))

      const result = await svc.runForPropertyIfDue(baseProperty)

      expect(result.ran).toBe(false)
      if (!result.ran) {
        expect(result.reason).toBe('OUT_OF_WINDOW')
      }
      expect(builder.enqueue).not.toHaveBeenCalled()

      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    it('TOO_RECENT: lastSync < 23h ago → skip', async () => {
      // 08:30 UTC → 03:30 Cancun → dentro de window 3-5
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 1, 8, 30, 0)))

      const result = await svc.runForPropertyIfDue({
        ...baseProperty,
        channexLastFullSyncAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 0)), // 8.5h ago
      })

      expect(result.ran).toBe(false)
      if (!result.ran) {
        expect(result.reason).toBe('TOO_RECENT')
      }
      expect(builder.enqueue).not.toHaveBeenCalled()

      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    it('happy: dentro del window + lastSync > 23h → ejecuta', async () => {
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 1, 8, 30, 0)))
      prisma.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        channexPropertyId: 'chx-p1',
      })
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', channexRoomTypeId: 'chx-rt-std' },
      ])

      const result = await svc.runForPropertyIfDue({
        ...baseProperty,
        channexLastFullSyncAt: new Date(Date.UTC(2026, 4, 31, 8, 30, 0)), // 24h ago
      })

      expect(result.ran).toBe(true)
      expect(builder.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'AVAILABILITY', priority: 100 }),
      )

      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    it('lastSync === null → primera vez, ejecuta dentro del window', async () => {
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 1, 8, 30, 0)))
      prisma.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        channexPropertyId: 'chx-p1',
      })
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', channexRoomTypeId: 'chx-rt-std' },
      ])

      const result = await svc.runForPropertyIfDue(baseProperty)

      expect(result.ran).toBe(true)

      jest.useRealTimers()
      jest.restoreAllMocks()
    })
  })

  describe('runForProperty (manual trigger)', () => {
    it('skip si property sin channexPropertyId', async () => {
      prisma.propertySettings.findUnique.mockResolvedValue(null)
      const result = await svc.runForProperty('p-unknown', { manual: true })
      expect(result.ran).toBe(false)
      if (!result.ran) {
        expect(result.reason).toBe('CHANNEX_NOT_CONFIGURED')
      }
    })

    it('enqueue 1 row AVAILABILITY + marca lastSync (rates skipped sin RatePlan)', async () => {
      prisma.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        channexPropertyId: 'chx-p1',
      })
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', channexRoomTypeId: 'chx-rt-std' },
        { id: 'r2', channexRoomTypeId: 'chx-rt-std' },
        { id: 'r3', channexRoomTypeId: 'chx-rt-std' },
      ])

      const result = await svc.runForProperty('p1', { manual: true })

      expect(result.ran).toBe(true)
      // 1 enqueue call (AVAILABILITY); RATES_RESTRICTIONS skipped
      expect(builder.enqueue).toHaveBeenCalledTimes(1)
      const enqueueCall = builder.enqueue.mock.calls[0][0]
      expect(enqueueCall.kind).toBe('AVAILABILITY')
      expect(enqueueCall.priority).toBe(100)
      expect(enqueueCall.payload.entries.length).toBe(500) // 1 room_type × 500 days

      // lastSync updated
      expect(prisma.propertySettings.update).toHaveBeenCalledWith({
        where: { propertyId: 'p1' },
        data: { channexLastFullSyncAt: expect.any(Date) },
      })
    })

    it('multi-room aggregation: 3 rooms misma channexRoomTypeId → availability=3 (sin stays)', async () => {
      prisma.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        channexPropertyId: 'chx-p1',
      })
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', channexRoomTypeId: 'chx-rt-std' },
        { id: 'r2', channexRoomTypeId: 'chx-rt-std' },
        { id: 'r3', channexRoomTypeId: 'chx-rt-std' },
      ])

      await svc.runForProperty('p1', { manual: true })

      const enqueueCall = builder.enqueue.mock.calls[0][0]
      // First entry should be 3 (all 3 rooms available)
      expect(enqueueCall.payload.entries[0].availability).toBe(3)
      expect(enqueueCall.payload.entries[0].roomTypeId).toBe('chx-rt-std')
    })

    it('stay activo reduce availability: 3 rooms, 1 stay → 2 disponibles', async () => {
      prisma.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        channexPropertyId: 'chx-p1',
      })
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', channexRoomTypeId: 'chx-rt-std' },
        { id: 'r2', channexRoomTypeId: 'chx-rt-std' },
        { id: 'r3', channexRoomTypeId: 'chx-rt-std' },
      ])
      // Date.now controlado para que day 0 sea predecible
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 1, 0, 0, 0)))
      prisma.guestStay.findMany.mockResolvedValue([
        {
          roomId: 'r1',
          checkinAt: new Date(Date.UTC(2026, 5, 1)),
          scheduledCheckout: new Date(Date.UTC(2026, 5, 3)),
        },
      ])

      await svc.runForProperty('p1', { manual: true })

      const entries = builder.enqueue.mock.calls[0][0].payload.entries
      // Day 0 (June 1): r1 is occupied → availability=2
      expect(entries[0].date).toBe('2026-06-01')
      expect(entries[0].availability).toBe(2)
      // Day 2 (June 3): stay scheduledCheckout > June 3 (i.e. stay overlaps June 3)
      // El stay overlap es [checkinAt, scheduledCheckout). Day overlap usa
      // checkinAt < nextDate AND scheduledCheckout > date.
      // June 3: nextDate=June 4. checkinAt(June 1)<June 4 ✅ AND
      // scheduledCheckout(June 3)>June 3 ❌ → no overlap, availability=3
      expect(entries[2].date).toBe('2026-06-03')
      expect(entries[2].availability).toBe(3)

      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    it('rooms sin channexRoomTypeId → excluidos del sync (no mapeados a Channex)', async () => {
      prisma.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        channexPropertyId: 'chx-p1',
      })
      prisma.room.findMany.mockResolvedValue([]) // findMany ya filtra por channexRoomTypeId NOT NULL

      const result = await svc.runForProperty('p1', { manual: true })

      expect(result.ran).toBe(true)
      // No enqueue porque entries vacío
      expect(builder.enqueue).not.toHaveBeenCalled()
      // Pero SÍ marca lastSync (cron no debe re-disparar)
      expect(prisma.propertySettings.update).toHaveBeenCalled()
    })

    it('RatePlan model no existe → restrictions skipped con warning', async () => {
      prisma.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        channexPropertyId: 'chx-p1',
      })
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', channexRoomTypeId: 'chx-rt' },
      ])
      // No ratePlan property en prisma mock — feature flag detection skip

      await svc.runForProperty('p1', { manual: true })

      const kinds = builder.enqueue.mock.calls.map((c) => c[0].kind)
      expect(kinds).toEqual(['AVAILABILITY'])
      expect(kinds).not.toContain('RATES_RESTRICTIONS')
    })
  })

  describe('runScheduled — cron behavior', () => {
    it('itera todas las properties con channexPropertyId configurado', async () => {
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 1, 14, 0, 0))) // out of window
      prisma.propertySettings.findMany.mockResolvedValue([
        {
          propertyId: 'p1',
          timezone: 'America/Cancun',
          channexPropertyId: 'chx-p1',
          channexLastFullSyncAt: null,
          channexFullSyncWindowStart: 3,
          channexFullSyncWindowEnd: 5,
        },
        {
          propertyId: 'p2',
          timezone: 'America/Cancun',
          channexPropertyId: 'chx-p2',
          channexLastFullSyncAt: null,
          channexFullSyncWindowStart: 3,
          channexFullSyncWindowEnd: 5,
        },
      ])

      await svc.runScheduled()

      // Out of window → no enqueue but both checked
      expect(prisma.propertySettings.findMany).toHaveBeenCalledTimes(1)
      expect(builder.enqueue).not.toHaveBeenCalled()

      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    it('error en una property no afecta a las demás', async () => {
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 5, 1, 8, 30, 0)))
      prisma.propertySettings.findMany.mockResolvedValue([
        {
          propertyId: 'p-broken',
          timezone: 'America/Cancun',
          channexPropertyId: 'chx-bad',
          channexLastFullSyncAt: null,
          channexFullSyncWindowStart: 3,
          channexFullSyncWindowEnd: 5,
        },
        {
          propertyId: 'p-ok',
          timezone: 'America/Cancun',
          channexPropertyId: 'chx-good',
          channexLastFullSyncAt: null,
          channexFullSyncWindowStart: 3,
          channexFullSyncWindowEnd: 5,
        },
      ])
      prisma.propertySettings.findUnique
        .mockRejectedValueOnce(new Error('DB error on p-broken'))
        .mockResolvedValueOnce({
          propertyId: 'p-ok',
          channexPropertyId: 'chx-good',
        })

      // Should not throw despite error
      await expect(svc.runScheduled()).resolves.toBeUndefined()

      jest.useRealTimers()
      jest.restoreAllMocks()
    })
  })
})
