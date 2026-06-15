import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import type { JwtPayload } from '@zenix/shared'
import { StaffRole } from '@zenix/shared'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ScheduledReportsService } from './scheduled-reports.service'
import { ReportGenerationService } from '../report-generation.service'
import { ScheduledReportEmailService } from './scheduled-report-email.service'
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/scheduled-report.dto'

/**
 * CRUD de reportes programados (P4a) + "enviar ahora" (test). SUPERVISOR-only —
 * los reportes contienen datos financieros (D-REPORT6).
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/reports/scheduled')
@Roles(StaffRole.SUPERVISOR)
export class ScheduledReportsController {
  constructor(
    private readonly service: ScheduledReportsService,
    private readonly generation: ReportGenerationService,
    private readonly email: ScheduledReportEmailService,
  ) {}

  @Get()
  list(@CurrentUser() actor: JwtPayload) {
    return this.service.list(actor)
  }

  @Post()
  create(@CurrentUser() actor: JwtPayload, @Body() dto: CreateScheduledReportDto) {
    return this.service.create(actor, dto)
  }

  @Patch(':id')
  update(@CurrentUser() actor: JwtPayload, @Param('id') id: string, @Body() dto: UpdateScheduledReportDto) {
    return this.service.update(actor, id, dto)
  }

  @Delete(':id')
  remove(@CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    return this.service.remove(actor, id)
  }

  /**
   * POST /v1/reports/scheduled/:id/run-now — genera + envía el reporte de inmediato
   * (test/manual). Usa la ventana rangeDays del reporte terminando ayer.
   */
  @Post(':id/run-now')
  async runNow(@CurrentUser() actor: JwtPayload, @Param('id') id: string) {
    const list = await this.service.list(actor)
    const r = list.find((x) => x.id === id)
    if (!r) return { sent: false, reason: 'not-found' }

    const to = ymdYesterday()
    const from = addDaysYmd(to, -(r.rangeDays - 1))
    const file = await this.generation.generateFile(
      {
        reportKey: r.reportKey,
        propertyId: r.propertyId,
        organizationId: r.organizationId,
        from,
        to,
        filters: (r.filters ?? null) as Record<string, unknown> | null,
      },
      r.format === 'csv' ? 'csv' : 'xlsx',
    )
    const result = await this.email.send({
      to: r.recipients,
      reportTitle: titleFor(r.reportKey),
      propertyName: 'tu propiedad',
      periodLabel: from === to ? from : `${from}–${to}`,
      rowCount: file.rowCount,
      attachment: {
        filename: file.filename,
        content: file.content,
        mime: r.format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })
    return { ...result, rowCount: file.rowCount }
  }
}

function titleFor(key: string): string {
  switch (key) {
    case 'metrics': return 'Métricas diarias'
    case 'no-shows': return 'No-shows'
    case 'stays': return 'Estadías extendidas'
    case 'overstayed': return 'Saldos vencidos'
    default: return key
  }
}
function ymdYesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, dd] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, dd))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
