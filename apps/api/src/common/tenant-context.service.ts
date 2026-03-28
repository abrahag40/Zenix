import { Injectable } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'

export interface TenantContext {
  organizationId: string
  propertyId: string
  userId: string
  role: string
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
}
