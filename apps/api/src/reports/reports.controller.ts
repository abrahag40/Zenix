import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '@zenix/shared'
import { ReportsService } from './reports.service'
import { OptionalDateRangeDto } from '../common/dto/date-range.dto'

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
