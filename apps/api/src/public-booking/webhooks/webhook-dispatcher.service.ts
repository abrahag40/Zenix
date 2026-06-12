import { Injectable, Logger } from '@nestjs/common'
import { createHmac } from 'crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../../notifications/notifications.service'

const MAX_ATTEMPTS = 5
// Backoff por intento (segundos): 1s, 5s, 30s, 5min, 30min.
const BACKOFF_SECONDS = [1, 5, 30, 300, 1800]

/**
 * WebhookDispatcherService — BOOKING-ENGINE B3.
 *
 * Entrega eventos al website del hotel vía POST firmado HMAC-SHA256. Patrón de
 * cola + backoff exponencial + dead-letter (mirror del outbound de Channex §144).
 *
 * Flujo: `enqueue` busca las subscriptions activas suscritas al evento, crea una
 * WebhookDelivery PENDING por cada una y dispara la entrega fire-and-forget. Los
 * fallos se reintentan vía WebhookRetryScheduler. Tras MAX_ATTEMPTS → DEAD_LETTER
 * + notif al SUPERVISOR (compliance permanente §101).
 */
@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Encola un evento para todas las subscriptions activas de la property. */
  async enqueue(propertyId: string, event: string, payload: Record<string, unknown>) {
    const subs = await this.prisma.webhookSubscription.findMany({
      where: { propertyId, active: true, disabledAt: null, events: { has: event } },
      select: { id: true },
    })
    if (subs.length === 0) return

    const body = { event, propertyId, data: payload, sentAt: new Date().toISOString() }
    for (const sub of subs) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: { subscriptionId: sub.id, event, payload: body as unknown as Prisma.InputJsonValue, status: 'PENDING', attempts: 0 },
        select: { id: true },
      })
      // Fire-and-forget: el primer intento ocurre ya; los retries via scheduler.
      setImmediate(() => this.attemptDelivery(delivery.id).catch(() => undefined))
    }
  }

  /** Intenta entregar una delivery. Idempotente respecto a status terminal. */
  async attemptDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { subscription: true },
    })
    if (!delivery || delivery.status === 'DELIVERED' || delivery.status === 'DEAD_LETTER') return
    const sub = delivery.subscription
    if (!sub.active || sub.disabledAt) return

    const rawBody = JSON.stringify(delivery.payload)
    const signature = createHmac('sha256', sub.secret).update(rawBody).digest('hex')

    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Zenix-Signature': `sha256=${signature}`,
          'X-Zenix-Event': delivery.event,
          'X-Zenix-Delivery': delivery.id,
        },
        body: rawBody,
        signal: AbortSignal.timeout(10_000),
      })

      if (res.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'DELIVERED', attempts: delivery.attempts + 1, statusCode: res.status, deliveredAt: new Date() },
        })
        await this.prisma.webhookSubscription.update({
          where: { id: sub.id },
          data: { failureCount: 0, lastDeliveryAt: new Date() },
        })
        return
      }
      await this.handleFailure(delivery.id, delivery.attempts, sub.id, sub.propertyId, `HTTP ${res.status}`, res.status)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.handleFailure(delivery.id, delivery.attempts, sub.id, sub.propertyId, msg, null)
    }
  }

  private async handleFailure(
    deliveryId: string,
    priorAttempts: number,
    subscriptionId: string,
    propertyId: string,
    error: string,
    statusCode: number | null,
  ) {
    const attempts = priorAttempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'DEAD_LETTER', attempts, lastError: error, statusCode },
      })
      this.logger.error(`[Webhook] DEAD_LETTER delivery=${deliveryId} sub=${subscriptionId}: ${error}`)
      // Notif permanente al SUPERVISOR (§101) — el website del hotel no recibe eventos.
      this.notifications.emit(propertyId, 'booking:created', {
        webhookDeadLetter: true,
        subscriptionId,
        error,
      })
      return
    }
    const backoff = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        attempts,
        lastError: error,
        statusCode,
        nextAttemptAt: new Date(Date.now() + backoff * 1000),
      },
    })
    this.logger.warn(`[Webhook] retry delivery=${deliveryId} en ${backoff}s (intento ${attempts}): ${error}`)
  }
}
