/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 3.
 *
 * AccessControlService — fuente única de verdad para resolver:
 *   1. `actorTier` de un usuario en la hierarchy 5-tier Nova
 *   2. `assignedOrgIds` (orgs cliente accesibles) cuando es PARTNER_MEMBER
 *   3. `partnerMemberId` linking
 *
 * Decisiones aplicadas:
 *   §159 D-NOVA-1 — Nova subdomain
 *   §160 D-NOVA-2 — hierarchy 5-tier
 *   §161 D-NOVA-3 — PLATFORM_ADMIN solo en Partner.isInternal=true
 *   §164 D-NOVA-6 — PartnerClientAssignment + PartnerMemberAssignment
 *   §169 D-NOVA-11 — JWT extended con actorTier + assignedOrgIds (max 20 inline)
 *   §170 D-NOVA-12 — TenantContextService.getActingOrgIdOrThrow
 *
 * Pattern: query SQL UNION sobre 4 fuentes de acceso (CLAUDE.md §67):
 *   · PartnerMemberAssignment (tier consultor)
 *   · UserPropertyRole (org staff legacy)
 *   · LegalEntityUserRole (multi-property cross-LE)
 *   · BrandUserRole (cross-org dentro de Brand)
 *
 * Backwards-compat: legacy users sin systemRole=PARTNER_* o sin PartnerMember
 * resolven a 'ORG_STAFF' (current default behavior preserved).
 */
import { Injectable, Logger } from '@nestjs/common'
import type { ActorTier } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'

/** Limite de orgs inline en JWT antes de fallback a Redis cache (§169). */
export const JWT_ASSIGNED_ORGS_INLINE_LIMIT = 20

