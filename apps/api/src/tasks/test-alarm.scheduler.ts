/**
 * TestAlarmScheduler — disparador periódico de alarma de tarea para QA.
 *
 * Activación:
 *   1. Encender flag `test.alarm` desde Soporte → Testing
 *      (web o mobile, persistente en BD con audit log)
 *   2. Seleccionar housekeeper objetivo (config.staffEmail)
 *   3. Cada 5 min:
 *        a) Si el housekeeper YA tiene tarea READY/PENDING/IN_PROGRESS
 *           → reemite SSE task:ready de esa tarea + push (no crea otra).
 *        b) Si NO tiene → CREA una tarea READY real sobre un Unit real
 *           del mismo property + emite SSE + push.
 *
 * Por qué crea tarea real (no sintética):
 *   El housekeeper opera el flujo completo end-to-end (Iniciar → Pausar
 *   → Finalizar → Verificar). Los TaskLog quedan en BD. Reportes de
 *   cleaning-time funcionan. Es testing real, no simulación.
 *
 * Marca de testing:
 *   Las tareas creadas por este scheduler se marcan con
 *   `TaskLog.metadata.testAlarm: true` en el evento CREATED, así
 *   reports/dashboards pueden filtrarlas si lo desean.
 *
 * Kill-switch (env):
 *   TEST_ALARM_ENABLED=false → cron no corre, sin importar BD flag.
 *
 * Idempotencia:
 *   Solo crea 1 tarea de prueba a la vez. Si ya existe una en
 *   READY/PENDING/IN_PROGRESS para el housekeeper, no crea otra.
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import {
  Capability,
  CleaningStatus,
  HousekeepingRole,
  Priority,
  TaskLogEvent,
  TaskType,
} from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'

const FLAG_KEY = 'test.alarm'
/** Estados que cuentan como "tarea activa" para no duplicar. */
const ACTIVE_STATUSES: CleaningStatus[] = [
  CleaningStatus.PENDING,
  CleaningStatus.READY,
  CleaningStatus.IN_PROGRESS,
  CleaningStatus.PAUSED,
]

