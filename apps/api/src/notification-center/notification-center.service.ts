import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common'
import {
  AppNotificationType,
  AppNotificationCategory,
  AppNotificationPriority,
  StaffRole,
  NotificationRecipient,
  ApprovalDecision,
} from '@prisma/client'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'

export interface SendNotificationDto {
  propertyId?: string
  type: AppNotificationType
  category: AppNotificationCategory
  priority?: AppNotificationPriority
  title: string
  body: string
  metadata?: Record<string, unknown>
  actionUrl?: string
  recipientType: NotificationRecipient
  recipientId?: string
  recipientRole?: StaffRole
  triggeredById?: string
  expiresAt?: Date
}

@Injectable()
export class NotificationCenterService {
  private readonly logger = new Logger(NotificationCenterService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly sse: NotificationsService,
    private readonly push: PushService,
  ) {}

  async send(dto: SendNotificationDto): Promise<string> {
    const orgId = this.tenant.getOrganizationId()

    // §62 D21 — Si el caller NO setea expiresAt, lo computamos según la
    // tabla canónica de TTLs por categoría. Esto centraliza la regla de
    // retención (antes propenso a olvido en cada caller).
    const expiresAt = dto.expiresAt ?? computeExpiresAt(dto.category, dto.priority ?? 'MEDIUM')

    const notification = await this.prisma.appNotification.create({
      data: {
        organizationId: orgId,
        propertyId:     dto.propertyId ?? null,
        type:           dto.type,
        category:       dto.category,
        priority:       dto.priority ?? 'MEDIUM',
        title:          dto.title,
        body:           dto.body,
        metadata:       dto.metadata !== undefined ? (dto.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        actionUrl:      dto.actionUrl ?? null,
        recipientType:  dto.recipientType,
        recipientId:    dto.recipientId ?? null,
        recipientRole:  dto.recipientRole ?? null,
        triggeredById:  dto.triggeredById ?? null,
        expiresAt,
      },
    })

    // Push real-time via SSE to the property (best-effort — SSE may have no subscribers)
    if (dto.propertyId) {
      this.sse.emit(dto.propertyId, 'notification:new' as any, {
        id:        notification.id,
        type:      notification.type,
        category:  notification.category,
        priority:  notification.priority,
        title:     notification.title,
        body:      notification.body,
        metadata:  notification.metadata,
        actionUrl: notification.actionUrl,
        createdAt: notification.createdAt,
      })
    }

    // M3.2 — OS-level push para alcanzar al usuario cuando la app mobile
    // está backgrounded/cerrada. SSE solo funciona en foreground.
    // Política:
    //   · priority LOW → solo SSE (no spam de push para info no actionable)
    //   · priority MEDIUM/HIGH/URGENT → push a recipient(s)
    //   · best-effort: fire-and-forget; cualquier error de Expo se loguea
    //     pero NO bloquea la transacción del notif.
    if (notification.priority !== 'LOW') {
      void this.sendPush(dto, notification, orgId).catch((err) =>
        this.logger.warn(`[NotifCenter] push fallback failed: ${err.message}`),
      )
    }

    this.logger.log(
      `[NotifCenter] sent category=${dto.category} type=${dto.type} ` +
      `recipient=${dto.recipientType}:${dto.recipientRole ?? dto.recipientId ?? 'all'} ` +
      `triggered_by=${dto.triggeredById ?? 'system'}`,
    )

    return notification.id
  }

  /**
   * M3.2 — Resuelve los recipients (USER/ROLE/PROPERTY_ALL) y dispara push
   * OS-level via Expo Push API. Construye el data payload con deep-link
   * (ticketId/taskId/stayId) para que el mobile listener navegue al detail
   * correcto al tap-ear la notif.
   *
   * Fire-and-forget — los errores se loguean pero NO bloquean la creación
   * del notif (el SSE + AppNotification BD ya son la fuente de verdad).
   */
  private async sendPush(
    dto: SendNotificationDto,
    notification: { id: string; actionUrl: string | null },
    orgId: string,
  ): Promise<void> {
    // Resolver staffIds destinatarios según recipientType
    const staffIds: string[] = []
    if (dto.recipientType === 'USER' && dto.recipientId) {
      staffIds.push(dto.recipientId)
    } else if (dto.recipientType === 'ROLE' && dto.recipientRole && dto.propertyId) {
      const staff = await this.prisma.staff.findMany({
        where: {
          organizationId: orgId,
          propertyId:     dto.propertyId,
          role:           dto.recipientRole,
          active:         true,
        },
        select: { id: true },
      })
      staffIds.push(...staff.map((s) => s.id))
    } else if (dto.recipientType === 'PROPERTY_ALL' && dto.propertyId) {
      const staff = await this.prisma.staff.findMany({
        where: { organizationId: orgId, propertyId: dto.propertyId, active: true },
        select: { id: true },
      })
      staffIds.push(...staff.map((s) => s.id))
    }
    if (staffIds.length === 0) return

    // Parse actionUrl → deep-link payload para el listener mobile.
    // Soporta los 3 formatos que el sistema produce hoy:
    //   /maintenance?ticketId=X         → ticketId=X
    //   /maintenance/tickets/X (legacy) → ticketId=X
    //   /(app)/task/X                   → taskId=X
    //   /reservations/X                 → stayId=X
    const data: Record<string, string> = { notificationId: notification.id }
    if (notification.actionUrl) {
      const m1 = notification.actionUrl.match(/^\/maintenance\?(?:.*&)?ticketId=([^&]+)/)
      const m2 = notification.actionUrl.match(/^\/maintenance\/tickets\/([^/?#]+)/)
      const m3 = notification.actionUrl.match(/^\/\(app\)\/task\/([^/?#]+)/)
      const m4 = notification.actionUrl.match(/^\/reservations\/([^/?#]+)/)
      if (m1 || m2) data.ticketId = (m1 ?? m2)![1]
      else if (m3) data.taskId = m3[1]
      else if (m4) data.stayId = m4[1]
    }

    // sendToMultipleStaff de PushService maneja chunking (Expo límite 100/req)
    // + dedup de tokens inactivos + retries internos.
    await this.push.sendToMultipleStaff(staffIds, dto.title, dto.body, data)
  }

  async listForUser(staffId: string, propertyId: string, limit = 50) {
    const orgId = this.tenant.getOrganizationId()

    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, organizationId: orgId },
      select: { role: true },
    })
    if (!staff) return []

    const now = new Date()

    // Build recipient filter: user-targeted OR role-targeted OR broadcast
    const recipientFilter = [
      { recipientType: 'USER' as NotificationRecipient,         recipientId: staffId },
      { recipientType: 'ROLE' as NotificationRecipient,         recipientRole: staff.role },
      { recipientType: 'PROPERTY_ALL' as NotificationRecipient },
    ]

    const notifications = await this.prisma.appNotification.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        OR: recipientFilter,
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        ],
      },
      include: {
        reads:       { where: { readById: staffId } },
        approvals:   { orderBy: { actionAt: 'desc' }, take: 1 },
        triggeredBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    })

    return notifications.map((n) => ({
      id:          n.id,
      type:        n.type,
      category:    n.category,
      priority:    n.priority,
      title:       n.title,
      body:        n.body,
      metadata:    n.metadata,
      actionUrl:   n.actionUrl,
      createdAt:   n.createdAt,
      isRead:      n.reads.length > 0,
      readAt:      n.reads[0]?.readAt ?? null,
      approval:    n.approvals[0] ?? null,
      triggeredBy: n.triggeredBy?.name ?? null,
    }))
  }

  async markRead(notificationId: string, staffId: string) {
    const orgId = this.tenant.getOrganizationId()
    const notification = await this.prisma.appNotification.findFirst({
      where: { id: notificationId, organizationId: orgId },
    })
    if (!notification) throw new NotFoundException('Notificación no encontrada')

    await this.prisma.appNotificationRead.upsert({
      where:  { notificationId_readById: { notificationId, readById: staffId } },
      create: { notificationId, readById: staffId },
      update: {},
    })
  }

  async markAllRead(staffId: string, propertyId: string) {
    const orgId = this.tenant.getOrganizationId()
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, organizationId: orgId },
      select: { role: true },
    })
    if (!staff) return

    const now = new Date()
    const notifications = await this.prisma.appNotification.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        OR: [
          { recipientType: 'USER' as NotificationRecipient,         recipientId: staffId },
          { recipientType: 'ROLE' as NotificationRecipient,         recipientRole: staff.role },
          { recipientType: 'PROPERTY_ALL' as NotificationRecipient },
        ],
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        ],
        reads: { none: { readById: staffId } },
      },
      select: { id: true },
    })

    if (notifications.length === 0) return

    await this.prisma.appNotificationRead.createMany({
      data:           notifications.map((n) => ({ notificationId: n.id, readById: staffId })),
      skipDuplicates: true,
    })
  }

  async approve(notificationId: string, staffId: string, reason?: string) {
    return this.recordApproval(notificationId, staffId, 'APPROVED', reason)
  }

  async reject(notificationId: string, staffId: string, reason?: string) {
    return this.recordApproval(notificationId, staffId, 'REJECTED', reason)
  }

  private async recordApproval(
    notificationId: string,
    staffId: string,
    action: ApprovalDecision,
    reason?: string,
  ) {
    const orgId = this.tenant.getOrganizationId()
    const notification = await this.prisma.appNotification.findFirst({
      where: { id: notificationId, organizationId: orgId },
    })
    if (!notification) throw new NotFoundException('Notificación no encontrada')
    if (notification.type !== 'APPROVAL_REQUIRED') {
      throw new ForbiddenException('Esta notificación no requiere aprobación')
    }

    const approval = await this.prisma.appNotificationApproval.create({
      data: { notificationId, action, actionById: staffId, reason: reason ?? null },
    })

    this.logger.log(
      `[NotifCenter] approval notif=${notificationId} action=${action} by=${staffId}`,
    )

    return approval
  }

  async getAuditLog(propertyId: string, from: Date, to: Date) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.appNotification.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        createdAt: { gte: from, lte: to },
      },
      include: {
        reads:       { include: { readBy: { select: { name: true, role: true } } } },
        approvals:   { include: { actionBy: { select: { name: true, role: true } } } },
        triggeredBy: { select: { name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async unreadCount(staffId: string, propertyId: string): Promise<number> {
    const orgId = this.tenant.getOrganizationId()
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, organizationId: orgId },
      select: { role: true },
    })
    if (!staff) return 0

    const now = new Date()
    return this.prisma.appNotification.count({
      where: {
        organizationId: orgId,
        propertyId,
        OR: [
          { recipientType: 'USER' as NotificationRecipient,         recipientId: staffId },
          { recipientType: 'ROLE' as NotificationRecipient,         recipientRole: staff.role },
          { recipientType: 'PROPERTY_ALL' as NotificationRecipient },
        ],
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        ],
        reads: { none: { readById: staffId } },
      },
    })
  }
}

