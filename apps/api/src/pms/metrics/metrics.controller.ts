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

  /**
   * POST /v1/metrics/forward-capture?propertyId[&asOf&horizonDays]
   * Captura manual de on-the-books a futuro. Útil para bootstrap del piloto +
   * tests; en operación normal lo dispara el scheduler nocturno.
   */
  @Post('forward-capture')
  forwardCapture(
    @Query('propertyId') propertyId: string,
    @Query('asOf') asOf?: string,
    @Query('horizonDays') horizonDays?: string,
  ) {
    const asOfDate = asOf ? new Date(asOf) : new Date()
    const horizon = horizonDays ? parseInt(horizonDays, 10) : 90
    return this.service.captureForwardSnapshot(propertyId, this.tenant.getOrganizationId(), asOfDate, horizon)
  }

  /**
   * GET /v1/metrics/pickup?propertyId&daysAgo[&asOf&horizonDays]
   * Pickup de habitaciones/revenue entre [asOf−daysAgo, asOf] por noche futura.
   */
  @Get('pickup')
  pickup(
    @Query('propertyId') propertyId: string,
    @Query('daysAgo') daysAgo: string,
    @Query('asOf') asOf?: string,
    @Query('horizonDays') horizonDays?: string,
  ) {
    return this.service.getPickup(
      propertyId,
      this.tenant.getOrganizationId(),
      asOf ? new Date(asOf) : new Date(),
      parseInt(daysAgo, 10) || 7,
      horizonDays ? parseInt(horizonDays, 10) : 30,
    )
  }

  /**
   * GET /v1/metrics/pace?propertyId[&asOf&horizonDays]
   * Pace YoY: on-the-books AS-OF hoy vs same-time-last-year. Requiere ≥1 año
   * de historia para que `stly` no salga null.
   */
  @Get('pace')
  pace(
    @Query('propertyId') propertyId: string,
    @Query('asOf') asOf?: string,
    @Query('horizonDays') horizonDays?: string,
  ) {
    return this.service.getPace(
      propertyId,
      this.tenant.getOrganizationId(),
      asOf ? new Date(asOf) : new Date(),
      horizonDays ? parseInt(horizonDays, 10) : 90,
    )
  }
}
