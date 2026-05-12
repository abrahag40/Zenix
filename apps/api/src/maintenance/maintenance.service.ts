import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  Prisma,
  AppNotificationCategory,
  AppNotificationPriority,
  AppNotificationType,
  NotificationRecipient,
  TicketCategory,
  TicketLogEvent,
  TicketPriority,
  TicketStatus,
} from '@prisma/client'
import {
  BlockLogEvent,
  BlockReason,
  BlockSemantic,
  BlockStatus,
  CleaningStatus,
  Department,
  Capability,
  JwtPayload,
  MaintenanceCategory,
  Priority,
  StaffRole,
  TaskType,
} from '@zenix/shared'
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { NotificationsService } from '../notifications/notifications.service'
import { NotificationCenterService } from '../notification-center/notification-center.service'
import { PushService } from '../notifications/push.service'
import { AvailabilityService } from '../pms/availability/availability.service'

import { CreateTicketDto } from './dto/create-ticket.dto'
import { ApproveTicketDto } from './dto/approve-ticket.dto'
import { RejectTicketDto } from './dto/reject-ticket.dto'
import { AssignTicketDto } from './dto/assign-ticket.dto'
import { ResolveTicketDto } from './dto/resolve-ticket.dto'
import { VerifyTicketDto } from './dto/verify-ticket.dto'
import { ReopenTicketDto } from './dto/reopen-ticket.dto'
import { AddCommentDto } from './dto/add-comment.dto'
import { AddPhotoDto } from './dto/add-photo.dto'
import { TicketListQueryDto } from './dto/ticket-list-query.dto'

// ─── Legacy MaintenanceIssue (deprecated, preserved for /tasks/:taskId/issues) ─

/**
 * @deprecated Sprint Mx-1 introduce MaintenanceTicket como reemplazo escalable.
 * Este DTO solo aplica al endpoint legacy `/tasks/:taskId/issues`. Cualquier
 * integración nueva debe usar `CreateTicketDto`.
 */
export class CreateIssueDto {
  @IsEnum(MaintenanceCategory)
  category: MaintenanceCategory

  @IsString()
  @MinLength(5)
  description: string

  @IsOptional()
  @IsString()
  photoUrl?: string
}

// ─── Helpers de transición de estado del ticket ───────────────────────────────

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.ACKNOWLEDGED, TicketStatus.CLOSED], // CLOSED por reject
  [TicketStatus.ACKNOWLEDGED]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.WAITING_PARTS, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.WAITING_PARTS]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.VERIFIED, TicketStatus.IN_PROGRESS], // reopen sin cierre
  [TicketStatus.VERIFIED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS], // reopen
  [TicketStatus.CLOSED]: [TicketStatus.IN_PROGRESS], // reopen
}

