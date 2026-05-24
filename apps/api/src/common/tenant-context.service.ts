import { ForbiddenException, Injectable } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import type { ActorTier, TenantScope } from '@zenix/shared'

export interface TenantContext {
  organizationId: string
  propertyId: string
  userId: string
  role: string
  // v1.0.5 TENANT-CTX-3LEVEL — campos opcionales
  scope: TenantScope
  legalEntityId?: string
  brandId?: string
  // Nova foundation — Day 3 (§170 D-NOVA-12)
  actorTier?: ActorTier
  partnerMemberId?: string
  assignedOrgIds?: string[]
  actingOrgId?: string
}

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  get(): TenantContext {
    return {
      organizationId: this.cls.get('organizationId'),
      propertyId: this.cls.get('propertyId'),
      userId: this.cls.get('userId'),
      role: this.cls.get('role'),
      scope: (this.cls.get<TenantScope>('scope') ?? 'PROPERTY') as TenantScope,
      legalEntityId: this.cls.get<string>('legalEntityId'),
      brandId: this.cls.get<string>('brandId'),
    }
  }

  getOrganizationId(): string {
    const id = this.cls.get<string>('organizationId')
    if (!id) throw new Error('TenantContext: organizationId not set')
    return id
  }

  getPropertyId(): string {
    const id = this.cls.get<string>('propertyId')
    if (!id) throw new Error('TenantContext: propertyId not set')
    return id
  }

  // ── v1.0.5 TENANT-CTX-3LEVEL — getters nuevos ─────────────────────────────

  /** Scope efectivo de la sesión. Default 'PROPERTY' por backwards-compat. */
  getScope(): TenantScope {
    return (this.cls.get<TenantScope>('scope') ?? 'PROPERTY') as TenantScope
  }

  /** LegalEntity en scope. Solo set cuando scope === 'LEGAL_ENTITY' o 'BRAND'. */
  getLegalEntityId(): string | undefined {
    return this.cls.get<string>('legalEntityId')
  }

  /** Brand en scope. Solo set cuando scope === 'BRAND'. */
  getBrandId(): string | undefined {
    return this.cls.get<string>('brandId')
  }

  /** UserId del actor. */
  getUserId(): string {
    const id = this.cls.get<string>('userId')
    if (!id) throw new Error('TenantContext: userId not set')
    return id
  }

  // ── Nova foundation Day 3 (§170 D-NOVA-12) ───────────────────────────────

  /** Tier en hierarchy 5-tier Nova. Default 'ORG_STAFF' por backwards-compat. */
  getActorTier(): ActorTier {
    return (this.cls.get<ActorTier>('actorTier') ?? 'ORG_STAFF') as ActorTier
  }

  /** PartnerMember linking — sólo set para tiers PLATFORM/PARTNER. */
  getPartnerMemberId(): string | undefined {
    return this.cls.get<string>('partnerMemberId')
  }

  /**
   * Resuelve el organizationId efectivo de scope:
   *   · ORG_OWNER + ORG_STAFF: retorna actor.organizationId (legacy behavior)
   *   · PLATFORM + PARTNER_ADMIN + PARTNER_MEMBER: retorna actingOrgId
   *     (validado por NovaActingOrgGuard via X-Acting-Organization-Id header)
   *
   * Lanza ForbiddenException si tier consultor sin actingOrgId (defensa
   * cuando endpoint NO usa @RequireActingOrg decorator pero la operación
   * sí requiere scope — bug-prevention).
   */
  getActingOrgIdOrThrow(): string {
    const tier = this.getActorTier()
    if (tier === 'ORG_OWNER' || tier === 'ORG_STAFF') {
      return this.getOrganizationId()
    }
    // PLATFORM + PARTNER_*: requieren actingOrgId del header
    const actingOrg = this.cls.get<string>('actingOrgId')
    if (!actingOrg) {
      throw new ForbiddenException(
        `Operación org-scoped requiere header X-Acting-Organization-Id (tier=${tier})`,
      )
    }
    return actingOrg
  }
}