// ─── §62 D21 — Tabla canónica de TTLs por categoría ────────────────────────────
//
// Cada categoría tiene una regla de retención visual documentada en CLAUDE.md.
// `null` significa "sin expiración" (compliance + actionable + fiscal).
// Cualquier categoría nueva del backend que no esté en este map → default 7d
// (con warning en log para que se agregue explícitamente).
//
// IMPORTANTE: no modificar las categorías "sin expiración" sin pasar por
// review de compliance (hospitality USALI / Visa Core Rules / CFDI 4.0).
const TTL_HOURS: Partial<Record<AppNotificationCategory, number | null>> = {
  // ── Sin expiración (compliance + actionable + fiscal) ───────────────────
  MAINTENANCE_TICKET_CRITICAL:       null,  // habitación bloqueada — revenue impact
  MAINTENANCE_TICKET_NEEDS_APPROVAL: null,  // actionable — requiere decisión
  MAINTENANCE_SLA_BREACH:            null,  // compliance — registro de incumplimiento
  NO_SHOW:                           null,  // fiscal — chargeback ref 120d (Visa §5.9.2)
  LATE_CHECKOUT_PENDING:             null,  // operativo en curso
  LATE_CHECKOUT_ESCALATED:           null,  // escalación URGENT
  PAYMENT_PENDING:                   null,  // fiscal
  // ── TTL corto (limpieza visual del feed) ────────────────────────────────
  MAINTENANCE_TICKET_VERIFIED:       4,     // cierre — confirmación visual breve
  TASK_VERIFIED_READY:               4,     // §57 — ciclo limpieza cerrado
  MAINTENANCE_TICKET_ASSIGNED:       24,    // acción tomada — recordatorio inicial
  MAINTENANCE_TICKET_QUEUED:         24,    // disponible para técnicos en turno
  CHECKOUT_COMPLETE:                 24,    // confirmación efímera
  TASK_COMPLETED:                    24,    // informativo
  NO_SHOW_REVERTED:                  48,    // aviso reciente
  MAINTENANCE_TICKET_RESOLVED:       48,    // espera verificación supervisor
  // ── TTL medio (operativo del día) ───────────────────────────────────────
  EARLY_CHECKOUT:                    7 * 24,
  MAINTENANCE_TICKET_CREATED:        7 * 24,
  MAINTENANCE_TICKET_UPDATED:        7 * 24,
  MAINTENANCE_REPORTED:              7 * 24,  // legacy Sprint 7D — preferir MAINTENANCE_TICKET_CREATED
  // ── Operativos hasta noShowCutoffHour del día ───────────────────────────
  // Estos NO usan TTL fijo — se setean en el caller (PotentialNoShowScheduler)
  // con expiresAt = corte del día. Si llegan acá sin expiresAt, default 24h.
  ARRIVAL_RISK:                      24,
  CHECKIN_UNCONFIRMED:               24,
  // ── Informativo general ─────────────────────────────────────────────────
  SYSTEM:                            30 * 24,
}

/**
 * computeExpiresAt — §62 D21 canonical TTL resolver.
 *
 * @param category AppNotificationCategory del notif
 * @param priority Si priority es URGENT, se respeta `null` (sin expiración)
 *                 aunque la categoría tenga TTL — el caller probablemente
 *                 quiere persistencia para algo importante.
 * @returns Date futuro o null (sin expiración)
 */
function computeExpiresAt(
  category: AppNotificationCategory,
  priority: AppNotificationPriority,
): Date | null {
  const ttl = TTL_HOURS[category]
  // URGENT siempre persiste — el caller usó URGENT por algo.
  if (priority === 'URGENT') return null
  // null explícito = sin expiración (compliance)
  if (ttl === null) return null
  // undefined = categoría no documentada — default 7 días + warning
  if (ttl === undefined) {
    // eslint-disable-next-line no-console
    console.warn(`[NotifCenter] categoría sin TTL en tabla canónica: ${category} — usando default 7d. Agregar a TTL_HOURS en notification-center.service.ts`)
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }
  return new Date(Date.now() + ttl * 60 * 60 * 1000)
}
