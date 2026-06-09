import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Priority, CleaningStatus, CleaningCancelReason } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { AssignmentService } from '../../assignment/assignment.service'
import { PushService } from '../../notifications/push.service'
import { startOfLocalDayUtc } from './hk-realtime.helpers'

/**
 * RoomMovedHkListener — Etapa A §A2 (MOBILE-DASHBOARD plan §D-HK-CHX2).
 *
 * Caso de uso (owner 2026-06-08): "son las 9am, llega checkin por channex
 * para hoy, recepcionista por X motivo cambia a otra habitación, el sistema
 * debería actualizar la data de la lista pendiente de tareas de la recamarista
 * porque si se queda con la habitación antes de realizar el movimiento de
 * habitación, va a limpiar una que no debe de ser y habría un problema".
 *
 * Gap pre-fix: guest-stays.service.moveRoom() emite `room.moved`, pero el
 * listener existente (PmsSseListener) solo re-emite SSE para el calendar UI.
 * NO migra CleaningTasks de fromRoomId a toRoomId. La recamarista termina
 * limpiando la habitación equivocada.
 *
 * Fix (este listener):
 *   1. Escucha `room.moved` (ya emitido por GuestStaysService.moveRoom).
 *   2. Pull CleaningTask activa (PENDING/READY/UNASSIGNED) en fromRoom hoy.
 *   3. **Si alguna está IN_PROGRESS** → log warning + skip (no podemos
 *      cancelarla; la recamarista YA está limpiando. El §54 D11 del CLAUDE.md
 *      ya bloquea el moveRoom en este caso desde GuestStaysService — defensive
 *      double-check aquí).
 *   4. Para cada task PENDING/UNASSIGNED/READY:
 *      a. Marcar como CANCELLED (TaskLog event=CANCELLED reason='room move').
 *      b. Crear task nueva en toRoom con priority + hasSameDayCheckIn heredados,
 *         carryoverFromTaskId apuntando a la cancelada, status READY (si la
 *         antigua era READY) o PENDING (si era PENDING).
 *      c. Heredar assignedToId si existía.
 *   5. Emite SSE `task:moved` con `{ fromTaskId, toTaskId, fromRoomId,
 *      toRoomId }` para refresh inmediato del Hub Recamarista.
 *
 * Fail-soft: errores se loggean. Si la migración falla parcial (algunas tasks
 * sí, otras no), el SSE igual se emite con lo que sí se hizo.
 */
@Injectable()
export class RoomMovedHkListener {
  private readonly logger = new Logger(RoomMovedHkListener.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly assignment: AssignmentService,
    private readonly push: PushService,
  ) {}

