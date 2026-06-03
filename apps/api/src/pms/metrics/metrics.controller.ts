import { Controller, Get, Post, Query } from '@nestjs/common'
import { StaffRole } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { TenantContextService } from '../../common/tenant-context.service'
import { MetricsService } from './metrics.service'

/**
 * Métricas — KPIs financieros (ADR/RevPAR/ocupación). SUPERVISOR-only: contiene
 * revenue. El snapshot diario lo puebla el NightAuditScheduler; estos endpoints
 * lo consultan + permiten backfill manual del histórico.
 */
@Controller('v1/metrics')
@Roles(StaffRole.SUPERVISOR)
export class MetricsController {
  constructor(
    private readonly service: MetricsService,
    private readonly tenant: TenantContextService,
  ) {}

  /** GET /v1/metrics/range?propertyId&from&to — snapshots para charts. */
  @Get('range')
  range(
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getRange(propertyId, this.tenant.getOrganizationId(), new Date(from), new Date(to))
  }

  /** POST /v1/metrics/backfill?propertyId&from — reconstruye snapshots históricos. */
  @Post('backfill')
  backfill(@Query('propertyId') propertyId: string, @Query('from') from: string) {
    return this.service.backfillSnapshots(propertyId, this.tenant.getOrganizationId(), new Date(from))
  }
}
