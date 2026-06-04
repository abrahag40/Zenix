import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { MetricsService } from './metrics.service'

/**
 * MetricsSnapshotScheduler — Fase 2 RATES-METRICS (D-METRICS1).
 *
 * Cron diario que persiste el snapshot del día que cerró (ayer UTC) para cada
 * property. Scheduler dedicado (no se entrelaza con el NightAuditScheduler, que
 * tiene su propia idempotencia multi-tz frágil). El upsert por [property, date]
 * hace la operación idempotente → re-correr es seguro.
 *
 * 04:00 UTC: después de que la mayoría de los night audits LATAM ya corrieron
 * (America/Mexico_City = 22:00; America/Bogota = 23:00 del día previo).
 */
@Injectable()
export class MetricsSnapshotScheduler {
  private readonly logger = new Logger(MetricsSnapshotScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  @Cron('0 4 * * *', { name: 'metrics-daily-snapshot' })
  async run(): Promise<void> {
    const yesterday = new Date(Date.now() - 86400000)
    const today = new Date()
    const props = await this.prisma.propertySettings.findMany({
      select: { propertyId: true, property: { select: { organizationId: true } } },
    })
    let okActuals = 0
    let okForward = 0
    for (const p of props) {
      const orgId = p.property?.organizationId
      if (!orgId) continue
      try {
        await this.metrics.computeDailySnapshot(p.propertyId, orgId, yesterday)
        okActuals += 1
      } catch (err) {
        this.logger.error(`[Metrics] snapshot failed property=${p.propertyId}: ${err instanceof Error ? err.message : String(err)}`)
      }
      try {
        // Forward capture: on-the-books AS-OF hoy para las próximas 90 noches.
        // Irreconstruible retroactivamente — por eso se captura cada noche.
        await this.metrics.captureForwardSnapshot(p.propertyId, orgId, today, 90)
        okForward += 1
      } catch (err) {
        this.logger.error(`[Metrics] forward snapshot failed property=${p.propertyId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    this.logger.log(
      `[Metrics] actuals=${okActuals}/${props.length} forward=${okForward}/${props.length} ` +
      `(date=${yesterday.toISOString().slice(0, 10)}, asOf=${today.toISOString().slice(0, 10)})`,
    )
  }
}
