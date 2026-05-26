/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5 integration tests.
 *
 * Verifica RoomTypes + RatePlans services con mocks Gateway + DB real (Prisma).
 *
 * Cubre:
 *   1. RoomTypesService.create — happy path + audit + property validation
 *   2. RoomTypesService.list — passes through Channex (gateway mock)
 *   3. RoomTypesService.delete con orphan rooms — force=false rejects
 *   4. RatePlansService.create — write-through mapping + audit
 *   5. RatePlansService.list — local DB first, fallback Channex
 *   6. AuditLog sanitization (sensitive keys redacted)
 *   7. AuditLog reason REQUIRED on impersonation
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { ChannexHttpError } from '../../integrations/channex/channex.gateway'
import { AuditLogService } from '../audit/audit-log.service'
import { ChannexRatePlansService } from './rate-plans/rate-plans.service'
import { ChannexRoomTypesService } from './room-types/room-types.service'

const PROPERTY_ID = 'prop-hotel-tulum-001'
const ACTOR_ID = 'user-abraham-platform-admin'
const ACTOR_ROLE = 'PLATFORM_ADMIN' as const

const prisma = new PrismaClient()

describe('ChannexManagement Day 5 — services integration', () => {
  let realOrgId: string
  let gatewayMock: any
  let tenantMock: any
  let roomTypesService: ChannexRoomTypesService
  let ratePlansService: ChannexRatePlansService
  let auditLog: AuditLogService

  beforeAll(async () => {
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: PROPERTY_ID },
      select: { organizationId: true },
    })
    realOrgId = property.organizationId
  })

  beforeEach(() => {
    gatewayMock = {
      listRoomTypes: jest.fn(),
      createRoomType: jest.fn(),
      updateRoomType: jest.fn(),
      deleteRoomType: jest.fn(),
      listRatePlans: jest.fn(),
      createRatePlan: jest.fn(),
      updateRatePlan: jest.fn(),
      deleteRatePlan: jest.fn(),
    }

    tenantMock = {
      getActingOrgIdOrThrow: jest.fn().mockReturnValue(realOrgId),
    }

    auditLog = new AuditLogService(prisma as any)
    roomTypesService = new ChannexRoomTypesService(
      prisma as any,
      tenantMock as any,
      gatewayMock as any,
      auditLog,
    )
    ratePlansService = new ChannexRatePlansService(
      prisma as any,
      tenantMock as any,
      gatewayMock as any,
      auditLog,
    )
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── 1. RoomTypes ───────────────────────────────────────────────────────

  describe('ChannexRoomTypesService', () => {
    it('list — pass-through Channex con channexPropertyId resolution', async () => {
      gatewayMock.listRoomTypes.mockResolvedValue([
        { id: 'rt-1', title: 'Test', count_of_rooms: 5, occ_adults: 2, occ_children: 0, occ_infants: 0, default_occupancy: 2 },
      ])
      const result = await roomTypesService.list(PROPERTY_ID)
      expect(result).toHaveLength(1)
      expect(gatewayMock.listRoomTypes).toHaveBeenCalledWith('ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13')
    })

    it('create — audit_log SUCCESS entry escrito', async () => {
      const before = await prisma.auditLog.count({ where: { action: 'CHANNEX_ROOM_TYPE_CREATE' } })
      gatewayMock.createRoomType.mockResolvedValue({
        id: 'rt-new-' + Date.now(),
        title: 'Test from Day 5',
        count_of_rooms: 3,
        occ_adults: 2,
        occ_children: 0,
        occ_infants: 0,
        default_occupancy: 2,
      })
      const result = await roomTypesService.create(
        PROPERTY_ID,
        { title: 'Test from Day 5', countOfRooms: 3, occAdults: 2 },
        ACTOR_ID,
        ACTOR_ROLE,
      )
      expect(result.id).toBeDefined()
      const after = await prisma.auditLog.count({ where: { action: 'CHANNEX_ROOM_TYPE_CREATE' } })
      expect(after).toBe(before + 1)
    })

    it('create — gateway throws → audit_log FAILURE entry + rethrow', async () => {
      gatewayMock.createRoomType.mockRejectedValue(
        new ChannexHttpError('Test failure', 500),
      )
      await expect(
        roomTypesService.create(
          PROPERTY_ID,
          { title: 'Fail', countOfRooms: 1, occAdults: 1 },
          ACTOR_ID,
          ACTOR_ROLE,
        ),
      ).rejects.toThrow(/Test failure/)
      const failure = await prisma.auditLog.findFirst({
        where: { action: 'CHANNEX_ROOM_TYPE_CREATE', status: 'FAILURE' },
        orderBy: { createdAt: 'desc' },
      })
      expect(failure?.errorMessage).toContain('Test failure')
    })

    it('list — property NO pertenece al acting org → NotFoundException', async () => {
      tenantMock.getActingOrgIdOrThrow = jest.fn().mockReturnValue('other-org-id')
      await expect(roomTypesService.list(PROPERTY_ID)).rejects.toThrow(NotFoundException)
    })

    it('delete con orphan rooms y force=false → ForbiddenException', async () => {
      // Hotel Tulum has rooms con channexRoomTypeId set from sandbox setup
      const sampleRoom = await prisma.room.findFirst({
        where: { propertyId: PROPERTY_ID, channexRoomTypeId: { not: null } },
      })
      if (!sampleRoom?.channexRoomTypeId) {
        // Test pre-condition not met — skip silently
        return
      }
      await expect(
        roomTypesService.delete(
          sampleRoom.channexRoomTypeId,
          PROPERTY_ID,
          { force: false },
          ACTOR_ID,
          ACTOR_ROLE,
        ),
      ).rejects.toThrow(/orphan|rooms en Zenix DB/i)
    })
  })

  // ── 2. RatePlans ──────────────────────────────────────────────────────

  describe('ChannexRatePlansService', () => {
    it('list — local DB cache hit (5 rate plans seed Day 2)', async () => {
      const result = await ratePlansService.list(PROPERTY_ID)
      // gateway.listRatePlans no se llama porque local hit
      expect(gatewayMock.listRatePlans).not.toHaveBeenCalled()
      expect(result.length).toBeGreaterThanOrEqual(5)
    })

    it('create — write-through mapping + audit SUCCESS', async () => {
      gatewayMock.createRatePlan.mockResolvedValue({
        id: 'rp-new-' + Date.now(),
        title: 'Test Day 5 Plan',
        currency: 'USD',
        sell_mode: 'per_room',
        rate_mode: 'manual',
        options: [{ occupancy: 2, is_primary: true, rate: '50.00' }],
      })

      const sampleMapping = await prisma.channexRatePlanMapping.findFirst({
        where: { propertyId: PROPERTY_ID },
      })
      const beforeMappingCount = await prisma.channexRatePlanMapping.count({
        where: { propertyId: PROPERTY_ID },
      })

      const result = await ratePlansService.create(
        PROPERTY_ID,
        {
          roomTypeId: sampleMapping!.channexRoomTypeId,
          title: 'Test Day 5 Plan',
          currency: 'USD',
          rateCents: 5000,
        },
        ACTOR_ID,
        ACTOR_ROLE,
      )
      expect(result.mappingId).toBeDefined()

      const afterCount = await prisma.channexRatePlanMapping.count({
        where: { propertyId: PROPERTY_ID },
      })
      expect(afterCount).toBe(beforeMappingCount + 1)

      // cleanup
      await prisma.channexRatePlanMapping.delete({ where: { id: result.mappingId! } })
    })
  })

  // ── 3. AuditLog sanitization + reason required ────────────────────────

  describe('AuditLogService', () => {
    it('sanitizePayload redacta sensitive keys (case-insensitive)', () => {
      const input = {
        guestName: 'Juan',
        password: 'secret',
        Password: 'secret',
        creditCard: '4111-1111-1111-1111',
        nested: { CVV: '123', apiKey: 'xyz' },
        items: [{ jwt: 'eyJ...' }, { ok: 'visible' }],
      }
      const out = AuditLogService.sanitizePayload(input)
      expect(out.guestName).toBe('Juan')
      expect(out.password).toBe('<REDACTED>')
      expect(out.Password).toBe('<REDACTED>')
      expect(out.creditCard).toBe('<REDACTED>')
      expect((out.nested as any).CVV).toBe('<REDACTED>')
      expect((out.nested as any).apiKey).toBe('<REDACTED>')
      expect((out.items as any[])[0].jwt).toBe('<REDACTED>')
      expect((out.items as any[])[1].ok).toBe('visible')
    })

    it('write con onBehalfOfId pero sin reason → ForbiddenException', async () => {
      await expect(
        auditLog.write({
          organizationId: realOrgId,
          actorRealId: ACTOR_ID,
          actorRealRole: 'PLATFORM_ADMIN',
          onBehalfOfId: ACTOR_ID,
          onBehalfOfRole: 'ORG_OWNER',
          action: 'TEST_MISSING_REASON_VIA_SERVICE',
          payload: {},
          status: 'SUCCESS',
        }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('write con reason válido → SUCCESS', async () => {
      const result = await auditLog.write({
        organizationId: realOrgId,
        actorRealId: ACTOR_ID,
        actorRealRole: 'PLATFORM_ADMIN',
        onBehalfOfId: ACTOR_ID,
        onBehalfOfRole: 'ORG_OWNER',
        reason: 'Diagnosing issue #456',
        action: 'TEST_DAY5_VALID_IMPERSONATION',
        payload: { ticketId: 456 },
        status: 'SUCCESS',
      })
      expect(result?.id).toBeDefined()
    })
  })
})
