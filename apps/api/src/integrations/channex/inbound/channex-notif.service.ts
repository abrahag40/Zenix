import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { NotificationsService } from '../../../notifications/notifications.service'
import { PushService } from '../../../notifications/push.service'

/**
 * ChannexNotifService — persists AppNotification rows for Channex conflicts
 * + emits SSE in the same call. System-context aware (no JWT/tenant lookup).
 *
 * Why this exists:
 *   NotificationCenterService.send() uses TenantContextService which expects
 *   JWT scope. Webhooks are public (no JWT) — calling send() throws. This
 *   helper bypasses tenant lookup by reading orgId directly from the row
 *   we already have.
 *
 * Category mapping (no new enum values to avoid an extra migration):
 *   category = SYSTEM           (channex events scoped under generic system)
 *   type     = ACTION_REQUIRED  (SUPERVISOR must decide — feeds the bell badge)
 *   priority = HIGH             (overbooking-class issue)
 *   metadata.channexConflict = true   → frontend filters on this
 *   metadata.bookingId / stayId / reason → deep-link payload
 *
 * Self-suppress (§99): triggeredById = null because this is system-initiated.
 * The supervisor receives the notif (they didn't trigger it themselves).
 */
@Injectable()
export class ChannexNotifService {
  private readonly logger = new Logger(ChannexNotifService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly sse: NotificationsService,
    private readonly push: PushService,
  ) {}

  async raiseConflict(args: {
    organizationId: string
    propertyId: string
    stayId: string | null
    bookingId: string | null
    reason: string
    otaName: string | null
    actionUrl?: string
  }): Promise<{ notificationId: string }> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7d window

    const title = `Conflicto Channex — ${args.otaName ?? 'OTA'}`
    const body = ChannexNotifService.bodyForReason(args.reason, args.otaName)

    const notif = await this.prisma.appNotification.create({
      data: {
        organizationId: args.organizationId,
        propertyId: args.propertyId,
        type: 'ACTION_REQUIRED',
        category: 'SYSTEM',
        priority: 'HIGH',
        title,
        body,
        metadata: {
          channexConflict: true,
          stayId: args.stayId,
          bookingId: args.bookingId,
          reason: args.reason,
          otaName: args.otaName,
        } as Prisma.InputJsonValue,
        actionUrl: args.actionUrl ?? '/channex/conflicts',
        recipientType: 'ROLE',
        recipientRole: 'SUPERVISOR',
        triggeredById: null, // system-initiated
        expiresAt,
      },
      select: { id: true },
    })

    // SSE push for the bell counter to flip immediately
    this.sse.emit(args.propertyId, 'notification:new', {
      id: notif.id,
      type: 'ACTION_REQUIRED',
      category: 'SYSTEM',
      priority: 'HIGH',
      title,
      body,
      metadata: {
        channexConflict: true,
        stayId: args.stayId,
        bookingId: args.bookingId,
        reason: args.reason,
      },
      actionUrl: args.actionUrl ?? '/channex/conflicts',
      createdAt: new Date(),
    })

