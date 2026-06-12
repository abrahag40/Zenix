import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { WebhookDispatcherService } from './webhook-dispatcher.service'

/**
 * WebhookRetryScheduler — BOOKING-ENGINE B3.
 *
 * Recovery net: cada 30s recoge las deliveries FAILED cuyo `nextAttemptAt` ya
 * venció y reintenta. El primer intento de cada delivery ocurre inline
 * (setImmediate en el dispatcher); este cron sólo cubre los retries. Mirror del
 * ChannexOutboxScheduler (§129).
 */
@Injectable()
export class WebhookRetryScheduler {
  private readonly logger = new Logger(WebhookRetryScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async retryDueDeliveries() {
    const due = await this.prisma.webhookDelivery.findMany({
      where: {
        status: 'FAILED',
        nextAttemptAt: { lte: new Date() },
      },
      select: { id: true },
      take: 50,
    })
    if (due.length === 0) return
    this.logger.debug(`[Webhook] reintentando ${due.length} deliveries`)
    for (const d of due) {
      await this.dispatcher.attemptDelivery(d.id).catch(() => undefined)
    }
  }
}
