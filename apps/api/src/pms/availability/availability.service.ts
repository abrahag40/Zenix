import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'

// UTC day boundary helper — independiente de la TZ del runtime del server.
// date-fns startOfDay() usa TZ local y rompe day-level overlap cuando el
// proceso corre fuera de UTC (ver comentario inline en `check`).
function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
import {
  ChannexGateway,
  ChannexInventoryUpdate,
} from '../../integrations/channex/channex.gateway'
import {
  CHANNEX_AVAILABILITY_CHANGED,
  ChannexAvailabilityChangedEvent,
} from '../../integrations/channex/outbound/channex-outbound-events'

// ── AvailabilityService ─────────────────────────────────────────────────────
//
// Single source of truth for "is this room bookable in this range?".
// Combines:
//   (a) LOCAL  — GuestStay + StaySegment + SmartBlock queries
//   (b) REMOTE — Channex allotment (Sprint 8+, via ChannexGateway)
//
// Every feature that reserves/releases inventory MUST go through this service.
// Direct queries to GuestStay/StaySegment from feature services for availability
// checks are considered tech debt (see CLAUDE.md §29).

export interface AvailabilityCheckDto {
  roomId: string
  from: Date
  to: Date
  /** Exclude these segments/stays from the local check (they belong to the caller) */
  excludeSegmentIds?: string[]
  excludeStayIds?: string[]
  /** When the journey is being rearranged (split/move), all of its segments are excluded */
  excludeJourneyId?: string
}

export interface AvailabilityConflict {
  source: 'LOCAL_STAY' | 'LOCAL_SEGMENT' | 'LOCAL_BLOCK' | 'CHANNEX'
  id: string
  label: string      // human-readable ("Pedro & Carmen Vega", "Mantenimiento", "Booking.com")
  from: Date
  to: Date
}

export interface AvailabilityResult {
  available: boolean
  conflicts: AvailabilityConflict[]
  /** True if Channex was consulted; false if only local DB was checked */
  checkedChannex: boolean
}

export interface ReservationNotification {
  roomId: string
  from: Date
  to: Date
  reason: ChannexInventoryUpdate['reason']
  traceId: string
}

/**
 * Stay overstayed (zombie): `scheduledCheckout` ya pasó pero `actualCheckout=null`.
 * AvailabilityService los excluye del check; este shape los expone para reports
 * y dashboard widget (contabilidad necesita ubicar saldos pendientes).
 */
