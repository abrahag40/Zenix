/**
 * StayoverScheduler — cron multi-timezone para limpieza de estadía (in-house cleaning).
 *
 * Decisión arquitectónica D14 (CLAUDE.md §54):
 *   La limpieza de camas ocupadas (sin checkout planificado para hoy) es un
 *   estándar industrial diferenciado por tipo de propiedad:
 *
 *     - HOTEL          → DAILY (AHLEI Sec. 4.2.1, Marriott/Hilton/IHG)
 *     - HOSTAL         → NEVER (encuesta LATAM 2023: 87% no limpian stayovers)
 *     - VACATION_RENTAL → NEVER (solo limpieza pre-checkout)
 *
 *   Configurable per-property vía PropertySettings.stayoverFrequency.
 *
 * Flujo:
 *   1. Cron cada 15 min recorre todas las propiedades activas.
 *   2. Para cada una con stayoverFrequency != NEVER:
 *      - Verifica hora local ≥ stayoverHour (default 8 AM, 1h post MorningRoster)
 *      - Verifica idempotencia (stayoverProcessedDate != localDate)
 *      - Por cada GuestStay activo (in-house) sin checkout hoy:
 *          · Aplica regla de frecuencia (DAILY siempre / EVERY_2_DAYS / etc.)
 *          · Si aplica: crea CleaningTask(taskType=STAYOVER, priority=LOW)
 *          · Auto-asigna via AssignmentService
 *      - Marca stayoverProcessedDate = localDate
 *      - Emite SSE 'stayover:published' con resumen
 *
 * Idempotencia:
 *   `stayoverProcessedDate` actúa como semáforo (mismo patrón que
 *   MorningRosterScheduler / NightAuditScheduler). Si el cron dispara dos
 *   veces en el mismo día local, la segunda es no-op.
 *
 * Por qué cron separado del MorningRoster (no fusionar):
 *   1. Concerns separados — MorningRoster trabaja sobre checkouts predichos;
 *      Stayover trabaja sobre estadías activas. Mezclarlos hace el código
 *      menos legible y más difícil de testear.
 *   2. Hora distinta — MorningRoster a las 7 AM (housekeeper recién llega);
 *      Stayover a las 8 AM (las habitaciones de checkout ya están en marcha,
 *      y el housekeeper puede ver las stayovers cuando termine las urgentes).
 *   3. Setting independiente — `stayoverFrequency` puede cambiar sin afectar
 *      el roster de checkout (que es siempre obligatorio).
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import {
  CleaningStatus,
  Priority,
  TaskType,
  TaskLogEvent,
  StayoverFrequency,
} from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AssignmentService } from '../assignment/assignment.service'
import { NotificationsService } from '../notifications/notifications.service'

function toLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toLocalHour(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(date)
  return Number(formatted) % 24
}

/**
 * Days between two dates by calendar-day comparison (NOT raw ms).
 * Normaliza ambas fechas a su midnight UTC para evitar que la hora del checkin
 * (e.g. 10 AM) cuente como día parcial. Devuelve siempre un entero.
 */
function daysBetween(earlier: Date, later: Date): number {
  const earlierDay = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate())
  const laterDay = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate())
  return Math.round((laterDay - earlierDay) / (24 * 60 * 60 * 1000))
}

export interface StayoverRunResult {
  propertyId: string
  newTasks: number
  skippedByFrequency: number
  skippedExisting: number
  skipped?: 'NEVER' | 'BEFORE_HOUR' | 'ALREADY_PROCESSED' | 'NO_PROPERTY'
}

@Injectable()
export class StayoverScheduler {
  private readonly logger = new Logger(StayoverScheduler.name)

  constructor(
    private prisma: PrismaService,
    private assignment: AssignmentService,
    private notifications: NotificationsService,
  ) {}

  /** Cron entry-point. Cada 15 min para baja latencia multi-timezone. */
  @Cron('*/15 * * * *')
  async runAll() {
    const allSettings = await this.prisma.propertySettings.findMany({
      select: { propertyId: true, property: { select: { isActive: true } } },
    })

    let processed = 0
    for (const s of allSettings) {
      if (!s.property?.isActive) continue
      try {
        const result = await this.runForProperty(s.propertyId)
        if (!result.skipped) processed++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.error(`[Stayover] property=${s.propertyId} error: ${msg}`)
      }
    }
    if (processed > 0) {
      this.logger.log(`[Stayover] ciclo completado — propiedades procesadas: ${processed}`)
    }
  }

