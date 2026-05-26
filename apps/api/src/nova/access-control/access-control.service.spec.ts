/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 3 tests integration.
 *
 * Verifica AccessControlService con DB real (no mock):
 *   1. PLATFORM_ADMIN (Abraham) → tier='PLATFORM', assignedOrgIds=null
 *   2. PARTNER_ADMIN (fake) → ve clientes del firm via PartnerClientAssignment
 *   3. PARTNER_MEMBER (fake) → ve sólo sus PartnerMemberAssignment
 *   4. Legacy Staff (no User row) → resolveLegacyStaff='ORG_STAFF'
 *   5. canActOnOrg() matrix
 *   6. trimAssignedOrgsForJwt (> 20 → null fallback)
 */

import { PrismaClient } from '@prisma/client'
import { AccessControlService, JWT_ASSIGNED_ORGS_INLINE_LIMIT } from './access-control.service'

const prisma = new PrismaClient()
let acl: AccessControlService

const PLATFORM_ADMIN_USER_ID = 'user-abraham-platform-admin'
const ZAHARDEV_PARTNER_ID = 'partner-zahardev-internal'

describe('AccessControlService — Day 3 integration', () => {
  beforeAll(() => {
    acl = new AccessControlService(prisma as any)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── 1. PLATFORM_ADMIN resolution (Abraham) ─────────────────────────────

  describe('resolveActor — PLATFORM_ADMIN', () => {
    it('Abraham (seed) resuelve a tier=PLATFORM + assignedOrgIds=null', async () => {
      const result = await acl.resolveActor(PLATFORM_ADMIN_USER_ID)
      expect(result.tier).toBe('PLATFORM')
      expect(result.partnerMemberId).toBeDefined()
      expect(result.assignedOrgIds).toBeNull() // PLATFORM ignora — cross-tenant
    })
  })

  // ── 2 + 3. PARTNER tiers — crear fixtures temporales ────────────────

  describe('resolveActor — PARTNER_ADMIN + PARTNER_MEMBER', () => {
    let partnerId: string
    let partnerAdminUserId: string
    let partnerMemberUserId: string
    let partnerAdminMemberId: string
    let partnerMemberMemberId: string
    let clientOrgIds: string[]
    let memberAssignmentIds: string[]

    beforeAll(async () => {
      // Crear Partner firm externo
      const partner = await prisma.partner.create({
        data: {
          name: 'Test Consulting Firm — ACL',
          tier: 'GOLD',
          countryCode: 'MX',
          contactEmail: 'test-firm@example.com',
          licenseValidUntil: new Date('2099-12-31'),
          isInternal: false,
        },
      })
      partnerId = partner.id

      // PARTNER_ADMIN user
      const adminUser = await prisma.user.create({
        data: {
          email: 'test-partner-admin-acl@example.com',
          passwordHash: 'fake',
          firstName: 'Test',
          lastName: 'PartnerAdmin',
          systemRole: 'PARTNER_ADMIN',
          organizationId: null,
        },
      })
      partnerAdminUserId = adminUser.id

      const adminMember = await prisma.partnerMember.create({
        data: {
          partnerId: partner.id,
          userId: adminUser.id,
          role: 'PARTNER_ADMIN',
          status: 'ACTIVE',
        },
      })
      partnerAdminMemberId = adminMember.id

      // PARTNER_MEMBER user (consultor individual)
      const memberUser = await prisma.user.create({
        data: {
          email: 'test-partner-member-acl@example.com',
          passwordHash: 'fake',
          firstName: 'Test',
          lastName: 'PartnerMember',
          systemRole: 'PARTNER_MEMBER',
          organizationId: null,
        },
      })
      partnerMemberUserId = memberUser.id

      const memberMember = await prisma.partnerMember.create({
        data: {
          partnerId: partner.id,
          userId: memberUser.id,
          role: 'SOLUTION_CONSULTANT',
          status: 'ACTIVE',
        },
      })
      partnerMemberMemberId = memberMember.id

      // Crear 3 client Orgs assigned al partner
      const org1 = await prisma.organization.create({
        data: { name: 'Test Client Org 1', slug: 'test-client-acl-1', plan: 'PROFESSIONAL' },
      })
      const org2 = await prisma.organization.create({
        data: { name: 'Test Client Org 2', slug: 'test-client-acl-2', plan: 'PROFESSIONAL' },
      })
      const org3 = await prisma.organization.create({
        data: { name: 'Test Client Org 3', slug: 'test-client-acl-3', plan: 'PROFESSIONAL' },
      })
      clientOrgIds = [org1.id, org2.id, org3.id]

      // PartnerClientAssignments (firm ↔ 3 clientes)
      const assignments = await Promise.all(
        clientOrgIds.map((orgId) =>
          prisma.partnerClientAssignment.create({
            data: {
              partnerId: partner.id,
              organizationId: orgId,
              scope: 'FULL',
              assignedById: PLATFORM_ADMIN_USER_ID,
            },
          }),
        ),
      )

      // PartnerMemberAssignments — el CONSULTANT solo está asignado a 2 de los 3 clientes
      memberAssignmentIds = []
      for (const a of assignments.slice(0, 2)) {
        const ma = await prisma.partnerMemberAssignment.create({
          data: {
            partnerClientAssignmentId: a.id,
            partnerMemberId: memberMember.id,
            engagementRole: 'CONSULTANT',
          },
        })
        memberAssignmentIds.push(ma.id)
      }
    })

    afterAll(async () => {
      // Cleanup en orden FK-safe
      await prisma.partnerMemberAssignment.deleteMany({
        where: { id: { in: memberAssignmentIds } },
      })
      await prisma.partnerClientAssignment.deleteMany({
        where: { partnerId },
      })
      await prisma.partnerMember.deleteMany({
        where: { id: { in: [partnerAdminMemberId, partnerMemberMemberId] } },
      })
      await prisma.user.deleteMany({
        where: { id: { in: [partnerAdminUserId, partnerMemberUserId] } },
      })
      await prisma.partner.deleteMany({ where: { id: partnerId } })
      await prisma.organization.deleteMany({ where: { id: { in: clientOrgIds } } })
    })

    it('PARTNER_ADMIN ve TODOS los clientes del firm (3 orgs)', async () => {
      const result = await acl.resolveActor(partnerAdminUserId)
      expect(result.tier).toBe('PARTNER_ADMIN')
      expect(result.partnerMemberId).toBe(partnerAdminMemberId)
      expect(result.assignedOrgIds).toHaveLength(3)
      expect(result.assignedOrgIds!.sort()).toEqual(clientOrgIds.slice().sort())
    })

    it('PARTNER_MEMBER ve sólo sus PartnerMemberAssignment (2 de 3 orgs)', async () => {
      const result = await acl.resolveActor(partnerMemberUserId)
      expect(result.tier).toBe('PARTNER_MEMBER')
      expect(result.partnerMemberId).toBe(partnerMemberMemberId)
      expect(result.assignedOrgIds).toHaveLength(2)
      // Org 3 NO está en su scope porque no hay PartnerMemberAssignment
      expect(result.assignedOrgIds).not.toContain(clientOrgIds[2])
      expect(result.assignedOrgIds!.sort()).toEqual(clientOrgIds.slice(0, 2).sort())
    })

    it('PARTNER_MEMBER con revokedAt → no aparece en assignedOrgIds', async () => {
      // Revocar el assignment al Org 2 del firm (cascade member assignment también)
      await prisma.partnerClientAssignment.updateMany({
        where: { partnerId, organizationId: clientOrgIds[1] },
        data: { revokedAt: new Date(), revokedById: PLATFORM_ADMIN_USER_ID },
      })

      const result = await acl.resolveActor(partnerMemberUserId)
      expect(result.assignedOrgIds).toHaveLength(1)
      expect(result.assignedOrgIds).toContain(clientOrgIds[0])
      expect(result.assignedOrgIds).not.toContain(clientOrgIds[1])

      // Restore (un-revoke) para los demás tests
      await prisma.partnerClientAssignment.updateMany({
        where: { partnerId, organizationId: clientOrgIds[1] },
        data: { revokedAt: null, revokedById: null },
      })
    })
  })

  // ── 4. Legacy Staff → resolveLegacyStaff ───────────────────────────────

  describe('resolveLegacyStaff — backwards-compat', () => {
    it('retorna tier=ORG_STAFF + assignedOrgIds=[] + partnerMemberId=null', () => {
      const result = acl.resolveLegacyStaff()
      expect(result.tier).toBe('ORG_STAFF')
      expect(result.assignedOrgIds).toEqual([])
      expect(result.partnerMemberId).toBeNull()
    })
  })

  // ── 5. canActOnOrg matrix ─────────────────────────────────────────────

  describe('canActOnOrg', () => {
    it('PLATFORM siempre true (cross-tenant)', () => {
      expect(
        acl.canActOnOrg({
          actorTier: 'PLATFORM',
          assignedOrgIds: null,
          actorOrganizationId: null,
          targetOrgId: 'any-org',
        }),
      ).toBe(true)
    })

    it('PARTNER_MEMBER con orgId in assignedOrgIds → true', () => {
      expect(
        acl.canActOnOrg({
          actorTier: 'PARTNER_MEMBER',
          assignedOrgIds: ['org-1', 'org-2'],
          actorOrganizationId: null,
          targetOrgId: 'org-1',
        }),
      ).toBe(true)
    })

    it('PARTNER_MEMBER con orgId fuera de assignedOrgIds → false', () => {
      expect(
        acl.canActOnOrg({
          actorTier: 'PARTNER_MEMBER',
          assignedOrgIds: ['org-1', 'org-2'],
          actorOrganizationId: null,
          targetOrgId: 'org-9',
        }),
      ).toBe(false)
    })

    it('PARTNER_MEMBER con assignedOrgIds=null (>20 overflow) → false defensively', () => {
      expect(
        acl.canActOnOrg({
          actorTier: 'PARTNER_MEMBER',
          assignedOrgIds: null,
          actorOrganizationId: null,
          targetOrgId: 'org-1',
        }),
      ).toBe(false)
    })

    it('ORG_OWNER con orgId === actor.organizationId → true', () => {
      expect(
        acl.canActOnOrg({
          actorTier: 'ORG_OWNER',
          assignedOrgIds: [],
          actorOrganizationId: 'my-org',
          targetOrgId: 'my-org',
        }),
      ).toBe(true)
    })

    it('ORG_STAFF con orgId !== actor.organizationId → false (cross-tenant access denied)', () => {
      expect(
        acl.canActOnOrg({
          actorTier: 'ORG_STAFF',
          assignedOrgIds: [],
          actorOrganizationId: 'my-org',
          targetOrgId: 'other-org',
        }),
      ).toBe(false)
    })
  })

  // ── 6. trimAssignedOrgsForJwt — overflow fallback ──────────────────────

  describe('trimAssignedOrgsForJwt', () => {
    it('array ≤ 20 orgs → retorna el array (inline JWT)', () => {
      const orgs = Array.from({ length: 15 }, (_, i) => `org-${i}`)
      expect(acl.trimAssignedOrgsForJwt(orgs)).toEqual(orgs)
    })

    it('array exactly 20 → retorna inline', () => {
      const orgs = Array.from({ length: JWT_ASSIGNED_ORGS_INLINE_LIMIT }, (_, i) => `org-${i}`)
      expect(acl.trimAssignedOrgsForJwt(orgs)).toEqual(orgs)
    })

    it('array > 20 orgs → retorna null (overflow, Redis cache fallback)', () => {
      const orgs = Array.from({ length: 25 }, (_, i) => `org-${i}`)
      expect(acl.trimAssignedOrgsForJwt(orgs)).toBeNull()
    })

    it('input null (PLATFORM) → null', () => {
      expect(acl.trimAssignedOrgsForJwt(null)).toBeNull()
    })
  })

  // ── 7. PLATFORM_ADMIN sin Partner isInternal=true → warn (defensive) ──

  describe('Defensive checks', () => {
    it('User con systemRole PLATFORM_ADMIN sin Partner.isInternal → loggea warn pero NO throws', async () => {
      // Edge case: User systemRole=PLATFORM_ADMIN sin PartnerMember en absoluto
      const orphanUser = await prisma.user.create({
        data: {
          email: 'test-orphan-platform-admin@example.com',
          passwordHash: 'fake',
          firstName: 'Orphan',
          lastName: 'Test',
          systemRole: 'PLATFORM_ADMIN',
          organizationId: null,
        },
      })

      const result = await acl.resolveActor(orphanUser.id)
      expect(result.tier).toBe('PLATFORM')
      expect(result.partnerMemberId).toBeNull()
      // No throws — solo warn en logs

      await prisma.user.delete({ where: { id: orphanUser.id } })
    })
  })
})