export interface OverstayedStay {
  id: string
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  roomId: string
  roomNumber: string | null
  roomCategory: string | null
  checkinAt: Date
  scheduledCheckout: Date
  actualCheckin: Date | null
  source: string | null
  bookingRef: string | null
  paymentStatus: string
  totalCharges: number
  totalPayments: number
  outstandingBalance: number
  hoursOverdue: number
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly channex: ChannexGateway,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Check a room's availability in a date range against local DB and Channex.
   *
   * Half-open interval [from, to): a checkout on `to` does NOT conflict with a
   * check-in on `to`.
   *
   * Local query covers three entities:
   *   - GuestStay        (direct reservations, pre-journey era)
   *   - StaySegment      (per-segment availability: extensions, splits, moves)
   *   - SmartBlock       (maintenance, out-of-service)
   *
   * Channex pull is best-effort: if the gateway is disabled or fails, we fall
   * back to local-only. Never silently pass: if Channex reports conflict, we
   * MUST reject.
   */
  async check(dto: AvailabilityCheckDto): Promise<AvailabilityResult> {
    const conflicts: AvailabilityConflict[] = []

    // 2026-05-15 — Same-day turnover bug fix. Antes:
    //   `scheduledCheckout: { gt: dto.from }`
    // comparaba hora-exacta. Si el guest saliente termina al mediodía y la
    // nueva reserva llegaba el form como midnight (00:00 UTC del mismo día),
    // 12:00 > 00:00 → conflict falso. Estándar industria (Mews, Cloudbeds,
    // Opera) + Channex/Booking/Expedia envían fechas-DAY (no horas):
    // same-day turnover debe permitirse SIEMPRE.
    //
    // Nueva lógica: comparamos al día.
    //   existing.checkOutDay > new.checkInDay  ⇔
    //   existing.scheduledCheckout >= dayAfter(new.checkIn)
    // Para Yuki (sale May 15 12:00) y nuevo huésped (entra May 15 cualquier
    // hora): dayAfterCheckin = May 16 00:00 → 12:00 < May 16 → false → no
    // conflict (turnover normal). Para overlap real (existing termina May 16
    // y nuevo entra May 15): May 16 noon >= May 16 00:00 → true → conflict ✓
    //
    // IMPORTANTE: usamos UTC day boundaries (Date.UTC), NO date-fns startOfDay,
    // porque éste interpreta en la TZ local del runtime del server. Si el server
    // corre fuera de UTC, `startOfDay(2026-05-17T00:00:00Z)` cae en 2026-05-16
    // local y desplaza el rango — Abraham Aaa (checkout 17T17:00Z) aparece como
    // conflict para un check-in 17→18 que debería ser turnover válido.
    const newCheckInDay  = utcStartOfDay(dto.from)
    const newCheckOutDay = utcStartOfDay(dto.to)
    const dayAfterNewCheckIn = new Date(newCheckInDay.getTime() + 86400000)

    // ── Overstayed/zombie stays — Sprint AVAIL-OVERSTAY (2026-05-19) ─────────
    // Stay con `actualCheckout=null` cuya `scheduledCheckout` ya pasó. Operación
    // real: el huésped se fue pero recepción nunca confirmó la salida; o cambió
    // dueño de turno; o cayó la conexión justo en el checkout. Resultado: el
    // bloque queda zombie en el calendario y bloquea re-bookings legítimos
    // (caso reportado 2026-05-18: drag Elena A1→A2 rechazado porque Carlos
    // tiene `scheduledCheckout` de hace días y `actualCheckout=null`).
    //
    // Política Option B (user-approved 2026-05-19):
    //   1. AvailabilityService los trata como salidos → libera inventario.
    //   2. OverstayService.findOverstayed() los retorna para reports + dashboard
    //      → contabilidad encuentra el saldo pendiente sin que el sistema
    //      "esconda" el problema.
    //
    // Cutoff = startOfDay(today). Un stay con `scheduledCheckout=ayer` ya es
    // zombie a partir de las 00:00 UTC de hoy. No usamos +24h grace porque
    // recepcionistas suelen confirmar el día de la salida, no al día siguiente.
    const zombieCutoff = utcStartOfDay(new Date())
    // Combinamos `dayAfterNewCheckIn` (day-level overlap) con `zombieCutoff`
    // (overstayed filter): el stay debe tener checkout >= ambos. Si Elena
    // arrastra con `from=su.checkIn` (en pasado), `dayAfterNewCheckIn` cae en
    // el pasado → solo `zombieCutoff` discrimina; los zombies quedan fuera.
    const effectiveCheckoutCutoff = new Date(
      Math.max(dayAfterNewCheckIn.getTime(), zombieCutoff.getTime())
    )

    // ── Local: direct GuestStay rows (excluding no-shows and checked-out) ────
    // Cuando se pasa excludeJourneyId, también excluimos la GuestStay padre del
    // journey: el caller está reorganizando esa estadía completa (extensión,
    // ROOM_MOVE, split) y la reserva original NO debe colisionar consigo misma.
    // Sin este filtro, extender Kevin Park en su propia habitación → 409 contra
    // su propio nombre, regresión observada tras la migración a este servicio.
    const excludeStayIds = dto.excludeStayIds ?? []
    const staysOnRoom = await this.prisma.guestStay.findMany({
      where: {
        roomId: dto.roomId,
        id: { notIn: excludeStayIds },
        deletedAt: null,
        actualCheckout: null,
        noShowAt: null,
        cancelledAt: null,  // Sprint CANCEL-ARCHIVE: cancelled stays liberan inventario
        // NOT { stayJourney: { id } } (en vez de stayJourney.id: { not }) para
        // que stays SIN journey (legacy/seed) NO sean excluidas — Prisma trata
        // la ausencia de relación como "no matchea el filtro positivo".
        ...(dto.excludeJourneyId
          ? { NOT: { stayJourney: { id: dto.excludeJourneyId } } }
          : {}),
        // Day-level overlap + zombie filter (combined en `effectiveCheckoutCutoff`).
        checkinAt: { lt: newCheckOutDay },
        scheduledCheckout: { gte: effectiveCheckoutCutoff },
      },
      select: { id: true, guestName: true, checkinAt: true, scheduledCheckout: true },
    })
    for (const s of staysOnRoom) {
      conflicts.push({
        source: 'LOCAL_STAY',
        id: s.id,
        label: s.guestName,
        from: s.checkinAt,
        to: s.scheduledCheckout,
      })
    }

    // ── Local: StaySegment (the journey model) ──────────────────────────────
    // Exclude segments whose parent stay has been marked no-show or has already
    // departed — CLAUDE.md §17 (no-shows release inventory) and §11 (actualCheckout
    // releases too). markAsNoShow sets GuestStay.noShowAt and StayJourney.status =
    // NO_SHOW but does NOT cascade status changes onto StaySegment rows, so the
    // segments remain ACTIVE in DB and would otherwise still create phantom conflicts.
    const excludeSegmentIds = dto.excludeSegmentIds ?? []
    const segmentsOnRoom = await this.prisma.staySegment.findMany({
      where: {
        roomId: dto.roomId,
        id: { notIn: excludeSegmentIds },
        status: { in: ['ACTIVE', 'PENDING'] },
        ...(dto.excludeJourneyId
          ? { journeyId: { not: dto.excludeJourneyId } }
          : {}),
        // Day-level overlap + zombie filter, mismo razonamiento que GuestStay arriba.
        // El stay padre del journey también debe pasar el cutoff de overstayed:
        // si su `scheduledCheckout < zombieCutoff`, todos sus segments son zombies.
        checkIn: { lt: newCheckOutDay },
        checkOut: { gte: effectiveCheckoutCutoff },
        journey: {
          guestStay: {
            noShowAt: null,
            actualCheckout: null,
            cancelledAt: null,
            scheduledCheckout: { gte: zombieCutoff },
          },
        },
      },
      include: { journey: { select: { guestName: true } } },
    })
    for (const seg of segmentsOnRoom) {
      conflicts.push({
        source: 'LOCAL_SEGMENT',
        id: seg.id,
        label: seg.journey.guestName,
        from: seg.checkIn,
        to: seg.checkOut,
      })
    }

    // ── Local: RoomBlock (OOO / OOS / maintenance). endDate=null = indefinite ─
    // Day-level overlap consistente con GuestStay/StaySegment arriba.
    const blocksOnRoom = await this.prisma.roomBlock.findMany({
      where: {
        roomId: dto.roomId,
        status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'APPROVED'] },
        startDate: { lt: newCheckOutDay },
        OR: [{ endDate: null }, { endDate: { gte: dayAfterNewCheckIn } }],
      },
      select: { id: true, reason: true, startDate: true, endDate: true },
    })
    for (const b of blocksOnRoom) {
      conflicts.push({
        source: 'LOCAL_BLOCK',
        id: b.id,
        label: `Bloqueo: ${b.reason}`,
        from: b.startDate,
        to: b.endDate ?? dto.to,
      })
    }

    // ── Remote: Channex pull ────────────────────────────────────────────────
    // Map internal roomId → Channex roomTypeId. Sprint 8 will add a
    // RoomTypeMapping table; for now we pass roomId as a stand-in.
    let checkedChannex = false
    if (this.channex.enabled) {
      try {
        const pull = await this.channex.pullAvailability({
          roomTypeId: dto.roomId,
          dateFrom: dto.from,
          dateTo: dto.to,
        })
        checkedChannex = pull.fromChannex
        for (const slot of pull.slots) {
          if (slot.available < 1 || slot.stopSell) {
            conflicts.push({
              source: 'CHANNEX',
              id: `channex-${slot.roomTypeId}-${slot.date}`,
              label: slot.stopSell ? 'Channex: stop-sell' : 'Channex: sin allotment',
              from: new Date(slot.date),
              to: new Date(slot.date),
            })
          }
        }
      } catch (err) {
        // Policy: on Channex error we treat it as a soft-fail and continue with
        // local check. Log so ops can spot systemic issues. Sprint 8 may decide
        // to harden this to fail-closed for critical operations.
        this.logger.error(
          `Channex pull failed for room=${dto.roomId}: ${(err as Error).message}`,
        )
      }
    }

    return { available: conflicts.length === 0, conflicts, checkedChannex }
  }

  /**
   * Find overstayed (zombie) stays in a property — `scheduledCheckout` ya pasó
   * pero `actualCheckout=null`. Visible para reports + dashboard widget.
   *
   * Sprint AVAIL-OVERSTAY (2026-05-19). Counterpart de la lógica zombie en
   * `check()`: lo que availability ignora, este método expone.
   *
   * Incluye `balanceProjection`-style data: `totalCharges`, `totalPayments` y
   * `outstandingBalance` (computado client-side por el caller — aquí solo
   * devolvemos los datos crudos para que el módulo de reports decida formato).
   */
  async findOverstayed(propertyId: string): Promise<OverstayedStay[]> {
    const zombieCutoff = utcStartOfDay(new Date())
    const stays = await this.prisma.guestStay.findMany({
      where: {
        propertyId,
        deletedAt: null,
        actualCheckout: null,
        noShowAt: null,
        cancelledAt: null,
        scheduledCheckout: { lt: zombieCutoff },
      },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        roomId: true,
        room: { select: { number: true, category: true } },
        checkinAt: true,
        scheduledCheckout: true,
        actualCheckin: true,
        source: true,
        bookingRef: true,
        paymentStatus: true,
        totalAmount: true,
        amountPaid: true,
      },
      orderBy: { scheduledCheckout: 'asc' },
    })

    const now = new Date()
    return stays.map((s) => {
      const totalCharges = Number(s.totalAmount ?? 0)
      const totalPayments = Number(s.amountPaid ?? 0)
      const outstandingBalance = totalCharges - totalPayments
      const hoursOverdue = Math.floor(
        (now.getTime() - s.scheduledCheckout.getTime()) / (60 * 60 * 1000)
      )
      return {
        id: s.id,
        guestName: s.guestName,
        guestEmail: s.guestEmail,
        guestPhone: s.guestPhone,
        roomId: s.roomId,
        roomNumber: s.room?.number ?? null,
        roomCategory: s.room?.category ?? null,
        checkinAt: s.checkinAt,
        scheduledCheckout: s.scheduledCheckout,
        actualCheckin: s.actualCheckin,
        source: s.source,
        bookingRef: s.bookingRef,
        paymentStatus: s.paymentStatus,
        totalCharges,
        totalPayments,
        outstandingBalance,
        hoursOverdue,
      }
    })
  }

  /**
   * Notify Channex that a room has been reserved locally. Fire-and-forget:
   * failures are logged, never thrown. Callers commit locally first, then call
   * this so a Channex outage cannot block the business operation.
   */
  async notifyReservation(n: ReservationNotification): Promise<void> {
    await this.notifyChannex(n, -1)
  }

  /**
   * Notify Channex that a room is freed (opposite of notifyReservation).
   */
  async notifyRelease(n: ReservationNotification): Promise<void> {
    await this.notifyChannex(n, +1)
  }

  /**
   * Resuelve los IDs Channex correctos antes de hacer push. Sin este paso,
   * `notifyReservation` enviaba `roomId` interno (UUID Zenix) como
   * `room_type_id` de Channex — Channex respondería 404 al activar la
   * integración. Pattern alineado con `computeAndPushInventory` (que ya
   * resuelve IDs correctamente para el modelo absoluto de hostal).
   *
   * Skip silencioso si:
   *   - Channex no está enabled (sin CHANNEX_API_KEY)
   *   - Room no tiene channexRoomTypeId configurado
   *   - PropertySettings no tiene channexPropertyId configurado
   *
   * §31 fail-soft: nunca lanza excepción. La operación local ya está commiteada.
   */
  private async notifyChannex(n: ReservationNotification, delta: -1 | 1): Promise<void> {
    if (!this.channex.enabled) return
    try {
      const room = await this.prisma.room.findUnique({
        where: { id: n.roomId },
        select: { propertyId: true, channexRoomTypeId: true },
      })
      if (!room?.channexRoomTypeId) return

      const settings = await this.prisma.propertySettings.findUnique({
        where: { propertyId: room.propertyId },
        select: { channexPropertyId: true },
      })
      if (!settings?.channexPropertyId) return

      // Sprint CHANNEX-OUTBOUND-CERT Day 3 — refactor AP-2.2.
      // Antes: `await this.channex.pushInventory(...)` direct desde el save
      // handler (violación cert AP-2.2 — Channex caído bloqueaba el save).
      // Ahora: emit domain event → OutboxBuilder enqueue → Worker drain.
      // Save handler retorna inmediato; resiliente a outages de Channex.
      //
      // Absolute model (hotel: 1 unit per room_type):
      //   delta=+1 (release)    → availability=1 absolute
      //   delta=-1 (reservation) → availability=0 absolute
      // Para hostel dorms con multi-unit, computeAndPushInventory ya usa el
      // path correcto con compute absoluto per date.
      const event: ChannexAvailabilityChangedEvent = {
        propertyId: room.propertyId,
        entries: [
          {
            propertyId: settings.channexPropertyId,
            roomTypeId: room.channexRoomTypeId,
            dateFrom: n.from.toISOString().slice(0, 10),
            dateTo: n.to.toISOString().slice(0, 10),
            availability: delta > 0 ? 1 : 0,
          },
        ],
      }
      this.events.emit(CHANNEX_AVAILABILITY_CHANGED, event)
    } catch (err) {
      this.logger.error(
        `notifyChannex (delta=${delta}) failed trace=${n.traceId}: ${(err as Error).message}`,
      )
    }
  }

  /**
   * Compute absolute availability per date for a dorm room and push to Channex.
   *
   * Designed for hostels where a room_type in Channex = 1 dorm with N beds.
   * Channex expects absolute counts (availability=3 means "3 beds free today"),
   * not deltas. This guarantees idempotency: re-syncing always produces the
   * correct state regardless of prior pushes.
   *
   * Algorithm per date:
   *   available = max(0, totalUnits - activeStays - activeSegments - blockedSlots)
   *   where blockedSlots = totalUnits (room-level block) or 1 (unit-level block)
   *
   * Best-effort (CLAUDE.md §31): never throws, logs on failure.
   */
  async computeAndPushInventory(roomId: string, dates: Date[]): Promise<void> {
    if (!this.channex.enabled) return
    if (dates.length === 0) return

    try {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: {
          propertyId: true,
          channexRoomTypeId: true,
          units: { select: { id: true } },
        },
      })
      if (!room?.channexRoomTypeId) return

      const settings = await this.prisma.propertySettings.findUnique({
        where: { propertyId: room.propertyId },
        select: { channexPropertyId: true },
      })
      if (!settings?.channexPropertyId) return

      const channexPropertyId = settings.channexPropertyId
      const channexRoomTypeId  = room.channexRoomTypeId
      const totalUnits         = room.units.length
      if (totalUnits === 0) return

      const firstDate     = dates[0]
      const lastDate      = dates[dates.length - 1]
      const dayAfterLast  = new Date(lastDate)
      dayAfterLast.setUTCDate(dayAfterLast.getUTCDate() + 1)

      // 3 bulk queries for the full range — processed in-memory per date
      const [stays, segments, blocks] = await Promise.all([
        this.prisma.guestStay.findMany({
          where: {
            roomId,
            actualCheckout:    null,
            noShowAt:          null,
            checkinAt:         { lt: dayAfterLast },
            scheduledCheckout: { gt: firstDate },
          },
          select: { checkinAt: true, scheduledCheckout: true },
        }),
        this.prisma.staySegment.findMany({
          where: {
            roomId,
            status:   { in: ['ACTIVE', 'PENDING'] },
            checkIn:  { lt: dayAfterLast },
            checkOut: { gt: firstDate },
          },
          select: { checkIn: true, checkOut: true },
        }),
        // Room-level blocks (roomId set) OR unit-level blocks (unit.roomId matches)
        this.prisma.roomBlock.findMany({
          where: {
            status:    'ACTIVE',
            startDate: { lte: lastDate },
            AND: [
              { OR: [{ endDate: null }, { endDate: { gt: firstDate } }] },
              { OR: [{ roomId }, { unit: { roomId } }] },
            ],
          },
          select: { roomId: true, unitId: true, startDate: true, endDate: true },
        }),
      ])

      const traceId = `abs-sync-${roomId}-${Date.now()}`
      const entries: { date: string; available: number }[] = []

      for (const date of dates) {
        // Exclusive upper bound of the day (next midnight UTC)
        const dEnd = new Date(date)
        dEnd.setUTCDate(dEnd.getUTCDate() + 1)

        const staysOnDay = stays.filter(
          (s) => s.checkinAt < dEnd && s.scheduledCheckout > date,
        ).length

        const segsOnDay = segments.filter(
          (s) => s.checkIn < dEnd && s.checkOut > date,
        ).length

        // Room-level block occupies all N units; unit-level block occupies 1
        let blockedSlots = 0
        for (const b of blocks) {
          const bEnd = b.endDate ?? dayAfterLast
          if (b.startDate <= date && bEnd > date) {
            blockedSlots += b.roomId ? totalUnits : 1
          }
        }

        const available = Math.max(0, totalUnits - staysOnDay - segsOnDay - blockedSlots)
        entries.push({ date: date.toISOString().slice(0, 10), available })
      }

      // Sprint CHANNEX-OUTBOUND-CERT Day 3 — refactor AP-2.2.
      // Antes: direct push (best-effort fire-and-forget). Ahora emit event
      // → OutboxBuilder enqueue → Worker drain con rate limit + retry.
      // Misma data, distinto path: save handler ya no bloquea en Channex.
      const event: ChannexAvailabilityChangedEvent = {
        propertyId: room.propertyId,
        entries: entries.map((e) => ({
          propertyId: channexPropertyId,
          roomTypeId: channexRoomTypeId,
          date: e.date,
          availability: e.available,
        })),
      }
      this.events.emit(CHANNEX_AVAILABILITY_CHANGED, event)
      this.logger.debug(
        `[computeAndPushInventory] emitted channex.availability.changed ` +
          `roomId=${roomId} entries=${entries.length} trace=${traceId}`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[computeAndPushInventory] roomId=${roomId}: ${msg}`)
    }
  }
}
