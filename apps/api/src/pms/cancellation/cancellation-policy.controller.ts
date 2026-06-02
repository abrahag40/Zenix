import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { StaffRole } from '@zenix/shared'
import {
  CancellationPolicyService,
  type PolicyTier,
} from './cancellation-policy.service'

/**
 * GROUP-BILLING Fase C — CRUD de políticas de cancelación per-property.
 * Auth via guards globales (JwtAuthGuard + RolesGuard APP_GUARD). Config
 * sensible → SUPERVISOR. El PropertyScopeGuard global valida el `?propertyId=`
 * contra el scope del JWT (§MT-5).
 */
@Controller('v1/cancellation-policies')
export class CancellationPolicyController {
  constructor(private readonly service: CancellationPolicyService) {}

  @Get()
  list(@Query('propertyId') propertyId: string) {
    return this.service.listForProperty(propertyId)
  }

  @Post()
  @Roles(StaffRole.SUPERVISOR)
  create(@Body() dto: {
    propertyId: string
    name: string
    freeWindowHours: number
    tiers: PolicyTier[]
    refundMode?: string
    groupOverride?: { freeWindowHours: number; tiers: PolicyTier[] } | null
    isDefault?: boolean
  }) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Roles(StaffRole.SUPERVISOR)
  update(@Param('id') id: string, @Body() dto: Partial<{
    name: string
    freeWindowHours: number
    tiers: PolicyTier[]
    refundMode: string
    groupOverride: { freeWindowHours: number; tiers: PolicyTier[] } | null
    isDefault: boolean
  }>) {
    return this.service.update(id, dto)
  }
}
