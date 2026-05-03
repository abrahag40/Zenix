/**
 * AssignmentService — auto-asignación determinística de CleaningTask.
 *
 * Reglas (en orden de precedencia, D10 + plan §6.2):
 *   1. COVERAGE_PRIMARY — staff con StaffCoverage.isPrimary=true para esa room
 *   2. COVERAGE_BACKUP  — staff con StaffCoverage.isPrimary=false para esa room
 *   3. ROUND_ROBIN      — fallback: staff con menos tareas pendientes hoy
 *
 * Filtros aplicados antes de las reglas:
 *   - Solo staff on-shift en el instante dado (AvailabilityQueryService)
 *   - Solo staff con la capability requerida
 *   - role === HOUSEKEEPER (un SUPERVISOR no recibe tareas auto-asignadas)
 *
 * Cada asignación escribe TaskLog { event: AUTO_ASSIGNED, metadata: { rule } }.
 *
 * Política (D10):
 *   - autoAssign() es invocado por: batchCheckout, confirmDeparture (re-evaluación),
 *     earlyCheckout, createRoomChangeTasks, MorningRosterScheduler.
 *   - Si PropertySettings.autoAssignmentEnabled === false → no-op (devuelve null).
 *   - Si no hay staff disponible → tarea queda UNASSIGNED y se escribe TaskLog
 *     con metadata.failureReason.
 */
import { Injectable, Logger } from '@nestjs/common'
import { Capability, CleaningStatus, AutoAssignmentRule, TaskLogEvent } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AvailabilityQueryService } from '../scheduling/availability-query.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'

