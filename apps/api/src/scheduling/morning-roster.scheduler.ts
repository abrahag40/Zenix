/**
 * MorningRosterScheduler — cron 7am multi-timezone para housekeeping.
 *
 * Para cada propiedad, en su hora local configurada (PropertySettings.morningRosterHour,
 * default 7), genera el roster del día:
 *
 *   1. CARRYOVER: tareas incompletas de ayer → clonadas a hoy con priority URGENT
 *      y campo carryoverFromTaskId (audit chain). La original se cancela con
 *      cancelledReason=DUPLICATE para no contaminar reportes.
 *
 *   2. PREDICTED CHECKOUTS: por cada GuestStay con scheduledCheckout=hoy y
 *      sin actualCheckout/noShowAt → si NO existe ya CleaningTask para esa
 *      Unit con scheduledFor=today → crearla en PENDING.
 *
 *   3. AUTO-ASSIGN: cada tarea creada/recuperada se pasa por AssignmentService.
 *      autoAssign() → COVERAGE_PRIMARY → BACKUP → ROUND_ROBIN.
 *
 *   4. NOTIFICATIONS: por cada housekeeper con tareas hoy, se envía un push
 *      "Tu día de hoy: N habitaciones (M con check-in mismo día 🔴, K carryover ⚠️)".
 *      Plus: NotificationCenter category SYSTEM para inbox persistente.
 *
 *   5. IDEMPOTENCIA: PropertySettings.morningRosterDate se actualiza al final.
 *      Si el cron dispara dos veces en el mismo día local, la segunda es no-op.
 *
 * Multi-timezone (CRÍTICO):
 *   Mismo patrón que NightAuditScheduler (§14, §15 CLAUDE.md). Usa
 *   Intl.DateTimeFormat con la timezone de cada propiedad. Cron cada 15 min
 *   (más frecuente que night audit por ser tarea operativa de mañana).
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { CleaningStatus, Priority, TaskLogEvent, CleaningCancelReason } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AssignmentService } from '../assignment/assignment.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'

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

export interface RosterRunResult {
  propertyId: string
  carryoverTasks: number
  newTasks: number
  reusedTasks: number
  staffNotified: number
  skipped?: 'BEFORE_HOUR' | 'ALREADY_PROCESSED' | 'NO_PROPERTY'
}

@Injectable()
export class MorningRosterScheduler {
  private readonly logger = new Logger(MorningRosterScheduler.name)

  constructor(
    private prisma: PrismaService,
    private assignment: AssignmentService,
    private notifications: NotificationsService,
    private push: PushService,
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
        this.logger.error(`[MorningRoster] property=${s.propertyId} error: ${msg}`)
      }
    }
    if (processed > 0) {
      this.logger.log(`[MorningRoster] ciclo completado — propiedades procesadas: ${processed}`)
    }
  }

  /**
   * Procesa el roster para una propiedad específica.
   *
   * @param propertyId  Propiedad a procesar
   * @param opts.force  Si true, ignora la guarda de hora y idempotencia (manual trigger).
   */
  async runForProperty(
    propertyId: string,
    opts: { force?: boolean } = {},
  ): Promise<RosterRunResult> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: {
        propertyId: true,
        timezone: true,
        morningRosterHour: true,
        morningRosterDate: true,
        carryoverPolicy: true,
        autoAssignmentEnabled: true,
        property: { select: { isActive: true, organizationId: true } },
      },
    })

    if (!settings || !settings.property) {
      return {
        propertyId,
        carryoverTasks: 0,
        newTasks: 0,
        reusedTasks: 0,
        staffNotified: 0,
        skipped: 'NO_PROPERTY',
      }
    }

    const tz = settings.timezone || 'UTC'
    const now = new Date()
    const localDate = toLocalDate(now, tz)
    const localHour = toLocalHour(now, tz)

    // Guarda 1: hora local aún no llegó al morningRosterHour
    if (!opts.force && localHour < settings.morningRosterHour) {
      return {
        propertyId,
        carryoverTasks: 0,
        newTasks: 0,
        reusedTasks: 0,
        staffNotified: 0,
        skipped: 'BEFORE_HOUR',
      }
    }

    // Guarda 2: idempotencia — ya procesado hoy en esta tz
    if (!opts.force) {
      const lastProcessed = settings.morningRosterDate
        ? toLocalDate(settings.morningRosterDate, tz)
        : null
      if (lastProcessed === localDate) {
        return {
          propertyId,
          carryoverTasks: 0,
          newTasks: 0,
          reusedTasks: 0,
          staffNotified: 0,
          skipped: 'ALREADY_PROCESSED',
        }
      }
    }

    const localDateMidnightUtc = new Date(`${localDate}T00:00:00.000Z`)
    const orgId = settings.property.organizationId

    // ── PASO A: Carryover de tareas incompletas de ayer ─────────────────────
    const carryoverTasks = await this.processCarryover(propertyId, orgId, localDateMidnightUtc)

    // ── PASO B: Predicción de checkouts del día ────────────────────────────
    const { newTasks, reusedTasks } = await this.processPredictedCheckouts(
      propertyId,
      orgId,
      localDateMidnightUtc,
    )

    // ── PASO C: Auto-asignación de todas las tareas con scheduledFor=today ─
    if (settings.autoAssignmentEnabled !== false) {
      const tasksToAssign = await this.prisma.cleaningTask.findMany({
        where: {
          scheduledFor: localDateMidnightUtc,
          assignedToId: null,
          status: { in: [CleaningStatus.PENDING, CleaningStatus.UNASSIGNED] },
          unit: { room: { propertyId } },
        },
        select: { id: true },
      })
      for (const t of tasksToAssign) {
        await this.assignment.autoAssign(t.id, now)
      }
    }

    // ── PASO D: Resumen + push por housekeeper ─────────────────────────────
    const staffNotified = await this.notifyStaff(propertyId, localDateMidnightUtc, localDate)

    // ── PASO E: Marcar idempotencia ────────────────────────────────────────
    if (!opts.force) {
      await this.prisma.propertySettings.update({
        where: { propertyId },
        data: { morningRosterDate: localDateMidnightUtc },
      })
    }

    // SSE: roster:published
    this.notifications.emit(propertyId, 'roster:published', {
      date: localDate,
      carryoverTasks,
      newTasks,
      staffNotified,
    })

    this.logger.log(
      `[MorningRoster] property=${propertyId} tz=${tz} date=${localDate} ` +
        `carryover=${carryoverTasks} new=${newTasks} reused=${reusedTasks} notified=${staffNotified}`,
    )

    return {
      propertyId,
      carryoverTasks,
      newTasks,
      reusedTasks,
      staffNotified,
    }
  }

  /**
   * Carryover: tareas con scheduledFor < today y status NOT IN [DONE, VERIFIED, CANCELLED]
   * → se clonan a today con priority URGENT, carryoverFromTaskId, y la original se cancela
   * con cancelledReason=DUPLICATE para evitar duplicados en reportes.
   */
  private async processCarryover(
    propertyId: string,
    orgId: string | null | undefined,
    localDateMidnightUtc: Date,
  ): Promise<number> {
    const stale = await this.prisma.cleaningTask.findMany({
      where: {
        unit: { room: { propertyId } },
        scheduledFor: { lt: localDateMidnightUtc, not: null },
        status: { notIn: [CleaningStatus.DONE, CleaningStatus.VERIFIED, CleaningStatus.CANCELLED] },
      },
      include: {
        unit: { select: { id: true, roomId: true } },
        checkout: { select: { id: true } },
      },
    })

    let count = 0

    for (const original of stale) {
      // Idempotencia: si YA existe un carryover de esta tarea para hoy, saltar
      const existing = await this.prisma.cleaningTask.findFirst({
        where: {
          carryoverFromTaskId: original.id,
          scheduledFor: localDateMidnightUtc,
        },
        select: { id: true },
      })
      if (existing) continue

      // Preserva el estado operativo original. Antes hardcodeábamos PENDING,
      // lo cual era un bug semántico:
      //   - READY (huésped ya salió, cuarto sucio) → debe seguir READY
      //   - PENDING (esperando salida) → puede seguir PENDING si stay activo
      //   - IN_PROGRESS/PAUSED → reset a READY (clean slate, housekeeper
      //     reanuda desde el inicio del shift, no recupera timer del día anterior)
      const carryoverStatus =
        original.status === CleaningStatus.READY
          ? CleaningStatus.READY
          : original.status === CleaningStatus.IN_PROGRESS ||
              original.status === CleaningStatus.PAUSED
            ? CleaningStatus.READY
            : CleaningStatus.PENDING

      // Priority semantics (fix issue reportado por usuario):
      //   URGENT    = checkout + checkin del mismo día (huésped llegando, presión de tiempo)
      //   HIGH      = importante pero sin presión inmediata (carryover sin same-day checkin)
      //   MEDIUM    = default (checkout normal del día)
      //   LOW       = stayover (in-house cleaning)
      //
      // Carryover por sí solo NO es URGENT — solo si TAMBIÉN tiene
      // hasSameDayCheckIn (combinación "doble urgente": ayer no se limpió
      // Y hoy llega huésped nuevo). Sin huésped llegando, carryover es HIGH.
      //
      // IMPORTANTE: re-evaluar hasSameDayCheckIn contra HOY (la fecha de
      // carryover), no copiar `original.hasSameDayCheckIn` (que fue computado
      // con datos de ayer). Sin esto, una tarea creada ayer cuando NO había
      // check-in para hoy se quedaría como HIGH aunque hoy sí haya un huésped
      // llegando al mismo room — perdiendo la urgencia operativa real.
      const dayEnd = new Date(localDateMidnightUtc.getTime() + 86_400_000 - 1)
      const todayCheckinCount = await this.prisma.guestStay.count({
        where: {
          roomId: original.unit.roomId,
          actualCheckin: null,
          noShowAt: null,
          checkinAt: { gte: localDateMidnightUtc, lte: dayEnd },
        },
      })
      const hasSameDayCheckIn = todayCheckinCount > 0
      const carryoverPriority = hasSameDayCheckIn
        ? Priority.URGENT  // doble: carryover + same-day checkin
        : Priority.HIGH    // solo carryover: importante pero sin presión de tiempo

      await this.prisma.$transaction(async (tx) => {
        const clone = await tx.cleaningTask.create({
          data: {
            organizationId: orgId,
            unitId: original.unitId,
            checkoutId: original.checkoutId,
            assignedToId: null,                     // se reasigna por autoAssign
            status: carryoverStatus,
            taskType: original.taskType,
            requiredCapability: original.requiredCapability,
            priority: carryoverPriority,
            hasSameDayCheckIn,
            scheduledFor: localDateMidnightUtc,
            carryoverFromDate: original.scheduledFor,
            carryoverFromTaskId: original.id,
          },
        })
        await tx.taskLog.create({
          data: {
            taskId: clone.id,
            staffId: null,
            event: TaskLogEvent.CARRYOVER,
            note: `from task ${original.id} (status: ${original.status} → ${carryoverStatus})`,
          },
        })
        // Si el carryover entró como READY, log explicit READY event para audit
        // (la tarea ya estaba lista para limpiar desde ayer — preserva trail).
        if (carryoverStatus === CleaningStatus.READY) {
          await tx.taskLog.create({
            data: {
              taskId: clone.id,
              staffId: null,
              event: TaskLogEvent.READY,
              note: `inherited READY from yesterday's carryover`,
            },
          })
        }
        // Marcar original como CANCELLED con DUPLICATE para no contar dos veces
        await tx.cleaningTask.update({
          where: { id: original.id },
          data: {
            status: CleaningStatus.CANCELLED,
            cancelledReason: CleaningCancelReason.DUPLICATE,
            cancelledAt: new Date(),
          },
        })
        await tx.taskLog.create({
          data: {
            taskId: original.id,
            staffId: null,
            event: TaskLogEvent.CANCELLED,
            note: 'auto-cancelled by carryover (replaced by new task)',
          },
        })
      })

      count++
    }

    return count
  }

  /**
   * Predice checkouts del día basado en GuestStay.scheduledCheckout Y mid-stay
   * room moves (segment-level). Crea CleaningTask(PENDING) idempotentes.
   *
   * Sprint 2026-05-17 — fix B2/B3 (caso reportado por usuario "guest extiende
   * a otra habitación + Room destino tiene checkout same-day"):
   *
   *   - ANTES: solo consideraba GuestStay.scheduledCheckout (stay-level).
   *     Mid-stay room moves (segments con checkOut=today + reason in
   *     [EXTENSION_NEW_ROOM, ROOM_MOVE]) NO disparaban task → la habitación
   *     vacated quedaba sin limpieza programada el día del move.
   *
   *   - ANTES: `hasSameDayCheckIn` solo detectaba GuestStay-level checkins.
   *     Si un guest se movía A una habitación que tenía otro checkout
   *     same-day, esa habitación NO se marcaba URGENT → la recamarista no
   *     priorizaba el cuarto donde llegaría el guest. Resultado operativo:
   *     guest esperaba 30+ min con sus maletas en recepción.
   *
   *   - AHORA: unifica fuentes en TODA dirección:
   *     · Rooms vacated today  = stay scheduledCheckout + segment moveOut
   *     · Rooms guest-arriving = stay checkinAt + segment moveIn (extension/move)
   *     Si vacated ∩ guest-arriving → URGENT. Sin intersección → MEDIUM.
   *
   * Idempotente: si ya existe CleaningTask con scheduledFor=today + unitId,
   * no duplica. Si existe pero ahora detectamos un nuevo same-day arrival,
   * eleva priority a URGENT (upgrade in place).
   */
  private async processPredictedCheckouts(
    propertyId: string,
    orgId: string | null | undefined,
    localDateMidnightUtc: Date,
  ): Promise<{ newTasks: number; reusedTasks: number }> {
    const dayEnd = new Date(localDateMidnightUtc.getTime() + 24 * 60 * 60 * 1000 - 1)

    // ── Stay-level checkouts (path histórico) ─────────────────────────────
    const stays = await this.prisma.guestStay.findMany({
      where: {
        organizationId: orgId ?? undefined,
        propertyId,
        deletedAt: null,
        actualCheckout: null,
        noShowAt: null,
        scheduledCheckout: { gte: localDateMidnightUtc, lte: dayEnd },
      },
      select: {
        id: true,
        roomId: true,
        room: {
          select: {
            id: true,
            number: true,
            units: { select: { id: true } },
          },
        },
      },
    })

    // ── Segment-level move-outs (Sprint 2026-05-17 fix B2) ────────────────
    // Segmentos ACTIVE que terminan hoy con razón de room change = guest se
    // mueve a otra room. La room ORIGINAL queda libre y necesita limpieza.
    const moveOutSegments = await this.prisma.staySegment.findMany({
      where: {
        status: 'ACTIVE',
        checkOut: { gte: localDateMidnightUtc, lte: dayEnd },
        reason: { in: ['EXTENSION_NEW_ROOM', 'ROOM_MOVE'] },
        room: { propertyId },
      },
      select: {
        id: true,
        roomId: true,
        room: {
          select: {
            id: true,
            number: true,
            units: { select: { id: true } },
          },
        },
      },
    })

    // ── Same-day check-ins (stay-level) ───────────────────────────────────
    const sameDayCheckIns = await this.prisma.guestStay.findMany({
      where: {
        organizationId: orgId ?? undefined,
        propertyId,
        deletedAt: null,
        noShowAt: null,
        checkinAt: { gte: localDateMidnightUtc, lte: dayEnd },
      },
      select: { roomId: true },
    })

    // ── Same-day move-ins (Sprint 2026-05-17 fix B3) ──────────────────────
    // Segmentos ACTIVE que arrancan hoy con razón de room change = guest
    // llega A esa habitación hoy. Esa habitación debe ser URGENT si hay
    // checkout/move-out previo el mismo día (guest esperando físicamente).
    const sameDayMoveIns = await this.prisma.staySegment.findMany({
      where: {
        status: 'ACTIVE',
        checkIn: { gte: localDateMidnightUtc, lte: dayEnd },
        reason: { in: ['EXTENSION_NEW_ROOM', 'ROOM_MOVE'] },
        room: { propertyId },
      },
      select: { roomId: true },
    })

    // Union — habitaciones donde HOY hay guest esperando llegar.
    const checkInRooms = new Set<string>([
      ...sameDayCheckIns.map((s) => s.roomId),
      ...sameDayMoveIns.map((s) => s.roomId),
    ])

    // ── Unificar fuentes de "rooms vacated today" — dedup por roomId ──────
    // Si la misma room aparece via stay-checkout Y segment-moveout (raro pero
    // defensivo), solo creamos task una vez por unit.
    const vacatedRooms = new Map<string, { units: { id: string }[]; number?: string }>()
    for (const s of stays) {
      if (s.room?.units) {
        vacatedRooms.set(s.roomId, { units: s.room.units, number: s.room.number })
      }
    }
    for (const seg of moveOutSegments) {
      if (!vacatedRooms.has(seg.roomId) && seg.room?.units) {
        vacatedRooms.set(seg.roomId, { units: seg.room.units, number: seg.room.number })
      }
    }

    let newTasks = 0
    let reusedTasks = 0

    for (const [roomId, { units }] of vacatedRooms) {
      const hasSameDayCheckIn = checkInRooms.has(roomId)
      const priority = hasSameDayCheckIn ? Priority.URGENT : Priority.MEDIUM

      for (const unit of units) {
        // Idempotencia: si ya existe una tarea para esta unit con scheduledFor=today
        const existing = await this.prisma.cleaningTask.findFirst({
          where: {
            unitId: unit.id,
            scheduledFor: localDateMidnightUtc,
            status: { notIn: [CleaningStatus.CANCELLED] },
          },
          select: { id: true, priority: true, hasSameDayCheckIn: true },
        })
        if (existing) {
          // Upgrade-in-place: si la task existía con prioridad menor y AHORA
          // detectamos un same-day arrival (ej. extension confirmada después
          // de que extendNewRoom creó eagerly la task), elevamos a URGENT.
          // Sin esto la señal "guest llegando hoy" se perdía.
          if (
            hasSameDayCheckIn &&
            (existing.priority !== Priority.URGENT || !existing.hasSameDayCheckIn)
          ) {
            await this.prisma.cleaningTask.update({
              where: { id: existing.id },
              data: { priority: Priority.URGENT, hasSameDayCheckIn: true },
            })
          }
          reusedTasks++
          continue
        }

        const newTask = await this.prisma.cleaningTask.create({
          data: {
            organizationId: orgId,
            unitId: unit.id,
            status: CleaningStatus.PENDING,
            taskType: 'CLEANING',
            requiredCapability: 'CLEANING',
            priority,
            hasSameDayCheckIn,
            scheduledFor: localDateMidnightUtc,
          },
        })
        await this.prisma.taskLog.create({
          data: {
            taskId: newTask.id,
            staffId: null,
            event: TaskLogEvent.CREATED,
            note: 'morning roster (predicted checkout/move-out)',
          },
        })
        newTasks++
      }
    }

    return { newTasks, reusedTasks }
  }

  /**
   * Genera el resumen del día por housekeeper y envía push notifications.
   * Returns el número de housekeepers notificados.
   */
  private async notifyStaff(
    propertyId: string,
    localDateMidnightUtc: Date,
    localDate: string,
  ): Promise<number> {
    const tasks = await this.prisma.cleaningTask.findMany({
      where: {
        scheduledFor: localDateMidnightUtc,
        assignedToId: { not: null },
        status: { notIn: [CleaningStatus.CANCELLED, CleaningStatus.DONE, CleaningStatus.VERIFIED] },
        unit: { room: { propertyId } },
      },
      select: {
        assignedToId: true,
        hasSameDayCheckIn: true,
        carryoverFromDate: true,
      },
    })

    const summaryByStaff = new Map<
      string,
      { total: number; sameDay: number; carryover: number; doubleUrgent: number }
    >()

    for (const t of tasks) {
      if (!t.assignedToId) continue
      const cur = summaryByStaff.get(t.assignedToId) ?? {
        total: 0,
        sameDay: 0,
        carryover: 0,
        doubleUrgent: 0,
      }
      cur.total++
      if (t.hasSameDayCheckIn) cur.sameDay++
      if (t.carryoverFromDate) cur.carryover++
      if (t.hasSameDayCheckIn && t.carryoverFromDate) cur.doubleUrgent++
      summaryByStaff.set(t.assignedToId, cur)
    }

    let notified = 0
    for (const [staffId, summary] of summaryByStaff.entries()) {
      const parts: string[] = [`${summary.total} habitaciones`]
      if (summary.doubleUrgent > 0) parts.push(`${summary.doubleUrgent} doble urgente 🔴⚠️`)
      else if (summary.sameDay > 0) parts.push(`${summary.sameDay} con check-in hoy 🔴`)
      if (summary.carryover > 0 && summary.doubleUrgent === 0)
        parts.push(`${summary.carryover} carryover ⚠️`)

      await this.push.sendToStaff(
        staffId,
        '☀️ Tu día de hoy',
        parts.join(' · '),
        {
          type: 'roster:published',
          date: localDate,
          summary,
        },
      )
      notified++
    }

    return notified
  }
}
