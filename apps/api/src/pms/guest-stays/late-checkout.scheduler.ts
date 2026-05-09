/**
 * LateCheckoutScheduler — escalación de checkouts olvidados/no procesados.
 *
 * Caso de uso operativo (CLAUDE.md §EC analysis 2026-05-08):
 *   El recepcionista olvida procesar un checkout. El huésped salió pero
 *   nadie lo registró. La habitación queda "fantasma" hasta que el night
 *   audit lo cierra (peor caso 2 AM al día siguiente).
 *
 * Solución: cron escalación basado en industry standards.
 *
 * Tiers de notificación (desde scheduledCheckout):
 *   ─────────────────────────────────────────────────────────────────
 *   Tier 0  T+0min                    Estado normal — sin acción
 *   Tier 1  T+lateCheckoutGraceMinutes   (default 60min) — notif RECEPTIONIST
 *   Tier 2  T+lateCheckoutEscalationMinutes (default 180min) — URGENT a SUPERVISOR
 *   Tier 3  noShowCutoffHour (night audit) — auto-resolve via existing audit
 *
 * Industry references:
 *   - AHLEI sec. 4.2 Front Desk Procedures — "Late Departure escalation"
 *   - Mews / Cloudbeds: notif T+60-90min al front desk
 *   - Marriott / Hilton SOP: T+60min Tier 1, T+180min Tier 2 (MOD)
 *
 * Multi-timezone: mismo patrón que NightAuditScheduler (Intl.DateTimeFormat
 * por propiedad, idempotencia per-day vía lateCheckoutProcessedDate).
 *
 * Tracking per-stay (evita duplicar notifs):
 *   GuestStay.lateCheckoutTier (0 | 1 | 2)
 *   GuestStay.lateCheckoutFlaggedAt (DateTime)
 *
 *   - 0 → ningún tier disparado todavía
 *   - 1 → Tier 1 ya enviado (recepción notificada)
 *   - 2 → Tier 2 ya enviado (supervisor notificado)
 *
 * Reset: cuando recepción confirma departure (checkout / confirmDeparture),
 * tier vuelve a 0 implícitamente porque actualCheckout != null excluye la
 * stay del query del scheduler.
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationCenterService } from '../../notification-center/notification-center.service'
import { NotificationsService } from '../../notifications/notifications.service'

function toLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

@Injectable()
export class LateCheckoutScheduler {
  private readonly logger = new Logger(LateCheckoutScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifCenter: NotificationCenterService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Cron cada 30 min. Por cada propiedad:
   *   1. Lee timezone + grace/escalation/cutoff settings
   *   2. Para cada stay activo (actualCheckout=null, noShowAt=null) cuyo
   *      scheduledCheckout pasó hace al menos `graceMinutes`, evalúa tier:
   *      - Si elapsed >= escalationMinutes y tier < 2 → Tier 2 (SUPERVISOR)
   *      - Si elapsed >= graceMinutes y tier < 1     → Tier 1 (RECEPTIONIST)
   *   3. Marca tier en BD para no re-notificar (idempotencia per-stay).
   *   4. Marca lateCheckoutProcessedDate (idempotencia per-day por timezone).
   */
  @Cron('*/30 * * * *')
  async run() {
    const now = new Date()

    const properties = await this.prisma.property.findMany({
      include: { settings: true },
    })

    for (const property of properties) {
      const settings = property.settings
      if (!settings) continue
      const tz = settings.timezone || 'UTC'
      const graceMinutes = settings.lateCheckoutGraceMinutes ?? 60
      const escalationMinutes = settings.lateCheckoutEscalationMinutes ?? 180

      try {
        await this.processProperty(
          property.id,
          property.organizationId ?? null,
          tz,
          graceMinutes,
          escalationMinutes,
          now,
        )
      } catch (err) {
        this.logger.error(
          `Late checkout cron failed for property=${property.id}: ${(err as Error).message}`,
        )
      }
    }
  }

  private async processProperty(
    propertyId: string,
    organizationId: string | null,
    timezone: string,
    graceMinutes: number,
    escalationMinutes: number,
    now: Date,
  ) {
    const localToday = toLocalDate(now, timezone)
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { lateCheckoutProcessedDate: true },
    })
    const lastProcessed = settings?.lateCheckoutProcessedDate
      ? toLocalDate(settings.lateCheckoutProcessedDate, timezone)
      : null

    // Aún si lastProcessed === localToday, NO salimos — el cron debe correr
    // múltiples veces el mismo día (Tier 1 a las 12:00, Tier 2 a las 14:00).
    // La idempotencia per-stay (lateCheckoutTier) previene duplicados.
    // lateCheckoutProcessedDate solo registra el último día con actividad
    // para reportes/diagnóstico — no bloquea ejecución.

    const graceDeadline = new Date(now.getTime() - graceMinutes * 60_000)
    const escalationDeadline = new Date(now.getTime() - escalationMinutes * 60_000)

    // Stays con scheduledCheckout pasado hace >= graceMinutes y aún sin
    // checkout procesado ni no-show. Excluye los que ya tienen tier=2
    // (escalación máxima alcanzada — sin más notifs hasta night audit).
    const candidates = await this.prisma.guestStay.findMany({
      where: {
        propertyId,
        actualCheckout: null,
        noShowAt: null,
        scheduledCheckout: { lte: graceDeadline },
        OR: [
          { lateCheckoutTier: { lt: 2 } },
          { lateCheckoutTier: null },
        ],
      },
      include: { room: { select: { number: true } } },
    })

    if (candidates.length === 0) return

    let t1Count = 0
    let t2Count = 0

    for (const stay of candidates) {
      const currentTier = stay.lateCheckoutTier ?? 0
      const elapsedMs = now.getTime() - stay.scheduledCheckout.getTime()

      // Tier 2 — escalación a SUPERVISOR
      if (elapsedMs >= escalationMinutes * 60_000 && currentTier < 2) {
        await this.fireTier2(stay, propertyId, organizationId)
        t2Count++
        continue
      }

      // Tier 1 — notif a RECEPTIONIST
      if (elapsedMs >= graceMinutes * 60_000 && currentTier < 1) {
        await this.fireTier1(stay, propertyId, organizationId)
        t1Count++
      }
    }

    // Marca processed para diagnóstico
    if (t1Count + t2Count > 0) {
      await this.prisma.propertySettings.update({
        where: { propertyId },
        data: { lateCheckoutProcessedDate: new Date(`${localToday}T00:00:00.000Z`) },
      })
      this.logger.log(
        `[LateCheckout] property=${propertyId} tz=${timezone} T1=${t1Count} T2=${t2Count}`,
      )
    }
  }

  private async fireTier1(
    stay: { id: string; guestName: string | null; room: { number: string }; scheduledCheckout: Date },
    propertyId: string,
    _organizationId: string | null,
  ) {
    await this.prisma.guestStay.update({
      where: { id: stay.id },
      data: { lateCheckoutTier: 1, lateCheckoutFlaggedAt: new Date() },
    })

    const sched = stay.scheduledCheckout.toISOString().slice(11, 16) // HH:MM UTC
    void this.notifCenter.send({
      propertyId,
      type:          'ACTION_REQUIRED',
      category:      'LATE_CHECKOUT_PENDING',
      priority:      'MEDIUM',
      title:         `Checkout pendiente — Hab. ${stay.room.number}`,
      body:          `${stay.guestName ?? 'Huésped'} debía salir a las ${sched} UTC. ¿Realizó el checkout? Confirma o extiende su estadía.`,
      metadata:      { stayId: stay.id, roomNumber: stay.room.number, tier: 1 },
      actionUrl:     `/reservations/${stay.id}`,
      recipientType: 'ROLE',
      recipientRole: 'RECEPTIONIST',
      // triggeredById omitido (sistema)
    }).catch((err: Error) =>
      this.logger.warn(`[LateCheckout T1] notif failed stay=${stay.id}: ${err?.message}`),
    )

    this.notifications.emit(propertyId, 'late-checkout:pending', {
      stayId: stay.id,
      roomNumber: stay.room.number,
      tier: 1,
    })
  }

  private async fireTier2(
    stay: { id: string; guestName: string | null; room: { number: string }; scheduledCheckout: Date },
    propertyId: string,
    _organizationId: string | null,
  ) {
    await this.prisma.guestStay.update({
      where: { id: stay.id },
      data: { lateCheckoutTier: 2, lateCheckoutFlaggedAt: new Date() },
    })

    const sched = stay.scheduledCheckout.toISOString().slice(11, 16)
    void this.notifCenter.send({
      propertyId,
      type:          'ACTION_REQUIRED',
      category:      'LATE_CHECKOUT_ESCALATED',
      priority:      'HIGH',
      title:         `🚨 Late checkout escalado — Hab. ${stay.room.number}`,
      body:          `${stay.guestName ?? 'Huésped'} debía salir a las ${sched} UTC. Han pasado más de 3 horas sin procesar. Acción del supervisor requerida.`,
      metadata:      { stayId: stay.id, roomNumber: stay.room.number, tier: 2 },
      actionUrl:     `/reservations/${stay.id}`,
      recipientType: 'ROLE',
      recipientRole: 'SUPERVISOR',
      // triggeredById omitido (sistema)
    }).catch((err: Error) =>
      this.logger.warn(`[LateCheckout T2] notif failed stay=${stay.id}: ${err?.message}`),
    )

    // También notif al RECEPTIONIST por si T1 fue ignorado (recepción cambió de turno, etc.)
    void this.notifCenter.send({
      propertyId,
      type:          'ACTION_REQUIRED',
      category:      'LATE_CHECKOUT_ESCALATED',
      priority:      'HIGH',
      title:         `🚨 Late checkout escalado — Hab. ${stay.room.number}`,
      body:          `Recordatorio: ${stay.guestName ?? 'Huésped'} sin procesar > 3h. Supervisor notificado.`,
      metadata:      { stayId: stay.id, roomNumber: stay.room.number, tier: 2 },
      actionUrl:     `/reservations/${stay.id}`,
      recipientType: 'ROLE',
      recipientRole: 'RECEPTIONIST',
      // triggeredById omitido (sistema)
    }).catch(() => undefined)

    this.notifications.emit(propertyId, 'late-checkout:escalated', {
      stayId: stay.id,
      roomNumber: stay.room.number,
      tier: 2,
    })
  }
}
