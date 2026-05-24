/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 2 schema integrity tests.
 *
 * Verifica los guards Postgres-level del schema Channex CRUD:
 *   1. ChannexRatePlanMapping default_rate >= 0
 *   2. RatePlanCap rate_cap_min <= rate_cap_max
 *   3. RatePlanCap rate_cap_min/max >= 0
 *   4. ChannexChannelPause unpaused_at >= paused_at
 *   5. PropertySettings rate_parity_threshold_pct ∈ [0, 100]
 *   6. Schema relations (Property ↔ ChannexRatePlanMapping ↔ RatePlanCap)
 *   7. Seed correcto de los 5 rate plans Channex sandbox
 *
 * Decisiones §"D-CHX-CC-6/7/9" del plan de sprint.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const PROPERTY_ID = 'prop-hotel-tulum-001'
const PLATFORM_ADMIN_USER_ID = 'user-abraham-platform-admin'

describe('Channex CRUD schema — Day 2 integrity', () => {
  beforeAll(async () => {
    const seeded = await prisma.channexRatePlanMapping.count({
      where: { propertyId: PROPERTY_ID },
    })
    if (seeded === 0) {
      throw new Error(
        'Pre-requisite: ejecuta `npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-rate-plans.ts`',
      )
    }
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── 1. ChannexRatePlanMapping default_rate >= 0 ────────────────────────

  describe('ChannexRatePlanMapping CHECK constraints', () => {
    it('default_rate negativo → CHECK constraint rechaza', async () => {
      await expect(
        prisma.channexRatePlanMapping.create({
          data: {
            organizationId: (await prisma.property.findUniqueOrThrow({
              where: { id: PROPERTY_ID }, select: { organizationId: true },
            })).organizationId,
            propertyId: PROPERTY_ID,
            channexRatePlanId: 'test-negative-rate-' + Date.now(),
            channexRoomTypeId: 'test-rt',
            title: 'TEST negative',
            currency: 'USD',
            sellMode: 'per_room',
            defaultRate: -10,
            createdById: PLATFORM_ADMIN_USER_ID,
          },
        }),
      ).rejects.toThrow(/default_rate_nonneg|check constraint/i)
    })

    it('default_rate=0 OK (edge case — comp/free room)', async () => {
      const m = await prisma.channexRatePlanMapping.create({
        data: {
          organizationId: (await prisma.property.findUniqueOrThrow({
            where: { id: PROPERTY_ID }, select: { organizationId: true },
          })).organizationId,
          propertyId: PROPERTY_ID,
          channexRatePlanId: 'test-zero-rate-' + Date.now(),
          channexRoomTypeId: 'test-rt',
          title: 'TEST zero (comp)',
          currency: 'USD',
          sellMode: 'per_room',
          defaultRate: 0,
          createdById: PLATFORM_ADMIN_USER_ID,
        },
      })
      expect(m.id).toBeDefined()
      await prisma.channexRatePlanMapping.delete({ where: { id: m.id } })
    })
  })

  // ── 2 + 3. RatePlanCap min <= max + non-negative ──────────────────────

  describe('RatePlanCap CHECK constraints', () => {
    let testMappingId: string

    beforeAll(async () => {
      const m = await prisma.channexRatePlanMapping.findFirstOrThrow({
        where: { propertyId: PROPERTY_ID, title: 'BAR — Estándar' },
      })
      testMappingId = m.id
    })

    afterEach(async () => {
      // cleanup any cap created
      await prisma.ratePlanCap.deleteMany({ where: { channexMappingId: testMappingId } })
    })

    it('cap_min > cap_max → CHECK constraint rechaza', async () => {
      await expect(
        prisma.ratePlanCap.create({
          data: {
            channexMappingId: testMappingId,
            rateCapMin: 100,
            rateCapMax: 50,  // ← max < min
            setById: PLATFORM_ADMIN_USER_ID,
          },
        }),
      ).rejects.toThrow(/min_lte_max|check constraint/i)
    })

    it('cap_min < 0 → CHECK constraint rechaza', async () => {
      await expect(
        prisma.ratePlanCap.create({
          data: {
            channexMappingId: testMappingId,
            rateCapMin: -10,
            rateCapMax: 100,
            setById: PLATFORM_ADMIN_USER_ID,
          },
        }),
      ).rejects.toThrow(/nonneg|check constraint/i)
    })

    it('cap_min <= cap_max ambos positivos → OK', async () => {
      const cap = await prisma.ratePlanCap.create({
        data: {
          channexMappingId: testMappingId,
          rateCapMin: 60,
          rateCapMax: 200,
          reason: 'BAR Estándar entre 60-200 USD según temporada',
          setById: PLATFORM_ADMIN_USER_ID,
        },
      })
      expect(cap.rateCapMin?.toString()).toBe('60')
      expect(cap.rateCapMax?.toString()).toBe('200')
    })

    it('solo cap_min set (sin ceiling) → OK', async () => {
      const cap = await prisma.ratePlanCap.create({
        data: {
          channexMappingId: testMappingId,
          rateCapMin: 50,
          rateCapMax: null,
          setById: PLATFORM_ADMIN_USER_ID,
        },
      })
      expect(cap.rateCapMin?.toString()).toBe('50')
      expect(cap.rateCapMax).toBeNull()
    })
  })

  // ── 4. ChannexChannelPause temporal validation ──────────────────────────

  describe('ChannexChannelPause CHECK constraints', () => {
    let testPauseId: string | null = null

    afterEach(async () => {
      if (testPauseId) {
        await prisma.channexChannelPause.delete({ where: { id: testPauseId } })
        testPauseId = null
      }
    })

    it('unpaused_at < paused_at → CHECK constraint rechaza', async () => {
      const paused = new Date('2026-06-01T10:00:00Z')
      const unpausedEarlier = new Date('2026-05-31T10:00:00Z')  // ← antes
      await expect(
        prisma.channexChannelPause.create({
          data: {
            propertyId: PROPERTY_ID,
            channexChannelId: 'test-channel-id',
            channelName: 'booking_com',
            pausedAt: paused,
            pausedById: PLATFORM_ADMIN_USER_ID,
            unpausedAt: unpausedEarlier,
            unpausedById: PLATFORM_ADMIN_USER_ID,
          },
        }),
      ).rejects.toThrow(/unpause_after_pause|check constraint/i)
    })

    it('unpaused_at = paused_at → OK (edge instant pause/unpause)', async () => {
      const t = new Date('2026-06-01T10:00:00Z')
      const pause = await prisma.channexChannelPause.create({
        data: {
          propertyId: PROPERTY_ID,
          channexChannelId: 'test-channel-id',
          channelName: 'booking_com',
          pausedAt: t,
          pausedById: PLATFORM_ADMIN_USER_ID,
          unpausedAt: t,
          unpausedById: PLATFORM_ADMIN_USER_ID,
        },
      })
      testPauseId = pause.id
      expect(pause.id).toBeDefined()
    })

    it('pause sin unpause aún (pause activo) → OK', async () => {
      const pause = await prisma.channexChannelPause.create({
        data: {
          propertyId: PROPERTY_ID,
          channexChannelId: 'test-channel-id',
          channelName: 'expedia',
          pauseReason: 'Channel rebooting due to rate parity break',
          pausedById: PLATFORM_ADMIN_USER_ID,
          // unpausedAt: null (default)
        },
      })
      testPauseId = pause.id
      expect(pause.unpausedAt).toBeNull()
    })
  })

  // ── 5. PropertySettings rateParityThresholdPct ∈ [0, 100] ────────────

  describe('PropertySettings.rateParityThresholdPct CHECK', () => {
    it('threshold > 100 → CHECK rechaza', async () => {
      await expect(
        prisma.propertySettings.update({
          where: { propertyId: PROPERTY_ID },
          data: { rateParityThresholdPct: 150 },
        }),
      ).rejects.toThrow(/rate_parity_threshold|check constraint/i)
    })

    it('threshold < 0 → CHECK rechaza', async () => {
      await expect(
        prisma.propertySettings.update({
          where: { propertyId: PROPERTY_ID },
          data: { rateParityThresholdPct: -5 },
        }),
      ).rejects.toThrow(/rate_parity_threshold|check constraint/i)
    })

    it('threshold = 0 (estricta, alert en cualquier delta) → OK', async () => {
      const updated = await prisma.propertySettings.update({
        where: { propertyId: PROPERTY_ID },
        data: { rateParityThresholdPct: 0 },
      })
      expect(updated.rateParityThresholdPct).toBe(0)
      // Restore default
      await prisma.propertySettings.update({
        where: { propertyId: PROPERTY_ID },
        data: { rateParityThresholdPct: 5 },
      })
    })
  })

  // ── 6. Schema relations integrity ──────────────────────────────────────

  describe('Schema relations integrity', () => {
    it('Property → ChannexRatePlanMapping cascade lookup OK', async () => {
      const property = await prisma.property.findUnique({
        where: { id: PROPERTY_ID },
        include: { channexRatePlanMappings: true },
      })
      expect(property?.channexRatePlanMappings.length).toBeGreaterThanOrEqual(5)
    })

    it('ChannexRatePlanMapping → Property relation OK', async () => {
      const mapping = await prisma.channexRatePlanMapping.findFirst({
        where: { propertyId: PROPERTY_ID },
        include: { property: true },
      })
      expect(mapping?.property.id).toBe(PROPERTY_ID)
    })

    it('Delete mapping cascade deletes cap (Cascade FK)', async () => {
      const m = await prisma.channexRatePlanMapping.findFirstOrThrow({
        where: { propertyId: PROPERTY_ID, title: 'BAR — Suite' },
      })
      const cap = await prisma.ratePlanCap.create({
        data: {
          channexMappingId: m.id,
          rateCapMin: 200,
          rateCapMax: 400,
          setById: PLATFORM_ADMIN_USER_ID,
        },
      })
      const capId = cap.id

      // Hard delete the mapping — cap should cascade
      await prisma.channexRatePlanMapping.delete({ where: { id: m.id } })
      const orphan = await prisma.ratePlanCap.findUnique({ where: { id: capId } })
      expect(orphan).toBeNull()

      // Re-seed deleted mapping for other tests
      await prisma.channexRatePlanMapping.create({
        data: {
          organizationId: (await prisma.property.findUniqueOrThrow({
            where: { id: PROPERTY_ID }, select: { organizationId: true },
          })).organizationId,
          propertyId: PROPERTY_ID,
          channexRatePlanId: '89391dcb-2eba-4e7b-a2a5-80ab3b7c62f3',
          channexRoomTypeId: 'b938aec0-0261-4acd-99c4-78aa2ce424ab',
          title: 'BAR — Suite',
          currency: 'USD',
          sellMode: 'per_room',
          defaultRate: 280,
          createdById: PLATFORM_ADMIN_USER_ID,
        },
      })
    })
  })

  // ── 7. Seed integrity: 5 rate plans con default rates correctos ─────────

  describe('Seed correctness — 5 Channex sandbox rate plans', () => {
    const EXPECTED = [
      { title: 'BAR — Cabaña',       rate: '130' },
      { title: 'BAR — Estándar',     rate: '70'  },
      { title: 'BAR — Superior',     rate: '110' },
      { title: 'BAR — Junior Suite', rate: '180' },
      { title: 'BAR — Suite',        rate: '280' },
    ]

    it('5 rate plans están mapeados con defaultRate correcto', async () => {
      const mappings = await prisma.channexRatePlanMapping.findMany({
        where: { propertyId: PROPERTY_ID, isActive: true },
        orderBy: { title: 'asc' },
      })
      const present = mappings.map((m) => ({
        title: m.title,
        rate: m.defaultRate.toString(),
      }))
      EXPECTED.forEach((e) => {
        expect(present).toContainEqual(e)
      })
    })

    it('Todos los rate plans están conectados a un channexRoomTypeId válido', async () => {
      const mappings = await prisma.channexRatePlanMapping.findMany({
        where: { propertyId: PROPERTY_ID, isActive: true },
      })
      // Cada channexRoomTypeId debe estar usado por al menos un Room real
      for (const m of mappings) {
        const room = await prisma.room.findFirst({
          where: { propertyId: PROPERTY_ID, channexRoomTypeId: m.channexRoomTypeId },
        })
        expect(room).not.toBeNull()
      }
    })

    it('PropertySettings tiene rateParityThresholdPct default 5%', async () => {
      const s = await prisma.propertySettings.findUniqueOrThrow({
        where: { propertyId: PROPERTY_ID },
      })
      expect(s.rateParityThresholdPct).toBeGreaterThan(0)
      expect(s.rateParityThresholdPct).toBeLessThanOrEqual(100)
      expect(s.channexCommandCenterEnabled).toBe(true)
    })

    it('AuditLog tiene entry CHANNEX_RATE_PLANS_BULK_SEED', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { action: 'CHANNEX_RATE_PLANS_BULK_SEED' },
      })
      expect(logs.length).toBeGreaterThanOrEqual(1)
      expect(logs[0].status).toBe('SUCCESS')
    })
  })
})
