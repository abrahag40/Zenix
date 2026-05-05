import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CleaningStatus, CleaningDeferReason, HousekeepingRole, JwtPayload, TaskLogEvent } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'
import { CreateTaskDto, AssignTaskDto, EndTaskDto, QueryTaskDto } from './dto/create-task.dto'
import { StaffGamificationService } from '../staff-gamification/staff-gamification.service'

const TASK_INCLUDE = {
  unit: { include: { room: true } },
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  verifiedBy: { select: { id: true, name: true } },
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantContextService,
    private notifications: NotificationsService,
    private push: PushService,
    private gamification: StaffGamificationService,
  ) {}

  async create(dto: CreateTaskDto, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId, organizationId: orgId },
      include: { room: { include: { property: true } } },
    })
    if (!unit) throw new NotFoundException('Unit not found')

    if (dto.assignedToId) {
      const staff = await this.prisma.housekeepingStaff.findUnique({
        where: { id: dto.assignedToId, organizationId: orgId },
      })
      if (!staff || !staff.active) throw new NotFoundException('Staff not found or inactive')
      if (dto.requiredCapability && !staff.capabilities.includes(dto.requiredCapability as any)) {
        throw new ConflictException('Staff does not have the required capability')
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.cleaningTask.create({
        data: {
          organizationId: orgId,
          unitId: dto.unitId,
          assignedToId: dto.assignedToId,
          taskType: dto.taskType ?? 'CLEANING',
          requiredCapability: dto.requiredCapability ?? 'CLEANING',
          priority: dto.priority ?? 'MEDIUM',
          status: dto.assignedToId ? CleaningStatus.PENDING : CleaningStatus.UNASSIGNED,
        },
        include: TASK_INCLUDE,
      })

      await tx.taskLog.create({
        data: { taskId: task.id, staffId: actor.sub, event: TaskLogEvent.CREATED },
      })

      if (dto.assignedToId) {
        await tx.taskLog.create({
          data: { taskId: task.id, staffId: actor.sub, event: TaskLogEvent.ASSIGNED },
        })
      }

      return task
    })
  }

  findAll(query: QueryTaskDto, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const where: any = { organizationId: orgId, unit: { room: { propertyId: actor.propertyId } } }

    // Housekeepers only see their own tasks
    if (actor.role === HousekeepingRole.HOUSEKEEPER) {
      where.assignedToId = actor.sub
    } else if (query.assignedToId) {
      where.assignedToId = query.assignedToId
    }

    if (query.status) {
      const statuses = query.status.split(',')
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0]
    }

    if (query.unitId) where.unitId = query.unitId

    if (query.roomId) where.unit = { ...where.unit, roomId: query.roomId }

    // Filtro scheduledFor (Sprint 8H — mobile roster diario)
    if (query.scheduledFor) {
      where.scheduledFor = new Date(`${query.scheduledFor}T00:00:00.000Z`)
    }

    /**
     * Sort prioritario (Sprint 8H — espejo del sort que el mobile aplica visualmente):
     *   1. hasSameDayCheckIn DESC  → "Hoy entra" arriba (independiente de priority enum)
     *   2. carryoverFromDate ASC, NULLS LAST → carryover (de ayer) primero
     *   3. priority DESC           → URGENT > HIGH > MEDIUM > LOW
     *   4. createdAt ASC           → orden estable, FIFO en empates
     *
     * Prisma no soporta nativamente "NULLS LAST" en MongoDB pero sí en PostgreSQL
     * via raw SQL. Usamos `{ sort: 'asc', nulls: 'last' }` (Prisma 5.x+).
     */
    return this.prisma.cleaningTask.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [
        { hasSameDayCheckIn: 'desc' },
        { carryoverFromDate: { sort: 'asc', nulls: 'last' } },
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    })
  }

  async findOne(id: string) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id, organizationId: orgId },
      include: { ...TASK_INCLUDE, logs: { orderBy: { createdAt: 'asc' } }, notes: true, issues: true },
    })
    if (!task) throw new NotFoundException('Task not found')
    return task
  }

  async startTask(taskId: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')

    if (task.status !== CleaningStatus.READY && task.status !== CleaningStatus.PENDING) {
      throw new ConflictException(`Cannot start task with status: ${task.status}`)
    }

    // Only the assigned housekeeper (or a supervisor) can start the task
    if (
      actor.role === HousekeepingRole.HOUSEKEEPER &&
      task.assignedToId !== actor.sub
    ) {
      throw new ForbiddenException('You are not assigned to this task')
    }

    // Prevent starting if housekeeper already has an IN_PROGRESS task
    if (actor.role === HousekeepingRole.HOUSEKEEPER) {
      const activeTask = await this.prisma.cleaningTask.findFirst({
        where: { assignedToId: actor.sub, status: CleaningStatus.IN_PROGRESS, organizationId: orgId },
      })
      if (activeTask) {
        throw new ConflictException('You already have an active task in progress')
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: {
          status: CleaningStatus.IN_PROGRESS,
          startedAt: new Date(),
          assignedToId: task.assignedToId ?? actor.sub,
        },
        include: TASK_INCLUDE,
      })

      await tx.taskLog.create({
        data: { taskId, staffId: actor.sub, event: TaskLogEvent.STARTED },
      })

      // Update unit status to CLEANING
      await tx.unit.update({ where: { id: task.unitId }, data: { status: 'CLEANING' } })

      return updated
    })

    this.notifications.emit(task.unit.room.property.id, 'task:started', {
      taskId,
      unitId: task.unitId,
      roomNumber: task.unit.room.number,
      assignedToId: actor.sub,
    })

    return updated
  }

  async endTask(taskId: string, actor: JwtPayload, dto?: EndTaskDto) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: {
        unit: { include: { room: { include: { property: true } } } },
        notes: true,
      },
    })
    if (!task) throw new NotFoundException('Task not found')

    if (task.status !== CleaningStatus.IN_PROGRESS && task.status !== CleaningStatus.PAUSED) {
      throw new ConflictException(`Cannot end task with status: ${task.status}`)
    }

    if (actor.role === HousekeepingRole.HOUSEKEEPER && task.assignedToId !== actor.sub) {
      throw new ForbiddenException('You are not assigned to this task')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: { status: CleaningStatus.DONE, finishedAt: new Date() },
        include: TASK_INCLUDE,
      })

      // Persistencia del checklist snapshot al cerrar la tarea.
      // Si el cliente no envía nada, queda metadata: null (compatible con
      // tareas viejas sin checklist o con clientes que aún no envíen).
      const checklistMeta =
        dto?.checklist && dto.checklist.length > 0
          ? { checklist: dto.checklist }
          : undefined

      await tx.taskLog.create({
        data: {
          taskId,
          staffId: actor.sub,
          event: TaskLogEvent.COMPLETED,
          metadata: checklistMeta as any,
        },
      })

      // Unit is now AVAILABLE (clean)
      await tx.unit.update({ where: { id: task.unitId }, data: { status: 'AVAILABLE' } })

      return updated
    })

    const propertyId = task.unit.room.property.id

    this.notifications.emit(propertyId, 'task:done', {
      taskId,
      unitId: task.unitId,
      roomId: task.unit.roomId,
      roomNumber: task.unit.room.number,
      assignedToId: actor.sub,
      hasNotes: task.notes.length > 0,
    })

    // Gamification — fire-and-forget. NEVER block the task transaction
    // (it already commited). If the streak update fails, the task is
    // still done. Logs internal warning for ops.
    if (task.assignedToId && task.startedAt) {
      const cleaningMinutes = Math.max(
        1,
        Math.round(
          (Date.now() - new Date(task.startedAt).getTime()) / 60_000,
        ),
      )
      const roomCategory = task.unit.room.category ?? 'PRIVATE'
      const workDate = new Date().toISOString().slice(0, 10)
      void this.gamification
        .onTaskCompleted({
          staffId: task.assignedToId,
          taskId,
          cleaningMinutes,
          roomCategory,
          workDate,
        })
        .catch((e) => {
          // Internal log only — gamification failures must NEVER bubble
          // up to break the operational flow (CLAUDE.md §32 — fail-soft).
          // eslint-disable-next-line no-console
          console.warn('[gamification.onTaskCompleted] non-fatal:', e?.message ?? e)
        })
    }

    return updated
  }

  async pauseTask(taskId: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')
    if (task.status !== CleaningStatus.IN_PROGRESS) {
      throw new ConflictException('Can only pause an in-progress task')
    }
    if (actor.role === HousekeepingRole.HOUSEKEEPER && task.assignedToId !== actor.sub) {
      throw new ForbiddenException('You are not assigned to this task')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: { status: CleaningStatus.PAUSED },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({ data: { taskId, staffId: actor.sub, event: TaskLogEvent.PAUSED } })
      return updated
    })

    // SSE — broadcast to all clients in the property so the web calendar
    // and other supervisors see the pause in real-time.
    this.notifications.emit(task.unit.room.property.id, 'task:paused', {
      taskId,
      unitId: task.unitId,
      roomId: task.unit.roomId,
      roomNumber: task.unit.room.number,
      assignedToId: actor.sub,
    })
    return updated
  }

  async resumeTask(taskId: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')
    if (task.status !== CleaningStatus.PAUSED) {
      throw new ConflictException('Can only resume a paused task')
    }
    if (actor.role === HousekeepingRole.HOUSEKEEPER && task.assignedToId !== actor.sub) {
      throw new ForbiddenException('You are not assigned to this task')
    }

    // Same guard as startTask: a housekeeper cannot have two IN_PROGRESS tasks.
    // Resuming a PAUSED task moves it to IN_PROGRESS, which would violate the
    // single-active-task invariant if another task is already in progress.
    if (actor.role === HousekeepingRole.HOUSEKEEPER) {
      const activeTask = await this.prisma.cleaningTask.findFirst({
        where: { assignedToId: actor.sub, status: CleaningStatus.IN_PROGRESS, organizationId: orgId },
      })
      if (activeTask) {
        throw new ConflictException('You already have an active task in progress')
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: { status: CleaningStatus.IN_PROGRESS },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({ data: { taskId, staffId: actor.sub, event: TaskLogEvent.RESUMED } })
      return updated
    })

    this.notifications.emit(task.unit.room.property.id, 'task:resumed', {
      taskId,
      unitId: task.unitId,
      roomId: task.unit.roomId,
      roomNumber: task.unit.room.number,
      assignedToId: actor.sub,
    })
    return updated
  }

  async verifyTask(taskId: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')
    if (task.status !== CleaningStatus.DONE) {
      throw new ConflictException('Task must be DONE before verification')
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: { status: CleaningStatus.VERIFIED, verifiedAt: new Date(), verifiedById: actor.sub },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({ data: { taskId, staffId: actor.sub, event: TaskLogEvent.VERIFIED } })
      return updated
    })

    // SSE — supervisor verification visible to all clients
    this.notifications.emit(task.unit.room.property.id, 'task:verified', {
      taskId,
      unitId: task.unitId,
      roomId: task.unit.roomId,
      roomNumber: task.unit.room.number,
      assignedToId: task.assignedToId,
      verifiedById: actor.sub,
    })

    // Gamification — fire-and-forget ring 3 increment.
    if (task.assignedToId) {
      const workDate = new Date().toISOString().slice(0, 10)
      void this.gamification
        .onTaskVerified({ staffId: task.assignedToId, workDate })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('[gamification.onTaskVerified] non-fatal:', e?.message ?? e)
        })
    }

    return result
  }

  /**
   * EC-6 (CLAUDE.md §58) — Skip-and-retry para casos AHLEI Sec. 4.3.
   *
   * El housekeeper toca y nadie responde, o el chip "no molestar" está
   * colgado. La tarea se marca DEFERRED y se reprograma automáticamente
   * 30 min después. Tras 3 deferrals consecutivos, pasa a BLOCKED y se
   * notifica al supervisor (acción manual).
   *
   * Reglas:
   *   - Solo el housekeeper asignado o un SUPERVISOR puede diferir.
   *   - Solo desde estado READY o IN_PROGRESS (si paused mid-task ante DND).
   *   - DONE/VERIFIED/CANCELLED rechazan defer (ya finalizadas).
   */
  async deferTask(taskId: string, reason: CleaningDeferReason, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')

    // Permisos: housekeeper asignado o supervisor
    const isOwner = task.assignedToId === actor.sub
    const isSupervisor = actor.role === HousekeepingRole.SUPERVISOR
    if (!isOwner && !isSupervisor) {
      throw new ForbiddenException('Only the assigned housekeeper or a supervisor can defer this task')
    }

    // Solo deferrible desde estados activos
    const ALLOWED = [CleaningStatus.READY, CleaningStatus.IN_PROGRESS, CleaningStatus.PAUSED] as const
    if (!ALLOWED.includes(task.status as any)) {
      throw new ConflictException(`Cannot defer a task in status ${task.status}`)
    }

    const newCount = task.deferredCount + 1
    const willBlock = newCount >= 3

    // Tres deferrals consecutivos → BLOCKED + alerta supervisor
    const newStatus = willBlock ? CleaningStatus.BLOCKED : CleaningStatus.DEFERRED
    const retryAt = willBlock ? null : new Date(Date.now() + 30 * 60 * 1000)

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: {
          status: newStatus,
          deferredAt: new Date(),
          deferredReason: reason,
          deferredCount: newCount,
          retryAt,
        },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({
        data: {
          taskId,
          staffId: actor.sub,
          event: willBlock ? TaskLogEvent.BLOCKED : TaskLogEvent.DEFERRED,
          note: `${reason}${willBlock ? ' — 3 attempts, blocked for manual action' : ''}`,
          metadata: { reason, deferredCount: newCount, retryAt: retryAt?.toISOString() ?? null },
        },
      })
      return updated
    })

    const propertyId = task.unit.room.property.id

    // SSE — supervisor + recepción ven el cambio en tiempo real
    if (willBlock) {
      this.notifications.emit(propertyId, 'task:blocked', {
        taskId,
        unitId: task.unitId,
        roomId: task.unit.roomId,
        roomNumber: task.unit.room.number,
        reason,
        deferredCount: newCount,
      })
      // Notif tier-2.5 al supervisor (push) — acción manual requerida
      const supervisors = await this.prisma.housekeepingStaff.findMany({
        where: { propertyId, organizationId: orgId, role: 'SUPERVISOR', active: true },
        select: { id: true },
      })
      for (const sup of supervisors) {
        await this.push.sendToStaff(
          sup.id,
          '⚠️ Habitación bloqueada',
          `Hab. ${task.unit.room.number} — 3 intentos sin acceso. Acción manual requerida.`,
          { type: 'task:blocked', taskId, reason },
        )
      }
    } else {
      this.notifications.emit(propertyId, 'task:deferred', {
        taskId,
        unitId: task.unitId,
        roomId: task.unit.roomId,
        roomNumber: task.unit.room.number,
        reason,
        retryAt: retryAt?.toISOString() ?? null,
      })
    }

    return result
  }

  /**
   * D15 — Force URGENT. Recepción decide que esta tarea es prioritaria
   * (huésped llegando antes, evento privado, etc.). Cambia priority a URGENT
   * y emite SSE para que el housekeeper la vea reordenada en su mobile hub.
   *
   * Permisos: SUPERVISOR / RECEPTIONIST (controller layer).
   * No reversible vía endpoint dedicado — para "bajar" la urgencia se reasigna
   * o se permite que el flow normal siga. Audit trail completo en TaskLog.
   */
  async forceUrgent(taskId: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')
    if (task.status === CleaningStatus.CANCELLED || task.status === CleaningStatus.VERIFIED) {
      throw new ConflictException(`No se puede modificar una tarea ${task.status}`)
    }
    if (task.priority === 'URGENT') {
      return task // idempotente — ya es URGENT
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: { priority: 'URGENT' },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({
        data: {
          taskId,
          staffId: actor.sub,
          event: TaskLogEvent.PRIORITY_OVERRIDDEN,
          note: `recepción forzó URGENT (era ${task.priority})`,
          metadata: { previousPriority: task.priority },
        },
      })
      return updated
    })

    this.notifications.emit(task.unit.room.property.id, 'task:priority-overridden', {
      taskId,
      unitId: task.unitId,
      roomId: task.unit.roomId,
      roomNumber: task.unit.room.number,
      previousPriority: task.priority,
      newPriority: 'URGENT',
    })

    if (task.assignedToId) {
      await this.push.sendToStaff(
        task.assignedToId,
        '🚨 Habitación URGENTE',
        `Hab. ${task.unit.room.number} — Prioridad forzada por recepción`,
        { type: 'task:priority-overridden', taskId },
      )
    }

    return result
  }

  /**
   * D15 — Deep clean flag. Recepción marca que esta tarea requiere limpieza
   * profunda (cambio total de blancos, sanitización extra, evento privado).
   * No cambia status — solo marca el flag para que el housekeeper reciba el
   * checklist extendido y duración estimada mayor.
   *
   * Toggle behavior: si ya está deep=true, lo apaga (idempotente).
   */
  async toggleDeepClean(taskId: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')
    if (task.status === CleaningStatus.CANCELLED || task.status === CleaningStatus.VERIFIED) {
      throw new ConflictException(`No se puede modificar una tarea ${task.status}`)
    }
    if (task.status === CleaningStatus.IN_PROGRESS) {
      throw new ConflictException(
        'La limpieza ya está en progreso — espera a que termine para marcar deep-clean',
      )
    }

    const newDeepClean = !task.deepClean

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: { deepClean: newDeepClean },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({
        data: {
          taskId,
          staffId: actor.sub,
          event: TaskLogEvent.DEEP_CLEAN_FLAGGED,
          note: newDeepClean ? 'marcada para limpieza profunda' : 'limpieza profunda removida',
          metadata: { deepClean: newDeepClean },
        },
      })
      return updated
    })

    this.notifications.emit(task.unit.room.property.id, 'task:deep-clean-flagged', {
      taskId,
      unitId: task.unitId,
      roomNumber: task.unit.room.number,
      deepClean: newDeepClean,
    })

    if (task.assignedToId && newDeepClean) {
      await this.push.sendToStaff(
        task.assignedToId,
        '🧽 Limpieza profunda',
        `Hab. ${task.unit.room.number} — Cambio total de blancos requerido`,
        { type: 'task:deep-clean-flagged', taskId },
      )
    }

    return result
  }

  /**
   * D15 — Hold cleaning. Recepción pone hold por extensión sin formalizar
   * (huésped pidió quedarse pero aún no paga). La tarea NO se inicia mientras
   * holdReason esté presente. Si está READY → revierte a PENDING.
   *
   * Al formalizar la extensión: D12 extendWithCleaningFlag resuelve.
   * Al cancelar el hold: releaseHold() restaura el estado.
   */
  async holdCleaning(taskId: string, reason: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')
    if (task.status === CleaningStatus.IN_PROGRESS) {
      throw new ConflictException(
        'No se puede pausar una limpieza en progreso — coordina con el housekeeper',
      )
    }
    if (
      task.status === CleaningStatus.DONE ||
      task.status === CleaningStatus.VERIFIED ||
      task.status === CleaningStatus.CANCELLED
    ) {
      throw new ConflictException(`No se puede poner en hold una tarea ${task.status}`)
    }

    const newStatus =
      task.status === CleaningStatus.READY ? CleaningStatus.PENDING : task.status

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: {
          status: newStatus,
          holdReason: reason,
          heldAt: new Date(),
          heldById: actor.sub,
        },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({
        data: {
          taskId,
          staffId: actor.sub,
          event: TaskLogEvent.HOLD_PLACED,
          note: reason,
          metadata: { previousStatus: task.status, reason },
        },
      })
      return updated
    })

    this.notifications.emit(task.unit.room.property.id, 'task:hold-placed', {
      taskId,
      unitId: task.unitId,
      roomNumber: task.unit.room.number,
      reason,
    })

    if (task.assignedToId) {
      await this.push.sendToStaff(
        task.assignedToId,
        '⏸ Limpieza en espera',
        `Hab. ${task.unit.room.number} — ${reason}`,
        { type: 'task:hold-placed', taskId },
      )
    }

    return result
  }

  /**
   * D15 — Release hold. Recepción cancela el hold (huésped sí salió, o la
   * extensión no se formalizó). Restaura status según el contexto.
   */
  async releaseHold(taskId: string, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
      include: { unit: { include: { room: { include: { property: true } } } } },
    })
    if (!task) throw new NotFoundException('Task not found')
    if (!task.holdReason) {
      throw new ConflictException('La tarea no está en hold')
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: {
          holdReason: null,
          heldAt: null,
          heldById: null,
        },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({
        data: {
          taskId,
          staffId: actor.sub,
          event: TaskLogEvent.HOLD_RELEASED,
          note: `hold liberado (era: ${task.holdReason})`,
          metadata: { previousReason: task.holdReason },
        },
      })
      return updated
    })

    this.notifications.emit(task.unit.room.property.id, 'task:hold-released', {
      taskId,
      unitId: task.unitId,
      roomNumber: task.unit.room.number,
    })

    return result
  }

  /**
   * D15 — Walk-in checkout. Crea GuestStay + CleaningTask atómicamente
   * para un huésped que llega sin reserva previa y se va el mismo día.
   *
   * Caso típico: turista pasa por la calle, paga 1 noche, se va a las 6 PM.
   * El cron 7 AM no lo cubre — esta es la pieza de "Ajustes del día" (D15).
   *
   * Defaults aplicados:
   *   - actualCheckin: now (se considera ya checkeado al llegar a recepción)
   *   - paymentStatus: PAID (se cobra en efectivo al momento)
   *   - taskType: CLEANING (no STAYOVER porque el huésped sale hoy)
   *   - status: PENDING (housekeeper espera salida física via confirmDeparture)
   *
   * Validaciones:
   *   - Room debe existir + pertenecer al org
   *   - unitId opcional: si privada con 1 unit → auto-pick; si shared sin unitId → error
   *   - scheduledCheckout debe ser futuro y <= 24h del checkin
   */
  async createWalkIn(
    dto: {
      roomId: string
      unitId?: string
      guestName: string
      ratePerNight: number
      currency: string
      scheduledCheckout: Date
      paxCount?: number
    },
    actor: JwtPayload,
  ) {
    const orgId = this.tenant.getOrganizationId()
    if (!orgId) throw new NotFoundException('Tenant context not set')

    const now = new Date()
    if (dto.scheduledCheckout <= now) {
      throw new ConflictException('La hora de salida debe ser futura')
    }
    const HOURS_24 = 24 * 60 * 60 * 1000
    if (dto.scheduledCheckout.getTime() - now.getTime() > HOURS_24) {
      throw new ConflictException('Walk-in debe salir antes de 24h — usa reserva normal')
    }

    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId, organizationId: orgId },
      include: { property: true, units: { select: { id: true } } },
    })
    if (!room) throw new NotFoundException('Habitación no encontrada')

    // Resolve unitId
    let unitId = dto.unitId
    if (!unitId) {
      if (room.units.length === 0) {
        throw new ConflictException('La habitación no tiene unidades configuradas')
      }
      if (room.units.length > 1) {
        throw new ConflictException('Habitación compartida — debes especificar unitId (cama)')
      }
      unitId = room.units[0].id
    } else {
      const validUnit = room.units.find((u) => u.id === unitId)
      if (!validUnit) throw new NotFoundException('Cama no encontrada en esta habitación')
    }

    const total = dto.ratePerNight // 1 noche/día

    const result = await this.prisma.$transaction(async (tx) => {
      const stay = await tx.guestStay.create({
        data: {
          organizationId: orgId,
          propertyId: room.propertyId,
          roomId: dto.roomId,
          guestName: dto.guestName,
          paxCount: dto.paxCount ?? 1,
          checkinAt: now,
          scheduledCheckout: dto.scheduledCheckout,
          actualCheckin: now,
          checkinConfirmedById: actor.sub,
          checkedInById: actor.sub,
          ratePerNight: dto.ratePerNight,
          currency: dto.currency,
          totalAmount: total,
          amountPaid: total,
          paymentStatus: 'PAID',
          source: 'WALK_IN',
        },
      })

      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      const task = await tx.cleaningTask.create({
        data: {
          organizationId: orgId,
          unitId: unitId!,
          status: CleaningStatus.PENDING,
          taskType: 'CLEANING',
          requiredCapability: 'CLEANING',
          priority: 'MEDIUM',
          hasSameDayCheckIn: false,
          scheduledFor: today,
        },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({
        data: {
          taskId: task.id,
          staffId: actor.sub,
          event: TaskLogEvent.WALK_IN_CREATED,
          note: `walk-in checkout · ${dto.guestName}`,
          metadata: {
            stayId: stay.id,
            roomNumber: room.number,
            scheduledCheckout: dto.scheduledCheckout.toISOString(),
          },
        },
      })

      return { stay, task }
    })

    this.notifications.emit(room.propertyId, 'task:planned', {
      taskId: result.task.id,
      unitId,
      roomId: dto.roomId,
      roomNumber: room.number,
      source: 'WALK_IN',
    })

    return result
  }

  async assignTask(taskId: string, dto: AssignTaskDto, actor: JwtPayload) {
    const orgId = this.tenant.getOrganizationId()
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId, organizationId: orgId },
    })
    if (!task) throw new NotFoundException('Task not found')
    if ([CleaningStatus.DONE, CleaningStatus.VERIFIED, CleaningStatus.CANCELLED].includes(task.status as CleaningStatus)) {
      throw new ConflictException('Cannot assign a completed or cancelled task')
    }

    const staff = await this.prisma.housekeepingStaff.findUnique({
      where: { id: dto.assignedToId, organizationId: orgId },
    })
    if (!staff || !staff.active) throw new NotFoundException('Staff not found or inactive')

    const newStatus =
      task.status === CleaningStatus.UNASSIGNED ? CleaningStatus.READY : task.status

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cleaningTask.update({
        where: { id: taskId },
        data: { assignedToId: dto.assignedToId, status: newStatus as CleaningStatus },
        include: TASK_INCLUDE,
      })
      await tx.taskLog.create({
        data: { taskId, staffId: actor.sub, event: TaskLogEvent.ASSIGNED },
      })

      if (newStatus === CleaningStatus.READY) {
        await this.push.sendToStaff(
          dto.assignedToId,
          '🛏️ Nueva tarea asignada',
          `Hab. ${(updated.unit as any).room.number} — Lista para limpiar`,
          { type: 'task:ready', taskId },
        )
      }

      return updated
    })
  }
}
