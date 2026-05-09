/**
 * Sprint Mx-1 — Maintenance SLA Scheduler
 *
 * Detecta tickets cuyo tiempo de respuesta excede los umbrales hardcoded:
 *   - CRITICAL sin acknowledgment después de 15 min
 *   - HIGH sin acknowledgment después de 60 min
 *
 * Idempotente vía `MaintenanceTicket.slaBreachAt`. Una vez registrado el
 * breach, no se vuelve a notificar (evita spam si el supervisor está fuera de
 * turno o el cron corre múltiples veces).
 *
 * Configurabilidad per-property + escalation chains multi-nivel quedan para
 * Sprint Mx-2. Aquí entregamos el comportamiento mínimo viable que cierra el
 * pain point #2 del estudio de mercado ("no sé si el técnico vio el ticket").
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import {
  AppNotificationCategory,
  AppNotificationPriority,
  AppNotificationType,
  NotificationRecipient,
  TicketLogEvent,
  TicketPriority,
  TicketStatus,
} from '@prisma/client'
import { StaffRole } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationCenterService } from '../notification-center/notification-center.service'
import { NotificationsService } from '../notifications/notifications.service'

const SLA_THRESHOLDS_MIN: Partial<Record<TicketPriority, number>> = {
  [TicketPriority.CRITICAL]: 15,
  [TicketPriority.HIGH]: 60,
}

@Injectable()
export class MaintenanceSlaScheduler {
  private readonly logger = new Logger(MaintenanceSlaScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifCenter: NotificationCenterService,
    private readonly sse: NotificationsService,
  ) {}

  @Cron('*/5 * * * *')
  async sweep() {
    try {
      const now = new Date()
      const candidates = await this.prisma.maintenanceTicket.findMany({
        where: {
          status: TicketStatus.OPEN,
          slaBreachAt: null,
          priority: { in: [TicketPriority.CRITICAL, TicketPriority.HIGH] },
          acknowledgedAt: null,
        },
        select: {
          id: true,
          propertyId: true,
          organizationId: true,
          priority: true,
          createdAt: true,
          title: true,
          roomId: true,
          room: { select: { number: true } },
        },
      })

      let breachCount = 0
      for (const t of candidates) {
        const thresholdMin = SLA_THRESHOLDS_MIN[t.priority as TicketPriority]
        if (!thresholdMin) continue
        const elapsedMin = Math.round((now.getTime() - t.createdAt.getTime()) / 60000)
        if (elapsedMin < thresholdMin) continue

        // Atomic: mark breach + log
        await this.prisma.$transaction(async (tx) => {
          await tx.maintenanceTicket.update({
            where: { id: t.id },
            data: { slaBreachAt: now },
          })
          await tx.maintenanceTicketLog.create({
            data: {
              ticketId: t.id,
              event: TicketLogEvent.SLA_BREACH,
              staffId: null,
              metadata: { elapsedMin, thresholdMin, priority: t.priority },
            },
          })
        })

        const isCritical = t.priority === TicketPriority.CRITICAL
        await this.notifCenter
          .send({
            propertyId: t.propertyId,
            type: AppNotificationType.ACTION_REQUIRED,
            category: AppNotificationCategory.MAINTENANCE_SLA_BREACH,
            priority: isCritical ? AppNotificationPriority.URGENT : AppNotificationPriority.HIGH,
            title: isCritical
              ? `🚨 SLA vencido: ticket CRITICAL sin atender`
              : `⚠️ SLA vencido: ticket HIGH sin atender`,
            body: `"${t.title}"${
              t.room ? ` · Hab. ${t.room.number}` : ''
            } — sin acknowledgment después de ${elapsedMin} min (umbral ${thresholdMin}).`,
            recipientType: NotificationRecipient.ROLE,
            recipientRole: StaffRole.SUPERVISOR,
            metadata: { ticketId: t.id, priority: t.priority, elapsedMin },
            actionUrl: `/maintenance/tickets/${t.id}`,
          })
          .catch((e) => this.logger.warn(`SLA notif failed for ticket ${t.id}: ${e.message}`))

        this.sse.emit(t.propertyId, 'maintenance:ticket:sla-breach' as any, {
          ticketId: t.id,
          priority: t.priority,
          elapsedMin,
          thresholdMin,
        })

        breachCount++
      }

      if (breachCount > 0) {
        this.logger.log(`SLA sweep — ${breachCount} ticket(s) marked as SLA_BREACH`)
      }
    } catch (err: any) {
      this.logger.error(`SLA sweep failed: ${err?.message ?? err}`)
    }
  }
}
