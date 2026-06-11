import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { PrecheckinService } from './precheckin.service'
import { PrecheckinEmailService } from './precheckin-email.service'

const MS_HOUR = 3_600_000
const MS_DAY = 86_400_000

// Defaults aprobados por owner (2026-06-11): invitación 3 días antes de la
// llegada + recordatorio dentro de las 24h previas si no completó.
// TODO(config): mover a PropertySettings.precheckinLeadDays/ReminderHours cuando
// un cliente pida personalizarlo (por ahora constantes documentadas).
const LEAD_DAYS = 3
const REMINDER_WITHIN_HOURS = 24
const BATCH = 200

@Injectable()
export class PrecheckinScheduler {
  private readonly logger = new Logger(PrecheckinScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly precheckin: PrecheckinService,
    private readonly email: PrecheckinEmailService,
  ) {}

  /**
   * Corre cada hora. Dos pases idempotentes (gobernados por marcadores
   * `precheckinSentAt` / `precheckinReminderSentAt`):
   *   1. Invitación — estadías que llegan dentro de LEAD_DAYS y no se han enviado.
   *   2. Recordatorio — enviadas, sin completar, que llegan dentro de 24h.
   * Ventanas en UTC (coarse: días/horas) — el lead de 3 días no requiere
   * precisión de hora-local como el night-audit.
   */
  @Cron('0 * * * *')
  async run() {
    const now = new Date()
    try {
      await this.sendInvites(now)
    } catch (e) {
      this.logger.error(`[precheckin] invites pass error: ${String(e).slice(0, 200)}`)
    }
    try {
      await this.sendReminders(now)
    } catch (e) {
      this.logger.error(`[precheckin] reminders pass error: ${String(e).slice(0, 200)}`)
    }
  }

  /** Pase 1 — invitación inicial (≤ LEAD_DAYS antes de la llegada). */
  async sendInvites(now: Date) {
    const leadCutoff = new Date(now.getTime() + LEAD_DAYS * MS_DAY)
    const stays = await this.prisma.guestStay.findMany({
      where: {
        precheckinSentAt: null,
        checkinAt: { gt: now, lte: leadCutoff },
        cancelledAt: null,
        noShowAt: null,
        actualCheckin: null,
        actualCheckout: null,
        guestEmail: { not: null },
      },
      select: this.staySelect(),
      take: BATCH,
    })
    for (const stay of stays) {
      await this.deliver(stay, now, false)
    }
    if (stays.length) this.logger.log(`[precheckin] invites pass: ${stays.length} stays`)
  }

  /** Pase 2 — recordatorio (dentro de 24h, enviado pero sin completar). */
  async sendReminders(now: Date) {
    const reminderCutoff = new Date(now.getTime() + REMINDER_WITHIN_HOURS * MS_HOUR)
    const stays = await this.prisma.guestStay.findMany({
      where: {
        precheckinSentAt: { not: null },
        precheckinSubmittedAt: null,
        precheckinReminderSentAt: null,
        checkinAt: { gt: now, lte: reminderCutoff },
        cancelledAt: null,
        noShowAt: null,
        actualCheckin: null,
        actualCheckout: null,
        guestEmail: { not: null },
      },
      select: this.staySelect(),
      take: BATCH,
    })
    for (const stay of stays) {
      await this.deliver(stay, now, true)
    }
    if (stays.length) this.logger.log(`[precheckin] reminders pass: ${stays.length} stays`)
  }

  // ─── helpers ──────────────────────────────────────────────────

  private staySelect() {
    return {
      id: true,
      guestName: true,
      guestEmail: true,
      checkinAt: true,
      room: { select: { property: { select: { name: true } } } },
    } as const
  }

  private async deliver(
    stay: {
      id: string
      guestName: string
      guestEmail: string | null
      checkinAt: Date
      room: { property: { name: string } | null } | null
    },
    now: Date,
    isReminder: boolean,
  ) {
    if (!stay.guestEmail) return
    // TTL: válido hasta ~24h después de la llegada (el huésped puede completar
    // hasta que llega). Clamp [24h, 30d].
    const hoursUntilArrival = Math.max(0, (stay.checkinAt.getTime() - now.getTime()) / MS_HOUR)
    const ttlHours = Math.min(24 * 30, Math.max(24, Math.ceil(hoursUntilArrival + 24)))

    // (Re)genera token — el reminder usa un link fresco (el raw no se persiste).
    const { rawToken } = await this.precheckin.generateToken(stay.id, ttlHours)
    const baseUrl = process.env.APP_BASE_URL || 'https://app.zenix.com'
    const link = `${baseUrl}/precheckin/${rawToken}`

    const result = await this.email.send({
      to: stay.guestEmail,
      guestName: stay.guestName,
      propertyName: stay.room?.property?.name ?? 'tu hotel',
      link,
      checkInIso: stay.checkinAt.toISOString(),
      isReminder,
    })

    // Marcamos el intento si se envió, o si la razón es permanente en este
    // entorno (no-key = stub/dev). Errores transitorios (api-error/network) NO
    // se marcan → reintento en el próximo cron.
    const markAttempt = result.sent || (!result.sent && result.reason === 'no-key')
    if (!markAttempt) {
      this.logger.warn(`[precheckin] envío transitorio falló stay=${stay.id} — reintentará`)
      return
    }

    const marker = isReminder
      ? { precheckinReminderSentAt: now }
      : { precheckinSentAt: now }
    await this.prisma.$transaction([
      this.prisma.guestStay.update({ where: { id: stay.id }, data: marker }),
      this.prisma.guestStayLog.create({
        data: {
          stayId: stay.id,
          event: isReminder ? 'PRECHECKIN_REMINDER_SENT' : 'PRECHECKIN_EMAIL_SENT',
          actorType: 'SYSTEM',
          metadata: { emailSent: result.sent, reason: result.sent ? null : result.reason },
        },
      }),
    ])
  }
}