  @OnEvent('room.moved', { async: true })
  async onRoomMoved(payload: {
    stayId: string
    fromRoomId: string
    toRoomId: string
    propertyId: string
    actorId?: string
  }): Promise<{ migrated: number; conflicts: number }> {
    try {
      const propSettings = await this.prisma.propertySettings.findUnique({
        where: { propertyId: payload.propertyId },
        select: { timezone: true },
      })
      const timezone = propSettings?.timezone || 'UTC'
      const todayUtc = startOfLocalDayUtc(new Date(), timezone)

      // Resolve units of fromRoom + toRoom
      const [fromUnits, toUnits] = await Promise.all([
        this.prisma.unit.findMany({ where: { roomId: payload.fromRoomId }, select: { id: true } }),
        this.prisma.unit.findMany({ where: { roomId: payload.toRoomId }, select: { id: true } }),
      ])
      if (fromUnits.length === 0 || toUnits.length === 0) {
        this.logger.debug(
          `[hk-realtime room-moved] sin units fromRoom=${payload.fromRoomId} ` +
            `(${fromUnits.length}) o toRoom=${payload.toRoomId} (${toUnits.length}). Skip.`,
        )
        return { migrated: 0, conflicts: 0 }
      }

      // BUG-3 fix (2026-06-08) — scope migration to ONE task per stay event.
      //
      // Original bug: el listener tomaba TODAS las tasks de fromRoom hoy,
      // asumiendo que todas pertenecían a la stay movida. Esto es falso:
      //   - En PRIVATE rooms hay 1 unit → 1 task max, no bug observable.
      //   - En HOSTAL dorms (multi-unit, §156 D-CHECKIN C3 — deferido) si
      //     2 stays comparten dorm + ambas tienen task hoy, una mudanza de
      //     STAY A migraría TAMBIÉN la task de STAY B → recamarista limpia
      //     la cama equivocada.
      //
      // CleaningTask no tiene stayId hoy (gap §156 — sprint hostel propio).
      // Fix mínimo seguro: `take: 1` ordenado por updatedAt desc — agarra
      // la task más reciente activa, que en PRIVATE es la única, y en
      // HOSTAL es la más probable de corresponder al stay que acaba de
      // ejecutar la mudanza. Si hay >1 task activa → WARN para que el log
      // operativo lo detecte y se priorice el sprint hostel.
      const fromUnitIds = fromUnits.map((u) => u.id)
      const allActiveTasks = await this.prisma.cleaningTask.findMany({
        where: {
          unitId: { in: fromUnitIds },
          scheduledFor: todayUtc,
          status: {
            in: [CleaningStatus.PENDING, CleaningStatus.UNASSIGNED, CleaningStatus.READY, CleaningStatus.IN_PROGRESS],
          },
        },
        select: {
          id: true,
          unitId: true,
          status: true,
          priority: true,
          hasSameDayCheckIn: true,
          assignedToId: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      })

      if (allActiveTasks.length > 1) {
        this.logger.warn(
          `[hk-realtime room-moved] stay=${payload.stayId} fromRoom=${payload.fromRoomId} ` +
            `tiene ${allActiveTasks.length} tasks activas hoy (multi-unit room). ` +
            `BUG-3 mitigation: migrando SOLO la más reciente (${allActiveTasks[0].id}). ` +
            `Hostel per-bed dorm scope requiere CleaningTask.stayId — diferido a sprint hostel (§156 D-CHECKIN C3).`,
        )
      }

      // Take exactly 1 task — la que pertenece a esta stay (PRIVATE 1:1, HOSTAL best-effort).
      const tasks = allActiveTasks.slice(0, 1)

      let migrated = 0
      let conflicts = 0

      for (const oldTask of tasks) {
        // Defensive — CLAUDE.md §54 D11 ya bloquea moveRoom si task IN_PROGRESS.
        // Si llegamos aquí con IN_PROGRESS, es bug aguas arriba — log y skip.
        if (oldTask.status === CleaningStatus.IN_PROGRESS) {
          this.logger.warn(
            `[hk-realtime room-moved] task=${oldTask.id} IN_PROGRESS detectada ` +
              `durante room.moved fromRoom=${payload.fromRoomId} stay=${payload.stayId}. ` +
              `Esto NO debería pasar (§54 bloquea en GuestStaysService). Skip migración.`,
          )
          conflicts++
          continue
        }

        // BUG-4 partial mitigation (2026-06-08) — `migrated % toUnits.length`
        // round-robin distribuía tasks entre TODAS las units del toRoom,
        // lo cual es semánticamente incorrecto: una stay ocupa UNA unit en
        // el toRoom. Tomamos la primera AVAILABLE-like (orden estable de
        // creación). Para hostal per-bed con assignedBedId explícito, ver
        // sprint hostel diferido (§156). Hoy `take: 1` arriba garantiza
        // que el loop solo itera una vez.
        const targetUnit = toUnits[0]
        if (!targetUnit) continue

        // Tx atómica: cancelar antigua + crear nueva + log
        const result = await this.prisma.$transaction(async (tx) => {
          await tx.cleaningTask.update({
            where: { id: oldTask.id },
            data: {
              status: CleaningStatus.CANCELLED,
              cancelledReason: CleaningCancelReason.RECEPTIONIST_MANUAL,
              cancelledAt: new Date(),
            },
          })
          await tx.taskLog.create({
            data: {
              taskId: oldTask.id,
              staffId: payload.actorId ?? null,
              event: 'CANCELLED',
              note: `room move ${payload.fromRoomId} → ${payload.toRoomId}`,
            },
          })

          // Nueva task — preserva semántica original.
          const newStatus =
            oldTask.status === CleaningStatus.READY ? CleaningStatus.READY : CleaningStatus.PENDING
          const newTask = await tx.cleaningTask.create({
            data: {
              unitId: targetUnit.id,
              taskType: 'CLEANING',
              status: newStatus,
              priority: oldTask.priority,
              hasSameDayCheckIn: oldTask.hasSameDayCheckIn,
              scheduledFor: todayUtc,
              // E2E-21 fix (2026-06-08) — NO heredar la recamarista de la zona
              // origen. La tarea nace sin assignee y autoAssign() (abajo, fuera
              // de la tx) elige el primary del NUEVO cuarto vía StaffCoverage.
              assignedToId: null,
              carryoverFromTaskId: oldTask.id,
            },
          })
          await tx.taskLog.create({
            data: {
              taskId: newTask.id,
              staffId: payload.actorId ?? null,
              event: 'CREATED',
              note: `migrada desde task ${oldTask.id} por room move`,
            },
          })

          return newTask
        })

        // E2E-21 fix (2026-06-08) — reasignar por COBERTURA del NUEVO cuarto.
        // Antes la tarea migrada heredaba la recamarista de la zona ORIGEN →
        // tras mover de piso 1 (María) a piso 3 (Pedro), quedaba con María
        // (recamarista equivocada) y la correcta (Pedro) nunca se enteraba.
        // autoAssign() elige el primary del toRoom via StaffCoverage + emite
        // task:auto-assigned (§53 D10). Fuera de la tx (lee la task ya creada).
        let newAssigneeId: string | null = null
        try {
          const decision = await this.assignment.autoAssign(result.id)
          newAssigneeId = decision.staffId ?? null
        } catch (e) {
          this.logger.warn(
            `[hk-realtime room-moved] autoAssign falló task=${result.id}: ` +
              `${e instanceof Error ? e.message : e}`,
          )
        }

        // Push a la NUEVA recamarista cuando la tarea es accionable (READY).
        // autoAssign solo empuja en UNASSIGNED→READY; la migrada nace READY/
        // PENDING, así que el push del room-move lo mandamos aquí explícitamente
        // (requisito owner: "asignarse a Y recamarista y notificarle por push").
        if (newAssigneeId && result.status === CleaningStatus.READY) {
          const toRoomNumber = await this.prisma.room
            .findUnique({ where: { id: payload.toRoomId }, select: { number: true } })
            .then((r) => r?.number ?? '?')
            .catch(() => '?')
          void this.push
            .sendToStaff(
              newAssigneeId,
              '🔄 Tarea reasignada',
              `Hab. ${toRoomNumber} — Lista para limpiar (cambio de habitación)`,
              { type: 'task:moved', taskId: result.id },
            )
            .catch((e) =>
              this.logger.warn(
                `[hk-realtime room-moved push] non-fatal: ${e instanceof Error ? e.message : e}`,
              ),
            )
        }

        // SSE refresh — Hub Recamarista actualiza lista (con el NUEVO assignee)
        this.notifications.emit(payload.propertyId, 'task:moved', {
          fromTaskId: oldTask.id,
          toTaskId: result.id,
          fromRoomId: payload.fromRoomId,
          toRoomId: payload.toRoomId,
          stayId: payload.stayId,
          assignedToId: newAssigneeId,
        })

        migrated++
      }

      if (migrated > 0) {
        this.logger.log(
          `[hk-realtime room-moved] stay=${payload.stayId} ` +
            `${payload.fromRoomId}→${payload.toRoomId}: ${migrated} task(s) migrada(s)` +
            (conflicts > 0 ? `, ${conflicts} conflict(s) IN_PROGRESS` : ''),
        )
      }

      return { migrated, conflicts }
    } catch (err) {
      this.logger.error(
        `[hk-realtime room-moved] error stay=${payload.stayId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      )
      return { migrated: 0, conflicts: 0 }
    }
  }
}

