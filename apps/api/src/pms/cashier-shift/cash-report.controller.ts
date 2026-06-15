import { Controller, Get, Header, Param, Query } from '@nestjs/common'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CashierShiftService } from './cashier-shift.service'
import { cashSummaryToCsv, shiftReportToCsv } from './cash-report-csv'
import { CashSummaryQueryDto } from './dto/cashier-shift.dto'

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