@Injectable()
export class TestAlarmScheduler {
  private readonly logger = new Logger(TestAlarmScheduler.name)
  private cycleCount = 0
  /** Timestamp of the last cycle that actually fired (not just the tick). */
  private lastFireMs = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly flags: FeatureFlagsService,
  ) {}

  // Runs every minute. The actual interval between real cycles is controlled by
  // config.intervalMinutes (default 5) so the user can change it from the app
  // without redeploying or editing the cron expression.
  @Cron('* * * * *', { name: 'test-alarm-tick' })
  async fireTestAlarm(): Promise<void> {
    const enabled = await this.flags.isEnabled(FLAG_KEY)
    if (!enabled) return

    const config = await this.flags.getConfig(FLAG_KEY)
    const intervalMinutes = Math.max(1, Number(config?.intervalMinutes ?? 5))
    if (Date.now() - this.lastFireMs < intervalMinutes * 60_000) return
    this.lastFireMs = Date.now()

    const targetEmail = (config?.staffEmail as string | undefined) ?? null
    if (!targetEmail) {
      this.logger.warn(
        '[TEST-ALARM] Flag test.alarm activo pero config.staffEmail no está definido. Saltando ciclo.',
      )
      return
    }

    this.cycleCount += 1
    const cycleId = `c${this.cycleCount}`

    // 1. Localizar housekeeper objetivo
    const staff = await this.prisma.housekeepingStaff.findFirst({
      where: { email: targetEmail, role: HousekeepingRole.HOUSEKEEPER },
      select: { id: true, name: true, email: true, propertyId: true, organizationId: true },
    })
    if (!staff || !staff.propertyId) {
      this.logger.warn(
        `[TEST-ALARM ${cycleId}] Housekeeper "${targetEmail}" no encontrado o sin propiedad. Saltando.`,
      )
      return
    }

    // 2. ¿Ya tiene tarea activa? Si sí, reemite SSE de esa.
    const existingTask = await this.prisma.cleaningTask.findFirst({
      where: {
        assignedToId: staff.id,
        status: { in: ACTIVE_STATUSES },
      },
      include: { unit: { include: { room: true } } },
      orderBy: { createdAt: 'desc' },
    })

    if (existingTask) {
      await this.emitAlarm(staff, existingTask, cycleId, false)
      return
    }

    // 3. No hay tarea activa → crear una real para que el housekeeper opere
    const created = await this.createTestTask(staff, cycleId)
    if (!created) return // log already emitted

    await this.emitAlarm(staff, created, cycleId, true)
  }

  /**
   * Crea una CleaningTask(READY) sobre un Unit real disponible de la propiedad,
   * asignada al housekeeper. Marcada con metadata.testAlarm para filtrado.
   */
  private async createTestTask(
    staff: { id: string; propertyId: string; organizationId: string | null; name: string },
    cycleId: string,
  ): Promise<{ id: string; unitId: string; unit: { roomId: string; room: { id: string; number: string } }; hasSameDayCheckIn: boolean } | null> {
    // Buscar un Unit del property que NO tenga tarea activa
    const unit = await this.prisma.unit.findFirst({
      where: {
        room: { propertyId: staff.propertyId },
        cleaningTasks: { none: { status: { in: ACTIVE_STATUSES } } },
      },
      include: { room: { select: { id: true, number: true, propertyId: true } } },
    })

    if (!unit) {
      this.logger.warn(
        `[TEST-ALARM ${cycleId}] Sin unidades libres en propiedad ${staff.propertyId}. Limpia una tarea pendiente o agrega habitaciones.`,
      )
      return null
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const t = await tx.cleaningTask.create({
        data: {
          organizationId: staff.organizationId,
          unitId: unit.id,
          assignedToId: staff.id,
          status: CleaningStatus.READY,
          taskType: TaskType.CLEANING,
          requiredCapability: Capability.CLEANING,
          priority: Priority.MEDIUM,
        },
        include: { unit: { include: { room: true } } },
      })
      await tx.taskLog.create({
        data: {
          taskId: t.id,
          staffId: null,
          event: TaskLogEvent.CREATED,
          note: `test.alarm cycle=${cycleId}`,
          metadata: { testAlarm: true, cycle: cycleId } as any,
        },
      })
      // El unit pasa a DIRTY (lista para limpiar) — alinea con flujo real
      await tx.unit.update({ where: { id: unit.id }, data: { status: 'DIRTY' } })
      return t
    })

    this.logger.log(
      `[TEST-ALARM ${cycleId}] 🆕 Tarea creada: Hab. ${task.unit.room.number} → ${staff.name} (id=${task.id})`,
    )
    return task
  }

  /**
   * Emite SSE task:ready (alarma full-screen en mobile) + push notification.
   */
  private async emitAlarm(
    staff: { id: string; propertyId: string; name: string },
    task: { id: string; unitId: string; unit: { roomId: string; room: { id: string; number: string } }; hasSameDayCheckIn: boolean },
    cycleId: string,
    isNew: boolean,
  ): Promise<void> {
    this.notifications.emit(staff.propertyId, 'task:ready', {
      taskId: task.id,
      unitId: task.unitId,
      roomId: task.unit.roomId,
      roomNumber: task.unit.room.number,
      bedId: undefined as string | undefined,
      assignedToId: staff.id,
      hasSameDayCheckIn: task.hasSameDayCheckIn,
      __test: true,
      __cycle: cycleId,
    })

    try {
      await this.push.sendToStaff(
        staff.id,
        '🧪 Test alarma — Tarea lista',
        `Hab. ${task.unit.room.number} (ciclo ${cycleId})`,
        { type: 'task:ready', taskId: task.id, __test: true },
      )
    } catch (e) {
      this.logger.warn(`[TEST-ALARM ${cycleId}] Push falló (no fatal): ${(e as Error).message}`)
    }

    this.logger.log(
      `[TEST-ALARM ${cycleId}] ✅ ${isNew ? 'CREADA + ' : 'Reemit '}alarma para "${staff.name}" — Hab. ${task.unit.room.number}`,
    )
  }
}