    // Fix Caso 4 — Expo push para SUPERVISOR en mobile. Sin esto el
    // SUPERVISOR no recibe OS-level notif y solo ve el conflict si tiene
    // el web abierto. Fire-and-forget — fail no bloquea la creación local.
    void this.firePushToSupervisors(
      args.organizationId,
      args.propertyId,
      title,
      body,
      { stayId: args.stayId, notificationId: notif.id },
    ).catch((err) =>
      this.logger.warn(
        `[Channex notif] push fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    )

    this.logger.log(
      `[Channex notif] CONFLICT notif=${notif.id} property=${args.propertyId} ` +
        `reason=${args.reason} ota=${args.otaName ?? '∅'}`,
    )
    return { notificationId: notif.id }
  }

  private async firePushToSupervisors(
    organizationId: string,
    propertyId: string,
    title: string,
    body: string,
    data: Record<string, string | null>,
  ): Promise<void> {
    const supervisors = await this.prisma.staff.findMany({
      where: { organizationId, propertyId, role: 'SUPERVISOR', active: true },
      select: { id: true },
    })
    if (supervisors.length === 0) return
    const cleanData: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && v !== undefined) cleanData[k] = String(v)
    }
    await this.push.sendToMultipleStaff(
      supervisors.map((s) => s.id),
      title,
      body,
      cleanData,
    )
  }

  /**
   * Sprint CHECK-IN C2.2 (2026-05-29) — GROUP_BOOKING_RECEIVED notif §158.
   * Priority adaptativa según conflicts:
   *  - HIGH (ACTION_REQUIRED) si al menos una stay del grupo quedó con
   *    `channexConflict=true` (recepción debe asignar manualmente).
   *  - MEDIUM (informativa) si todo el grupo auto-asignó OK.
   *
   * Body localizado es-MX. CTA "/reservation-groups/:id" (route futura
   * C3; hoy puede caer a /channex/conflicts).
   */
  async raiseGroupBookingReceived(args: {
    organizationId: string
    propertyId: string
    groupId: string
    bookingId: string | null
    otaName: string | null
    primaryGuestName: string
    groupSize: number
    roomCount: number
    groupCheckIn: Date
    hasConflicts: boolean
  }): Promise<{ notificationId: string }> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7d

    const ota = args.otaName ?? 'OTA'
    const title = args.hasConflicts
      ? `Grupo de ${args.roomCount} habs requiere asignación — ${ota}`
      : `Grupo de ${args.roomCount} habs recibido — ${ota}`

    // Fecha es-MX corta DD/MM
    const dd = String(args.groupCheckIn.getUTCDate()).padStart(2, '0')
    const mm = String(args.groupCheckIn.getUTCMonth() + 1).padStart(2, '0')
    const body =
      `Grupo de ${args.roomCount} habitaciones — ${args.primaryGuestName} ` +
      `(${args.groupSize} personas) · Llega ${dd}/${mm} · ${ota}` +
      (args.hasConflicts ? ' · Requiere asignación manual.' : '')

    const notif = await this.prisma.appNotification.create({
      data: {
        organizationId: args.organizationId,
        propertyId: args.propertyId,
        type: args.hasConflicts ? 'ACTION_REQUIRED' : 'INFORMATIONAL',
        category: 'SYSTEM',
        priority: args.hasConflicts ? 'HIGH' : 'MEDIUM',
        title,
        body,
        metadata: {
          channexGroupBooking: true,
          groupId: args.groupId,
          bookingId: args.bookingId,
          otaName: args.otaName,
          roomCount: args.roomCount,
          groupSize: args.groupSize,
          hasConflicts: args.hasConflicts,
        } as Prisma.InputJsonValue,
        actionUrl: `/reservation-groups/${args.groupId}`,
        recipientType: 'ROLE',
        recipientRole: 'SUPERVISOR',
        triggeredById: null,
        expiresAt,
      },
      select: { id: true },
    })

    this.sse.emit(args.propertyId, 'notification:new', {
      id: notif.id,
      type: args.hasConflicts ? 'ACTION_REQUIRED' : 'INFORMATIONAL',
      category: 'SYSTEM',
      priority: args.hasConflicts ? 'HIGH' : 'MEDIUM',
      title,
      body,
      metadata: {
        channexGroupBooking: true,
        groupId: args.groupId,
        bookingId: args.bookingId,
      },
      actionUrl: `/reservation-groups/${args.groupId}`,
      createdAt: new Date(),
    })

    void this.firePushToSupervisors(
      args.organizationId,
      args.propertyId,
      title,
      body,
      { groupId: args.groupId, notificationId: notif.id },
    ).catch((err) =>
      this.logger.warn(
        `[Channex notif] group push failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    )

    this.logger.log(
      `[Channex notif] GROUP_BOOKING_RECEIVED notif=${notif.id} group=${args.groupId} ` +
        `rooms=${args.roomCount} conflicts=${args.hasConflicts}`,
    )
    return { notificationId: notif.id }
  }

  static bodyForReason(reason: string, otaName: string | null): string {
    const ota = otaName ?? 'el OTA'
    switch (reason) {
      case 'AVAILABILITY_OVERLAP':
        return `Llegó una reserva de ${ota} para una habitación ya ocupada. Revisa y mueve a otra habitación o cancela.`
      case 'NO_ROOM_TYPE_MATCH':
        return `Reserva de ${ota} con tipo de habitación sin mapear en Zenix. Mapea el room type en Configuración o asigna manual.`
      case 'UNMAPPED_RATE_PLAN':
        return `Reserva de ${ota} con plan tarifario sin mapear. Mapea el rate plan o valida el precio antes de aceptar.`
      case 'MULTI_ROOM_BOOKING':
        return `Reserva de ${ota} con MÚLTIPLES habitaciones (familia/grupo). v1.0.0 procesa solo single-room — crea las habitaciones adicionales manualmente. Soporte completo viene en v1.0.1.`
      case 'PROPERTY_NOT_FOUND':
        return `Reserva llegó para una propiedad desconocida. Verifica el mapping del webhook en Channex.`
      case 'DATE_CHANGE_POST_CHECKIN':
        return `${ota} modificó las fechas de un huésped ya checked-in. Decide si extender la estadía manualmente.`
      case 'DATE_CHANGE_OVERLAPS_OTHER_STAY':
        return `Modificación de fechas de ${ota} choca con otra reserva. Mueve a otra habitación o rechaza el cambio.`
      case 'CANCEL_GUEST_ALREADY_CHECKED_IN':
        return `${ota} canceló una reserva donde el huésped ya hizo check-in. Decide: comp / early-checkout / disputar con OTA.`
      case 'CANCEL_STAY_ALREADY_CHECKED_OUT':
        return `${ota} canceló una reserva post-checkout. Solo registro fiscal — verifica chargeback evidence.`
      case 'CANCEL_STAY_MARKED_NO_SHOW':
        return `${ota} canceló un no-show. El cargo de no-show puede tener que devolverse — revisa política.`
      default:
        return `Conflicto Channex sin clasificar (${reason}). Revisa manualmente.`
    }
  }
}
