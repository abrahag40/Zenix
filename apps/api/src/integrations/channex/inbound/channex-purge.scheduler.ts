import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../../prisma/prisma.service'

/**
 * ChannexPurgeScheduler — Cert audit C4 fix (2026-05-22).
 *
 * Sin esto la tabla `channex_webhook_logs` crece sin límite:
 *   100 properties × 50 bookings/día × ~10 webhooks/booking ≈ 50K rows/día
 *   → 18M rows/año → eventual disk pressure
 *
 * Política (mismo patrón que NotificationPurgeScheduler §101):
 *   - Tier 1 (≤90 días): preservado completo
 *   - Tier 2 (>90 días) Y `result='succeeded'`: DELETE físico
 *   - Tier 3 PRESERVE para compliance permanente (sin importar edad):
 *     · `signatureValid=false` — intentos de inyección, forense
 *     · `result='conflict'` — chargeback evidence Visa §5.9.2
 *     · `result='dead_letter'` — manual review audit trail
 *     · `result='rejected'` — security review
 *
 * Cron: daily 4 AM (off-peak, mismo slot que NotificationPurgeScheduler).
 */
@Injectable()
export class ChannexPurgeScheduler {
  private readonly logger = new Logger(ChannexPurgeScheduler.name)
  /** Threshold de purga — 90 días, alineado con Visa CRR chargeback window 120d. */
  private static readonly RETENTION_DAYS = 90

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'channex-webhook-log-purge' })
  async runScheduled(): Promise<void> {
    await this.purge()
  }

  /**
   * Pure logic separated para testability. Returns count borrados.
   */
  async purge(): Promise<{ deletedCount: number; preservedCompliance: number }> {
    const cutoff = new Date(Date.now() - ChannexPurgeScheduler.RETENTION_DAYS * 86_400_000)

    // Preserved compliance rows count (informational — no delete)
    const preservedCompliance = await this.prisma.channexWebhookLog.count({
      where: {
        receivedAt: { lt: cutoff },
        OR: [
          { signatureValid: false },
          { result: 'conflict' },
          { result: 'dead_letter' },
          { result: 'rejected' },
        ],
      },
    })

    // Delete physical: solo success rows >90d
    const { count } = await this.prisma.channexWebhookLog.deleteMany({
      where: {
        receivedAt: { lt: cutoff },
        result: 'succeeded',
        signatureValid: true,
      },
    })

    this.logger.log(
      `[Channex purge] deleted=${count} preservedCompliance=${preservedCompliance} ` +
        `cutoff=${cutoff.toISOString().slice(0, 10)}`,
    )
    return { deletedCount: count, preservedCompliance }
  }
}
