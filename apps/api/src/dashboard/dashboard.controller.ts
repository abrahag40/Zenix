import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '@zenix/shared'
import { DashboardService } from './dashboard.service'
import { TenantContextService } from '../common/tenant-context.service'

@UseGuards(JwtAuthGuard)
@Controller('v1/dashboard')
export class DashboardController {
  constructor(
    private readonly service: DashboardService,
    private readonly tenant: TenantContextService,
  ) {}

  /** Legacy scaffold endpoint — preservado por back-compat. */
  @Get('overview')
  overview(@CurrentUser() user: JwtPayload) {
    return this.service.getOverview(user.propertyId)
  }

  /**
   * GET /v1/dashboard/snapshot — Command Center aggregator.
   * Single round-trip: hero + liveNow + actions + pulse.
   * Cualquier rol autenticado; service filtra PII según role.
   */
  @Get('snapshot')
  snapshot(@CurrentUser() user: JwtPayload) {
    return this.service.getSnapshot(
      user.propertyId,
      this.tenant.getOrganizationId(),
      user.sub,
    )
  }
}