export interface ActorResolution {
  tier: ActorTier
  partnerMemberId: string | null
  /** Organizations accesibles. null si tier=PLATFORM (acceso pleno cross-tenant).
   *  Array vacío si tier=ORG_OWNER/ORG_STAFF (organizationId implícito en JWT.organizationId).
   *  Set sólo cuando tier ∈ {PARTNER_ADMIN, PARTNER_MEMBER}. */
  assignedOrgIds: string[] | null
}

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve el ActorTier + assignments de un usuario User.id.
   *
   * Pasos:
   *   1. Lee User.systemRole + organizationId
   *   2. Si systemRole ∈ {PLATFORM_ADMIN, PARTNER_ADMIN, PARTNER_MEMBER}:
   *      busca PartnerMember linked → resuelve assignedOrgIds via assignments
   *   3. Si systemRole=ORG_OWNER: tier='ORG_OWNER', assignedOrgIds=[]
   *   4. Else (legacy OWNER/MANAGER/RECEPTIONIST/HOUSEKEEPER/...): tier='ORG_STAFF'
   *
   * Lanza si el user no existe o el state es inválido (PLATFORM_ADMIN sin
   * PartnerMember en Partner isInternal=true → corrupción de schema).
   */
  async resolveActor(userId: string): Promise<ActorResolution> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        partnerMember: {
          include: {
            partner: { select: { id: true, isInternal: true } },
          },
        },
      },
    })

    if (!user) {
      throw new Error(`AccessControl: User ${userId} not found`)
    }

    // ── Tier 1: PLATFORM (ZaharDev staff) ────────────────────────────────
    if (user.systemRole === 'PLATFORM_ADMIN') {
      // Defensivo: PLATFORM_ADMIN debe estar linked a Partner isInternal=true.
      // Si no, es corrupción (el trigger DB lo evita en inserts via Prisma,
      // pero validamos por raw-SQL backdoors).
      if (!user.partnerMember || !user.partnerMember.partner.isInternal) {
        this.logger.warn(
          `[AccessControl] User ${userId} systemRole=PLATFORM_ADMIN pero NO está linked a Partner isInternal=true (corrupción schema)`,
        )
      }
      return {
        tier: 'PLATFORM',
        partnerMemberId: user.partnerMember?.id ?? null,
        // PLATFORM_ADMIN ignora assignedOrgIds — acceso pleno por definición
        assignedOrgIds: null,
      }
    }

    // ── Tier 2: PARTNER_ADMIN — owner del firm consultor ────────────────
    if (user.systemRole === 'PARTNER_ADMIN') {
      if (!user.partnerMember) {
        throw new Error(
          `AccessControl: User ${userId} systemRole=PARTNER_ADMIN pero sin PartnerMember linked`,
        )
      }
      // PARTNER_ADMIN ve todos los clientes del firm (todos los
      // PartnerClientAssignment del partner) — no requiere PartnerMemberAssignment
      // explícito porque es leadership del firm.
      const assignments = await this.prisma.partnerClientAssignment.findMany({
        where: {
          partnerId: user.partnerMember.partnerId,
          revokedAt: null,
        },
        select: { organizationId: true },
      })
      const orgIds = assignments.map((a) => a.organizationId)
      return {
        tier: 'PARTNER_ADMIN',
        partnerMemberId: user.partnerMember.id,
        assignedOrgIds: orgIds,
      }
    }

    // ── Tier 3: PARTNER_MEMBER — consultor con assignments granulares ──
    if (user.systemRole === 'PARTNER_MEMBER') {
      if (!user.partnerMember) {
        throw new Error(
          `AccessControl: User ${userId} systemRole=PARTNER_MEMBER pero sin PartnerMember linked`,
        )
      }
      // Consultor ve sólo orgs donde tiene PartnerMemberAssignment activo,
      // bajo PartnerClientAssignment no revocado del partner.
      const memberAssignments = await this.prisma.partnerMemberAssignment.findMany({
        where: {
          partnerMemberId: user.partnerMember.id,
          removedAt: null,
          partnerClientAssignment: { revokedAt: null },
        },
        include: {
          partnerClientAssignment: { select: { organizationId: true } },
        },
      })
      const orgIds = memberAssignments.map((m) => m.partnerClientAssignment.organizationId)
      return {
        tier: 'PARTNER_MEMBER',
        partnerMemberId: user.partnerMember.id,
        assignedOrgIds: orgIds,
      }
    }

    // ── Tier 4: ORG_OWNER (hotel owner cliente) ────────────────────────
    if (user.systemRole === 'ORG_OWNER') {
      return {
        tier: 'ORG_OWNER',
        partnerMemberId: null,
        // ORG_OWNER tiene UN organizationId via User.organizationId — no array.
        assignedOrgIds: [],
      }
    }

    // ── Tier 5: ORG_STAFF (legacy OWNER/MANAGER/RECEPTIONIST/etc.) ──────
    return {
      tier: 'ORG_STAFF',
      partnerMemberId: null,
      assignedOrgIds: [],
    }
  }

  /**
   * Resuelve actor de un Staff legacy (NO User). Backwards-compat para
   * Staff seed/legacy que no tiene User row vinculado.
   *
   * Siempre retorna 'ORG_STAFF' tier. assignedOrgIds=[] porque su scope es
   * el staff.propertyId → organizationId (set en JWT como organizationId).
   */
  resolveLegacyStaff(): ActorResolution {
    return {
      tier: 'ORG_STAFF',
      partnerMemberId: null,
      assignedOrgIds: [],
    }
  }

  /**
   * Returns the assignedOrgIds slimmed for inline JWT inclusion.
   * Si excede el limite, retorna null + el caller debe fallback a Redis cache
   * key `partner_member:{id}:assigned_orgs` (§169 D-NOVA-11).
   */
  trimAssignedOrgsForJwt(assignedOrgIds: string[] | null): string[] | null {
    if (assignedOrgIds === null) return null // PLATFORM_ADMIN — ignora array
    if (assignedOrgIds.length <= JWT_ASSIGNED_ORGS_INLINE_LIMIT) return assignedOrgIds
    // Excede limit — server-side resolution requerida
    return null
  }

  /**
   * Verifica que un organizationId esté en la lista de assignedOrgIds del actor.
   * Caller (Nova guards) usa esto para enforcement por endpoint.
   *
   * Casos:
   *   · tier=PLATFORM: siempre true (acceso pleno cross-tenant)
   *   · tier=PARTNER_ADMIN/PARTNER_MEMBER: verifica que orgId ∈ assignedOrgIds
   *   · tier=ORG_OWNER/ORG_STAFF: verifica que orgId === actor's own organizationId
   */
  canActOnOrg(args: {
    actorTier: ActorTier
    assignedOrgIds: string[] | null
    actorOrganizationId: string | null | undefined
    targetOrgId: string
  }): boolean {
    if (args.actorTier === 'PLATFORM') return true
    if (args.actorTier === 'PARTNER_ADMIN' || args.actorTier === 'PARTNER_MEMBER') {
      if (args.assignedOrgIds === null) {
        // null = overflow > 20 (server debe fallback cache). Caller decide.
        // En este método retornamos false defensively (mejor que false-positive).
        return false
      }
      return args.assignedOrgIds.includes(args.targetOrgId)
    }
    // ORG_OWNER + ORG_STAFF
    return args.actorOrganizationId === args.targetOrgId
  }
}
