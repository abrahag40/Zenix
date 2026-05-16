import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'

/**
 * NotificationPurgeScheduler — limpieza física de AppNotifications obsoletas.
 *
 * Política de retención (estrategia "two-tier" justificada para v1.0.0):
 *
 *   Tier 1 — ACTIVAS (visibles en la app):
 *     · expiresAt > now  → vivas (la consulta listForUser ya filtra)
 *     · expiresAt = null → permanentes (compliance: NO_SHOW, fiscal, etc.)
 *
 *   Tier 2 — EXPIRADAS pero AÚN PRESENTES (audit grace period):
 *     · expiresAt <= now Y < now - PURGE_GRACE_HOURS → preservadas para
 *       auditoría/compliance hasta el cron de purga
 *
 *   Tier 3 — PURGADAS (físicamente eliminadas):
 *     · expiresAt + PURGE_GRACE_HOURS < now → DELETE FROM
 *
 * Defaults v1.0.0:
 *   · PURGE_GRACE_HOURS = 168 (7 días post-expiración)
 *   · Cron: diario 04:00 UTC (post night-audit per-tz)
 *
 * Lo que NUNCA se purga (expiresAt = null):
 *   · NO_SHOW (Visa chargeback evidence — 120 días)
 *   · MAINTENANCE_SLA_BREACH (compliance log)
 *   · MAINTENANCE_TICKET_CRITICAL (revenue impact audit)
 *   · LATE_CHECKOUT_* (operativo)
 *   · PAYMENT_PENDING (fiscal)
 *
 * Para esos casos, una migración futura v1.0.3+ REPORTS-CORE moverá filas
 * de >365 días a cold storage (partition o tabla archive). En v1.0.0 viven
 * en la tabla viva pero el filtro listForUser las ignora si expiresAt < now,
 * así que NO contaminan el panel del usuario.
 *
 * Análogo al patrón NightAuditScheduler (CLAUDE.md §12) y al
 * CancelledAnonymizationScheduler planeado (v1.0.4).
 */
@Injectable()
export class NotificationPurgeScheduler {
  private readonly logger = new Logger(NotificationPurgeScheduler.name)

  /** Horas post-expiración antes de purgar físicamente. */
  private readonly PURGE_GRACE_HOURS = 168 // 7 días

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron diario 04:00 UTC. Borra notifs con expiresAt + grace < now.
   * Cleanup cascade automático: AppNotificationRead + AppNotificationApproval
   * tienen onDelete: Cascade por FK en el schema.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'notification-purge' })
  async purgeExpired() {
    const cutoff = new Date(Date.now() - this.PURGE_GRACE_HOURS * 3600_000)

    const result = await this.prisma.appNotification.deleteMany({
      where: {
        expiresAt: { not: null, lt: cutoff },
      },
    })

    if (result.count > 0) {
      this.logger.log(
        `[NotifPurge] eliminadas ${result.count} notifs expiradas ` +
        `(expiresAt < ${cutoff.toISOString()})`,
      )
    } else {
      this.logger.debug('[NotifPurge] nada que purgar')
    }

    return result.count
  }

  /** Endpoint de runtime para testing/manual cleanup (no expuesto via REST). */
  async purgeNow(): Promise<number> {
    return this.purgeExpired()
  }
}
