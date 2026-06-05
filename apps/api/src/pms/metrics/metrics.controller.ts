import { Controller, Get, Post, Query } from '@nestjs/common'
import { StaffRole } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { TenantContextService } from '../../common/tenant-context.service'
import { MetricsService } from './metrics.service'
import {
  MetricsBackfillDto,
  MetricsForwardCaptureDto,
  MetricsPickupDto,
  MetricsRangeDto,
} from './dto/metrics-query.dto'

/**
 * Métricas — KPIs financieros (ADR/RevPAR/ocupación). SUPERVISOR-only: contiene
 * revenue. El snapshot diario lo puebla el NightAuditScheduler; estos endpoints
 * lo consultan + permiten backfill manual del histórico.
 *
 * Sprint testing BUG #22 — los endpoints ahora validan inputs vía DTO +
 * ValidationPipe global (main.ts: whitelist:true, transform:true,
 * enableImplicitConversion:true). Params ausentes / malformed devuelven
 * 400 con mensaje específico en vez de 500 genérico.
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
  range(@Query() dto: MetricsRangeDto) {
    return this.service.getRange(
      dto.propertyId,
      this.tenant.getOrganizationId(),
      new Date(dto.from),
      new Date(dto.to),
    )
  }

  /** POST /v1/metrics/backfill?propertyId&from — reconstruye snapshots históricos. */
  @Post('backfill')
  backfill(@Query() dto: MetricsBackfillDto) {
    return this.service.backfillSnapshots(
      dto.propertyId,
      this.tenant.getOrganizationId(),
      new Date(dto.from),
    )
  }

  /**
   * POST /v1/metrics/forward-capture?propertyId[&asOf&horizonDays]
   * Captura manual de on-the-books a futuro. Útil para bootstrap del piloto +
   * tests; en operación normal lo dispara el scheduler nocturno.
   */
  @Post('forward-capture')
  forwardCapture(@Query() dto: MetricsForwardCaptureDto) {
    const asOfDate = dto.asOf ? new Date(dto.asOf) : new Date()
    const horizon = dto.horizonDays ?? 90
    return this.service.captureForwardSnapshot(
      dto.propertyId,
      this.tenant.getOrganizationId(),
      asOfDate,
      horizon,
    )
  }

  /**
   * GET /v1/metrics/pickup?propertyId&daysAgo[&asOf&horizonDays]
   * Pickup de habitaciones/revenue entre [asOf−daysAgo, asOf] por noche futura.
   */
  @Get('pickup')
  pickup(@Query() dto: MetricsPickupDto) {
    return this.service.getPickup(
      dto.propertyId,
      this.tenant.getOrganizationId(),
      dto.asOf ? new Date(dto.asOf) : new Date(),
      dto.daysAgo,
      dto.horizonDays ?? 30,
    )
  }

  /**
   * GET /v1/metrics/pace?propertyId[&asOf&horizonDays]
   * Pace YoY: on-the-books AS-OF hoy vs same-time-last-year. Requiere ≥1 año
   * de historia para que `stly` no salga null.
   *
   * Reusa `MetricsForwardCaptureDto` — la forma (propertyId + asOf? + horizonDays?)
   * coincide exactamente.
   */
  @Get('pace')
  pace(@Query() dto: MetricsForwardCaptureDto) {
    return this.service.getPace(
      dto.propertyId,
      this.tenant.getOrganizationId(),
      dto.asOf ? new Date(dto.asOf) : new Date(),
      dto.horizonDays ?? 90,
    )
  }
}
