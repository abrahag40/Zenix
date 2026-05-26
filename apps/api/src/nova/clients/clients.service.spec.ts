/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9 unit tests.
 *
 * NovaClientsService cubre:
 *   · PLATFORM tier → lista todas las orgs
 *   · PARTNER_ADMIN → orgs del firm (PartnerClientAssignment revokedAt null)
 *   · PARTNER_MEMBER con assignedOrgIds inline → usa el array sin DB query extra
 *   · PARTNER_MEMBER sin assignedOrgIds (overflow → null) → query DB
 *   · ORG_OWNER → su propia org
 *   · ORG_OWNER sin organizationId → ForbiddenException
 *   · partnerMemberId missing en tier PARTNER_* → ForbiddenException
 *   · Subtitle formatting: 0/1/N properties
 *   · isActive=false → status='SUSPENDED'
 */
import { ForbiddenException } from '@nestjs/common'
import { NovaClientsService } from './clients.service'

describe('NovaClientsService — Day 9', () => {
  function build(opts: {
    organizations?: any[]
    partnerMember?: any
    partnerClientAssignments?: any[]
    partnerMemberAssignments?: any[]
    propertyGroupBy?: any[]
  } = {}) {
    const prisma: any = {
      organization: {
        findMany: jest.fn().mockResolvedValue(opts.organizations ?? []),
        findUnique: jest.fn().mockImplementation((args: any) => {
          const found = (opts.organizations ?? []).find((o) => o.id === args.where.id)
          return Promise.resolve(found ?? null)
        }),
      },
      partnerMember: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(opts.partnerMember ?? null),
      },
      partnerClientAssignment: {
        findMany: jest.fn().mockResolvedValue(opts.partnerClientAssignments ?? []),
      },
      partnerMemberAssignment: {
        findMany: jest.fn().mockResolvedValue(opts.partnerMemberAssignments ?? []),
      },
      property: {
        groupBy: jest.fn().mockResolvedValue(opts.propertyGroupBy ?? []),
      },
    }
    return { service: new NovaClientsService(prisma), prisma }
  }

  describe('PLATFORM tier', () => {
    it('lista todas las orgs con propertiesCount', async () => {
      const { service } = build({
        organizations: [
          { id: 'org-1', name: 'Hotel Tulum', slug: 'tulum', isActive: true, createdAt: new Date('2025-01-01') },
          { id: 'org-2', name: 'Hotel Cancun', slug: 'cancun', isActive: false, createdAt: new Date('2025-02-01') },
        ],
        propertyGroupBy: [
          { organizationId: 'org-1', _count: { id: 3 } },
          { organizationId: 'org-2', _count: { id: 1 } },
        ],
      })
      const out = await service.listAccessibleClients({
        actorTier: 'PLATFORM',
        actorId: 'u-1',
        partnerMemberId: undefined,
        organizationId: undefined,
        assignedOrgIds: null,
      })
      expect(out).toHaveLength(2)
      expect(out[0]).toMatchObject({ id: 'org-1', status: 'ACTIVE', subtitle: '3 properties' })
      expect(out[1]).toMatchObject({ id: 'org-2', status: 'SUSPENDED', subtitle: '1 property' })
    })

    it('orgs sin properties → subtitle "Sin properties"', async () => {
      const { service } = build({
        organizations: [
          { id: 'org-1', name: 'Solo Org', slug: 'solo', isActive: true, createdAt: new Date() },
        ],
        propertyGroupBy: [],
      })
      const out = await service.listAccessibleClients({
        actorTier: 'PLATFORM',
        actorId: 'u-1',
        partnerMemberId: undefined,
        organizationId: undefined,
        assignedOrgIds: null,
      })
      expect(out[0].subtitle).toBe('Sin properties')
    })
  })

  describe('PARTNER_ADMIN tier', () => {
    it('lista orgs del firm vía PartnerClientAssignment activos', async () => {
      const { service } = build({
        partnerMember: { partnerId: 'partner-firm-1' },
        partnerClientAssignments: [
          {
            scope: 'FULL',
            organization: {
              id: 'org-A',
              name: 'Cliente A',
              slug: 'cliente-a',
              isActive: true,
              createdAt: new Date('2025-03-01'),
            },
          },
        ],
        propertyGroupBy: [{ organizationId: 'org-A', _count: { id: 2 } }],
      })
      const out = await service.listAccessibleClients({
        actorTier: 'PARTNER_ADMIN',
        actorId: 'u-partner',
        partnerMemberId: 'pm-1',
        organizationId: undefined,
        assignedOrgIds: null,
      })
      expect(out).toHaveLength(1)
      expect(out[0]).toMatchObject({
        id: 'org-A',
        subtitle: 'Firm scope: FULL',
        assignmentScope: 'Firm scope: FULL',
      })
    })

    it('sin partnerMemberId → ForbiddenException', async () => {
      const { service } = build({})
      await expect(
        service.listAccessibleClients({
          actorTier: 'PARTNER_ADMIN',
          actorId: 'u',
          partnerMemberId: undefined,
          organizationId: undefined,
          assignedOrgIds: null,
        }),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('PARTNER_MEMBER tier', () => {
    it('con assignedOrgIds inline → query orgs directo sin pasar por DB-join', async () => {
      const { service, prisma } = build({
        organizations: [
          { id: 'org-A', name: 'A', slug: 'a', isActive: true, createdAt: new Date() },
          { id: 'org-B', name: 'B', slug: 'b', isActive: true, createdAt: new Date() },
        ],
        propertyGroupBy: [{ organizationId: 'org-A', _count: { id: 1 } }],
      })
      const out = await service.listAccessibleClients({
        actorTier: 'PARTNER_MEMBER',
        actorId: 'u',
        partnerMemberId: 'pm-1',
        organizationId: undefined,
        assignedOrgIds: ['org-A', 'org-B'],
      })
      expect(out).toHaveLength(2)
      // findMany PartnerMemberAssignment NO debió llamarse (inline shortcut)
      expect(prisma.partnerMemberAssignment.findMany).not.toHaveBeenCalled()
    })

    it('sin assignedOrgIds (null overflow) → query PartnerMemberAssignment', async () => {
      const { service, prisma } = build({
        organizations: [
          { id: 'org-X', name: 'X', slug: 'x', isActive: true, createdAt: new Date() },
        ],
        partnerMemberAssignments: [
          {
            engagementRole: 'LEAD_CONSULTANT',
            partnerClientAssignment: {
              organizationId: 'org-X',
              scope: 'FULL',
              revokedAt: null,
            },
          },
        ],
        propertyGroupBy: [{ organizationId: 'org-X', _count: { id: 5 } }],
      })
      const out = await service.listAccessibleClients({
        actorTier: 'PARTNER_MEMBER',
        actorId: 'u',
        partnerMemberId: 'pm-1',
        organizationId: undefined,
        assignedOrgIds: null,
      })
      expect(prisma.partnerMemberAssignment.findMany).toHaveBeenCalled()
      expect(out).toHaveLength(1)
      expect(out[0].subtitle).toContain('LEAD_CONSULTANT')
      expect(out[0].subtitle).toContain('FULL')
    })

    it('filtra firms cuya PartnerClientAssignment está revoked', async () => {
      const { service } = build({
        organizations: [
          { id: 'org-X', name: 'X', slug: 'x', isActive: true, createdAt: new Date() },
        ],
        partnerMemberAssignments: [
          {
            engagementRole: 'LEAD_CONSULTANT',
            partnerClientAssignment: {
              organizationId: 'org-X',
              scope: 'FULL',
              revokedAt: new Date('2026-01-01'),
            },
          },
        ],
      })
      const out = await service.listAccessibleClients({
        actorTier: 'PARTNER_MEMBER',
        actorId: 'u',
        partnerMemberId: 'pm-1',
        organizationId: undefined,
        assignedOrgIds: null,
      })
      expect(out).toHaveLength(0)
    })
  })

  describe('ORG_OWNER tier', () => {
    it('retorna SOLO su propia org', async () => {
      const { service } = build({
        organizations: [
          { id: 'org-own', name: 'Mi Hotel', slug: 'mio', isActive: true, createdAt: new Date() },
        ],
        propertyGroupBy: [{ organizationId: 'org-own', _count: { id: 4 } }],
      })
      const out = await service.listAccessibleClients({
        actorTier: 'ORG_OWNER',
        actorId: 'u',
        partnerMemberId: undefined,
        organizationId: 'org-own',
        assignedOrgIds: null,
      })
      expect(out).toHaveLength(1)
      expect(out[0].id).toBe('org-own')
      expect(out[0].subtitle).toBe('4 properties')
    })

    it('sin organizationId → ForbiddenException', async () => {
      const { service } = build({})
      await expect(
        service.listAccessibleClients({
          actorTier: 'ORG_OWNER',
          actorId: 'u',
          partnerMemberId: undefined,
          organizationId: undefined,
          assignedOrgIds: null,
        }),
      ).rejects.toThrow(ForbiddenException)
    })
  })
})
