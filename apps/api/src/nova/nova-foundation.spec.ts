/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 1 schema integrity tests.
 *
 * Verifica los guards Postgres-level que protegen la fundación Nova:
 *   1. AuditLog append-only (trigger bloquea UPDATE/DELETE)
 *   2. AuditLog.reason REQUIRED on impersonation (CHECK constraint)
 *   3. PartnerMember PLATFORM_ADMIN solo en Partner isInternal=true (trigger)
 *   4. Partner sub-partner solo permitido si parent tier=PLATINUM (trigger)
 *   5. Schema relations FK válidas (Partner ↔ PartnerMember ↔ User)
 *
 * Estos tests son defense-in-depth: el TenantContextService app-layer también
 * enforce las mismas reglas, pero el trigger DB previene bypass via SQL directo.
 *
 * Decisiones §161, §164, §165 D-NOVA-3/6/7 CLAUDE.md.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ZAHARDEV_PARTNER_ID = 'partner-zahardev-internal'

describe('Nova foundation — Day 1 schema integrity', () => {
  beforeAll(async () => {
    // El seed-nova-foundation.ts ya corre antes — estos tests asumen ese estado.
    const zahardev = await prisma.partner.findUnique({ where: { id: ZAHARDEV_PARTNER_ID } })
    if (!zahardev) {
      throw new Error(
        'Pre-requisite: ejecuta primero `npx ts-node -r tsconfig-paths/register prisma/scripts/seed-nova-foundation.ts`',
      )
    }
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── 1. AuditLog append-only ─────────────────────────────────────────────

  describe('§165 D-NOVA-7 — AuditLog append-only trigger', () => {
    let testLogId: string

    beforeAll(async () => {
      const sentinelOrg = await prisma.organization.findFirst({
        where: { slug: 'zahardev-platform-sentinel' },
      })
      const log = await prisma.auditLog.create({
        data: {
          organizationId: sentinelOrg!.id,
          actorRealId: 'user-abraham-platform-admin',
          actorRealRole: 'PLATFORM_ADMIN',
          action: 'TEST_APPEND_ONLY',
          payload: { test: 'append-only' },
          status: 'SUCCESS',
        },
      })
      testLogId = log.id
    })

    it('UPDATE de audit_log lanza excepción del trigger', async () => {
      await expect(
        prisma.auditLog.update({
          where: { id: testLogId },
          data: { status: 'TAMPERED' },
        }),
      ).rejects.toThrow(/append-only|D-NOVA-7/i)
    })

    it('DELETE de audit_log lanza excepción del trigger', async () => {
      await expect(
        prisma.auditLog.delete({ where: { id: testLogId } }),
      ).rejects.toThrow(/append-only|D-NOVA-7/i)
    })
  })

  // ── 2. AuditLog reason REQUIRED on impersonation ────────────────────────

  describe('§165 D-NOVA-7 — reason REQUIRED on impersonation', () => {
    let sentinelOrgId: string

    beforeAll(async () => {
      const sentinelOrg = await prisma.organization.findFirst({
        where: { slug: 'zahardev-platform-sentinel' },
      })
      sentinelOrgId = sentinelOrg!.id
    })

    it('INSERT con onBehalfOfId pero sin reason → CHECK constraint falla', async () => {
      await expect(
        prisma.auditLog.create({
          data: {
            organizationId: sentinelOrgId,
            actorRealId: 'user-abraham-platform-admin',
            actorRealRole: 'PLATFORM_ADMIN',
            onBehalfOfId: 'fake-user-id',
            onBehalfOfRole: 'OWNER',
            // ← falta reason
            action: 'TEST_MISSING_REASON',
            payload: {},
            status: 'SUCCESS',
          },
        }),
      ).rejects.toThrow(/reason_required_on_impersonation|check constraint/i)
    })

    it('INSERT con onBehalfOfId + reason vacío → CHECK constraint falla', async () => {
      await expect(
        prisma.auditLog.create({
          data: {
            organizationId: sentinelOrgId,
            actorRealId: 'user-abraham-platform-admin',
            actorRealRole: 'PLATFORM_ADMIN',
            onBehalfOfId: 'fake-user-id',
            onBehalfOfRole: 'OWNER',
            reason: '   ', // whitespace-only no cuenta
            action: 'TEST_BLANK_REASON',
            payload: {},
            status: 'SUCCESS',
          },
        }),
      ).rejects.toThrow(/reason_required_on_impersonation|check constraint/i)
    })

    it('INSERT con onBehalfOfId + reason válido → OK', async () => {
      const log = await prisma.auditLog.create({
        data: {
          organizationId: sentinelOrgId,
          actorRealId: 'user-abraham-platform-admin',
          actorRealRole: 'PLATFORM_ADMIN',
          onBehalfOfId: 'fake-user-id',
          onBehalfOfRole: 'OWNER',
          reason: 'Diagnóstico de issue #123 — verificar guest stay record',
          action: 'TEST_VALID_IMPERSONATION',
          payload: {},
          status: 'SUCCESS',
        },
      })
      expect(log.id).toBeDefined()
      expect(log.reason).toContain('Diagnóstico')
    })

    it('INSERT sin onBehalfOfId (no impersonation) → reason puede ser null', async () => {
      const log = await prisma.auditLog.create({
        data: {
          organizationId: sentinelOrgId,
          actorRealId: 'user-abraham-platform-admin',
          actorRealRole: 'PLATFORM_ADMIN',
          // onBehalfOfId/Role/reason todos null
          action: 'TEST_NO_IMPERSONATION',
          payload: {},
          status: 'SUCCESS',
        },
      })
      expect(log.id).toBeDefined()
      expect(log.onBehalfOfId).toBeNull()
      expect(log.reason).toBeNull()
    })
  })

  // ── 3. PartnerMember PLATFORM_ADMIN solo en Partner internal ────────────

  describe('§161 D-NOVA-3 — PLATFORM_ADMIN guard (Partner isInternal only)', () => {
    let externalPartnerId: string
    let externalUserId: string

    beforeAll(async () => {
      // Crear Partner externo (no internal)
      const externalPartner = await prisma.partner.create({
        data: {
          name: 'Consultoría Externa Test',
          tier: 'SILVER',
          countryCode: 'MX',
          contactEmail: 'test-external@example.com',
          licenseValidUntil: new Date('2099-12-31'),
          isInternal: false,
        },
      })
      externalPartnerId = externalPartner.id

      // Crear User con systemRole=PLATFORM_ADMIN (mal asignado)
      const user = await prisma.user.create({
        data: {
          email: 'test-platform-admin-external@example.com',
          passwordHash: 'fake-hash',
          firstName: 'Test',
          lastName: 'Externo',
          systemRole: 'PLATFORM_ADMIN',
          organizationId: null,
        },
      })
      externalUserId = user.id
    })

    afterAll(async () => {
      // cleanup
      await prisma.user.deleteMany({ where: { id: externalUserId } })
      await prisma.partner.deleteMany({ where: { id: externalPartnerId } })
    })

    it('PartnerMember con user.systemRole=PLATFORM_ADMIN + partner.isInternal=false → trigger rejection', async () => {
      await expect(
        prisma.partnerMember.create({
          data: {
            partnerId: externalPartnerId,
            userId: externalUserId,
            role: 'PARTNER_ADMIN',
            status: 'ACTIVE',
          },
        }),
      ).rejects.toThrow(/PLATFORM_ADMIN.*is_internal|D-NOVA-3/i)
    })

    it('PartnerMember con user.systemRole=PARTNER_ADMIN + partner.isInternal=false → OK (no PLATFORM_ADMIN)', async () => {
      // Cambiar systemRole del user a PARTNER_ADMIN (no PLATFORM_ADMIN)
      await prisma.user.update({
        where: { id: externalUserId },
        data: { systemRole: 'PARTNER_ADMIN' },
      })

      const member = await prisma.partnerMember.create({
        data: {
          partnerId: externalPartnerId,
          userId: externalUserId,
          role: 'PARTNER_ADMIN',
          status: 'ACTIVE',
        },
      })
      expect(member.id).toBeDefined()

      // cleanup
      await prisma.partnerMember.delete({ where: { id: member.id } })
    })
  })

  // ── 4. Sub-partner solo permitido si parent tier=PLATINUM ────────────────

  describe('§164 D-NOVA-6 — sub-partner PLATINUM-only guard', () => {
    let silverPartnerId: string
    let platinumPartnerId: string

    beforeAll(async () => {
      const silver = await prisma.partner.create({
        data: {
          name: 'Silver Partner Test',
          tier: 'SILVER',
          countryCode: 'MX',
          contactEmail: 'silver@test.com',
          licenseValidUntil: new Date('2099-12-31'),
        },
      })
      silverPartnerId = silver.id

      const platinum = await prisma.partner.create({
        data: {
          name: 'Platinum Partner Test',
          tier: 'PLATINUM',
          countryCode: 'MX',
          contactEmail: 'platinum@test.com',
          licenseValidUntil: new Date('2099-12-31'),
        },
      })
      platinumPartnerId = platinum.id
    })

    afterAll(async () => {
      await prisma.partner.deleteMany({
        where: { id: { in: [silverPartnerId, platinumPartnerId] } },
      })
    })

    it('Sub-partner con parent SILVER → trigger rejection', async () => {
      await expect(
        prisma.partner.create({
          data: {
            name: 'Sub-Partner Test',
            tier: 'AUTHORIZED',
            countryCode: 'MX',
            contactEmail: 'sub@test.com',
            licenseValidUntil: new Date('2099-12-31'),
            parentPartnerId: silverPartnerId, // ← parent SILVER, no PLATINUM
          },
        }),
      ).rejects.toThrow(/PLATINUM|D-NOVA-6/i)
    })

    it('Sub-partner con parent PLATINUM → OK', async () => {
      const sub = await prisma.partner.create({
        data: {
          name: 'Sub-Partner of Platinum Test',
          tier: 'AUTHORIZED',
          countryCode: 'MX',
          contactEmail: 'sub-of-plat@test.com',
          licenseValidUntil: new Date('2099-12-31'),
          parentPartnerId: platinumPartnerId,
        },
      })
      expect(sub.id).toBeDefined()

      // cleanup
      await prisma.partner.delete({ where: { id: sub.id } })
    })
  })

  // ── 5. Schema relations FK válidas ───────────────────────────────────────

  describe('Schema relations integrity', () => {
    it('Partner ZaharDev tiene exactamente 1 PartnerMember (Abraham)', async () => {
      const zahardev = await prisma.partner.findUnique({
        where: { id: ZAHARDEV_PARTNER_ID },
        include: { members: { include: { user: true } } },
      })
      expect(zahardev?.members).toHaveLength(1)
      expect(zahardev?.members[0].user.email).toBe('abrahag40@gmail.com')
      expect(zahardev?.members[0].role).toBe('PARTNER_ADMIN')
    })

    it('Abraham User tiene systemRole=PLATFORM_ADMIN + partnerMember linking', async () => {
      const user = await prisma.user.findUnique({
        where: { email: 'abrahag40@gmail.com' },
        include: { partnerMember: { include: { partner: true } } },
      })
      expect(user?.systemRole).toBe('PLATFORM_ADMIN')
      expect(user?.partnerMember?.partner.id).toBe(ZAHARDEV_PARTNER_ID)
      expect(user?.partnerMember?.partner.isInternal).toBe(true)
    })

    it('AuditLog bootstrap entry persiste con retentionPolicy=PERMANENT', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { action: 'NOVA_FOUNDATION_BOOTSTRAP' },
      })
      expect(logs.length).toBeGreaterThanOrEqual(1)
      expect(logs[0].retentionPolicy).toBe('PERMANENT')
    })
  })
})