export interface AssignmentDecision {
  assigned: boolean
  staffId: string | null
  rule: AutoAssignmentRule | null
  reason: string | null
}

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name)

  constructor(
    private prisma: PrismaService,
    private availability: AvailabilityQueryService,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  /**
   * Auto-asigna una tarea ya creada según las 3 reglas.
   * Persiste el cambio + escribe TaskLog. Devuelve AssignmentDecision.
   *
   * Si la tarea ya tiene assignedToId, no hace nada (decisión: respetar asignaciones manuales).
   */
  async autoAssign(taskId: string, atInstant: Date = new Date()): Promise<AssignmentDecision> {
    const task = await this.prisma.cleaningTask.findUnique({
      where: { id: taskId },
      include: {
        unit: { include: { room: { select: { id: true, propertyId: true, number: true } } } },
      },
    })
    if (!task) {
      return { assigned: false, staffId: null, rule: null, reason: 'TASK_NOT_FOUND' }
    }
    if (task.assignedToId) {
      return {
        assigned: false,
        staffId: task.assignedToId,
        rule: null,
        reason: 'ALREADY_ASSIGNED',
      }
    }

    const propertyId = task.unit.room.propertyId
    const roomId = task.unit.room.id
    const requiredCap = task.requiredCapability as Capability

    // Toggle global por propiedad
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { autoAssignmentEnabled: true },
    })
    if (settings && settings.autoAssignmentEnabled === false) {
      return { assigned: false, staffId: null, rule: null, reason: 'AUTO_ASSIGNMENT_DISABLED' }
    }

    const decision = await this.decide(propertyId, roomId, requiredCap, atInstant)
    if (!decision.assigned || !decision.staffId) {
      // Log the failure to TaskLog for audit
      await this.prisma.taskLog.create({
        data: {
          taskId,
          staffId: null,
          event: TaskLogEvent.AUTO_ASSIGNED,
          note: `auto-assign failed: ${decision.reason}`,
        },
      })
      return decision
    }

    // Persist assignment
    const transitionedToReady = task.status === CleaningStatus.UNASSIGNED
    await this.prisma.$transaction(async (tx) => {
      await tx.cleaningTask.update({
        where: { id: taskId },
        data: {
          assignedToId: decision.staffId,
          autoAssignmentRule: decision.rule,
          // Si la tarea estaba UNASSIGNED, transicionar a READY (cuando ya está activa post-checkout)
          // Si estaba PENDING, dejarla PENDING (espera salida física)
          status: transitionedToReady ? CleaningStatus.READY : task.status,
        },
      })
      await tx.taskLog.create({
        data: {
          taskId,
          staffId: decision.staffId,
          event: TaskLogEvent.AUTO_ASSIGNED,
          note: `rule=${decision.rule}`,
        },
      })
    })

    // SSE para que web vea la asignación (supervisor en KanbanPage)
    this.notifications.emit(propertyId, 'task:auto-assigned', {
      taskId,
      assignedToId: decision.staffId,
      rule: decision.rule,
      roomNumber: task.unit.room.number,
    })

    // FIX gap auditado en docs/alarm-flow-audit.md §4:
    // Cuando UNASSIGNED→READY, el housekeeper asignado debe recibir el
    // mismo trato que recibe en confirmDeparture: SSE task:ready (alarma
    // en mobile) + push notification para background. Sin esto, el
    // alarm host del mobile no dispara en este sub-flujo.
    if (transitionedToReady) {
      this.notifications.emit(propertyId, 'task:ready', {
        taskId,
        unitId: task.unitId,
        roomId: task.unit.room.id,
        roomNumber: task.unit.room.number,
        bedId: undefined as string | undefined,
        assignedToId: decision.staffId,
        hasSameDayCheckIn: task.hasSameDayCheckIn,
      })

      // Push best-effort — no bloquear la transacción si Expo Push falla.
      void this.push
        .sendToStaff(
          decision.staffId,
          '🛏️ Nueva tarea asignada',
          `Hab. ${task.unit.room.number} — Lista para limpiar`,
          { type: 'task:ready', taskId },
        )
        .catch((e) =>
          this.logger.warn(
            `[autoAssign push] non-fatal: ${e instanceof Error ? e.message : e}`,
          ),
        )
    }

    this.logger.debug(
      `[autoAssign] task=${taskId} → staff=${decision.staffId} rule=${decision.rule}`,
    )

    return decision
  }

  /**
   * Decide a quién asignar SIN persistir nada. Útil para previews y para testing.
   */
  async decide(
    propertyId: string,
    roomId: string,
    requiredCapability: Capability,
    atInstant: Date = new Date(),
  ): Promise<AssignmentDecision> {
    // 1. Staff on-shift hoy (con todos los turnos del día, no solo el momento exacto)
    const onShift = await this.availability.getStaffOnShiftToday(propertyId, atInstant)

    // 2. Filtrar por role HOUSEKEEPER + capability
    const eligible = onShift.filter(
      s => s.role === 'HOUSEKEEPER' && s.capabilities.includes(requiredCapability),
    )

    if (eligible.length === 0) {
      return { assigned: false, staffId: null, rule: null, reason: 'NO_ELIGIBLE_STAFF_ON_SHIFT' }
    }

    // 3. Coverages para esta room
    const coverages = await this.prisma.staffCoverage.findMany({
      where: { roomId, staffId: { in: eligible.map(s => s.staffId) } },
      orderBy: [{ isPrimary: 'desc' }, { weight: 'desc' }],
    })

    const eligibleIds = new Set(eligible.map(s => s.staffId))

    // ── Regla 1: PRIMARY ───────────────────────────────────────────────────
    const primary = coverages.filter(c => c.isPrimary && eligibleIds.has(c.staffId))
    if (primary.length === 1) {
      return {
        assigned: true,
        staffId: primary[0].staffId,
        rule: AutoAssignmentRule.COVERAGE_PRIMARY,
        reason: null,
      }
    }
    if (primary.length > 1) {
      // Tiebreak: menor carga + weight desc
      const winner = await this.tiebreak(primary.map(c => c.staffId))
      return {
        assigned: true,
        staffId: winner,
        rule: AutoAssignmentRule.COVERAGE_PRIMARY,
        reason: null,
      }
    }

    // ── Regla 2: BACKUP ────────────────────────────────────────────────────
    const backup = coverages.filter(c => !c.isPrimary && eligibleIds.has(c.staffId))
    if (backup.length > 0) {
      const winner = await this.tiebreak(backup.map(c => c.staffId))
      return {
        assigned: true,
        staffId: winner,
        rule: AutoAssignmentRule.COVERAGE_BACKUP,
        reason: null,
      }
    }

    // ── Regla 3: ROUND_ROBIN ───────────────────────────────────────────────
    const winner = await this.tiebreak(eligible.map(s => s.staffId))
    return {
      assigned: true,
      staffId: winner,
      rule: AutoAssignmentRule.ROUND_ROBIN,
      reason: null,
    }
  }

  /**
   * Tiebreak: el staffId con menos tareas activas hoy (PENDING + READY + IN_PROGRESS).
   * Si hay empate, devuelve el primero (orden estable por staffId).
   */
  private async tiebreak(staffIds: string[]): Promise<string> {
    if (staffIds.length === 1) return staffIds[0]

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const counts = await this.prisma.cleaningTask.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: staffIds },
        status: { in: [CleaningStatus.PENDING, CleaningStatus.READY, CleaningStatus.IN_PROGRESS] },
        createdAt: { gte: today },
      },
      _count: { id: true },
    })

    const countMap = new Map<string, number>(
      counts.map(c => [c.assignedToId as string, Number(c._count?.id ?? 0)])
    )

    // Sort: lowest count first, then alphabetical
    const sorted = [...staffIds].sort((a, b) => {
      const ca: number = countMap.get(a) ?? 0
      const cb: number = countMap.get(b) ?? 0
      if (ca !== cb) return ca - cb
      return a.localeCompare(b)
    })

    return sorted[0]
  }

  /**
   * D5 — flujo de ausencia: reasigna las tareas elegibles del staff ausente.
   *
   * Tareas elegibles para reasignar:
   *   - status NOT IN [DONE, VERIFIED, CANCELLED]
   *   - status NOT IN [IN_PROGRESS, PAUSED]  (D11 — no se reasigna lo en curso)
   *   - assignedToId === absentStaffId
   *
   * Para cada tarea: limpiar assignedToId + ejecutar autoAssign() → encontrar nuevo dueño.
   * Emite SSE shift:absence al final.
   */
  async reassignTasksForAbsence(absentStaffId: string, propertyId: string): Promise<{ reassigned: number; failed: number }> {
    const eligibleTasks = await this.prisma.cleaningTask.findMany({
      where: {
        assignedToId: absentStaffId,
        status: { in: [CleaningStatus.PENDING, CleaningStatus.READY, CleaningStatus.UNASSIGNED] },
        unit: { room: { propertyId } },
      },
      select: { id: true },
    })

    let reassigned = 0
    let failed = 0

    for (const t of eligibleTasks) {
      // Limpiar assignedToId primero para que autoAssign vea la tarea como "sin asignar"
      await this.prisma.cleaningTask.update({
        where: { id: t.id },
        data: { assignedToId: null, autoAssignmentRule: null },
      })
      await this.prisma.taskLog.create({
        data: {
          taskId: t.id,
          staffId: null,
          event: TaskLogEvent.REASSIGNED,
          note: 'staff_absence',
        },
      })

      const decision = await this.autoAssign(t.id)
      if (decision.assigned) reassigned++
      else failed++
    }

    this.notifications.emit(propertyId, 'shift:absence', {
      absentStaffId,
      tasksReassigned: reassigned,
      tasksUnassigned: failed,
    })

    this.logger.log(
      `[reassignForAbsence] staff=${absentStaffId} reassigned=${reassigned} failed=${failed}`,
    )

    return { reassigned, failed }
  }
}
