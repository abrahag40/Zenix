import { Controller, Get, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
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
import { MetricsReportExportQueryDto, MetricsReportQueryDto } from './dto/metrics-report-query.dto'
import { buildReportCsv, buildReportXlsx, type ReportColumn } from '../../common/report-export'

function metricsColumns(currency: string): ReportColumn[] {
  return [
    { key: 'date', header: 'Fecha', width: 14 },
    { key: 'occupancy', header: 'Ocupación %', width: 13, numFmt: '#,##0.00' },
    { key: 'roomsSold', header: 'Hab. vendidas', width: 14 },
    { key: 'adr', header: `ADR (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'revpar', header: `RevPAR (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'revenue', header: `Ingreso (${currency})`, width: 16, numFmt: '#,##0.00' },
    { key: 'arrivals', header: 'Llegadas', width: 11 },
    { key: 'departures', header: 'Salidas', width: 11 },
    { key: 'cancellations', header: 'Cancelaciones', width: 14 },
    { key: 'noShows', header: 'No-shows', width: 11 },
  ]
}

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

  /**
   * GET /v1/metrics/report?propertyId&from&to[&sort&dir&page&pageSize]
   * Reporte tabular de Métricas diarias (Estándar de Reportes): una fila por día,
   * paginado + totales agregados USALI. SUPERVISOR (revenue).
   */
  @Get('report')
  report(@Query() dto: MetricsReportQueryDto) {
    return this.service.getMetricsReportTable(dto.propertyId, this.tenant.getOrganizationId(), dto)
  }

  /** GET /v1/metrics/report/export?format=xlsx|csv — export del reporte (SUPERVISOR). */
  @Get('report/export')
  async reportExport(@Query() dto: MetricsReportExportQueryDto, @Res() res: Response) {
    const { rows, totals, currency } = await this.service.buildMetricsReportRows(
      dto.propertyId,
      this.tenant.getOrganizationId(),
      dto,
    )
    const cols = metricsColumns(currency)
    const exportRows = rows.map((r) => ({ ...r, date: r.date.slice(0, 10) }))
    const totalsRow = {
      date: 'TOTALES',
      occupancy: totals.occupancy,
      roomsSold: totals.roomsSold,
      adr: totals.adr,
      revpar: totals.revpar,
      revenue: totals.revenue,
      arrivals: totals.arrivals,
      departures: totals.departures,
      cancellations: totals.cancellations,
      noShows: totals.noShows,
    }
    if (dto.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="metricas-diarias.csv"',
      })
      return res.send(buildReportCsv(cols, exportRows, totalsRow))
    }
    const buf = await buildReportXlsx('Métricas diarias', cols, exportRows, totalsRow)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="metricas-diarias.xlsx"',
    })
    return res.send(buf)
  }

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
