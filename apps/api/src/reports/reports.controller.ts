import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { ReportsService } from './reports.service'
import { OptionalDateRangeDto } from '../common/dto/date-range.dto'
import { NoShowReportExportQueryDto, NoShowReportQueryDto } from './dto/no-show-report-query.dto'
import { StayReportExportQueryDto, StayReportQueryDto } from './dto/stay-report-query.dto'
import { OverstayedReportExportQueryDto, OverstayedReportQueryDto } from './dto/overstayed-report-query.dto'
import { buildReportCsv, buildReportXlsx, type ReportColumn } from '../common/report-export'

function stayColumns(currency: string): ReportColumn[] {
  return [
    { key: 'guest', header: 'Huésped', width: 24 },
    { key: 'room', header: 'Habitación', width: 12 },
    { key: 'checkIn', header: 'Llegada', width: 14 },
    { key: 'checkOut', header: 'Salida', width: 14 },
    { key: 'nights', header: 'Noches extra', width: 12 },
    { key: 'revenue', header: `Ingreso extra (${currency})`, width: 16, numFmt: '#,##0.00' },
    { key: 'source', header: 'Canal', width: 14 },
    { key: 'contact', header: 'Contacto', width: 26 },
  ]
}

function overstayedColumns(currency: string): ReportColumn[] {
  return [
    { key: 'guest', header: 'Huésped', width: 24 },
    { key: 'room', header: 'Habitación', width: 12 },
    { key: 'scheduledCheckout', header: 'Salida programada', width: 16 },
    { key: 'daysOverdue', header: 'Días vencidos', width: 13 },
    { key: 'hoursOverdue', header: 'Horas vencidas', width: 14 },
    { key: 'balance', header: `Saldo pendiente (${currency})`, width: 18, numFmt: '#,##0.00' },
    { key: 'source', header: 'Canal', width: 14 },
    { key: 'paymentStatus', header: 'Estado de pago', width: 16 },
    { key: 'contact', header: 'Contacto', width: 26 },
  ]
}

function noShowColumns(currency: string): ReportColumn[] {
  return [
    { key: 'noShowAt', header: 'Marcado', width: 16 },
    { key: 'guest', header: 'Huésped', width: 24 },
    { key: 'room', header: 'Habitación', width: 12 },
    { key: 'scheduledCheckin', header: 'Llegada esperada', width: 16 },
    { key: 'source', header: 'Canal', width: 14 },
    { key: 'fee', header: `Cargo (${currency})`, width: 12, numFmt: '#,##0.00' },
    { key: 'chargeStatus', header: 'Estado cargo', width: 14 },
    { key: 'reason', header: 'Razón', width: 24 },
    { key: 'markedBy', header: 'Marcado por', width: 20 },
  ]
}

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10)
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toYMD(d)
}

