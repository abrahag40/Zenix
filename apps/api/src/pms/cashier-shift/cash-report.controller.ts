import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { buildReportCsv, buildReportXlsx, type ReportColumn } from '../../common/report-export'
import { CashierShiftService } from './cashier-shift.service'
import { cashSummaryToCsv, shiftReportToCsv } from './cash-report-csv'
import { CashSummaryQueryDto, ShiftsReportExportQueryDto, ShiftsReportQueryDto } from './dto/cashier-shift.dto'

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function shiftReportColumns(currency: string): ReportColumn[] {
  return [
    { key: 'openedAt', header: 'Apertura', width: 18 },
    { key: 'closedAt', header: 'Cierre', width: 18 },
    { key: 'cashier', header: 'Cajero', width: 24 },
    { key: 'status', header: 'Estado', width: 14 },
    { key: 'opening', header: `Fondo (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'expected', header: `Esperado (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'actual', header: `Contado (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'variance', header: `Diferencia (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'reconciledBy', header: 'Conciliado por', width: 24 },
  ]
}

/**
 * Reportes de caja — Sprint CASH-DRAWER-REPORTS Sprint 3 (D-CASH7/10, R7).
 * Cashier Shift Report individual + resumen diario, en JSON y CSV. El email/print
 * de cierre llega en S5 (necesita configuración de destinatarios + UI).
 */
@Controller('v1/cash-reports')
@Roles(StaffRole.RECEPTIONIST, StaffRole.SUPERVISOR)
export class CashReportController {
  constructor(private readonly service: CashierShiftService) {}

  /** GET /v1/cash-reports/shift/:id — reporte del turno (cajero: sin over/short). */
  @Get('shift/:id')
  shiftReport(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.getShiftReport(id, actor)
  }

  /** GET /v1/cash-reports/shift/:id/csv — el mismo reporte en CSV. */
  @Get('shift/:id/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cashier-shift-report.csv"')
  async shiftReportCsv(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return shiftReportToCsv(await this.service.getShiftReport(id, actor))
  }

  /** GET /v1/cash-reports/shifts — reporte tabular paginado de Turnos de caja (SUPERVISOR). */
  @Get('shifts')
  @Roles(StaffRole.SUPERVISOR)
  shiftsReport(@Query() q: ShiftsReportQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.service.getShiftsReport(q, actor)
  }

  /** GET /v1/cash-reports/shifts/export?format=xlsx|csv — export del reporte (SUPERVISOR). */
  @Get('shifts/export')
  @Roles(StaffRole.SUPERVISOR)
  async shiftsExport(
    @Query() q: ShiftsReportExportQueryDto,
    @CurrentUser() actor: JwtPayload,
    @Res() res: Response,
  ) {
    const { rows, totals, currency } = await this.service.buildShiftReportRows(q, actor)
    const cols = shiftReportColumns(currency)
    const exportRows = rows.map((r) => ({
      ...r,
      openedAt: fmtDateTime(r.openedAt),
      closedAt: fmtDateTime(r.closedAt),
    }))
    const totalsRow = {
      cashier: 'TOTALES',
      opening: totals.opening,
      expected: totals.expected,
      actual: totals.actual,
      variance: totals.variance,
    }
    if (q.format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="turnos-caja.csv"',
      })
      return res.send(buildReportCsv(cols, exportRows, totalsRow))
    }
    const buf = await buildReportXlsx('Turnos de caja', cols, exportRows, totalsRow)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="turnos-caja.xlsx"',
    })
    return res.send(buf)
  }

  /** GET /v1/cash-reports/cash-summary?propertyId&date[&filter] — resumen diario (SUPERVISOR). */
  @Get('cash-summary')
  @Roles(StaffRole.SUPERVISOR)
  cashSummary(@Query() q: CashSummaryQueryDto) {
    return this.service.getCashSummary(q.propertyId, q.date, q.filter)
  }

  /** GET /v1/cash-reports/cash-summary/csv?propertyId&date[&filter] — resumen diario en CSV. */
  @Get('cash-summary/csv')
  @Roles(StaffRole.SUPERVISOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cash-summary.csv"')
  async cashSummaryCsv(@Query() q: CashSummaryQueryDto) {
    return cashSummaryToCsv(await this.service.getCashSummary(q.propertyId, q.date, q.filter))
  }
}
