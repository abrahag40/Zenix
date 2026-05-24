import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { NotificationsService } from '../../../notifications/notifications.service'
import { PushService } from '../../../notifications/push.service'

/**
 * ChannexOutboundNotifService — persiste AppNotification cuando un row del
 * outbound queue cae en DEAD_LETTER (5 attempts exhaustos o error terminal
 * 4xx). Mitigación cert AP-2.3: "If Channex returns 429, does your existing
 * retry logic back off, or does it silently drop the update?".
 *
 * Sin esta notif, los precios/disponibilidad podrían quedar desincronizados
 * indefinidamente sin que nadie se entere.
 *
 * Pattern análogo a ChannexNotifService (inbound) — separado por scope
 * (outbound failure ≠ inbound conflict). Mismo category=SYSTEM, type=
 * ACTION_REQUIRED, priority=HIGH para que entre en el bell badge del
 * SUPERVISOR.
 */
@Injectable()
export class ChannexOutboundNotifService {
  private readonly logger = new Logger(ChannexOutboundNotifService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly sse: NotificationsService,
    private readonly push: PushService,
  ) {}

  async raiseDeadLetter(args: {
    organizationId: string
    propertyId: string
    outboundQueueId: string
    kind: 'AVAILABILITY' | 'RATES_RESTRICTIONS' | 'BOOKING_CANCEL'
    attempts: number
    lastError: string
    httpStatus: number | null
  }): Promise<{ notificationId: string }> {
    // Cert audit B2 fix: distinguir data integrity issue de Channex outage.
    // Si lastError menciona null organizationId/property, es un BUG en NUESTRO
    // schema (Property mal seedeado), no un Channex down — priority URGENT
    // + título distinto para que el operador no asuma "Channex está caído".
    const isDataIntegrity = /null organizationId|property=.+not found in Zenix DB/.test(args.lastError)
    const priority = isDataIntegrity ? 'URGENT' : 'HIGH'
    const titlePrefix = isDataIntegrity
      ? '⚠ DATA INTEGRITY — Channex sync impossible'
      : 'Channex sync failed'
    const kindLabel =
      args.kind === 'AVAILABILITY'
        ? 'disponibilidad'
        : args.kind === 'RATES_RESTRICTIONS'
          ? 'tarifas/restricciones'
          : 'cancelación de reserva OTA'
    const title = `${titlePrefix} — ${kindLabel}`
    const body = isDataIntegrity
      ? `Una property tiene null organizationId o falta del DB. Esto es ` +
        `un BUG schema, no Channex down. Contacta ops para revisar ` +
        `multi-tenancy integrity. Error técnico: ${args.lastError.slice(0, 200)}`
      : `Tras ${args.attempts} intentos, Zenix no pudo propagar el cambio a Channex. ` +
        `Verifica /settings/channex y considera disparar full-sync manual. ` +
        `Error: ${args.lastError.slice(0, 200)}`

    const notif = await this.prisma.appNotification.create({
      data: {
        organizationId: args.organizationId,
        propertyId: args.propertyId,
        type: 'ACTION_REQUIRED',
        category: 'SYSTEM',
        priority: priority as 'HIGH' | 'URGENT',
        title,
        body,
        metadata: {
          channexOutboundQueueId: args.outboundQueueId,
          kind: args.kind,
          attempts: args.attempts,
          httpStatus: args.httpStatus,
          lastError: args.lastError,
        } as Prisma.InputJsonValue,
        actionUrl: '/settings/channex',
        recipientType: 'ROLE',
        recipientRole: 'SUPERVISOR',
        triggeredById: null,
        // Compliance permanente — no auto-purge (§101 CLAUDE.md): si un sync
        // falló, el operador debe verlo aunque pasen días.
        expiresAt: null,
      },
      select: { id: true },
    })

    this.sse.emit(args.propertyId, 'notification:new', {
      id: notif.id,
      type: 'ACTION_REQUIRED',
      category: 'SYSTEM',
      priority: 'HIGH',
      title,
      body,
      metadata: { channexOutboundQueueId: args.outboundQueueId, kind: args.kind },
      actionUrl: '/settings/channex',
      createdAt: new Date(),
    })

    // Fix Caso 4 — Expo push para SUPERVISOR mobile (igual que inbound notif).
    void this.firePushToSupervisors(args.organizationId, args.propertyId, title, body, {
      outboundQueueId: args.outboundQueueId,
      notificationId: notif.id,
    }).catch((err) =>
      this.logger.warn(
        `[Channex outbound notif] push failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    )

    this.logger.error(
      `[Channex outbound notif] DEAD_LETTER notif=${notif.id} ` +
        `queue=${args.outboundQueueId} kind=${args.kind} attempts=${args.attempts} ` +
        `status=${args.httpStatus ?? '∅'}`,
    )

    return { notificationId: notif.id }
  }

  private async firePushToSupervisors(
    organizationId: string,
    propertyId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    const supervisors = await this.prisma.staff.findMany({
      where: { organizationId, propertyId, role: 'SUPERVISOR', active: true },
      select: { id: true },
    })
    if (supervisors.length === 0) return
    await this.push.sendToMultipleStaff(
      supervisors.map((s) => s.id),
      title,
      body,
      data,
    )
  }
}