  /** Procesa el stayover roster para una propiedad. */
  async runForProperty(
    propertyId: string,
    opts: { force?: boolean } = {},
  ): Promise<StayoverRunResult> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: {
        propertyId: true,
        timezone: true,
        stayoverFrequency: true,
        stayoverHour: true,
        stayoverProcessedDate: true,
        autoAssignmentEnabled: true,
        property: { select: { isActive: true, organizationId: true } },
      },
    })

    if (!settings || !settings.property) {
      return { propertyId, newTasks: 0, skippedByFrequency: 0, skippedExisting: 0, skipped: 'NO_PROPERTY' }
    }

    // Guarda 0: política deshabilitada
    if (settings.stayoverFrequency === StayoverFrequency.NEVER) {
      return { propertyId, newTasks: 0, skippedByFrequency: 0, skippedExisting: 0, skipped: 'NEVER' }
    }

    const tz = settings.timezone || 'UTC'
    const now = new Date()
    const localDate = toLocalDate(now, tz)
    const localHour = toLocalHour(now, tz)

    // Guarda 1: hora local aún no llegó al stayoverHour
    if (!opts.force && localHour < settings.stayoverHour) {
      return { propertyId, newTasks: 0, skippedByFrequency: 0, skippedExisting: 0, skipped: 'BEFORE_HOUR' }
    }

    // Guarda 2: idempotencia
    if (!opts.force) {
      const lastProcessed = settings.stayoverProcessedDate
        ? toLocalDate(settings.stayoverProcessedDate, tz)
        : null
      if (lastProcessed === localDate) {
        return { propertyId, newTasks: 0, skippedByFrequency: 0, skippedExisting: 0, skipped: 'ALREADY_PROCESSED' }
      }
    }

    const localDateMidnightUtc = new Date(`${localDate}T00:00:00.000Z`)
    const dayEnd = new Date(localDateMidnightUtc.getTime() + 24 * 60 * 60 * 1000 - 1)
    const orgId = settings.property.organizationId

    // ── Estadías in-house: actualCheckin != null, actualCheckout == null,
    //    sin scheduledCheckout para hoy (esos los maneja MorningRoster).
    const stays = await this.prisma.guestStay.findMany({
      where: {
        organizationId: orgId ?? undefined,
        propertyId,
        deletedAt: null,
        actualCheckin: { not: null },
        actualCheckout: null,
        noShowAt: null,
        // Excluir estadías cuyo scheduledCheckout es hoy (MorningRoster ya las cubre)
        OR: [
          { scheduledCheckout: { lt: localDateMidnightUtc } },
          { scheduledCheckout: { gt: dayEnd } },
        ],
      },
      select: {
        id: true,
        roomId: true,
        actualCheckin: true,
        room: { select: { id: true, units: { select: { id: true } } } },
      },
    })

    let newTasks = 0
    let skippedByFrequency = 0
    let skippedExisting = 0

    for (const stay of stays) {
      // Aplica regla de frecuencia
      if (!this.shouldGenerateForStay(stay.actualCheckin, localDateMidnightUtc, settings.stayoverFrequency)) {
        skippedByFrequency++
        continue
      }

      for (const unit of stay.room.units) {
        // Idempotencia per-unit: si ya existe tarea STAYOVER para hoy en esta unit, saltar
        const existing = await this.prisma.cleaningTask.findFirst({
          where: {
            unitId: unit.id,
            scheduledFor: localDateMidnightUtc,
            taskType: TaskType.STAYOVER,
            status: { notIn: [CleaningStatus.CANCELLED] },
          },
          select: { id: true },
        })
        if (existing) {
          skippedExisting++
          continue
        }

        const task = await this.prisma.cleaningTask.create({
          data: {
            organizationId: orgId,
            unitId: unit.id,
            status: CleaningStatus.UNASSIGNED,
            taskType: TaskType.STAYOVER,
            requiredCapability: 'CLEANING',
            priority: Priority.LOW,                   // checkouts tienen prioridad
            hasSameDayCheckIn: false,
            scheduledFor: localDateMidnightUtc,
          },
        })
        await this.prisma.taskLog.create({
          data: {
            taskId: task.id,
            staffId: null,
            event: TaskLogEvent.STAYOVER_CREATED,
            note: `stayover roster (frequency=${settings.stayoverFrequency})`,
          },
        })

        // Auto-asignar si está habilitado (D10 — toda tarea pasa por autoAssign)
        if (settings.autoAssignmentEnabled !== false) {
          await this.assignment.autoAssign(task.id, now)
        }

        newTasks++
      }
    }

    // Marcar idempotencia
    if (!opts.force) {
      await this.prisma.propertySettings.update({
        where: { propertyId },
        data: { stayoverProcessedDate: localDateMidnightUtc },
      })
    }

    // SSE: stayover:published
    this.notifications.emit(propertyId, 'stayover:published', {
      date: localDate,
      newTasks,
      skippedByFrequency,
      skippedExisting,
    })

    this.logger.log(
      `[Stayover] property=${propertyId} tz=${tz} date=${localDate} ` +
        `freq=${settings.stayoverFrequency} new=${newTasks} skippedFreq=${skippedByFrequency} skippedExisting=${skippedExisting}`,
    )

    return { propertyId, newTasks, skippedByFrequency, skippedExisting }
  }

  /**
   * Decide si para esta estadía y este día corresponde generar una tarea STAYOVER
   * según la frecuencia configurada de la propiedad.
   */
  private shouldGenerateForStay(
    actualCheckin: Date | null,
    todayLocalUtc: Date,
    // Prisma genera tipo string literal; aceptamos string para evitar
    // doble-tipado entre `@zenix/shared` enum y el tipo de Prisma.
    frequency: StayoverFrequency | string,
  ): boolean {
    if (!actualCheckin) return false  // sin check-in confirmado, no aplica

    switch (frequency) {
      case StayoverFrequency.NEVER:
        return false
      case StayoverFrequency.DAILY:
        return true
      case StayoverFrequency.EVERY_2_DAYS: {
        const days = daysBetween(actualCheckin, todayLocalUtc)
        return days > 0 && days % 2 === 0
      }
      case StayoverFrequency.EVERY_3_DAYS: {
        const days = daysBetween(actualCheckin, todayLocalUtc)
        return days > 0 && days % 3 === 0
      }
      case StayoverFrequency.ON_REQUEST:
        // Sin GuestPreference yet — siempre skip (huésped opt-in pendiente Roadmap P6)
        return false
      case StayoverFrequency.GUEST_PREFERENCE:
        // Sin GuestPreference yet — fallback NEVER hasta Roadmap P6
        return false
      default:
        return false
    }
  }
}
