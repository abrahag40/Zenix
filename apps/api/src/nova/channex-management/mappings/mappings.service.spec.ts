/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 7 unit tests.
 *
 * MappingsService cubre:
 *   · tokenize helper (diacritics, special chars)
 *   · proposal genera scoring decreciente — best match per room
 *   · proposal capacity boost suma 0.3
 *   · proposal vacío cuando no hay channex room types
 *   · bulkUpdate persiste + audit
 *   · bulkUpdate rechaza room IDs no del property
 *   · healthCheck UNMAPPED_ROOM, STALE_MAPPING, ORPHAN_CHANNEX_TYPE,
 *     CAPACITY_MISMATCH, NO_RATE_PLAN
 */
import { BadRequestException } from '@nestjs/common'
import { MappingsService, tokenize } from './mappings.service'

describe('MappingsService — Day 7', () => {
  const PROPERTY_ID = 'prop-1'
  const CHANNEX_PROPERTY_ID = 'channex-prop-1'
  const ORG_ID = 'org-1'
  const ACTOR_ID = 'user-1'

  function build(opts: {
    rooms?: any[]
    channexRoomTypes?: any[]
    ratePlanMappings?: any[]
    channexPropertyId?: string | null
  } = {}) {
    const prisma: any = {
      property: { findFirst: jest.fn().mockResolvedValue({ id: PROPERTY_ID }) },
      propertySettings: {
        findUnique: jest.fn().mockResolvedValue({
          channexPropertyId: opts.channexPropertyId === undefined ? CHANNEX_PROPERTY_ID : opts.channexPropertyId,
        }),
      },
      room: {
        findMany: jest.fn().mockImplementation((args: any) => {
          const all = opts.rooms ?? []
          // honra filter in array (caso bulkUpdate validation)
          if (args?.where?.id?.in) {
            const wanted = new Set(args.where.id.in)
            return Promise.resolve(all.filter((r: any) => wanted.has(r.id)))
          }
          return Promise.resolve(all)
        }),
        update: jest.fn().mockImplementation((args: any) =>
          Promise.resolve({ id: args.where.id, ...args.data }),
        ),
      },
      channexRatePlanMapping: {
        findMany: jest.fn().mockResolvedValue(opts.ratePlanMappings ?? []),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        const tx = {
          room: {
            update: prisma.room.update,
          },
        }
        return cb(tx)
      }),
    }
    const tenant: any = { getActingOrgIdOrThrow: jest.fn().mockReturnValue(ORG_ID) }
    const gateway: any = {
      listRoomTypes: jest.fn().mockResolvedValue(opts.channexRoomTypes ?? []),
    }
    const auditLog: any = { write: jest.fn().mockResolvedValue({ id: 'audit-1' }) }
    const service = new MappingsService(prisma, tenant, gateway, auditLog)
    return { service, prisma, gateway, auditLog }
  }

  describe('tokenize helper', () => {
    it('lowercase + strip diacritics + alphanumeric only', () => {
      expect(tokenize('Cabaña Suite #1')).toEqual(['cabana', 'suite'])
      expect(tokenize('JR-SUITE 101')).toEqual(['jr', 'suite', '101'])
      expect(tokenize('Habitación Estándar — Doble')).toEqual(['habitacion', 'estandar', 'doble'])
    })
  })

  describe('proposal', () => {
    it('vacío cuando no hay channex room types', async () => {
      const { service } = build({
        rooms: [{ id: 'r1', number: '101', category: 'STANDARD', capacity: 2, channexRoomTypeId: null }],
        channexRoomTypes: [],
      })
      const out = await service.proposal(PROPERTY_ID)
      expect(out).toHaveLength(1)
      expect(out[0].suggestedChannexRoomTypeId).toBeNull()
      expect(out[0].similarityScore).toBe(0)
    })

    it('matches por token overlap + capacity boost', async () => {
      const { service } = build({
        rooms: [
          { id: 'r1', number: '101', category: 'STANDARD', capacity: 2, channexRoomTypeId: null },
          { id: 'r2', number: '201', category: 'SUITE', capacity: 4, channexRoomTypeId: null },
        ],
        channexRoomTypes: [
          { id: 'rt-1', title: 'Standard Double', count_of_rooms: 5, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
          { id: 'rt-2', title: 'Suite Junior', count_of_rooms: 2, occ_adults: 4, occ_children: 0, occ_infants: 0, default_occupancy: 4 },
        ],
      })
      const out = await service.proposal(PROPERTY_ID)
      // r1 STANDARD 2 → "Standard Double" (token "standard" match + capacity 2=2 boost)
      expect(out[0].suggestedChannexRoomTypeId).toBe('rt-1')
      expect(out[0].similarityScore).toBeGreaterThan(0.3)
      // r2 SUITE 4 → "Suite Junior" (token "suite" + capacity 4=4)
      expect(out[1].suggestedChannexRoomTypeId).toBe('rt-2')
      expect(out[1].similarityScore).toBeGreaterThan(0.3)
    })

    it('score < 0.2 → suggestedChannexRoomTypeId null (low-confidence)', async () => {
      const { service } = build({
        rooms: [{ id: 'r1', number: '101', category: 'XYZZY', capacity: 99, channexRoomTypeId: null }],
        channexRoomTypes: [
          { id: 'rt-1', title: 'Standard Double', count_of_rooms: 5, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
        ],
      })
      const out = await service.proposal(PROPERTY_ID)
      expect(out[0].suggestedChannexRoomTypeId).toBeNull()
      expect(out[0].similarityScore).toBeLessThan(0.2)
    })
  })

  describe('bulkUpdate', () => {
    it('happy path — actualiza Room.channexRoomTypeId + audit', async () => {
      const { service, prisma, auditLog } = build({
        rooms: [
          { id: 'r1', number: '101', channexRoomTypeId: null },
          { id: 'r2', number: '201', channexRoomTypeId: 'rt-old' },
        ],
      })
      const out = await service.bulkUpdate(
        PROPERTY_ID,
        [
          { roomId: 'r1', channexRoomTypeId: 'rt-1' },
          { roomId: 'r2', channexRoomTypeId: 'rt-2' },
        ],
        ACTOR_ID,
        'PLATFORM_ADMIN',
        undefined,
        'Setup wizard Step 5',
      )
      expect(out.updated).toBe(2)
      expect(prisma.room.update).toHaveBeenCalledTimes(2)
      expect(auditLog.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHANNEX_MAPPING_BULK_UPDATE',
          status: 'SUCCESS',
          retentionPolicy: 'PERMANENT',
          payload: expect.objectContaining({
            updateCount: 2,
            mappingsBefore: expect.any(Array),
            mappingsAfter: expect.any(Array),
          }),
        }),
      )
    })

    it('rechaza si room ID no pertenece a property', async () => {
      const { service } = build({
        rooms: [{ id: 'r1', number: '101', channexRoomTypeId: null }],
      })
      await expect(
        service.bulkUpdate(
          PROPERTY_ID,
          [{ roomId: 'r-fantasma', channexRoomTypeId: 'rt-1' }],
          ACTOR_ID,
          'PLATFORM_ADMIN',
        ),
      ).rejects.toThrow(/no pertenecen a property/)
    })

    it('rechaza updates vacíos', async () => {
      const { service } = build({})
      await expect(
        service.bulkUpdate(PROPERTY_ID, [], ACTOR_ID, 'PLATFORM_ADMIN'),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('healthCheck', () => {
    it('UNMAPPED_ROOM ERROR + ORPHAN_CHANNEX_TYPE WARNING', async () => {
      const { service } = build({
        rooms: [
          { id: 'r1', number: '101', capacity: 2, channexRoomTypeId: null }, // unmapped
          { id: 'r2', number: '201', capacity: 2, channexRoomTypeId: 'rt-1' }, // OK
        ],
        channexRoomTypes: [
          { id: 'rt-1', title: 'Standard', count_of_rooms: 1, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
          { id: 'rt-2', title: 'Suite', count_of_rooms: 1, occ_adults: 4, occ_children: 0, occ_infants: 0, default_occupancy: 4 }, // orphan
        ],
        ratePlanMappings: [{ channexRoomTypeId: 'rt-1' }, { channexRoomTypeId: 'rt-2' }],
      })
      const out = await service.healthCheck(PROPERTY_ID)
      expect(out.passedErrors).toBe(false)
      expect(out.errorCount).toBe(1)
      expect(out.findings.find((f) => f.code === 'UNMAPPED_ROOM')).toBeDefined()
      expect(out.findings.find((f) => f.code === 'ORPHAN_CHANNEX_TYPE')).toBeDefined()
    })

    it('STALE_MAPPING ERROR si Channex room type ya no existe', async () => {
      const { service } = build({
        rooms: [{ id: 'r1', number: '101', capacity: 2, channexRoomTypeId: 'rt-deleted' }],
        channexRoomTypes: [
          { id: 'rt-1', title: 'Standard', count_of_rooms: 1, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
        ],
        ratePlanMappings: [{ channexRoomTypeId: 'rt-1' }],
      })
      const out = await service.healthCheck(PROPERTY_ID)
      expect(out.findings.find((f) => f.code === 'STALE_MAPPING')).toBeDefined()
    })

    it('CAPACITY_MISMATCH WARNING si occ_adults ≠ capacity', async () => {
      const { service } = build({
        rooms: [{ id: 'r1', number: '101', capacity: 4, channexRoomTypeId: 'rt-1' }],
        channexRoomTypes: [
          { id: 'rt-1', title: 'Standard', count_of_rooms: 1, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
        ],
        ratePlanMappings: [{ channexRoomTypeId: 'rt-1' }],
      })
      const out = await service.healthCheck(PROPERTY_ID)
      expect(out.passedErrors).toBe(true) // solo warning
      const mismatch = out.findings.find((f) => f.code === 'CAPACITY_MISMATCH')
      expect(mismatch).toBeDefined()
      expect(mismatch?.severity).toBe('WARNING')
    })

    it('NO_RATE_PLAN WARNING para channex room type sin rate plan', async () => {
      const { service } = build({
        rooms: [{ id: 'r1', number: '101', capacity: 2, channexRoomTypeId: 'rt-1' }],
        channexRoomTypes: [
          { id: 'rt-1', title: 'Standard', count_of_rooms: 1, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
        ],
        ratePlanMappings: [], // ningún rate plan
      })
      const out = await service.healthCheck(PROPERTY_ID)
      expect(out.findings.find((f) => f.code === 'NO_RATE_PLAN')).toBeDefined()
    })

    it('passedErrors=true cuando solo hay warnings', async () => {
      const { service } = build({
        rooms: [{ id: 'r1', number: '101', capacity: 2, channexRoomTypeId: 'rt-1' }],
        channexRoomTypes: [
          { id: 'rt-1', title: 'Standard', count_of_rooms: 1, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
        ],
        ratePlanMappings: [{ channexRoomTypeId: 'rt-1' }],
      })
      const out = await service.healthCheck(PROPERTY_ID)
      expect(out.passedErrors).toBe(true)
      expect(out.errorCount).toBe(0)
    })
  })
})