/**
 * Sprint DTO-CORE (bug #22 sistémico) — endpoints reciben @Query() dto en
 * vez de params sueltos. Inputs malformed (`from: "BAD"`) ahora producen 400
 * con mensaje específico en vez de 500 genérico aguas abajo.
 */
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('overview')
  overview(@CurrentUser() user: JwtPayload, @Query() dto: OptionalDateRangeDto) {
    const today = toYMD(new Date())
    return this.service.getOverview(user.propertyId, dto.from ?? today, dto.to ?? today)
  }

  @Get('staff-performance')
  staffPerformance(@CurrentUser() user: JwtPayload, @Query() dto: OptionalDateRangeDto) {
    return this.service.getStaffPerformance(
      user.propertyId,
      dto.from ?? daysAgo(6),
      dto.to ?? toYMD(new Date()),
    )
  }

  @Get('daily-trend')
  dailyTrend(@CurrentUser() user: JwtPayload, @Query() dto: OptionalDateRangeDto) {
    return this.service.getDailyTrend(
      user.propertyId,
      dto.from ?? daysAgo(6),
      dto.to ?? toYMD(new Date()),
    )
  }

  /**
   * GET /reports/no-shows?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Reporte de auditoría de no-shows con KPIs de ingresos y distribución por canal.
   * Filtros: rango de fechas por noShowAt (cuándo se marcó, no cuándo fue la llegada).
   * Default: últimos 30 días.
   */
  @Get('no-shows')
  noShowReport(@CurrentUser() user: JwtPayload, @Query() dto: OptionalDateRangeDto) {
    return this.service.getNoShowReport(
      user.propertyId,
      dto.from ?? daysAgo(29),
      dto.to ?? toYMD(new Date()),
    )
  }

  /** GET /reports/no-shows-table — reporte tabular paginado de no-shows (SUPERVISOR). */
  @Get('no-shows-table')
  @Roles(StaffRole.SUPERVISOR)
  noShowTable(@CurrentUser() user: JwtPayload, @Query() q: NoShowReportQueryDto) {
    return this.service.getNoShowReportTable(user.propertyId, q)
  }

  /** GET /reports/no-shows-table/export?format=xlsx|csv — export del reporte (SUPERVISOR). */
  @Get('no-shows-table/export')
  @Roles(StaffRole.SUPERVISOR)
  async noShowTableExport(
    @CurrentUser() user: JwtPayload,
    @Query() q: NoShowReportExportQueryDto,
    @Res() res: Response,
  ) {
    const { rows, totals, currency } = await this.service.buildNoShowReportRows(user.propertyId, q)
    const cols = noShowColumns(currency)
    const exportRows = rows.map((r) => ({
      ...r,
      noShowAt: r.noShowAt.slice(0, 10),
      scheduledCheckin: r.scheduledCheckin.slice(0, 10),
    }))
    const totalsRow = { guest: 'TOTALES', fee: totals.fee }
    if (q.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="no-shows.csv"',
      })
      return res.send(buildReportCsv(cols, exportRows, totalsRow))
    }
    const buf = await buildReportXlsx('No-shows', cols, exportRows, totalsRow)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="no-shows.xlsx"',
    })
    return res.send(buf)
  }

  /** GET /reports/overstayed-table — reporte tabular de saldos vencidos / overstayed (SUPERVISOR). */
  @Get('overstayed-table')
  @Roles(StaffRole.SUPERVISOR)
  overstayedTable(@CurrentUser() user: JwtPayload, @Query() q: OverstayedReportQueryDto) {
    return this.service.getOverstayedReportTable(user.propertyId, q)
  }

  /** GET /reports/overstayed-table/export?format=xlsx|csv — export del reporte (SUPERVISOR). */
  @Get('overstayed-table/export')
  @Roles(StaffRole.SUPERVISOR)
  async overstayedTableExport(
    @CurrentUser() user: JwtPayload,
    @Query() q: OverstayedReportExportQueryDto,
    @Res() res: Response,
  ) {
    const { rows, totals, currency } = await this.service.buildOverstayedReportRows(user.propertyId, q)
    const cols = overstayedColumns(currency)
    const exportRows = rows.map((r) => ({ ...r, scheduledCheckout: r.scheduledCheckout.slice(0, 10) }))
    const totalsRow = { guest: 'TOTALES', balance: totals.balance }
    if (q.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="saldos-vencidos.csv"',
      })
      return res.send(buildReportCsv(cols, exportRows, totalsRow))
    }
    const buf = await buildReportXlsx('Saldos vencidos', cols, exportRows, totalsRow)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="saldos-vencidos.xlsx"',
    })
    return res.send(buf)
  }

  /** GET /reports/stays-table — reporte tabular paginado de estadías extendidas (SUPERVISOR). */
  @Get('stays-table')
  @Roles(StaffRole.SUPERVISOR)
  staysTable(@CurrentUser() user: JwtPayload, @Query() q: StayReportQueryDto) {
    return this.service.getStayReportTable(user.propertyId, q)
  }

  /** GET /reports/stays-table/export?format=xlsx|csv — export del reporte (SUPERVISOR). */
  @Get('stays-table/export')
  @Roles(StaffRole.SUPERVISOR)
  async staysTableExport(
    @CurrentUser() user: JwtPayload,
    @Query() q: StayReportExportQueryDto,
    @Res() res: Response,
  ) {
    const { rows, totals, currency } = await this.service.buildStayReportRows(user.propertyId, q)
    const cols = stayColumns(currency)
    const exportRows = rows.map((r) => ({ ...r, checkIn: r.checkIn.slice(0, 10), checkOut: r.checkOut.slice(0, 10) }))
    const totalsRow = { guest: 'TOTALES', nights: totals.nights, revenue: totals.revenue }
    if (q.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="estadias-extendidas.csv"',
      })
      return res.send(buildReportCsv(cols, exportRows, totalsRow))
    }
    const buf = await buildReportXlsx('Estadías extendidas', cols, exportRows, totalsRow)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="estadias-extendidas.xlsx"',
    })
    return res.send(buf)
  }

  /**
   * GET /reports/stay-journeys?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Reporte de extensiones de estadía con datos de contacto del huésped.
   * Filtro: checkIn del segmento de extensión. Default: últimos 30 días.
   */
  @Get('stay-journeys')
  stayJourneysReport(@CurrentUser() user: JwtPayload, @Query() dto: OptionalDateRangeDto) {
    return this.service.getStayJourneysReport(
      user.propertyId,
      dto.from ?? daysAgo(29),
      dto.to ?? toYMD(new Date()),
    )
  }
}
