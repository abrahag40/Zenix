/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 9.
 *
 * NovaClientsService — devuelve la lista de Organizations accesibles al
 * actor según su tier (§168 D-NOVA-10 SuccessFactors landing list pattern).
 *
 *   tier=PLATFORM         → TODAS las Organizations (cross-tenant)
 *   tier=PARTNER_ADMIN    → Orgs vinculadas vía PartnerClientAssignment del firm
 *   tier=PARTNER_MEMBER   → Orgs en PartnerMemberAssignment (subset del firm)
 *   tier=ORG_OWNER        → Su propia Organization (1 row)
 *
 * Schema realities a respetar (v1.0.5):
 *   - Organization NO tiene `status`/`activatedAt` (post-wizard fields que
 *     vienen en sprint Activate-Wizard Days 14-15). Por ahora derivamos
 *     status desde `isActive` flag (true=ACTIVE / false=SUSPENDED).
 *   - PartnerMemberAssignment se conecta a Organization vía
 *     PartnerClientAssignment (no tiene FK directa a organizationId).
 *   - PartnerMemberAssignment usa `removedAt` (null=activo).
 *   - PartnerClientAssignment usa `revokedAt` (null=activo).
 */
import { ForbiddenException, Injectable } from '@nestjs/common'
import type { ActorTier } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'

export interface NovaClientRow {
  id: string
  name: string
  slug: string
  /** "3 properties" o "Brand X" etc. */
  subtitle: string
  /** Para PARTNER_MEMBER: rol/scope dentro del engagement. */
  assignmentScope?: string | null
  /** ACTIVE | SUSPENDED — derivado de Organization.isActive (post-wizard
   *  Days 14-15 agregaremos ONBOARDING explícito). */
  status: 'ACTIVE' | 'SUSPENDED'
  /** Date when org became active. Por ahora retorna createdAt como proxy. */
  activatedAt: Date | null
}

@Injectable()
export class NovaClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAccessibleClients(args: {
    actorTier: ActorTier
    actorId: string
    partnerMemberId: string | undefined
    organizationId: string | undefined
    assignedOrgIds: string[] | null
  }): Promise<NovaClientRow[]> {
    switch (args.actorTier) {
      case 'PLATFORM':
        return this.listAllOrgs()

      case 'PARTNER_ADMIN':
      case 'PARTNER_MEMBER':
        return this.listAssignedOrgs(args.actorTier, args.partnerMemberId, args.assignedOrgIds)

      case 'ORG_OWNER':
      case 'ORG_STAFF':
        if (!args.organizationId) {
          throw new ForbiddenException(
            'Usuario sin organizationId vinculada — contactar soporte',
          )
        }
        return this.listOwnOrg(args.organizationId)

      default:
        throw new ForbiddenException(`Tier ${args.actorTier} no soportado en Nova`)
    }
  }

  private async listAllOrgs(): Promise<NovaClientRow[]> {
    const orgs = await this.prisma.organization.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (orgs.length === 0) return []
    const counts = await this.countPropertiesPerOrg(orgs.map((o) => o.id))
    return orgs.map((o) => this.toRow(o, counts.get(o.id) ?? 0))
  }

  private async listAssignedOrgs(
    tier: 'PARTNER_ADMIN' | 'PARTNER_MEMBER',
    partnerMemberId: string | undefined,
    assignedOrgIds: string[] | null,
  ): Promise<NovaClientRow[]> {
    if (!partnerMemberId) {
      throw new ForbiddenException(`Tier ${tier} sin partnerMemberId — auth roto`)
    }

    // PARTNER_ADMIN: orgs del firm vía PartnerClientAssignment (revokedAt null)
    if (tier === 'PARTNER_ADMIN') {
      const member = await this.prisma.partnerMember.findUniqueOrThrow({
        where: { id: partnerMemberId },
        select: { partnerId: true },
      })
      const assignments = await this.prisma.partnerClientAssignment.findMany({
        where: { partnerId: member.partnerId, revokedAt: null },
        select: {
          scope: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              createdAt: true,
            },
          },
        },
        orderBy: { organization: { name: 'asc' } },
      })
      if (assignments.length === 0) return []
      const counts = await this.countPropertiesPerOrg(
        assignments.map((a) => a.organization.id),
      )
      return assignments.map((a) =>
        this.toRow(a.organization, counts.get(a.organization.id) ?? 0, `Firm scope: ${a.scope}`),
      )
    }

    // PARTNER_MEMBER: orgs vía PartnerMemberAssignment ↔ PartnerClientAssignment
    // assignedOrgIds (JWT) puede traer la lista inline (≤20). Fallback a DB.
    let orgIds: string[]
    let scopeByOrg = new Map<string, string>()

    if (assignedOrgIds !== null) {
      orgIds = assignedOrgIds
    } else {
      const memberAssignments = await this.prisma.partnerMemberAssignment.findMany({
        where: { partnerMemberId, removedAt: null },
        select: {
          engagementRole: true,
          partnerClientAssignment: {
            select: {
              organizationId: true,
              scope: true,
              revokedAt: true,
            },
          },
        },
      })
      // Filtrar firms cuya assignment al cliente fue revocada (cascade activeness)
      const active = memberAssignments.filter(
        (a) => a.partnerClientAssignment.revokedAt === null,
      )
      orgIds = Array.from(new Set(active.map((a) => a.partnerClientAssignment.organizationId)))
      // Map de scope para el subtitle
      for (const a of active) {
        scopeByOrg.set(
          a.partnerClientAssignment.organizationId,
          `${a.engagementRole} — ${a.partnerClientAssignment.scope}`,
        )
      }
    }

    if (orgIds.length === 0) return []

    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
      },
    })
    const counts = await this.countPropertiesPerOrg(orgIds)
    return orgs.map((o) =>
      this.toRow(o, counts.get(o.id) ?? 0, scopeByOrg.get(o.id) ?? null),
    )
  }

  private async listOwnOrg(organizationId: string): Promise<NovaClientRow[]> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!org) return []
    const counts = await this.countPropertiesPerOrg([org.id])
    return [this.toRow(org, counts.get(org.id) ?? 0)]
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async countPropertiesPerOrg(orgIds: string[]): Promise<Map<string, number>> {
    if (orgIds.length === 0) return new Map()
    const grouped = await this.prisma.property.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: orgIds } },
      _count: { id: true },
    })
    const map = new Map<string, number>()
    for (const row of grouped) {
      map.set(row.organizationId, row._count.id)
    }
    return map
  }

  private toRow(
    o: {
      id: string
      name: string
      slug: string
      isActive: boolean
      createdAt: Date
    },
    propertiesCount: number,
    customSubtitle?: string | null,
  ): NovaClientRow {
    const subtitle = customSubtitle ?? this.formatSubtitle(propertiesCount)
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      subtitle,
      assignmentScope: customSubtitle ?? null,
      status: o.isActive ? 'ACTIVE' : 'SUSPENDED',
      activatedAt: o.createdAt, // proxy hasta Days 14-15 wizard agrega activatedAt explícito
    }
  }

  private formatSubtitle(propertiesCount: number): string {
    if (propertiesCount === 0) return 'Sin properties'
    if (propertiesCount === 1) return '1 property'
    return `${propertiesCount} properties`
  }
}