function assertTransition(from: TicketStatus, to: TicketStatus) {
  const allowed = VALID_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Transición inválida ${from} → ${to}. Permitidas: ${allowed.join(', ') || '(ninguna)'}`,
    )
  }
}

const TICKET_INCLUDE = {
  room: { select: { id: true, number: true } },
  unit: { select: { id: true, label: true } },
  reportedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  autoBlock: { select: { id: true, status: true } },
} as const

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly sse: NotificationsService,
    private readonly notifCenter: NotificationCenterService,
    private readonly push: PushService,
    private readonly availability: AvailabilityService,
  ) {}

  // ============================================================================
  //  CREATE — flujos A/B/Cola + auto-bloqueo CRITICAL (D-Mx2)
  // ============================================================================

  async createTicket(dto: CreateTicketDto, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()

    // ── Validación XOR-soft: roomId/unitId/assetTag pueden coexistir,
    //     pero al menos uno debe presente para tickets de "ubicación" lógica.
    //     Sin ninguno → ticket genérico (válido — equipo/área general).
    if (!dto.roomId && !dto.unitId && !dto.assetTag && !dto.title) {
      throw new BadRequestException('Debes especificar título, habitación, unidad o asset')
    }

    // ── Validar pertenencia a la organización si hay roomId/unitId
    let propertyId = actor.propertyId
    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, organizationId: orgId },
        include: { room: { select: { id: true, propertyId: true } } },
      })
      if (!unit) throw new NotFoundException('Unidad no encontrada')
      propertyId = unit.room.propertyId
    } else if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, organizationId: orgId },
        select: { propertyId: true },
      })
      if (!room) throw new NotFoundException('Habitación no encontrada')
      propertyId = room.propertyId
    }

    const priority = (dto.priority as TicketPriority) ?? TicketPriority.MEDIUM

    // ── CRITICAL en habitación con huésped activo → ConflictException explícito
    if (priority === TicketPriority.CRITICAL && dto.roomId) {
      const farFuture = new Date('2099-12-31T00:00:00.000Z')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      // Solo bloquear si hay huéspedes activos HOY (no en el futuro).
      // Un huésped futuro con check-in en N días puede coordinarse al
      // momento — el sistema lo notificará cuando intente confirmar la
      // llegada y vea la habitación bloqueada. Usar farFuture aquí sería
      // demasiado estricto (impide CRITICAL para reservas con meses de
      // anticipación incluso si la habitación está libre HOY).
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const avail = await this.availability.check({
        roomId: dto.roomId,
        from: today,
        to: tomorrow,
      })
      const guestConflicts = avail.conflicts.filter(
        (c) => c.source === 'LOCAL_STAY' || c.source === 'LOCAL_SEGMENT',
      )
      if (guestConflicts.length > 0) {
        const names = [...new Set(guestConflicts.map((c) => c.label))].join(', ')
        throw new ConflictException(
          `Hay huéspedes activos en la habitación (${names}). ` +
            `No puedes bloquearla con un ticket crítico ahora — crea el ticket con prioridad alta ` +
            `o coordina la reubicación de los huéspedes primero.`,
        )
      }
    }

    // ── Inferir flujo según el dto:
    //   A) assignedToId → top-down → ACKNOWLEDGED
    //   B) requiresApproval → bottom-up → OPEN + push supervisor
    //   C) sin nada → cola → OPEN sin asignar
    const flowA = !!dto.assignedToId
    const flowB = !flowA && !!dto.requiresApproval
    const flowC = !flowA && !flowB

    // Flujo A: validar que el asignee sea staff de mantenimiento de esta org
    if (flowA) {
      const assignee = await this.prisma.staff.findFirst({
        where: {
          id: dto.assignedToId!,
          organizationId: orgId,
          active: true,
        },
        select: { id: true, department: true, name: true },
      })
      if (!assignee) throw new NotFoundException('Técnico asignado no encontrado')
      if (assignee.department !== Department.MAINTENANCE) {
        throw new BadRequestException(
          'Solo se pueden asignar tickets a staff con department=MAINTENANCE',
        )
      }
    }

    // Flujo B: solo housekeeper/maintenance/receptionist pueden levantar (todos staff válidos)
    // — sin restricción de rol; ya filtramos por organización.

    const initialStatus = flowA ? TicketStatus.ACKNOWLEDGED : TicketStatus.OPEN

    // Calcular estimatedEndAt si se proveyó días estimados (defaults aplican
    // del lado del cliente — el backend respeta lo recibido).
    const estimatedEndAt = dto.estimatedEndDays
      ? new Date(Date.now() + dto.estimatedEndDays * 24 * 60 * 60 * 1000)
      : null

    // ── Transacción atómica: ticket + log inicial + (si CRITICAL+room) auto-block
    const result = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.maintenanceTicket.create({
        data: {
          organizationId: orgId,
          propertyId,
          roomId: dto.roomId ?? null,
          unitId: dto.unitId ?? null,
          assetTag: dto.assetTag ?? null,
          category: dto.category as TicketCategory,
          priority,
          status: initialStatus,
          title: dto.title,
          description: dto.description ?? null,
          guestImpact: dto.guestImpact ?? null,
          reportedById: actor.sub,
          assignedToId: dto.assignedToId ?? null,
          requiresApproval: !!dto.requiresApproval,
          estimatedMinutes: dto.estimatedMinutes ?? null,
          estimatedEndAt,
          sourceTaskId: dto.sourceTaskId ?? null,
          acknowledgedAt: flowA ? new Date() : null,
        },
      })

      await tx.maintenanceTicketLog.create({
        data: {
          ticketId: ticket.id,
          event: TicketLogEvent.CREATED,
          staffId: actor.sub,
          metadata: {
            flow: flowA ? 'TOP_DOWN' : flowB ? 'BOTTOM_UP_APPROVAL' : 'QUEUE',
            priority,
            category: ticket.category,
          },
        },
      })

      if (flowA) {
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId: ticket.id,
            event: TicketLogEvent.ASSIGNED,
            staffId: actor.sub,
            metadata: { toStaffId: dto.assignedToId, mode: 'AT_CREATION' },
          },
        })
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId: ticket.id,
            event: TicketLogEvent.ACKNOWLEDGED,
            staffId: actor.sub,
            metadata: { autoOnCreate: true },
          },
        })
      }

      if (flowC) {
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId: ticket.id,
            event: TicketLogEvent.QUEUED,
            staffId: actor.sub,
            metadata: { reason: 'NO_INITIAL_ASSIGNEE' },
          },
        })
      }

      // ── Mx-1B-W2: adjuntar fotos iniciales subidas vía /v1/uploads
      if (dto.initialPhotoUrls && dto.initialPhotoUrls.length > 0) {
        await tx.maintenanceTicketPhoto.createMany({
          data: dto.initialPhotoUrls.map((url) => ({
            ticketId: ticket.id,
            url,
            uploadedById: actor.sub,
            isAfterPhoto: false, // foto al crear es "antes" por definición
          })),
        })
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId: ticket.id,
            event: TicketLogEvent.PHOTO_ADDED,
            staffId: actor.sub,
            metadata: { count: dto.initialPhotoUrls.length, atCreation: true },
          },
        })
      }

      // ── D-Mx2: CRITICAL en habitación → auto-block dentro de la misma tx
      let blockId: string | null = null
      if (priority === TicketPriority.CRITICAL && dto.roomId) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // endDate del block sincronizado con estimatedEndAt del ticket.
        // Si el técnico cierra antes → liberamos antes (verifyTicket).
        // Si vence sin cierre → notif al supervisor para extender o cerrar.
        // Si no hay estimación → null (indefinido — fallback al pattern viejo
        // sólo como salvaguarda; el wizard ahora siempre captura).
        const block = await tx.roomBlock.create({
          data: {
            organizationId: orgId,
            propertyId,
            roomId: dto.roomId,
            unitId: null,
            semantic: BlockSemantic.OUT_OF_ORDER,
            reason: BlockReason.MAINTENANCE,
            status: BlockStatus.APPROVED, // auto-aprobado por sistema
            requestedById: actor.sub,
            approvedById: actor.sub,
            approvedAt: new Date(),
            startDate: today,
            endDate: estimatedEndAt,
            notes: `Bloqueo automático por ticket de mantenimiento CRITICAL: ${ticket.title}`,
            internalNotes: `Auto-creado por MaintenanceService.createTicket(ticket=${ticket.id})`,
            maintenanceTicketId: ticket.id,
          },
        })

        await tx.blockLog.create({
          data: {
            blockId: block.id,
            staffId: actor.sub,
            event: BlockLogEvent.CREATED,
            note: `Auto-bloqueo por ticket CRITICAL ${ticket.id}`,
            metadata: { source: 'MAINTENANCE_TICKET', ticketId: ticket.id },
          },
        })

        await tx.blockLog.create({
          data: {
            blockId: block.id,
            staffId: null, // sistema
            event: BlockLogEvent.APPROVED,
            note: 'Auto-aprobado (CRITICAL ticket)',
          },
        })

        await tx.maintenanceTicketLog.create({
          data: {
            ticketId: ticket.id,
            event: TicketLogEvent.BLOCK_AUTO_CREATED,
            staffId: null,
            metadata: { roomBlockId: block.id, semantic: BlockSemantic.OUT_OF_ORDER },
          },
        })

        // Nota: Room.status NO se modifica aquí — sigue el patrón de BlocksService
        // (la disponibilidad se calcula combinando RoomBlock activos + GuestStay
        // vía AvailabilityService.check, no leyendo Room.status). El calendario
        // muestra el bloque activo via la relación Room.blocks.
        blockId = block.id
      }

      return { ticket, blockId }
    })

    const fullTicket = await this.prisma.maintenanceTicket.findUnique({
      where: { id: result.ticket.id },
      include: TICKET_INCLUDE,
    })

    // ── Side effects post-tx (fire-and-forget según §29/§31 CLAUDE.md)
    this.sse.emit(propertyId, 'maintenance:ticket:created' as any, this.toListDto(fullTicket!))

    if (result.blockId && dto.roomId) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      // Channex sync (fire-and-forget): cierra disponibilidad SÓLO durante
      // el período estimado. Si no hay estimación, fallback a today+7d para
      // no cerrar OTAs infinitamente (research: feature request más pedido
      // en Mews desde 2019). El supervisor puede extender vía Mx-1B-W2.
      const to = estimatedEndAt ?? new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      this.availability
        .notifyReservation({
          roomId: dto.roomId,
          from: today,
          to,
          reason: 'BLOCK',
          traceId: `maintenance-ticket-${result.ticket.id}`,
        })
        .catch((err) =>
          this.logger.warn(
            `Channex notify failed for ticket ${result.ticket.id}: ${err.message}`,
          ),
        )
      this.sse.emit(propertyId, 'block:created' as any, { id: result.blockId, roomId: dto.roomId })
    }

    // ── Notificaciones según flujo
    if (flowA) {
      void this.notifCenter
        .send({
          propertyId,
          type: AppNotificationType.ACTION_REQUIRED,
          category: AppNotificationCategory.MAINTENANCE_TICKET_ASSIGNED,
          priority:
            priority === TicketPriority.CRITICAL
              ? AppNotificationPriority.URGENT
              : AppNotificationPriority.HIGH,
          title: `🔧 Te asignaron un ticket: ${fullTicket!.title}`,
          body: `Categoría ${fullTicket!.category} · Prioridad ${priority}${
            fullTicket!.room ? ` · Hab. ${fullTicket!.room.number}` : ''
          }`,
          recipientType: NotificationRecipient.USER,
          recipientId: dto.assignedToId,
          triggeredById: actor.sub,
          metadata: { ticketId: result.ticket.id },
          actionUrl: `/maintenance?ticketId=${result.ticket.id}`,
        })
        .catch((e) => this.logger.warn(`notif assigned failed: ${e.message}`))
    }

    if (flowB) {
      void this.notifCenter
        .send({
          propertyId,
          type: AppNotificationType.APPROVAL_REQUIRED,
          category: AppNotificationCategory.MAINTENANCE_TICKET_NEEDS_APPROVAL,
          priority: AppNotificationPriority.HIGH,
          title: `📝 Ticket pendiente de aprobación`,
          body: `${actor.role}: "${fullTicket!.title}"${
            fullTicket!.room ? ` · Hab. ${fullTicket!.room.number}` : ''
          }`,
          recipientType: NotificationRecipient.ROLE,
          recipientRole: StaffRole.SUPERVISOR,
          triggeredById: actor.sub,
          metadata: { ticketId: result.ticket.id },
          actionUrl: `/maintenance?ticketId=${result.ticket.id}`,
        })
        .catch((e) => this.logger.warn(`notif approval failed: ${e.message}`))
    }

    if (flowC) {
      // Si el setting está on, intentar auto-asignación post-tx (fire-and-forget)
      void this.maybeAutoAssign(result.ticket.id, propertyId, orgId)
    }

    if (priority === TicketPriority.CRITICAL) {
      void this.notifCenter
        .send({
          propertyId,
          type: AppNotificationType.ACTION_REQUIRED,
          category: AppNotificationCategory.MAINTENANCE_TICKET_CRITICAL,
          priority: AppNotificationPriority.URGENT,
          title: `🚨 Ticket CRÍTICO: ${fullTicket!.title}`,
          body: fullTicket!.room
            ? `Habitación ${fullTicket!.room.number} fuera de servicio. Auto-bloqueada — Channex notificado.`
            : `Asset/área crítica reportada — atención inmediata.`,
          recipientType: NotificationRecipient.ROLE,
          recipientRole: StaffRole.SUPERVISOR,
          triggeredById: actor.sub,
          metadata: { ticketId: result.ticket.id, roomId: dto.roomId, blockId: result.blockId },
          actionUrl: `/maintenance?ticketId=${result.ticket.id}`,
        })
        .catch((e) => this.logger.warn(`notif critical failed: ${e.message}`))
    }

    return this.toListDto(fullTicket!)
  }

  // ============================================================================
  //  APPROVE / REJECT (Flujo B)
  // ============================================================================

  async approveTicket(ticketId: string, dto: ApproveTicketDto, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo supervisores pueden aprobar tickets')
    }

    const ticket = await this.findOrThrow(ticketId)
    if (!ticket.requiresApproval) {
      throw new BadRequestException('Este ticket no requiere aprobación')
    }
    if (ticket.approvedById) {
      throw new BadRequestException('Este ticket ya fue aprobado')
    }
    if (ticket.status !== TicketStatus.OPEN) {
      throw new BadRequestException(
        'Este ticket ya no requiere aprobación (otro supervisor lo procesó).',
      )
    }

    if (dto.assignedToId) {
      const assignee = await this.prisma.staff.findFirst({
        where: { id: dto.assignedToId, organizationId: ticket.organizationId, active: true },
        select: { id: true, department: true },
      })
      if (!assignee) throw new NotFoundException('Técnico asignado no encontrado')
      if (assignee.department !== Department.MAINTENANCE) {
        throw new BadRequestException('Solo staff de mantenimiento puede tomar tickets')
      }
    }

    const now = new Date()
    // Testing T-approve-flow: si el supervisor aprueba SIN asignar a alguien
    // específico, el ticket debe quedar en la COLA (estado OPEN) para que
    // cualquier técnico lo tome — no en ACKNOWLEDGED sin dueño (caso anterior
    // donde el ticket "desaparecía" del Hub mobile).
    //
    // Reglas semánticas:
    //   · OPEN + pendingApproval=false + sin asignar → "En cola" (queue)
    //   · ACKNOWLEDGED + assignedToId → "Recibido por X"
    //   · IN_PROGRESS + assignedToId → "En progreso"
    const finalAssignee = dto.assignedToId ?? ticket.assignedToId
    const hasAssignee = !!finalAssignee
    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          approvedById: actor.sub,
          approvedAt: now,
          assignedToId: finalAssignee,
          // Si hay asignado → ACKNOWLEDGED; si no → OPEN (queue)
          status: hasAssignee ? TicketStatus.ACKNOWLEDGED : TicketStatus.OPEN,
          acknowledgedAt: hasAssignee ? now : null,
        },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.APPROVED,
          staffId: actor.sub,
          metadata: {
            assignedToId: dto.assignedToId,
            comment: dto.comment,
            queued: !hasAssignee,
          },
        },
      })
      if (!hasAssignee) {
        // El ticket entra a la cola → log explícito para audit
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId,
            event: TicketLogEvent.QUEUED,
            staffId: actor.sub,
            metadata: { reason: 'APPROVED_WITHOUT_ASSIGNEE' },
          },
        })
      }
      if (hasAssignee && dto.assignedToId) {
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId,
            event: TicketLogEvent.ASSIGNED,
            staffId: actor.sub,
            metadata: { toStaffId: dto.assignedToId, mode: 'ON_APPROVAL' },
          },
        })
      }
    })

    const updated = await this.findOrThrow(ticketId)
    this.sse.emit(updated.propertyId, 'maintenance:ticket:approved' as any, this.toListDto(updated))

    if (dto.assignedToId) {
      void this.notifCenter
        .send({
          propertyId: updated.propertyId,
          type: AppNotificationType.ACTION_REQUIRED,
          category: AppNotificationCategory.MAINTENANCE_TICKET_ASSIGNED,
          priority: AppNotificationPriority.HIGH,
          title: `✅ Ticket aprobado y asignado: ${updated.title}`,
          body: `Categoría ${updated.category}${
            updated.room ? ` · Hab. ${updated.room.number}` : ''
          }`,
          recipientType: NotificationRecipient.USER,
          recipientId: dto.assignedToId,
          triggeredById: actor.sub,
          metadata: { ticketId },
          actionUrl: `/maintenance?ticketId=${ticketId}`,
        })
        .catch((e) => this.logger.warn(`notif assigned-on-approve failed: ${e.message}`))
    }

    // Notificar al reportador que su ticket fue aprobado
    void this.notifCenter
      .send({
        propertyId: updated.propertyId,
        type: AppNotificationType.INFORMATIONAL,
        category: AppNotificationCategory.MAINTENANCE_TICKET_UPDATED,
        priority: AppNotificationPriority.LOW,
        title: `✅ Tu reporte fue aprobado`,
        body: `"${updated.title}" — ${dto.assignedToId ? 'asignado a un técnico' : 'pendiente de asignar'}`,
        recipientType: NotificationRecipient.USER,
        recipientId: updated.reportedById,
        triggeredById: actor.sub,
        metadata: { ticketId },
      })
      .catch((e) => this.logger.warn(`notif reporter approved failed: ${e.message}`))

    return this.toListDto(updated)
  }

  async rejectTicket(ticketId: string, dto: RejectTicketDto, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo supervisores pueden rechazar tickets')
    }
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('Razón de rechazo es obligatoria (min 5 caracteres)')
    }

    const ticket = await this.findOrThrow(ticketId)
    if (!ticket.requiresApproval) {
      throw new BadRequestException(
        'Solo se pueden rechazar tickets reportados que aún esperan aprobación.',
      )
    }
    if (ticket.status !== TicketStatus.OPEN) {
      throw new BadRequestException(
        'Este ticket ya no se puede rechazar (otro supervisor lo procesó).',
      )
    }

    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.CLOSED,
          rejectedReason: dto.reason,
          approvedById: actor.sub, // registramos quién decidió (rechazo)
          approvedAt: now,
          closedAt: now,
        },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.REJECTED,
          staffId: actor.sub,
          metadata: { reason: dto.reason },
        },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.CLOSED,
          staffId: actor.sub,
          metadata: { byRejection: true },
        },
      })
    })

    const updated = await this.findOrThrow(ticketId)
    this.sse.emit(updated.propertyId, 'maintenance:ticket:rejected' as any, this.toListDto(updated))

    void this.notifCenter
      .send({
        propertyId: updated.propertyId,
        type: AppNotificationType.INFORMATIONAL,
        category: AppNotificationCategory.MAINTENANCE_TICKET_UPDATED,
        priority: AppNotificationPriority.MEDIUM,
        title: `❌ Tu reporte fue rechazado`,
        body: `"${updated.title}" — Motivo: ${dto.reason}`,
        recipientType: NotificationRecipient.USER,
        recipientId: updated.reportedById,
        triggeredById: actor.sub,
        metadata: { ticketId, reason: dto.reason },
      })
      .catch((e) => this.logger.warn(`notif reporter rejected failed: ${e.message}`))

    return this.toListDto(updated)
  }

  // ============================================================================
  //  CLAIM (voluntary pickup desde la cola)
  // ============================================================================

  async claimTicket(ticketId: string, actor: JwtPayload) {
    if (actor.department !== Department.MAINTENANCE && actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo staff de mantenimiento puede tomar tickets')
    }

    const ticket = await this.findOrThrow(ticketId)
    if (ticket.assignedToId) {
      throw new ConflictException(
        `Este ticket ya tiene asignado a ${ticket.assignedTo?.name ?? 'otro técnico'}.`,
      )
    }
    if (ticket.status !== TicketStatus.OPEN) {
      throw new BadRequestException(
        'Este ticket ya no está disponible para tomar — alguien lo procesó antes.',
      )
    }
    if (ticket.requiresApproval && !ticket.approvedById) {
      throw new BadRequestException('Este ticket requiere aprobación del supervisor antes de tomarse')
    }

    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          assignedToId: actor.sub,
          status: TicketStatus.ACKNOWLEDGED,
          acknowledgedAt: now,
        },
      })
      await tx.maintenanceTicketLog.create({
        data: { ticketId, event: TicketLogEvent.CLAIMED, staffId: actor.sub },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.ACKNOWLEDGED,
          staffId: actor.sub,
          metadata: { onClaim: true },
        },
      })
    })

    const updated = await this.findOrThrow(ticketId)
    this.sse.emit(updated.propertyId, 'maintenance:ticket:claimed' as any, this.toListDto(updated))
    return this.toListDto(updated)
  }

  // ============================================================================
  //  ASSIGN manual (supervisor)
  // ============================================================================

  async assignTicket(ticketId: string, dto: AssignTicketDto, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo supervisores pueden asignar manualmente')
    }
    const ticket = await this.findOrThrow(ticketId)
    if (([TicketStatus.CLOSED, TicketStatus.VERIFIED] as TicketStatus[]).includes(ticket.status)) {
      throw new BadRequestException(
        ticket.status === TicketStatus.CLOSED
          ? 'No se puede reasignar un ticket archivado.'
          : 'No se puede reasignar un ticket ya verificado. Reábrelo primero si es necesario.',
      )
    }
    const assignee = await this.prisma.staff.findFirst({
      where: { id: dto.assigneeId, organizationId: ticket.organizationId, active: true },
      select: { id: true, department: true, name: true },
    })
    if (!assignee) throw new NotFoundException('Técnico no encontrado')
    if (assignee.department !== Department.MAINTENANCE) {
      throw new BadRequestException('Solo staff de mantenimiento puede tomar tickets')
    }

    const wasUnassigned = !ticket.assignedToId
    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          assignedToId: dto.assigneeId,
          status: wasUnassigned ? TicketStatus.ACKNOWLEDGED : ticket.status,
          acknowledgedAt: ticket.acknowledgedAt ?? new Date(),
        },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.ASSIGNED,
          staffId: actor.sub,
          metadata: {
            fromStaffId: ticket.assignedToId,
            toStaffId: dto.assigneeId,
            mode: 'MANUAL',
          },
        },
      })
    })

    const updated = await this.findOrThrow(ticketId)
    this.sse.emit(updated.propertyId, 'maintenance:ticket:assigned' as any, this.toListDto(updated))

    void this.notifCenter
      .send({
        propertyId: updated.propertyId,
        type: AppNotificationType.ACTION_REQUIRED,
        category: AppNotificationCategory.MAINTENANCE_TICKET_ASSIGNED,
        priority: AppNotificationPriority.HIGH,
        title: `🔧 Te asignaron: ${updated.title}`,
        body: `Categoría ${updated.category}${
          updated.room ? ` · Hab. ${updated.room.number}` : ''
        }`,
        recipientType: NotificationRecipient.USER,
        recipientId: dto.assigneeId,
        triggeredById: actor.sub,
        metadata: { ticketId },
        actionUrl: `/maintenance?ticketId=${ticketId}`,
      })
      .catch((e) => this.logger.warn(`notif assign failed: ${e.message}`))

    return this.toListDto(updated)
  }

  // ============================================================================
  //  AUTO-ASSIGN (cola — load balancing por count)
  // ============================================================================

  /**
   * Internal: invoked post-creation when ticket entered the queue and the
   * property has `maintenanceAutoAssignEnabled = true`. Picks the maintenance
   * staff with the lowest active workload. No-op if no eligible staff.
   */
  async maybeAutoAssign(ticketId: string, propertyId: string, organizationId: string) {
    try {
      const settings = await this.prisma.propertySettings.findUnique({
        where: { propertyId },
        select: { maintenanceAutoAssignEnabled: true },
      })
      if (!settings?.maintenanceAutoAssignEnabled) return

      const ticket = await this.prisma.maintenanceTicket.findUnique({
        where: { id: ticketId },
        select: { id: true, status: true, assignedToId: true, propertyId: true },
      })
      if (!ticket || ticket.assignedToId || ticket.status !== TicketStatus.OPEN) return

      // Candidatos: staff activo de mantenimiento de la propiedad.
      // Optimización futura: cruzar con AvailabilityQueryService.getOnShiftStaff.
      // Por simplicidad en Mx-1, tomamos todos los activos.
      const staffList = await this.prisma.staff.findMany({
        where: {
          organizationId,
          propertyId,
          active: true,
          department: Department.MAINTENANCE,
        },
        select: { id: true, name: true },
      })

      // Carga actual por staff (count de tickets activos)
      const candidates = await Promise.all(
        staffList.map(async (s) => ({
          id: s.id,
          name: s.name,
          activeCount: await this.prisma.maintenanceTicket.count({
            where: {
              assignedToId: s.id,
              status: {
                in: [
                  TicketStatus.ACKNOWLEDGED,
                  TicketStatus.IN_PROGRESS,
                  TicketStatus.WAITING_PARTS,
                ],
              },
            },
          }),
        })),
      )

      if (candidates.length === 0) {
        // Sin staff disponible — notificar supervisor para que asigne manual
        void this.notifCenter
          .send({
            propertyId,
            type: AppNotificationType.ACTION_REQUIRED,
            category: AppNotificationCategory.MAINTENANCE_TICKET_QUEUED,
            priority: AppNotificationPriority.HIGH,
            title: `📥 Ticket sin asignar (no hay técnicos en turno)`,
            body: `Asigna manualmente desde la cola.`,
            recipientType: NotificationRecipient.ROLE,
            recipientRole: StaffRole.SUPERVISOR,
            metadata: { ticketId },
            actionUrl: `/maintenance/queue`,
          })
          .catch(() => undefined)
        return
      }

      // Sort ASC por carga actual; tiebreak por nombre para determinismo
      candidates.sort((a, b) => a.activeCount - b.activeCount || a.name.localeCompare(b.name))
      const winner = candidates[0]

      const now = new Date()
      await this.prisma.$transaction(async (tx) => {
        await tx.maintenanceTicket.update({
          where: { id: ticketId },
          data: {
            assignedToId: winner.id,
            status: TicketStatus.ACKNOWLEDGED,
            acknowledgedAt: now,
          },
        })
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId,
            event: TicketLogEvent.AUTO_ASSIGNED,
            staffId: null,
            metadata: { toStaffId: winner.id, rule: 'LOAD_BALANCED', activeCount: winner.activeCount },
          },
        })
      })

      const updated = await this.findOrThrow(ticketId)
      this.sse.emit(propertyId, 'maintenance:ticket:auto-assigned' as any, this.toListDto(updated))
      void this.notifCenter
        .send({
          propertyId,
          type: AppNotificationType.ACTION_REQUIRED,
          category: AppNotificationCategory.MAINTENANCE_TICKET_ASSIGNED,
          priority: AppNotificationPriority.HIGH,
          title: `🔧 Te asignaron (auto): ${updated.title}`,
          body: `Carga balanceada — ${winner.activeCount} tickets activos`,
          recipientType: NotificationRecipient.USER,
          recipientId: winner.id,
          metadata: { ticketId },
          actionUrl: `/maintenance?ticketId=${ticketId}`,
        })
        .catch(() => undefined)
    } catch (err: any) {
      this.logger.warn(`autoAssign failed for ticket ${ticketId}: ${err.message}`)
    }
  }

  // ============================================================================
  //  STATE MACHINE — start, requestParts, resume, resolve, verify, close, reopen
  // ============================================================================

  async startTicket(ticketId: string, actor: JwtPayload) {
    const ticket = await this.findOrThrow(ticketId)
    this.assertActor(ticket, actor, ['assignee'])
    assertTransition(ticket.status, TicketStatus.IN_PROGRESS)
    return this.transitionStatus(ticket, TicketStatus.IN_PROGRESS, actor, TicketLogEvent.STARTED, {
      startedAt: new Date(),
    })
  }

  async requestParts(ticketId: string, note: string | undefined, actor: JwtPayload) {
    const ticket = await this.findOrThrow(ticketId)
    this.assertActor(ticket, actor, ['assignee'])
    assertTransition(ticket.status, TicketStatus.WAITING_PARTS)
    return this.transitionStatus(
      ticket,
      TicketStatus.WAITING_PARTS,
      actor,
      TicketLogEvent.WAITING_PARTS,
      { waitingPartsAt: new Date() },
      { note },
    )
  }

  async resumeTicket(ticketId: string, actor: JwtPayload) {
    const ticket = await this.findOrThrow(ticketId)
    this.assertActor(ticket, actor, ['assignee'])
    assertTransition(ticket.status, TicketStatus.IN_PROGRESS)
    return this.transitionStatus(ticket, TicketStatus.IN_PROGRESS, actor, TicketLogEvent.STARTED, {})
  }

  async resolveTicket(ticketId: string, dto: ResolveTicketDto, actor: JwtPayload) {
    const ticket = await this.findOrThrow(ticketId)
    this.assertActor(ticket, actor, ['assignee'])
    assertTransition(ticket.status, TicketStatus.RESOLVED)

    const now = new Date()
    const actualMinutes = ticket.startedAt
      ? Math.round((now.getTime() - new Date(ticket.startedAt).getTime()) / 60000)
      : null

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.RESOLVED,
          resolvedAt: now,
          resolvedById: actor.sub,
          actualMinutes,
        },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.RESOLVED,
          staffId: actor.sub,
          metadata: {
            resolutionSummary: dto.resolutionSummary,
            actualMinutes,
          },
        },
      })
      if (dto.afterPhotoUrl) {
        const photo = await tx.maintenanceTicketPhoto.create({
          data: {
            ticketId,
            url: dto.afterPhotoUrl,
            caption: 'Foto después',
            isAfterPhoto: true,
            uploadedById: actor.sub,
          },
        })
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId,
            event: TicketLogEvent.PHOTO_ADDED,
            staffId: actor.sub,
            metadata: { photoId: photo.id, isAfterPhoto: true },
          },
        })
      }
    })

    const updated = await this.findOrThrow(ticketId)
    this.sse.emit(updated.propertyId, 'maintenance:ticket:resolved' as any, this.toListDto(updated))

    // Notificar al supervisor para verificación
    void this.notifCenter
      .send({
        propertyId: updated.propertyId,
        type: AppNotificationType.ACTION_REQUIRED,
        category: AppNotificationCategory.MAINTENANCE_TICKET_RESOLVED,
        priority: AppNotificationPriority.MEDIUM,
        title: `✅ Ticket resuelto — verificar calidad`,
        body: `"${updated.title}" listo para verificación${
          updated.room ? ` · Hab. ${updated.room.number}` : ''
        }`,
        recipientType: NotificationRecipient.ROLE,
        recipientRole: StaffRole.SUPERVISOR,
        triggeredById: actor.sub,
        metadata: { ticketId },
        actionUrl: `/maintenance?ticketId=${ticketId}`,
      })
      .catch(() => undefined)

    return this.toListDto(updated)
  }

  async verifyTicket(ticketId: string, dto: VerifyTicketDto, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo supervisores pueden verificar tickets')
    }
    const ticket = await this.findOrThrow(ticketId)

    // Si el supervisor rechaza la calidad → reabrir a IN_PROGRESS
    if (dto.approved === false) {
      if (!dto.rejectionReason || dto.rejectionReason.trim().length < 5) {
        throw new BadRequestException('Razón de rechazo de calidad obligatoria')
      }
      assertTransition(ticket.status, TicketStatus.IN_PROGRESS)
      return this.transitionStatus(
        ticket,
        TicketStatus.IN_PROGRESS,
        actor,
        TicketLogEvent.REOPENED,
        { resolvedAt: null, resolvedById: null },
        { reason: dto.rejectionReason, byVerifyRejection: true },
      )
    }

    // Aprobar verificación: VERIFIED + liberar bloque (si había) + crear post-clean
    assertTransition(ticket.status, TicketStatus.VERIFIED)
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.VERIFIED,
          verifiedAt: now,
          verifiedById: actor.sub,
        },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.VERIFIED,
          staffId: actor.sub,
          metadata: { note: dto.note },
        },
      })

      // ── D-Mx3: Liberación del bloque automático
      let releasedBlockId: string | null = null
      if (ticket.autoBlock?.id) {
        await tx.roomBlock.update({
          where: { id: ticket.autoBlock.id },
          data: {
            status: BlockStatus.CANCELLED,
          },
        })
        await tx.blockLog.create({
          data: {
            blockId: ticket.autoBlock.id,
            staffId: actor.sub,
            event: BlockLogEvent.CANCELLED,
            note: `Liberación automática por VERIFIED del ticket ${ticketId}`,
          },
        })
        await tx.maintenanceTicketLog.create({
          data: {
            ticketId,
            event: TicketLogEvent.BLOCK_AUTO_RELEASED,
            staffId: actor.sub,
            metadata: { roomBlockId: ticket.autoBlock.id },
          },
        })
        // Nota: Room.status NO se modifica aquí (mismo razonamiento que en createTicket).
        releasedBlockId = ticket.autoBlock.id
      }

      // ── Crear CleaningTask post-mantenimiento (MAINTENANCE_FOLLOWUP) si era de habitación.
      // El cleaning followup garantiza que después de una reparación, housekeeping
      // pase a sanitizar antes de devolver a venta. CleaningTask requiere unitId
      // (decisión histórica del módulo HK §schema). Si no hay unitId obvio, lo
      // resolvemos eligiendo cualquier unidad de la habitación.
      let followupTaskId: string | null = null
      if (ticket.roomId) {
        const unitForFollowup = ticket.unitId
          ? { id: ticket.unitId }
          : await tx.unit.findFirst({
              where: { roomId: ticket.roomId },
              select: { id: true },
            })

        if (unitForFollowup) {
          const task = await tx.cleaningTask.create({
            data: {
              organizationId: ticket.organizationId,
              unitId: unitForFollowup.id,
              checkoutId: null,
              taskType: TaskType.MAINTENANCE,
              status: CleaningStatus.READY,
              priority: Priority.HIGH,
              requiredCapability: Capability.SANITIZATION,
              hasSameDayCheckIn: false,
            },
          })
          followupTaskId = task.id
          await tx.maintenanceTicketLog.create({
            data: {
              ticketId,
              event: TicketLogEvent.COMMENT_ADDED,
              staffId: null,
              metadata: { autoCreatedCleaningTaskId: task.id, kind: 'POST_MAINTENANCE_FOLLOWUP' },
            },
          })
        }
      }

      return { releasedBlockId, followupTaskId }
    })

    const updated = await this.findOrThrow(ticketId)
    this.sse.emit(updated.propertyId, 'maintenance:ticket:verified' as any, this.toListDto(updated))

    if (result.releasedBlockId && updated.roomId) {
      this.sse.emit(updated.propertyId, 'block:cancelled' as any, {
        id: result.releasedBlockId,
        roomId: updated.roomId,
      })
      // Reabrir disponibilidad en Channex
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      this.availability
        .notifyRelease({
          roomId: updated.roomId,
          from: today,
          to: new Date('2099-12-31T00:00:00.000Z'),
          reason: 'RELEASE',
          traceId: `maintenance-verify-${ticketId}`,
        })
        .catch(() => undefined)
    }

    if (result.followupTaskId) {
      this.sse.emit(updated.propertyId, 'task:planned' as any, {
        taskId: result.followupTaskId,
        kind: 'MAINTENANCE_FOLLOWUP',
      })
    }

    // Notificar al técnico que su trabajo fue verificado (refuerzo gamificación SDT competencia)
    if (updated.assignedToId) {
      void this.notifCenter
        .send({
          propertyId: updated.propertyId,
          type: AppNotificationType.INFORMATIONAL,
          category: AppNotificationCategory.MAINTENANCE_TICKET_VERIFIED,
          priority: AppNotificationPriority.LOW,
          title: `✓ Tu trabajo fue verificado`,
          body: `"${updated.title}" — verificado por el supervisor`,
          recipientType: NotificationRecipient.USER,
          recipientId: updated.assignedToId,
          triggeredById: actor.sub,
          metadata: { ticketId },
        })
        .catch(() => undefined)
    }

    // Bug B7 fix — notificar al housekeeper/reporter original cuando su
    // reporte se cierra el círculo. Antes solo el técnico se enteraba del
    // verify, y el reporter (housekeeper que detectó el problema) nunca
    // sabía si lo arreglaron — exactamente la queja documentada en foros de
    // hotelkit/Flexkeeping LATAM. Cumple §33 CLAUDE.md (feedback informativo
    // end-to-end). No-op si el reporter es el mismo que el assignee (el
    // técnico ya recibió la notif anterior).
    if (updated.reportedById && updated.reportedById !== updated.assignedToId) {
      void this.notifCenter
        .send({
          propertyId: updated.propertyId,
          type: AppNotificationType.INFORMATIONAL,
          category: AppNotificationCategory.MAINTENANCE_TICKET_VERIFIED,
          priority: AppNotificationPriority.LOW,
          title: `✓ Tu reporte fue resuelto`,
          body: `"${updated.title}" — ya está verificado y la habitación regresó al inventario.`,
          recipientType: NotificationRecipient.USER,
          recipientId: updated.reportedById,
          triggeredById: actor.sub,
          metadata: { ticketId },
        })
        .catch(() => undefined)
    }

    return this.toListDto(updated)
  }

  async closeTicket(ticketId: string, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo supervisores pueden cerrar tickets')
    }
    const ticket = await this.findOrThrow(ticketId)
    assertTransition(ticket.status, TicketStatus.CLOSED)
    return this.transitionStatus(ticket, TicketStatus.CLOSED, actor, TicketLogEvent.CLOSED, {
      closedAt: new Date(),
    })
  }

  async reopenTicket(ticketId: string, dto: ReopenTicketDto, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo supervisores pueden reabrir tickets')
    }
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('Razón de reapertura obligatoria')
    }
    const ticket = await this.findOrThrow(ticketId)
    assertTransition(ticket.status, TicketStatus.IN_PROGRESS)

    // Si era CRITICAL en habitación y la habitación ya está vendida → conflicto
    if (ticket.priority === TicketPriority.CRITICAL && ticket.roomId) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const farFuture = new Date('2099-12-31T00:00:00.000Z')
      const avail = await this.availability.check({
        roomId: ticket.roomId,
        from: today,
        to: farFuture,
      })
      const guestConflicts = avail.conflicts.filter(
        (c) => c.source === 'LOCAL_STAY' || c.source === 'LOCAL_SEGMENT',
      )
      if (guestConflicts.length > 0) {
        const names = [...new Set(guestConflicts.map((c) => c.label))].join(', ')
        throw new ConflictException(
          `No puedes reabrir un ticket CRITICAL: la habitación ya tiene huéspedes (${names}). ` +
            `Reabre con priority HIGH o coordina la reubicación.`,
        )
      }
    }

    return this.transitionStatus(
      ticket,
      TicketStatus.IN_PROGRESS,
      actor,
      TicketLogEvent.REOPENED,
      { closedAt: null, verifiedAt: null, verifiedById: null },
      { reason: dto.reason },
    )
  }

  // ============================================================================
  //  COMENTARIOS y FOTOS
  // ============================================================================

  async addComment(ticketId: string, dto: AddCommentDto, actor: JwtPayload) {
    const ticket = await this.findOrThrow(ticketId)
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('No se puede comentar en un ticket cerrado')
    }
    const comment = await this.prisma.maintenanceTicketComment.create({
      data: { ticketId, authorId: actor.sub, content: dto.content },
      include: { author: { select: { id: true, name: true } } },
    })
    await this.prisma.maintenanceTicketLog.create({
      data: {
        ticketId,
        event: TicketLogEvent.COMMENT_ADDED,
        staffId: actor.sub,
        metadata: { commentId: comment.id, length: dto.content.length },
      },
    })
    this.sse.emit(ticket.propertyId, 'maintenance:ticket:commented' as any, {
      ticketId,
      commentId: comment.id,
    })
    return comment
  }

  async addPhoto(ticketId: string, dto: AddPhotoDto, actor: JwtPayload) {
    const ticket = await this.findOrThrow(ticketId)
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('No se pueden añadir fotos a un ticket cerrado')
    }

    // Sprint Mx-1B-W2 audit — W2-03 hard limit 3 fotos.
    //
    // Investigación que sustenta el límite:
    //  · Cognitive Load Theory (Sweller 1988) — working memory 7±2
    //  · Forensic Photography Standards (ASTM E2825): "three-shot rule" =
    //    overview + midrange + close-up (mínimo evidencia legal)
    //  · FEMA / Insurance adjuster standards: 3 shots por damage point
    //  · Quore CMMS best-practice guide: 3-5 fotos por work order
    //  · MaintainX 2023 survey: mediana = 2 fotos
    //  · Twitter max 4, Instagram Stories típico 1-3
    //
    // Soft-deleted photos NO cuentan al límite (la cuenta es de evidencia
    // viva). El supervisor que necesita >3 puede borrar viejas y subir nuevas.
    const activeCount = await this.prisma.maintenanceTicketPhoto.count({
      where: { ticketId, deletedAt: null },
    })
    if (activeCount >= 3) {
      throw new BadRequestException(
        'Máximo 3 fotos por ticket. Elimina una existente para subir otra.',
      )
    }

    const photo = await this.prisma.maintenanceTicketPhoto.create({
      data: {
        ticketId,
        url: dto.url,
        caption: dto.caption ?? null,
        isAfterPhoto: !!dto.isAfterPhoto,
        uploadedById: actor.sub,
      },
    })
    await this.prisma.maintenanceTicketLog.create({
      data: {
        ticketId,
        event: TicketLogEvent.PHOTO_ADDED,
        staffId: actor.sub,
        metadata: { photoId: photo.id, isAfterPhoto: !!dto.isAfterPhoto },
      },
    })
    this.sse.emit(ticket.propertyId, 'maintenance:ticket:photo-added' as any, {
      ticketId,
      photoId: photo.id,
    })
    return photo
  }

  /**
   * Soft-delete de foto (Sprint Mx-1B-W2 — W2-04 fix).
   *
   * Patrón de privacidad alineado con plataformas grandes:
   *  · Instagram — "Recently Deleted" 30d antes de hard delete
   *  · Twitter Engineering 2019 — 30d soft-delete window
   *  · GDPR Art. 17 (right to erasure) — el archivo binario aún existe
   *    en disco hasta el cron Mx-1C que limpia >30d. Para hard-delete
   *    inmediato por compliance, supervisor edita en BD (admin path).
   *
   * Permisos: SUPERVISOR o el uploader original. Otro técnico NO puede
   * borrar fotos ajenas (anti-vandalismo entre pares).
   */
  async deletePhoto(ticketId: string, photoId: string, actor: JwtPayload) {
    const photo = await this.prisma.maintenanceTicketPhoto.findFirst({
      where: { id: photoId, ticketId, deletedAt: null },
      include: { ticket: { select: { propertyId: true, status: true } } },
    })
    if (!photo) {
      throw new NotFoundException('Foto no encontrada (o ya eliminada)')
    }
    if (photo.ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException(
        'No se pueden eliminar fotos de un ticket cerrado (preservación de audit trail)',
      )
    }
    const isOwner = photo.uploadedById === actor.sub
    const isSupervisor = actor.role === StaffRole.SUPERVISOR
    if (!isOwner && !isSupervisor) {
      throw new ForbiddenException(
        'Solo el supervisor o quien subió la foto pueden eliminarla',
      )
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceTicketPhoto.update({
        where: { id: photoId },
        data: { deletedAt: new Date(), deletedById: actor.sub },
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId,
          event: TicketLogEvent.PHOTO_DELETED,
          staffId: actor.sub,
          metadata: {
            photoId,
            wasAfterPhoto: photo.isAfterPhoto,
            byOwner: isOwner,
            bySupervisor: isSupervisor,
          },
        },
      })
    })

    this.sse.emit(photo.ticket.propertyId, 'maintenance:ticket:photo-deleted' as any, {
      ticketId,
      photoId,
    })
    return { ok: true }
  }

  // ============================================================================
  //  QUERIES
  // ============================================================================

  async findByProperty(query: TicketListQueryDto, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const where: Prisma.MaintenanceTicketWhereInput = {
      organizationId: orgId,
      propertyId: actor.propertyId,
    }
    if (query.status) {
      where.status = Array.isArray(query.status)
        ? { in: query.status as TicketStatus[] }
        : (query.status as TicketStatus)
    }
    if (query.priority) {
      where.priority = Array.isArray(query.priority)
        ? { in: query.priority as TicketPriority[] }
        : (query.priority as TicketPriority)
    }
    if (query.category) {
      where.category = Array.isArray(query.category)
        ? { in: query.category as TicketCategory[] }
        : (query.category as TicketCategory)
    }
    if (query.assignedToId) where.assignedToId = query.assignedToId
    if (query.roomId) where.roomId = query.roomId
    if (query.assetTag) where.assetTag = query.assetTag
    if (query.queueOnly) where.assignedToId = null
    if (query.pendingApprovalOnly) {
      where.requiresApproval = true
      where.approvedById = null
      where.status = TicketStatus.OPEN
    }
    if (query.activeOnly !== false) {
      where.status = where.status ?? { notIn: [TicketStatus.CLOSED] }
    }
    const fromDate = query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined
    const toDate = query.toDate ? new Date(`${query.toDate}T23:59:59.999Z`) : undefined
    if (fromDate || toDate) {
      where.createdAt = { gte: fromDate, lte: toDate }
    }

    const tickets = await this.prisma.maintenanceTicket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    })
    return tickets.map((t) => this.toListDto(t))
  }

  async findOne(ticketId: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id: ticketId },
      include: {
        ...TICKET_INCLUDE,
        photos: {
          where: { deletedAt: null }, // soft-deleted ocultas (W2-04 fix)
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { photos: true, comments: true, logs: true } },
        comments: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        logs: {
          include: { staff: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!ticket) throw new NotFoundException('Ticket no encontrado')
    // Log diagnóstico (testing T-photo-web): permite verificar que las fotos
    // están en BD antes de llegar al cliente. Si _count.photos > 0 pero
    // el cliente no las ve, el problema está en el render.
    const counts = (ticket as any)._count
    if (counts) {
      this.logger.debug(
        `findOne ${ticketId}: photos=${counts.photos} (visible=${ticket.photos?.length ?? 0}) comments=${counts.comments} logs=${counts.logs}`,
      )
    }
    return this.toDetailDto(ticket)
  }

  async getQueue(actor: JwtPayload) {
    return this.findByProperty({ queueOnly: true, activeOnly: true } as any, actor)
  }

  async getRoomHistory(roomId: string, actor: JwtPayload) {
    const tickets = await this.prisma.maintenanceTicket.findMany({
      where: {
        organizationId: actor.organizationId,
        propertyId: actor.propertyId,
        roomId,
      },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return tickets.map((t) => this.toListDto(t))
  }

  async getAssetHistory(assetTag: string, actor: JwtPayload) {
    const tickets = await this.prisma.maintenanceTicket.findMany({
      where: {
        organizationId: actor.organizationId,
        propertyId: actor.propertyId,
        assetTag,
      },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return tickets.map((t) => this.toListDto(t))
  }

  async listRecurrenceTemplates(actor: JwtPayload) {
    return this.prisma.maintenanceRecurrenceTemplate.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
      orderBy: [{ category: 'asc' }, { intervalDays: 'asc' }],
    })
  }

  // ============================================================================
  //  Helpers internos
  // ============================================================================

  private async findOrThrow(ticketId: string) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id: ticketId },
      include: TICKET_INCLUDE,
    })
    if (!ticket) throw new NotFoundException('Ticket no encontrado')
    return ticket
  }

  private assertActor(
    ticket: Awaited<ReturnType<MaintenanceService['findOrThrow']>>,
    actor: JwtPayload,
    allowed: Array<'assignee' | 'supervisor' | 'reporter'>,
  ) {
    const isAssignee = ticket.assignedToId === actor.sub
    const isSupervisor = actor.role === StaffRole.SUPERVISOR
    const isReporter = ticket.reportedById === actor.sub
    const ok =
      (allowed.includes('assignee') && isAssignee) ||
      (allowed.includes('supervisor') && isSupervisor) ||
      (allowed.includes('reporter') && isReporter)
    if (!ok) {
      throw new ForbiddenException('No tienes permiso para esta acción sobre el ticket')
    }
  }

  private async transitionStatus(
    ticket: Awaited<ReturnType<MaintenanceService['findOrThrow']>>,
    to: TicketStatus,
    actor: JwtPayload,
    event: TicketLogEvent,
    extraData: Prisma.MaintenanceTicketUncheckedUpdateInput = {},
    metadata: Record<string, unknown> = {},
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.maintenanceTicket.update({
        where: { id: ticket.id },
        data: { status: to, ...extraData },
        include: TICKET_INCLUDE,
      })
      await tx.maintenanceTicketLog.create({
        data: {
          ticketId: ticket.id,
          event,
          staffId: actor.sub,
          metadata: { from: ticket.status, to, ...metadata },
        },
      })
      return u
    })

    this.sse.emit(updated.propertyId, this.eventTypeFor(event) as any, this.toListDto(updated))
    return this.toListDto(updated)
  }

  private eventTypeFor(event: TicketLogEvent): string {
    switch (event) {
      case TicketLogEvent.STARTED:
        return 'maintenance:ticket:started'
      case TicketLogEvent.WAITING_PARTS:
        return 'maintenance:ticket:waiting-parts'
      case TicketLogEvent.RESOLVED:
        return 'maintenance:ticket:resolved'
      case TicketLogEvent.VERIFIED:
        return 'maintenance:ticket:verified'
      case TicketLogEvent.CLOSED:
        return 'maintenance:ticket:closed'
      case TicketLogEvent.REOPENED:
        return 'maintenance:ticket:reopened'
      case TicketLogEvent.ACKNOWLEDGED:
        return 'maintenance:ticket:acknowledged'
      default:
        return 'maintenance:ticket:created'
    }
  }

  /**
   * Friendly ID estable derivado del UUID. Formato `MT-XXXXXX` (6 hex upper).
   * Sirve para auditoría humana ("ticket MT-38A5AA") sin schema delta. Si en
   * el futuro se requiere ID secuencial fiscal (propCode-MT-####), añadir
   * campo dedicado en Mx-2 — derivar de UUID es suficiente para v1.0.0.
   */
  private friendlyId(uuid: string): string {
    return 'MT-' + uuid.replace(/-/g, '').slice(0, 6).toUpperCase()
  }

  private toListDto(t: any): any {
    return {
      id: t.id,
      friendlyId: this.friendlyId(t.id),
      organizationId: t.organizationId,
      propertyId: t.propertyId,
      roomId: t.roomId ?? null,
      unitId: t.unitId ?? null,
      assetTag: t.assetTag ?? null,
      category: t.category,
      priority: t.priority,
      status: t.status,
      title: t.title,
      description: t.description ?? null,
      guestImpact: t.guestImpact ?? null,
      reportedById: t.reportedById,
      assignedToId: t.assignedToId ?? null,
      resolvedById: t.resolvedById ?? null,
      verifiedById: t.verifiedById ?? null,
      approvedById: t.approvedById ?? null,
      approvedAt: t.approvedAt?.toISOString() ?? null,
      rejectedReason: t.rejectedReason ?? null,
      requiresApproval: t.requiresApproval,
      pendingApproval:
        t.requiresApproval && !t.approvedById && t.status === TicketStatus.OPEN,
      recurrenceTemplateId: t.recurrenceTemplateId ?? null,
      estimatedMinutes: t.estimatedMinutes ?? null,
      actualMinutes: t.actualMinutes ?? null,
      acknowledgedAt: t.acknowledgedAt?.toISOString() ?? null,
      startedAt: t.startedAt?.toISOString() ?? null,
      waitingPartsAt: t.waitingPartsAt?.toISOString() ?? null,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      verifiedAt: t.verifiedAt?.toISOString() ?? null,
      closedAt: t.closedAt?.toISOString() ?? null,
      slaBreachAt: t.slaBreachAt?.toISOString() ?? null,
      estimatedEndAt: t.estimatedEndAt?.toISOString() ?? null,
      sourceTaskId: t.sourceTaskId ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      roomNumber: t.room?.number ?? null,
      reportedByName: t.reportedBy?.name ?? null,
      assignedToName: t.assignedTo?.name ?? null,
      hasAutoBlock: !!t.autoBlock?.id,
    }
  }

  private toDetailDto(t: any): any {
    return {
      ...this.toListDto(t),
      photos: (t.photos ?? []).map((p: any) => ({
        id: p.id,
        ticketId: p.ticketId,
        url: p.url,
        caption: p.caption ?? null,
        isAfterPhoto: p.isAfterPhoto,
        uploadedById: p.uploadedById,
        uploadedByName: p.uploadedBy?.name ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      comments: (t.comments ?? []).map((c: any) => ({
        id: c.id,
        ticketId: c.ticketId,
        authorId: c.authorId,
        authorName: c.author?.name ?? null,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      })),
      logs: (t.logs ?? []).map((l: any) => ({
        id: l.id,
        ticketId: l.ticketId,
        event: l.event,
        staffId: l.staffId ?? null,
        staffName: l.staff?.name ?? null,
        metadata: l.metadata ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
      activeBlockId: t.autoBlock?.id ?? null,
    }
  }

  // ============================================================================
  //  LEGACY MaintenanceIssue — endpoints /tasks/:taskId/issues
  //  @deprecated Sprint Mx-1 — usar MaintenanceTicket para flujos nuevos.
  // ============================================================================

  /** @deprecated usar `createTicket()` con `sourceTaskId` */
  async createIssue(taskId: string, dto: CreateIssueDto, actor: JwtPayload) {
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')

    const issue = await this.prisma.maintenanceIssue.create({
      data: {
        organizationId: task.organizationId,
        taskId,
        reportedById: actor.sub,
        category: dto.category,
        description: dto.description,
        photoUrl: dto.photoUrl,
      },
      include: { reportedBy: { select: { id: true, name: true } } },
    })

    this.sse.emit(task.unit.room.property.id, 'maintenance:reported', {
      issueId: issue.id,
      taskId,
      roomNumber: task.unit.room.number,
      category: dto.category,
    })

    return issue
  }

  /** @deprecated */
  findIssuesByTask(taskId: string) {
    return this.prisma.maintenanceIssue.findMany({
      where: { taskId },
      include: { reportedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** @deprecated */
  findIssuesByProperty(propertyId: string, resolved?: boolean) {
    return this.prisma.maintenanceIssue.findMany({
      where: {
        task: { unit: { room: { propertyId } } },
        ...(resolved !== undefined ? { resolved } : {}),
      },
      include: {
        task: { include: { unit: { include: { room: true } } } },
        reportedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** @deprecated */
  async resolveIssue(id: string) {
    const issue = await this.prisma.maintenanceIssue.findUnique({ where: { id } })
    if (!issue) throw new NotFoundException('Issue not found')
    return this.prisma.maintenanceIssue.update({ where: { id }, data: { resolved: true } })
  }
}
