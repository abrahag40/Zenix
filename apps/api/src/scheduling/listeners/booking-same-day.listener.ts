import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Priority, CleaningStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { startOfLocalDayUtc, isSameDayInTimezone } from './hk-realtime.helpers'

/**
 * BookingSameDayListener — Etapa A §A1 (MOBILE-DASHBOARD plan §D-HK-CHX1).
 *
 * Caso de uso (owner 2026-06-08): "son las 10am, llega una reserva para hoy
 * desde channex, automáticamente el sistema notifica a la recamarista que hay
 * entrada y se actualiza su lista de tareas, si está ocupada y el checkout es
 * a las 11am debería ser prioritaria porque está sucia debido al antiguo huésped".
 *
 * Gap pre-fix: booking-new.handler.ts crea GuestStay + notifica al SUPERVISOR
 * pero NO toca CleaningTask. El cron morning-roster (07:00) ya pasó cuando
 * aterriza la booking 10AM. La recamarista no se entera hasta el día siguiente.
 *
 * Fix (este listener):
 *   1. Escucha `channex.booking.same-day-arrival` (emitido por
 *      BookingNewHandler post-save cuando el stay.checkIn cae HOY tz-aware).
 *   2. Resuelve timezone de la property + computa startOfLocalDayUtc(today).
 *   3. Pull CleaningTask activa (PENDING/READY/UNASSIGNED) para la room +
 *      scheduledFor=hoy.
 *   4. Si existe Y NO está ya URGENT con hasSameDayCheckIn=true → upgrade
 *      priority + flag + TaskLog event=PRIORITY_UPGRADED.
 *   5. Si NO existe task → NO crea una (la room presumiblemente ya está limpia
 *      y disponible; sin task pendiente significa que el ciclo de HK ya pasó).
 *   6. Emite SSE `task:upgraded` para refresh inmediato del Hub Recamarista.
 *
 * Fail-soft: cualquier error se loggea pero NO propaga (la booking-new ya está
 * salvada en BD; no queremos rollback de eso por un detalle de HK).
 */
@Injectable()
export class BookingSameDayListener {
  private readonly logger = new Logger(BookingSameDayListener.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent('channex.booking.same-day-arrival', { async: true })
  async onSameDayArrival(payload: {
    stayId: string
    roomId: string
    propertyId: string
    checkInIso: string
    otaName: string | null
  }): Promise<{ upgraded: number; skipped: 'NO_TASK' | 'ALREADY_URGENT' | 'NOT_SAME_DAY' | null }> {
    try {
      const propSettings = await this.prisma.propertySettings.findUnique({
        where: { propertyId: payload.propertyId },
        select: { timezone: true },
      })
      const timezone = propSettings?.timezone || 'UTC'

      // Double-check timezone-aware (defensive — emisor ya validó pero por si event payload
      // viaja stale o el cron de timezone shift cambia algo)
      if (!isSameDayInTimezone(payload.checkInIso, timezone)) {
        this.logger.debug(
          `[hk-realtime] skip stay=${payload.stayId} — checkIn ${payload.checkInIso} no cae HOY en tz=${timezone}`,
        )
        return { upgraded: 0, skipped: 'NOT_SAME_DAY' }
      }

      const todayUtc = startOfLocalDayUtc(new Date(), timezone)

      // Resolve unitId for this room. CleaningTask.unitId → Unit.roomId.
      const units = await this.prisma.unit.findMany({
        where: { roomId: payload.roomId },
        select: { id: true },
      })
      if (units.length === 0) {
        this.logger.debug(`[hk-realtime] stay=${payload.stayId} room=${payload.roomId} sin units`)
        return { upgraded: 0, skipped: 'NO_TASK' }
      }
      const unitIds = units.map((u) => u.id)

      // Active tasks for today (PENDING/READY/UNASSIGNED) — IN_PROGRESS no se
      // toca (recamarista ya está limpiando), DONE/VERIFIED tampoco.
      const tasks = await this.prisma.cleaningTask.findMany({
        where: {
          unitId: { in: unitIds },
          scheduledFor: todayUtc,
          status: { in: [CleaningStatus.PENDING, CleaningStatus.UNASSIGNED, CleaningStatus.READY] },
        },
        select: { id: true, priority: true, hasSameDayCheckIn: true, assignedToId: true },
      })

      if (tasks.length === 0) {
        // No HK task pending — la room presumiblemente ya está limpia (sin
        // checkout previo hoy) y el huésped puede entrar directo. No-op.
        this.logger.log(
          `[hk-realtime] stay=${payload.stayId} room=${payload.roomId} ` +
            `no requiere escalación HK (sin tasks pendientes hoy)`,
        )
        return { upgraded: 0, skipped: 'NO_TASK' }
      }

      let upgraded = 0
      for (const task of tasks) {
        if (task.priority === Priority.URGENT && task.hasSameDayCheckIn) {
          // Ya estaba escalada (otra señal anterior, p.ej. morning-roster)
          continue
        }
        await this.prisma.cleaningTask.update({
          where: { id: task.id },
          data: { priority: Priority.URGENT, hasSameDayCheckIn: true },
        })
        // PRIORITY_OVERRIDDEN es el enum value semánticamente más cercano al
        // upgrade automático del sistema. El `note` captura la causa real
        // (booking OTA same-day) para el audit trail.
        await this.prisma.taskLog.create({
          data: {
            taskId: task.id,
            event: 'PRIORITY_OVERRIDDEN',
            note: `auto-upgrade URGENT — OTA ${payload.otaName ?? 'directa'} booking same-day arrival`,
          },
        })
        upgraded++
      }

      if (upgraded === 0) {
        return { upgraded: 0, skipped: 'ALREADY_URGENT' }
      }

      // SSE → Hub Recamarista refresca + haptic.
      this.notifications.emit(payload.propertyId, 'task:upgraded', {
        roomId: payload.roomId,
        stayId: payload.stayId,
        reason: 'OTA same-day arrival',
        otaName: payload.otaName,
      })

      this.logger.log(
        `[hk-realtime] stay=${payload.stayId} room=${payload.roomId} ` +
          `upgraded=${upgraded} task(s) to URGENT (OTA ${payload.otaName ?? '∅'})`,
      )
      return { upgraded, skipped: null }
    } catch (err) {
      // Fail-soft: NO propagamos el error porque la booking ya está salvada
      // en BD. Reportamos a logs + Sentry (cuando se wire).
      this.logger.error(
        `[hk-realtime] error escalando stay=${payload.stayId} room=${payload.roomId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      )
      return { upgraded: 0, skipped: null }
    }
  }
}
