import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CleaningStatus, HousekeepingRole, JwtPayload, TaskLogEvent } from '@zenix/shared'
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
