import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'

/**
 * ChannexInboundService — accepts webhook deliveries from Channex and
 * persists them to (a) ChannexWebhookLog append-only audit (D-CHX4) and
 * (b) ChannexOutbox PENDING for async processing (D-CHX10).
 *
 * Both writes happen in a single Prisma transaction so a crash between
 * them can't leave a webhook accepted-but-not-queued (data loss) or
 * queued-twice (duplicate work).
 *
 * The actual booking pull + save + ack lives in ChannexRevisionPullerService
 * which is invoked by the outbox scheduler.
 */
@Injectable()
export class ChannexInboundService {
  private readonly logger = new Logger(ChannexInboundService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accept a webhook delivery. Writes audit log + outbox row atomically.
   * Returns the new IDs so the controller can log the correlation.
   *
   * Idempotency: si recibimos un retry de Channex para la MISMA
   * revisionId que ya está en outbox como PENDING/IN_PROGRESS/SUCCEEDED,
   * NO encolamos un segundo job. El audit log SÍ se escribe (forense).
   */
  async acceptDelivery(args: {
    propertyId: string
    eventType: string
    channexBookingId: string | null
    channexRevisionId: string | null
    payload: unknown
    signatureValid: boolean
  }): Promise<{ logId: string; outboxId: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const log = await tx.channexWebhookLog.create({
        data: {
          propertyId: args.propertyId,
          eventType: args.eventType,
          channexBookingId: args.channexBookingId,
          payload: args.payload as Prisma.InputJsonValue,
          signatureValid: args.signatureValid,
          result: 'pending',
        },
        select: { id: true },
      })

      // Dedup outbox: si existe un row PENDING/IN_PROGRESS/SUCCEEDED para
      // la misma revisionId, no encolamos otra vez. Channex puede emitir
      // duplicados; nosotros respondemos 200 igual pero sin duplicar trabajo.
      if (args.channexRevisionId) {
        const existing = await tx.channexOutbox.findFirst({
          where: {
            channexRevisionId: args.channexRevisionId,
            status: { in: ['PENDING', 'IN_PROGRESS', 'SUCCEEDED'] },
          },
          select: { id: true, status: true },
        })
        if (existing) {
          this.logger.warn(
            `[Channex inbound] dedup revision=${args.channexRevisionId} ` +
              `existing outbox=${existing.id} status=${existing.status}`,
          )
          // BUG E2E-14 fix (2026-06-08) — antes el WebhookLog quedaba con
          // result='pending' para siempre cuando dedup rechazaba la delivery.
          // Operador veía 24 webhooks "pending" desde hace 4 días pensando
          // backlog, cuando en realidad eran retries del mismo booking ya
          // procesado. Marcar 'deduplicated' refleja la verdad operativa.
          await tx.channexWebhookLog.update({
            where: { id: log.id },
            data: {
              result: 'deduplicated',
              processedAt: new Date(),
            },
          })
          return { logId: log.id, outboxId: null }
        }
      }

      const outbox = await tx.channexOutbox.create({
        data: {
          propertyId: args.propertyId,
          eventType: args.eventType,
          channexBookingId: args.channexBookingId,
          channexRevisionId: args.channexRevisionId,
          webhookLogId: log.id,
          status: 'PENDING',
          attempts: 0,
        },
        select: { id: true },
      })

      return { logId: log.id, outboxId: outbox.id }
    })
  }

  /**
   * Legacy entry point preserved for the Day 1 spec. Day 2+ callers should
   * use `acceptDelivery` (which also enqueues the outbox row).
   *
   * @deprecated Will be removed when Day 1 spec is migrated to acceptDelivery.
   */
  async recordDelivery(args: {
    propertyId: string
    eventType: string
    channexBookingId?: string | null
    channexRevision?: number | null
    payload: unknown
    signatureValid: boolean
  }): Promise<{ logId: string }> {
    const log = await this.prisma.channexWebhookLog.create({
      data: {
        propertyId: args.propertyId,
        eventType: args.eventType,
        channexBookingId: args.channexBookingId ?? null,
        channexRevision: args.channexRevision ?? null,
        payload: args.payload as Prisma.InputJsonValue,
        signatureValid: args.signatureValid,
        result: 'pending',
      },
      select: { id: true },
    })
    return { logId: log.id }
  }
}
