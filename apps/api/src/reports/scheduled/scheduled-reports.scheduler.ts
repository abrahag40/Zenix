import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { ReportGenerationService } from '../report-generation.service'
import { ScheduledReportEmailService } from './scheduled-report-email.service'

/**
 * ScheduledReportsScheduler — envía los reportes programados por email (P4a).
 *
 * Multi-timezone (§12, patrón NightAuditScheduler): el cron corre cada 30 min en
 * UTC; para cada reporte activo calcula la hora/fecha LOCAL de su propiedad y
 * decide si "toca" enviarlo hoy. Idempotente por `lastRunDate` (fecha local).
 *
 * Ventana de datos: el reporte cubre [localDate − rangeDays, ayer]. Ej. DAILY con
 * rangeDays=1 → solo ayer; WEEKLY rangeDays=7 → últimos 7 días terminando ayer.
 */
@Injectable()
export class ScheduledReportsScheduler {
  private readonly logger = new Logger(ScheduledReportsScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: ReportGenerationService,
    private readonly email: ScheduledReportEmailService,
  ) {}

  @Cron('0,30 * * * *')
  async dispatch() {
    const now = new Date()
    const reports = await this.prisma.scheduledReport.findMany({
      where: { active: true },
      include: { property: { select: { name: true, settings: { select: { timezone: true } } } } },
    })
    if (reports.length === 0) return

    for (const r of reports) {
      const tz = r.property?.settings?.timezone || 'America/Mexico_City'
      const localDate = toLocalDate(now, tz)
      const localHour = toLocalHour(now, tz)
      const localWeekday = toLocalWeekday(now, tz) // 1=lunes … 7=domingo
      const localDay = Number(localDate.slice(8, 10))

      if (r.lastRunDate === localDate) continue // ya se envió hoy (idempotencia)
      if (localHour < r.sendHour) continue // aún no llega la hora local

      if (r.frequency === 'WEEKLY' && r.weekday && localWeekday !== r.weekday) continue
      if (r.frequency === 'MONTHLY' && r.monthday && localDay !== r.monthday) continue

      await this.runOne(r.id, r, localDate)
    }
  }

  private async runOne(
    id: string,
    r: {
      reportKey: string
      propertyId: string
      organizationId: string
      rangeDays: number
      recipients: string[]
      format: string
      filters: unknown
      property?: { name?: string | null } | null
    },
    localDate: string,
  ) {
    try {
      // Ventana: hasta ayer (no incluye el día en curso, que aún no cerró).
      const to = addDaysYmd(localDate, -1)
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
        propertyName: r.property?.name ?? 'Propiedad',
        periodLabel: from === to ? formatYmd(from) : `${formatYmd(from)}–${formatYmd(to)}`,
        rowCount: file.rowCount,
        attachment: {
          filename: file.filename,
          content: file.content,
          mime:
            r.format === 'csv'
              ? 'text/csv'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })

      await this.prisma.scheduledReport.update({
        where: { id },
        data: { lastRunDate: localDate, lastRunAt: new Date(), lastRunStatus: result.sent ? 'sent' : result.reason ?? 'unknown' },
      })
      this.logger.log(`[ScheduledReport] ${r.reportKey} → ${r.recipients.length} dest · ${file.rowCount} filas · ${result.sent ? 'enviado' : result.reason}`)
    } catch (err) {
      // Fail-soft: marca el intento para no reintentar en loop el mismo día, con error.
      await this.prisma.scheduledReport
        .update({ where: { id }, data: { lastRunDate: localDate, lastRunAt: new Date(), lastRunStatus: 'error' } })
        .catch(() => undefined)
      this.logger.error(`[ScheduledReport] ${r.reportKey} falló: ${String(err).slice(0, 200)}`)
    }
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

function toLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
function toLocalHour(date: Date, timezone: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date)
  return Number(f) % 24
}
function toLocalWeekday(date: Date, timezone: string): number {
  // en-US weekday corto → mapeo a 1=lunes … 7=domingo (ISO).
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return map[wd] ?? 1
}
/** Suma `days` a una fecha YYYY-MM-DD usando UTC (date-only, sin tz). */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}
