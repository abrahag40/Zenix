/**
 * DeferRetryScheduler — auto-retry de tareas DEFERRED (EC-6 / CLAUDE.md §58).
 *
 * Cada 5 min recorre las tareas con status=DEFERRED y retryAt <= now.
 * Las promueve de vuelta al estado activo correspondiente:
 *   - Si tenían assignedToId → READY (housekeeper recibe push de retry)
 *   - Si no tenían assignee → UNASSIGNED (supervisor decide)
 *
 * No re-asignamos via AssignmentService — la tarea ya tiene un dueño.
 * Solo si el dueño cambió de turno entre defer y retry, supervisor lo ve
 * en kanban y reasigna manualmente.
 *
 * Idempotencia: la query filtra status=DEFERRED + retryAt <= now. Un
 * segundo disparo del mismo cron en el mismo segundo es no-op porque
 * la primera ejecución ya cambió el status.
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CleaningStatus, TaskLogEvent } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'

@Injectable()
export class DeferRetryScheduler {
  private readonly logger = new Logger(DeferRetryScheduler.name)

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryDeferred() {
    const now = new Date()
    const due = await this.prisma.cleaningTask.findMany({
      where: {
        status: CleaningStatus.DEFERRED,
        retryAt: { lte: now, not: null },
      },
      include: {
        unit: { include: { room: { include: { property: true } } } },
      },
      take: 200, // safety cap por ciclo
    })

    if (due.length === 0) return

    let promoted = 0
    for (const task of due) {
      const newStatus = task.assignedToId ? CleaningStatus.READY : CleaningStatus.UNASSIGNED

      await this.prisma.$transaction(async (tx) => {
        await tx.cleaningTask.update({
          where: { id: task.id },
          data: {
            status: newStatus,
            // Limpiamos retryAt para evitar re-promotion. deferredCount/deferredReason
            // se preservan como audit trail.
            retryAt: null,
          },
        })
        await tx.taskLog.create({
          data: {
            taskId: task.id,
            staffId: null,
            event: TaskLogEvent.RETRY_SCHEDULED,
            note: 'auto-retry from DEFERRED',
            metadata: { previousStatus: 'DEFERRED', deferredCount: task.deferredCount },
          },
        })
      })

      const propertyId = task.unit.room.property.id

      // SSE
      this.notifications.emit(propertyId, 'task:retry-scheduled', {
        taskId: task.id,
        unitId: task.unitId,
        roomId: task.unit.roomId,
        roomNumber: task.unit.room.number,
        newStatus,
        deferredCount: task.deferredCount,
      })

      // Push al housekeeper si está asignado — "intenta de nuevo"
      if (task.assignedToId) {
        await this.push.sendToStaff(
          task.assignedToId,
          '🔁 Reintenta limpieza',
          `Hab. ${task.unit.room.number} — Es buen momento para volver a tocar. (Intento ${task.deferredCount + 1}/3)`,
          { type: 'task:retry-scheduled', taskId: task.id },
        )
      }

      promoted++
    }

    this.logger.log(`[DeferRetry] promoted ${promoted} task(s) DEFERRED → READY/UNASSIGNED`)
  }
}
