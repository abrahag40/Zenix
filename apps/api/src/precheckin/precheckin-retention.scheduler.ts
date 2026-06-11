import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'

const MS_DAY = 86_400_000
// Default aprobado (2026-06-11): purga la foto de ID ~30d post-checkout.
// Tensión documentada: Visa chargeback window 120d vs minimización LFPDPPP/GDPR.
// TODO(config): mover a PropertySettings cuando legal del cliente fije el valor.
const RETENTION_DAYS = 30
const BATCH = 200

/**
 * PrecheckinRetentionScheduler — Sprint AUTO-CHECKIN §D-AC4.
 *
 * Purga la imagen de identificación subida por el huésped (scope `precheckin`,
 * en disco) N días después del checkout. Conserva el rastro de auditoría
 * (`precheckinSubmittedAt` + `guestVerifiedFields` + `documentType`) — solo se
 * borra el BLOB sensible (la foto) y se anula `documentPhotoUrl`.
 *
 * Solo afecta fotos scope `precheckin` (path `/api/uploads/.../precheckin/...`).
 * Las fotos data-URI capturadas en recepción son otro flujo (no se tocan aquí).
 */
@Injectable()
export class PrecheckinRetentionScheduler {
  private readonly logger = new Logger(PrecheckinRetentionScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  @Cron('0 5 * * *') // diario 05:00 (off-peak, como otros schedulers)
  async run() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_DAY)
    const stays = await this.prisma.guestStay.findMany({
      where: {
        actualCheckout: { lt: cutoff },
        documentPhotoUrl: { contains: '/precheckin/' },
      },
      select: { id: true, documentPhotoUrl: true },
      take: BATCH,
    })
    if (!stays.length) return

    let purged = 0
    for (const stay of stays) {
      try {
        if (stay.documentPhotoUrl) await this.uploads.deleteByUrl(stay.documentPhotoUrl)
        await this.prisma.$transaction([
          this.prisma.guestStay.update({
            where: { id: stay.id },
            data: { documentPhotoUrl: null },
          }),
          this.prisma.guestStayLog.create({
            data: {
              stayId: stay.id,
              event: 'PRECHECKIN_PHOTO_PURGED',
              actorType: 'SYSTEM',
              metadata: { retentionDays: RETENTION_DAYS },
            },
          }),
        ])
        purged++
      } catch (e) {
        this.logger.warn(`[precheckin-retention] stay=${stay.id} purge falló: ${String(e).slice(0, 120)}`)
      }
    }
    this.logger.log(`[precheckin-retention] purgadas ${purged}/${stays.length} fotos (>${RETENTION_DAYS}d post-checkout)`)
  }
}
