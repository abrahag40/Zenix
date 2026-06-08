import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Priority, CleaningStatus, CleaningCancelReason } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../../notifications/notifications.service'
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

      // Map: índice → unit destino correspondiente (asumimos 1 unit per
      // PRIVATE room, o N matched para hostal dorms — caso piloto Hotel
      // Monica Tulum es PRIVATE, así que mapping trivial).
      const fromUnitIds = fromUnits.map((u) => u.id)
      const tasks = await this.prisma.cleaningTask.findMany({
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
        },
      })

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

        // Pick matching unit en toRoom — por orden de aparición.
        const targetUnit = toUnits[migrated % toUnits.length]
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
              assignedToId: oldTask.assignedToId,
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

        // SSE refresh — Hub Recamarista actualiza lista
        this.notifications.emit(payload.propertyId, 'task:moved', {
          fromTaskId: oldTask.id,
          toTaskId: result.id,
          fromRoomId: payload.fromRoomId,
          toRoomId: payload.toRoomId,
          stayId: payload.stayId,
          assignedToId: oldTask.assignedToId,
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

