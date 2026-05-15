import { Injectable } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import type { TenantScope } from '@zenix/shared'

export interface TenantContext {
  organizationId: string
  propertyId: string
  userId: string
  role: string
  // v1.0.5 TENANT-CTX-3LEVEL — campos opcionales
  scope: TenantScope
  legalEntityId?: string
  brandId?: string
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
}
