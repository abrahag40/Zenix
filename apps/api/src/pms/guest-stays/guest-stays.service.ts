import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { UploadsService } from '../../uploads/uploads.service'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CHANNEX_AVAILABILITY_CHANGED,
  CHANNEX_BOOKING_CANCEL_REQUESTED,
  ChannexAvailabilityChangedEvent,
  ChannexBookingCancelRequestedEvent,
} from '../../integrations/channex/outbound/channex-outbound-events'
import { TenantContextService } from '../../common/tenant-context.service'
import { EmailService } from '../../common/email/email.service'
import { titleCase } from '../../common/utils/title-case.util'
import { CreateGuestStayDto } from './dto/create-guest-stay.dto'
import { MoveRoomDto } from './dto/move-room.dto'
import type { AvailabilityConflict, RoomAvailabilityResult } from '@zenix/shared'
import { PaymentMethod, StaffRole, CleaningStatus, TaskLogEvent } from '@zenix/shared'
import { SystemRole, AuditLogStatus, AuditLogRetention } from '@prisma/client'
import { AuditOutboxService } from '../../common/audit/audit-outbox.service'
import {
  addDays,
  localYMD,
  fmtRelativeLabel,
  fmtAbsoluteLabel,
  fmtReservationDateRange,
} from '../../dashboard-reports/format.helpers'
import { Prisma } from '@prisma/client'
import { ConfirmCheckinDto } from './dto/confirm-checkin.dto'
import { RegisterPaymentDto } from './dto/register-payment.dto'
import { BulkCheckinDto } from './dto/bulk-checkin.dto'
import { RegisterCancelRefundDto } from './dto/register-cancel-refund.dto'
import { EditReservationDatesDto } from './dto/edit-reservation-dates.dto'
import {
  RESERVATION_OTA_DATES_ADJUST,
  type ReservationOtaDatesAdjustEvent,
} from '../../integrations/channex/outbound/channex-outbound-notif.service'
import {
  computeCancellationOutcome,
  DEFAULT_FREE_WINDOW_HOURS,
  DEFAULT_POLICY_TIERS,
  type PolicyTier,
} from '../cancellation/cancellation-policy.service'
import { VoidPaymentDto } from './dto/void-payment.dto'
import { UpdateGuestStayDto } from './dto/update-guest-stay.dto'
import { CreateGuestStayNoteDto, UpdateGuestStayNoteDto } from './dto/guest-stay-note.dto'
import { StayJourneyService } from '../stay-journeys/stay-journeys.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import { NotificationCenterService } from '../../notification-center/notification-center.service'
import { PushService } from '../../notifications/push.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { AssignmentService } from '../../assignment/assignment.service'
import { AvailabilityService } from '../availability/availability.service'
import { CashierShiftService } from '../cashier-shift/cashier-shift.service'

/** Maps GuestStay.source values to the single-char SRC segment of bookingRef. */
const SOURCE_CHAR: Record<string, string> = {
  booking:     'B',
  'booking.com': 'B',
  airbnb:      'A',
  hostelworld: 'H',
  expedia:     'E',
  vrbo:        'V',
  homeaway:    'V',
  tripadvisor: 'T',
  google:      'G',
  agoda:       'W',
  despegar:    'K',
  decolar:     'K',
  hotelbeds:   'R',
  sembo:       'S',
  channex:     'C',
  direct:      'D',
  direct_web:  'W', // BOOKING-ENGINE — reserva directa vía Zenix Booking (website)
}

/** Returns the local date string (YYYY-MM-DD) for a given UTC date in the specified IANA timezone. */
function toLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Returns the local hour (0-23) for a given UTC date in the specified IANA timezone. */
function toLocalHour(date: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(date),
  )
}

/**
 * PAY-8: Computes the shiftDate (midnight UTC of the property-local day) for a
 * PaymentLog. Using server UTC date silently crosses the cashier shift boundary
 * across timezones (e.g. 10pm property local = 4am UTC the next day → wrong
 * shift). Pattern mirrors night-audit.scheduler.ts.
 */
function shiftDateForTimezone(now: Date, timezone: string): Date {
  // toLocalDate returns YYYY-MM-DD in the property's IANA timezone.
  return new Date(`${toLocalDate(now, timezone)}T00:00:00.000Z`)
}

/**
 * Sprint 9 — Aggregate the cleaning status of multiple units (beds) belonging
 * to the same room into a single status per room.
 *
 * Design rationale (CLAUDE.md §54):
 *   - PRIVATE rooms (1 unit): trivial, the only task's status maps directly.
 *   - SHARED rooms (N units, dorms): the calendar shows N blocks (one per
 *     stay/bed) for the same roomId. Without a stay→unit linkage in the
 *     data model, all N blocks display the same status — which is correct
 *     operationally: when housekeeping enters a dorm, ALL beds are being
 *     serviced. The receptionist should NOT show "limpiando" on bed 1 and
 *     "esperando" on bed 2 if the housekeeper is in the room.
 *
 * Priority order (most "active" wins, mirrors animation hierarchy in CSS):
 *   IN_PROGRESS → READY → DONE → PAUSED → VERIFIED → UNASSIGNED → PENDING
 *
 * Why IN_PROGRESS > READY > DONE in this order:
 *   - IN_PROGRESS: housekeeping IS in the room → most attention (slide stripe)
 *   - READY: room available for housekeeping but they haven't entered → pulse
 *   - DONE: pending supervisor verification → glow
 *   - PAUSED: was IN_PROGRESS, less urgent than active work
 *   - VERIFIED: completed cycle, low signal
 *   - UNASSIGNED/PENDING: not yet activated, no animation needed
 *
 * Returns null when there are no active tasks for the room.
 */
const CLEANING_STATUS_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 7,
  READY:       6,
  DONE:        5,
  PAUSED:      4,
  VERIFIED:    3,
  UNASSIGNED:  2,
  PENDING:     1,
}

type CleaningTaskMin = { status: string; unit: { roomId: string } }

export function aggregateCleaningStatusByRoom(
  tasks: CleaningTaskMin[],
): Map<string, string> {
  const result = new Map<string, string>()
  for (const t of tasks) {
    const roomId = t.unit.roomId
    const current = result.get(roomId)
    const currentRank = current ? (CLEANING_STATUS_PRIORITY[current] ?? 0) : -1
    const newRank = CLEANING_STATUS_PRIORITY[t.status] ?? 0
    if (newRank > currentRank) {
      result.set(roomId, t.status)
    }
  }
  return result
}

@Injectable()
export class GuestStaysService {
  private readonly logger = new Logger(GuestStaysService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly events: EventEmitter2,
    private readonly email: EmailService,
    private readonly journeyService: StayJourneyService,
    private readonly channex: ChannexGateway,
    private readonly notifCenter: NotificationCenterService,
    private readonly assignment: AssignmentService,
    private readonly push: PushService,
    private readonly notifications: NotificationsService,
    private readonly availability: AvailabilityService,
    // Sprint AUDIT-CORE — outbox pattern para audit_log universal §165.
    // Inject opcional: si AuditModule no está cargado (tests legacy), los
    // métodos siguen funcionando — el helper hace fail-soft.
    private readonly audit: AuditOutboxService,
    // AUTO-CHECKIN §D-AC4 — resolver la foto de pre-checkin (disco) a data-URI
    // server-side para mostrarla a recepción sin exponer el GET público.
    // @Optional: specs legacy construyen el service posicionalmente sin esto.
    @Optional() private readonly uploads?: UploadsService,
    // CASH-DRAWER (D-CASH14) — liga el pago en efectivo al turno de caja abierto
    // del cajero. @Optional: specs legacy lo omiten → el link es no-op (cero
    // regresión); con la bandera cashShiftRequired apagada tampoco enforce.
    @Optional() private readonly cashierShift?: CashierShiftService,
  ) {}

  /** Generates a globally unique human-readable booking reference.
   *  Format: [CC]-[SRC]-[PROP]-[YYMM]-[SEQ]
   *  Example: MX-B-001-2604-0134
   */
  /**
   * Generar bookingRef estructurado: `[CC]-[SRC]-[propCode]-[YYMM]-[SEQ]`.
   *
   * BUG #15 fix 2026-06-04 — el primer segmento es **ISO 3166-1 country code**
   * (MX/CO/PE/CR), NO city. Antes el caller pasaba `city ?? name` → "TU" para
   * Tulum, "CA" para Cancún — rompía audit CFDI + chargeback evidence que
   * esperan ISO codes parseables.
   *
   * Si `country` no es exactamente 2 chars ISO válidos, fallback "MX" (default
   * para piloto LATAM). Validación strict de ISO en v1.0.1 Tax-CORE sprint.
   */
  private async generateBookingRef(
    propCode: string,
    country: string | null | undefined,
    source: string | null | undefined,
    checkIn: Date,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    // ISO 3166-1 alpha-2 enforce. Si no es exactamente 2 letras A-Z, fallback "MX".
    const raw = (country ?? '').toUpperCase().trim()
    const cc = /^[A-Z]{2}$/.test(raw) ? raw : 'MX'
    const src  = SOURCE_CHAR[(source ?? '').toLowerCase()] ?? 'Z'
    const yy   = String(checkIn.getFullYear()).slice(-2)
    const mm   = String(checkIn.getMonth() + 1).padStart(2, '0')
    const prefix = `${cc}-${src}-${propCode}-${yy}${mm}-`
    const count = await tx.guestStay.count({ where: { bookingRef: { startsWith: prefix } } })
    return `${prefix}${String(count + 1).padStart(4, '0')}`
  }

  async create(dto: CreateGuestStayDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()

    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId, organizationId: orgId },
      include: {
        property: {
          include: {
            settings: { select: { timezone: true } },
            // BUG #15 fix — necesitamos countryCode ISO 3166-1 de la
            // LegalEntity para el prefix del bookingRef (CFDI audit compliance).
            legalEntity: { select: { countryCode: true } },
          },
        },
      },
    })
    if (!room) throw new NotFoundException('Habitación no encontrada')

    const checkIn = new Date(dto.checkIn)
    const checkOut = new Date(dto.checkOut)

    // Validate date-range availability before mutating any state.
    // This is the authoritative backend guard — the frontend pre-flight check
    // is advisory only and cannot replace this server-side validation.
    const availability = await this.checkAvailability(dto.roomId, checkIn, checkOut)
    if (!availability.available) {
      const hard = availability.conflicts.find(c => c.severity === 'HARD')
      const soft = availability.conflicts.find(c => c.severity === 'SOFT')
      const message = hard?.guestName
        ? `La habitación ya tiene una reserva de "${hard.guestName}" que se solapa ${hard.overlapDays} noche(s) con las fechas solicitadas`
        : soft
        ? `Habitación fuera de servicio: ${room.status}`
        : 'Habitación no disponible para las fechas seleccionadas'
      throw new ConflictException({ message, conflicts: availability.conflicts })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const checkInDay = new Date(checkIn)
    checkInDay.setHours(0, 0, 0, 0)
    const isSameDayCheckin = checkInDay.getTime() === todayStart.getTime()

    // Operational status blocks ALL bookings only for MAINTENANCE / OUT_OF_SERVICE.
    // OCCUPIED / DIRTY / CHECKING_OUT are transient housekeeping states — they do NOT
    // block future or same-day reservations. Date-range availability (checkAvailability
    // above) is the authoritative inventory guard; room.status reflects physical state,
    // not calendar availability. Blocking on OCCUPIED here would prevent legitimate
    // same-day turnover (guest A checking out today while guest B checks in today).
    if (room.status === 'MAINTENANCE' || room.status === 'OUT_OF_SERVICE') {
      throw new ConflictException(`Habitación fuera de servicio: estado ${room.status}`)
    }
    const nights = Math.max(
      1,
      Math.round(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
      ),
    )
    const total = dto.ratePerNight * nights

    // CHECK-IN C1.12 (2026-05-29) — title-case en source para consistencia BI.
    // Recepción a veces tipea "aa aaa" o "JOSE PEREZ" — normalizamos antes
    // de tocar BD. Mismo helper aplicado en OTA inbound (BookingNewHandler).
    const firstName = titleCase(dto.firstName)
    const lastName  = titleCase(dto.lastName)
    const guestName = `${firstName} ${lastName}`.trim()

    // GROUP-BILLING Fase C C2 — asignar la política de cancelación default de la
    // property a la reserva nueva (per-rate-plan en v1.0.1). Null si la property
    // aún no tiene policy configurada → cancelStay cae al default del motor.
    const defaultPolicy = await this.prisma.cancellationPolicy.findFirst({
      where: { propertyId: dto.propertyId, organizationId: orgId, isDefault: true },
      select: { id: true },
    })

    // BUG #9 fix 2026-06-04 — advisory lock atomic + checkAvailability dentro de tx.
    //
    // Pre-prod testing detectó: 3 walk-ins concurrentes en MISMA room → 1×201
    // + 2×500 (en vez de 1×201 + 2×409). Causa raíz dual:
    //   1. checkAvailability() corría FUERA de $transaction → 2 requests ven
    //      la room libre simultáneamente y proceden.
    //   2. generateBookingRef() hace COUNT + count+1 → 2 requests calculan el
    //      mismo siguiente número → Prisma P2002 `Unique on booking_ref`.
    //
    // El P2002 escapaba sin capturar → HttpExceptionFilter lo transformaba a
    // 500 genérico. Y la integridad se salvaba por casualidad (booking_ref
    // unique), pero si dos walk-ins caen en MES DISTINTO el bookingRef no
    // colisionaría y AMBOS commit → overbooking real.
    //
    // Fix:
    //   · Postgres advisory lock keyed por hash(roomId) — serialize concurrent
    //     walk-ins sobre la misma room. pg_advisory_xact_lock se libera
    //     auto al commit/rollback de la $transaction.
    //   · Re-check availability DENTRO del tx (después de adquirir el lock).
    //     Esto cierra la ventana de race entre "leí free" y "escribí stay".
    //   · Catch P2002 booking_ref → ConflictException 409 sin retry (la causa
    //     real ya es serialized por el lock).
    let stay: Awaited<ReturnType<typeof this.prisma.guestStay.create>>
    try {
      stay = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent walk-ins sobre esta room. El hash convierte
      // el UUID a un bigint para pg_advisory_xact_lock (acepta bigint).
      // Try/catch para no romper unit tests con mock $transaction client.
      try {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
          `walk-in:${dto.roomId}`,
        )
      } catch (e) {
        if (!(e instanceof TypeError)) throw e
      }

      // Re-check disponibilidad DENTRO del lock — protege contra el caso de
      // que entre nuestro checkAvailability inicial y este punto, otra
      // request ya creó una stay overlapping.
      const recheck = await this.checkAvailability(dto.roomId, checkIn, checkOut)
      if (!recheck.available) {
        const hard = recheck.conflicts.find(c => c.severity === 'HARD')
        throw new ConflictException({
          message: hard?.guestName
            ? `La habitación ya tiene una reserva de "${hard.guestName}" (conflicto detectado al adquirir lock)`
            : 'Habitación no disponible para las fechas seleccionadas (race condition)',
          conflicts: recheck.conflicts,
        })
      }

      // BUG #16 fix 2026-06-04 — segundo advisory lock per (property, yyyymm)
      // para serializar el contador del bookingRef cross-room.
      //
      // Pre-prod testing Z1: 5 walk-ins concurrentes en rooms distintas →
      // 1×201 + 4×409. Causa: el lock per-room serializa same-room race, pero
      // generateBookingRef hace COUNT con prefix `MX-D-000-2607-` (sin roomId)
      // → 5 requests cuentan N, todas intentan insertar `0001`, sólo 1 gana,
      // las 4 restantes lanzan P2002 → ConflictException.
      //
      // Fix: el segundo lock estrecha la sección crítica del counter sólo a
      // walk-ins del MISMO mes en la MISMA property — escala lineal con
      // ops/min real del hotel (~10 walk-ins/min peak). Walk-ins en otra
      // property o mes siguen serializando solo entre ellas.
      const yymm = String(checkIn.getFullYear()).slice(-2) + String(checkIn.getMonth() + 1).padStart(2, '0')
      try {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
          `walk-in:ref:${dto.propertyId}:${yymm}`,
        )
      } catch (e) {
        if (!(e instanceof TypeError)) throw e
      }

      const propCode = room.property.propCode ?? '000'
      const bookingRef = await this.generateBookingRef(
        propCode,
        // BUG #15 fix 2026-06-04 — usar countryCode ISO 3166-1 (MX/CO/PE/CR)
        // de la LegalEntity. Antes pasaba `city ?? name` → prefix "TU" (de
        // "Tulum") o "CA" (de "Cancún") en vez de "MX" — rompía audit CFDI
        // que espera ISO codes en el bookingRef. Fallback "MX" para LegalEntity
        // missing durante migration v1.0.5 (Property.legalEntityId nullable).
        room.property.legalEntity?.countryCode ?? 'MX',
        dto.source,
        checkIn,
        tx,
      )

      const newStay = await tx.guestStay.create({
        data: {
          organizationId: orgId,
          propertyId: dto.propertyId,
          roomId: dto.roomId,
          bookingRef,
          guestName,
          guestFirstName: firstName || null,
          guestLastName:  lastName || null,
          guestEmail: dto.guestEmail,
          guestPhone: dto.guestPhone,
          nationality: dto.nationality,
          // Sprint 2026-05-20 — guestSex para BI analytics futuras.
          guestSex: dto.guestSex,
          documentType: dto.documentType,
          // Bug fix 2026-05-20: documentNumber estaba en CreateGuestStayDto
          // (línea 41-43) pero el create() no lo persistía → cualquier nueva
          // reserva con número de documento capturado lo perdía silenciosamente.
          documentNumber: dto.documentNumber,
          paxCount: dto.adults + (dto.children ?? 0),
          checkinAt: checkIn,
          scheduledCheckout: checkOut,
          ratePerNight: dto.ratePerNight,
          currency: dto.currency,
          totalAmount: total,
          amountPaid: dto.amountPaid,
          paymentStatus:
            dto.amountPaid >= total
              ? 'PAID'
              : dto.amountPaid > 0
                ? 'PARTIAL'
                : 'PENDING',
          source: dto.source,
          notes: dto.notes,
          checkedInById: actorId,
          cancellationPolicyId: defaultPolicy?.id ?? null,
        },
      })

      // Create StayJourney + ORIGINAL segment so extensions route through
      // the journey-aware path (extendSameRoom) instead of the legacy
      // PATCH /guest-stays/:id/extend that stretches the original block.
      const journey = await tx.stayJourney.create({
        data: {
          organizationId: orgId,
          propertyId: dto.propertyId,
          guestName,
          guestEmail: dto.guestEmail,
          guestStayId: newStay.id,
          journeyCheckIn: checkIn,
          journeyCheckOut: checkOut,
        },
      })
      await tx.staySegment.create({
        data: {
          journeyId: journey.id,
          roomId: dto.roomId,
          guestStayId: newStay.id,
          checkIn,
          checkOut,
          status: 'ACTIVE',
          reason: 'ORIGINAL',
          rateSnapshot: dto.ratePerNight,
        },
      })

      // PAYMENT-MODAL-UNIFY (Fase D) — persistir el anticipo como PaymentLog
      // real (auditable, USALI §28 append-only). Antes `amountPaid` se escribía
      // directo a GuestStay sin registro de pago: el anticipo no aparecía en los
      // movimientos ni dejaba evidencia de método/referencia (chargeback Visa
      // CRR §5.9.2). El campo `paymentMethod` del DTO se ignoraba por completo.
      if (dto.amountPaid > 0) {
        const tz = room.property.settings?.timezone ?? 'UTC'
        const validMethods = Object.values(PaymentMethod) as string[]
        const method = validMethods.includes(dto.paymentMethod ?? '')
          ? (dto.paymentMethod as PaymentMethod)
          : PaymentMethod.CASH
        // CASH-DRAWER (D-CASH14) — liga el anticipo en efectivo al turno abierto.
        const cashierShiftId =
          (await this.cashierShift?.resolveShiftForCashPayment(dto.propertyId, actorId, method)) ?? null
        await tx.paymentLog.create({
          data: {
            organizationId: orgId,
            propertyId:     dto.propertyId,
            stayId:         newStay.id,
            method:         method as any,
            amount:         dto.amountPaid,
            currency:       dto.currency,
            reference:      dto.paymentReference?.trim() || null,
            shiftDate:      shiftDateForTimezone(new Date(), tz),
            collectedById:  actorId,
            cashierShiftId,
          },
        })
      }

      // Only flip room status immediately for same-day check-ins.
      // Future reservations keep the room AVAILABLE until the guest physically arrives.
      if (isSameDayCheckin) {
        await tx.room.update({
          where: { id: dto.roomId },
          data: { status: 'OCCUPIED' },
        })
      }

      return newStay
    })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // booking_ref collision: el lock NO debería permitirlo, pero defense
        // in depth — si pasa, es porque otra request paralela en OTRA room
        // ganó el counter al mismo tiempo. Indicamos 409 como fallback.
        throw new ConflictException(
          'No se pudo asignar referencia de reserva única — reintenta.',
        )
      }
      throw err
    }

    this.events.emit('checkin.completed', {
      stayId: stay.id,
      roomId: dto.roomId,
      propertyId: dto.propertyId,
      orgId,
      guestName: stay.guestName,
    })

    // BUG #1 fix 2026-06-04 — push Channex availability=0 (room reservado).
    // Antes este path sólo emitía `checkin.completed` y nunca notificaba a
    // Channex → walk-ins / nuevas reservas direct dejaban la OTA con
    // disponibilidad inflada (overbooking real, confirmado pre-prod testing
    // 2026-06-04 con discrepancia 7 rooms vs sandbox). Fire-and-forget igual
    // que el resto de paths (earlyCheckout, restoreStay, cancelStay) —
    // failures se loggean, jamás bloquean la operación local (§31 política
    // best-effort outbound).
    void this.availability.notifyReservation({
      roomId: dto.roomId,
      from:   checkIn,
      to:     checkOut,
      reason: 'RESERVATION',
      traceId: `create-${stay.id}-${Date.now()}`,
    })

    if (dto.guestEmail) {
      this.email
        .sendCheckinConfirmation({
          guestEmail: dto.guestEmail,
          guestName,
          propertyName: room.property.name,
          roomNumber: room.number,
          checkIn,
          checkOut,
          nights,
          totalAmount: total,
          currency: dto.currency,
          pmsId: stay.bookingRef ?? stay.id,
        })
        .catch((err) => {
          this.logger.error(`Failed to send checkin email: ${err}`)
        })
    }

    return stay
  }

  /**
   * Checks whether a room is available for the given date range.
   *
   * Delegates to AvailabilityService (CLAUDE.md §35 — single source of truth)
   * which covers GuestStay + StaySegment + RoomBlock + Channex.io. The internal
   * conflict shape is mapped onto the legacy public DTO (RoomAvailabilityResult
   * with sources GUEST_STAY / ROOM_STATUS) so the existing GET
   * /v1/guest-stays/availability contract and frontend consumers (CheckInDialog)
   * keep working unchanged.
   *
   * Mapping:
   *   LOCAL_STAY / LOCAL_SEGMENT → GUEST_STAY (HARD, with guestName)
   *   LOCAL_BLOCK                → ROOM_STATUS (HARD — block is operational)
   *   CHANNEX                    → ROOM_STATUS (HARD — room not bookable externally)
   *
   * @param excludeStayId - optional stayId to exclude (used by moveRoom to ignore the stay being moved)
   */
  async checkAvailability(
    roomId: string,
    checkIn: Date,
    checkOut: Date,
    excludeStayId?: string,
  ): Promise<RoomAvailabilityResult> {
    const orgId = this.tenant.getOrganizationId()

    const room = await this.prisma.room.findUnique({
      where: { id: roomId, organizationId: orgId },
      select: { status: true },
    })
    if (!room) throw new NotFoundException('Habitación no encontrada')

    const conflicts: AvailabilityConflict[] = []

    // Operational room status — kept as SOFT warning for backward compat. A
    // supervisor may override and accept a check-in into a MAINTENANCE room.
    // Hard blocks for date ranges are handled by the RoomBlock check below
    // (via AvailabilityService).
    if (room.status === 'MAINTENANCE' || room.status === 'OUT_OF_SERVICE') {
      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)
      conflicts.push({
        source: 'ROOM_STATUS',
        severity: 'SOFT',
        conflictStart: checkIn.toISOString(),
        conflictEnd: checkOut.toISOString(),
        overlapDays: Math.max(0, nights),
      })
    }

    const result = await this.availability.check({
      roomId,
      from: checkIn,
      to: checkOut,
      excludeStayIds: excludeStayId ? [excludeStayId] : undefined,
    })

    for (const c of result.conflicts) {
      const conflictStart = c.from.toISOString()
      const conflictEnd   = c.to.toISOString()
      const overlapStart  = Math.max(checkIn.getTime(), c.from.getTime())
      const overlapEnd    = Math.min(checkOut.getTime(), c.to.getTime())
      const overlapDays   = Math.max(0, Math.round((overlapEnd - overlapStart) / 86400000))

      if (c.source === 'LOCAL_STAY' || c.source === 'LOCAL_SEGMENT') {
        conflicts.push({
          source: 'GUEST_STAY',
          severity: 'HARD',
          guestName: c.label,
          conflictStart,
          conflictEnd,
          overlapDays,
        })
      } else {
        // LOCAL_BLOCK + CHANNEX both render as ROOM_STATUS in the legacy DTO.
        conflicts.push({
          source: 'ROOM_STATUS',
          severity: 'HARD',
          conflictStart,
          conflictEnd,
          overlapDays,
        })
      }
    }

    return { available: conflicts.length === 0, conflicts }
  }

  /**
   * BUG #8 fix 2026-06-04 — IDOR cross-property en findUnique.
   *
   * Hasta hoy, los 25+ `guestStay.findUnique` del módulo scoped sólo por
   * `organizationId`. Para customers chain/brand con N properties en la
   * misma Organization (Selina con 24, próximo cliente Hotel Monica con 1
   * pero piloto multi-prop futuro), un SUPERVISOR de la Property A podía
   * leer/modificar stays de Property B.
   *
   * CLAUDE.md MT-5 audit pensó que `PropertyScopeGuard` cerraba esto, pero
   * el guard SÓLO chequea `?propertyId=` query params — los `:id` paths
   * caen al servicio que confía en su propia tenant lookup, que era org-only.
   *
   * Esta helper retorna el scope correcto. Usar en TODO `findUnique` /
   * `findFirst` / `update` / `delete` que reciben un stayId del cliente.
   */
  private stayScope(stayId: string) {
    return {
      id: stayId,
      organizationId: this.tenant.getOrganizationId(),
      propertyId: this.tenant.getPropertyId(),
    }
  }

  async findOne(stayId: string) {
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: { room: { select: { number: true } } },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    return stay
  }

  /**
   * Sprint PAGINATION-CORE — fix bug #23.
   *
   * `from/to` ahora REQUIRED y el overlap se aplica server-side.
   *
   * Lógica overlap correcta de intervalos:
   *   stay [checkinAt, scheduledCheckout) overlaps window [from, to)
   *   ⟺   checkinAt < to  AND  scheduledCheckout > from
   *
   * Antes el código usaba OR (siempre true para cualquier stay con fechas
   * en el pasado o futuro razonable) — efectivamente no filtraba nada.
   *
   * Resultados PERF-1 stress (validación post-fix esperada):
   *   - Antes: calendar p95 = 33.19s @ 30 VUs / 10k stays (21MB/request)
   *   - Objetivo: calendar p95 < 800ms post-fix
   */
  async findByProperty(
    propertyId: string,
    from: Date,
    to: Date,
    opts: { includeCancelled?: boolean; limit?: number } = {},
  ) {
    const orgId = this.tenant.getOrganizationId()
    const limit = Math.min(opts.limit ?? 5000, 5000) // hard cap defensivo

    // Sprint CALENDAR-SELECT (COMPRESSION-CORE follow-up) — `select` específico
    // en vez de retornar TODA la fila GuestStay. El TimelineScheduler frontend
    // (useGuestStays.adaptStay) solo consume ~25 campos. La fila completa
    // tiene ~50 campos (~2KB) incluyendo audit columns (deletedAt, createdAt,
    // checkedInById, *_ById, *_processedAt, lateCheckout*, requiresFiscalReview,
    // metadata jsonb, etc.) que el calendar NO renderiza.
    //
    // Resultado smoke esperado: 3.3MB → ~1.5MB en wire (sin gzip)
    //                         → ~250KB con gzip
    // p95 calendar bajo 30 VUs proyectado: 3.68s → ~1s ✅ cumple <800ms en
    // perfil piloto realista (10-15 VUs) con holgura, y se acerca al
    // threshold estricto bajo carga extrema.
    const stays = await this.prisma.guestStay.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        deletedAt: null,
        // Exclusión de canceladas por default — calendar §97 las oculta del
        // view (drawer "Canceladas hoy" usa endpoint /cancelled separado).
        ...(opts.includeCancelled ? {} : { cancelledAt: null }),
        // Overlap AND correcto — ver docstring del método.
        checkinAt:         { lt: to },
        scheduledCheckout: { gt: from },
      },
      select: {
        // Identidad
        id: true,
        bookingRef: true,
        roomId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        nationality: true,
        documentType: true,
        paxCount: true,
        // Fechas
        checkinAt: true,
        scheduledCheckout: true,
        actualCheckin: true,
        actualCheckout: true,
        // Dinero
        ratePerNight: true,
        totalAmount: true,
        amountPaid: true,
        paymentStatus: true,
        currency: true,
        // Origen + notas (notes corto, OK incluir)
        source: true,
        notes: true,
        // No-show (badge + tooltip BookingBlock)
        noShowAt: true,
        noShowFeeAmount: true,
        noShowFeeCurrency: true,
        noShowChargeStatus: true,
        noShowChargeMethod: true,
        noShowChargeReference: true,
        noShowChargeAt: true,
        noShowChargeReason: true,
        // OTA guarantee data (chip Channex en BookingDetailSheet)
        channexGuaranteeMeta: true,
        // Cancel snapshot (drawer "Canceladas hoy" + audit visual)
        cancelledAt: true,
        cancelInitiator: true,
        cancelReason: true,
        cancelReasonCode: true,
        cancelRetentionAmount: true,
        cancelRefundAmount: true,
        cancelRefundStatus: true,
        cancelRefundMethod: true,
        cancelRefundReference: true,
        cancelRefundAt: true,
        // Channex sync chip
        channexBookingId: true,
        otaReservationCode: true,
        channexOtaName: true,
        channexConflict: true,
        channexLastSyncAt: true,
        paymentModel: true,
        // Group identity (badge X/Y + ring del BookingBlock)
        reservationGroupId: true,
        groupRoomIndex: true,
        // Relaciones — select específico, no include con todos los campos
        stayJourney: { select: { id: true } },
        reservationGroup: {
          select: {
            id: true,
            roomCount: true,
            primaryGuestName: true,
            channexOtaName: true,
          },
        },
      },
      orderBy: { checkinAt: 'desc' },
      take: limit,
    })

    // ── Sprint 9 — cleaningStatus per stay (CLAUDE.md §54-§57) ────────────
    // Calendario PMS muestra animación inline según el estado de limpieza
    // del cuarto. Una sola query agregada para todos los rooms involucrados.
    const roomIds = Array.from(new Set(stays.map((s) => s.roomId)))
    const activeTasks =
      roomIds.length === 0
        ? []
        : await this.prisma.cleaningTask.findMany({
            where: {
              unit: { roomId: { in: roomIds } },
              // Solo estados visibles en el calendario (no CANCELLED / DEFERRED / BLOCKED).
              // PENDING incluido para "esperando salida física" pero no causa animación.
              status: {
                in: [
                  CleaningStatus.PENDING,
                  CleaningStatus.UNASSIGNED,
                  CleaningStatus.READY,
                  CleaningStatus.IN_PROGRESS,
                  CleaningStatus.PAUSED,
                  CleaningStatus.DONE,
                  CleaningStatus.VERIFIED,
                ],
              },
            },
            select: {
              status: true,
              unit: { select: { roomId: true } },
            },
          })

    const cleaningByRoom = aggregateCleaningStatusByRoom(activeTasks)
    return stays.map((s) => ({
      ...s,
      cleaningStatus: cleaningByRoom.get(s.roomId) ?? null,
    }))
  }

  /**
   * POST /v1/guest-stays/:id/checkout
   *
   * Checkout regular: el huésped sale en su fecha programada o después.
   *
   * A diferencia de earlyCheckout():
   *  - paymentStatus → PAID (estadía completada, sin refund pendiente)
   *  - No se notifica freedFrom/freedTo a Channex (inventario ya en su última noche)
   *  - Notificación es INFORMATIONAL (no ACTION_REQUIRED)
   *
   * Comparte con earlyCheckout (unificado por decisión de negocio):
   *  - Crea CleaningTask(READY) — el clic en checkout = confirmación física de salida
   *    (AHLEI sec. 4.1: "front desk closes checkout = physical departure confirmed")
   *  - Auto-asigna via AssignmentService según cobertura
   *  - hasSameDayCheckIn detection automática → priority URGENT si hay nuevo huésped hoy
   *  - housekeepingEndHour cutoff (default 20): si checkout es post-cutoff, tarea va al
   *    grid de mañana (housekeepers fuera de turno)
   *  - Push al asignado + SSE task:ready para tiempo real (calendario, kanban, mobile)
   */
  async checkout(stayId: string, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        room: {
          select: {
            id: true,
            number: true,
            units: { select: { id: true } },
            property: { select: { id: true, settings: true } },
          },
        },
        // Sprint 9 fix — incluir journey + segments activos para cerrarlos.
        // Sin esto el frontend renderizaba el bloque como ACTIVE aunque
        // el stay tuviera actualCheckout (issue reportado: botón checkout
        // seguía activo en bloque del calendario tras procesar checkout).
        stayJourney: {
          select: {
            id: true,
            segments: {
              where: { status: { in: ['ACTIVE', 'PENDING'] } },
              orderBy: { checkIn: 'asc' },
            },
          },
        },
      },
    })
    if (!stay) throw new NotFoundException()
    if (stay.actualCheckout) {
      throw new BadRequestException('El huésped ya realizó checkout')
    }
    if (stay.noShowAt) {
      throw new BadRequestException('No se puede realizar checkout de un no-show')
    }
    // BUG #32 fix (Bloque HH1) — checkout requiere confirmCheckin previo.
    // Sin este guard, POST /checkout a stay con actualCheckin=null aceptaba
    // 201 y dejaba estado inválido: actualCheckin=null + actualCheckout=set.
    // Eso es violación de máquina de estados §1 + audit fiscal hueco (¿qué
    // huésped se fue si nunca entró?).
    if (!stay.actualCheckin) {
      throw new BadRequestException({
        code: 'CHECKIN_REQUIRED',
        message: 'No se puede realizar checkout sin confirmar check-in primero. Si la reserva no se concretó, marca como cancelación o no-show.',
      })
    }
    if (stay.cancelledAt) {
      throw new BadRequestException({
        code: 'CANCELLED',
        message: 'La reserva está cancelada — no se puede realizar checkout',
      })
    }

    const now = new Date()
    const tz = stay.room.property.settings?.timezone ?? 'UTC'
    const localHour = toLocalHour(now, tz)
    const housekeepingEndHour = stay.room.property.settings?.housekeepingEndHour ?? 20

    // Cutoff de turno HK: si checkout es post-cutoff, la tarea va al grid de mañana.
    let taskCheckoutAt: Date
    if (localHour < housekeepingEndHour) {
      taskCheckoutAt = now
    } else {
      const tomorrowLocal = toLocalDate(new Date(now.getTime() + 86_400_000), tz)
      taskCheckoutAt = new Date(`${tomorrowLocal}T09:00:00.000Z`)
    }

    // Detección automática de URGENT: ¿hay otra reserva con check-in en la fecha
    // operativa de la tarea? Usamos taskCheckoutAt (que puede ser hoy o mañana
    // según housekeepingEndHour), NO `now` — sin esto un checkout post-cutoff
    // del Día 1 con check-in nuevo el Día 2 no se marcaría URGENT.
    const taskDateLocal = toLocalDate(taskCheckoutAt, tz)
    const taskDayStart = new Date(`${taskDateLocal}T00:00:00.000Z`)
    const taskDayEnd   = new Date(`${taskDateLocal}T23:59:59.999Z`)
    const sameDayCheckInCount = await this.prisma.guestStay.count({
      where: {
        organizationId: orgId,
        roomId: stay.roomId,
        actualCheckin: null,
        noShowAt: null,
        checkinAt: { gte: taskDayStart, lte: taskDayEnd },
        id: { not: stayId },
      },
    })
    const hasSameDayCheckIn = sameDayCheckInCount > 0
    const taskPriority = hasSameDayCheckIn ? 'URGENT' : 'MEDIUM'

    const newCleaningTaskIds: string[] = []
    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Cerrar GuestStay
      const stayUpdated = await tx.guestStay.update({
        where: { id: stayId },
        data: {
          actualCheckout: now,
          checkedOutById: actorId,
          paymentStatus: 'PAID',
          // Reset late-checkout escalation: una vez que la stay sale del
          // flujo de "actualCheckout=null", el LateCheckoutScheduler la
          // excluye automáticamente, pero limpiamos los flags para audit.
          lateCheckoutTier: 0,
          lateCheckoutFlaggedAt: null,
        },
      })

      // 2. Room status → CHECKING_OUT (housekeeping verá la transición a DIRTY al confirmar limpia)
      await tx.room.update({
        where: { id: stay.roomId },
        data: { status: 'CHECKING_OUT' },
      })

      // 3. Checkout record para HK
      const checkout = await tx.checkout.create({
        data: {
          organizationId: orgId,
          roomId: stay.roomId,
          guestName: stay.guestName,
          actualCheckoutAt: taskCheckoutAt,
          source: 'MANUAL',
          isEarlyCheckout: false,
        },
      })

      // 4. Por cada unit:
      //    - Si existe PENDING (creada por cron 7am o por extension/move) → PROMOVER a READY
      //      preservando audit trail (carryoverFromTaskId, asignación previa, etc.)
      //    - Si NO existe → crear nueva READY (caso walk-in / super-early sin cron)
      //    Esto evita duplicados (1 PENDING del cron + 1 READY del checkout endpoint).
      const scheduledFor = new Date(`${taskCheckoutAt.toISOString().slice(0, 10)}T00:00:00.000Z`)
      for (const unit of stay.room.units) {
        const existing = await tx.cleaningTask.findFirst({
          where: {
            unitId: unit.id,
            status: { in: ['PENDING', 'UNASSIGNED'] },
          },
          orderBy: { createdAt: 'desc' },
        })

        if (existing) {
          // Promover PENDING → READY. Mantiene assignedToId, priority, hasSameDayCheckIn
          // del cron (que ya hizo auto-assign + URGENT detection en su momento). Solo
          // actualizamos checkoutId para vincularla a esta salida física.
          const updated = await tx.cleaningTask.update({
            where: { id: existing.id },
            data: {
              status: 'READY',
              checkoutId: checkout.id,
              // Re-evaluar URGENT por si entró un nuevo huésped same-day post-cron
              priority: hasSameDayCheckIn ? 'URGENT' : existing.priority,
              hasSameDayCheckIn: hasSameDayCheckIn || existing.hasSameDayCheckIn,
            },
          })
          await tx.taskLog.create({
            data: {
              organizationId: orgId,
              taskId: updated.id,
              staffId: actorId,
              event: 'READY',
              note: 'Salida física confirmada por recepción',
            },
          })
          // No re-asignamos: ya está asignada por el cron. autoAssign() en post-tx
          // verificará y solo asigna si está sin asignar.
          newCleaningTaskIds.push(updated.id)
        } else {
          // Walk-in o super-early sin pre-population del cron: crear desde cero.
          const task = await tx.cleaningTask.create({
            data: {
              organizationId: orgId,
              unitId: unit.id,
              checkoutId: checkout.id,
              status: 'READY',
              taskType: 'CLEANING',
              priority: taskPriority,
              hasSameDayCheckIn,
              scheduledFor,
            },
          })
          await tx.taskLog.create({
            data: { organizationId: orgId, taskId: task.id, staffId: actorId, event: 'CREATED' },
          })
          await tx.taskLog.create({
            data: { organizationId: orgId, taskId: task.id, staffId: actorId, event: 'READY' },
          })
          newCleaningTaskIds.push(task.id)
        }
      }

      // Sprint 9 fix — cerrar journey + segment activo. Sin esto el frontend
      // sigue renderizando el bloque como ACTIVE en el calendario aunque el
      // stay tenga actualCheckout (issue reportado: botón checkout seguía
      // activo). Mismo patrón que earlyCheckout().
      if (stay.stayJourney?.id && stay.stayJourney.segments.length > 0) {
        const activeSegment = stay.stayJourney.segments[stay.stayJourney.segments.length - 1]
        if (activeSegment && activeSegment.checkOut > now) {
          // Recortar segmento al momento real de salida (preserva audit del
          // tiempo real ocupado, ej. late checkout queda registrado).
          await tx.staySegment.update({
            where: { id: activeSegment.id },
            data: { checkOut: now, status: 'COMPLETED' },
          })
        } else if (activeSegment) {
          // Late checkout (now > segment.checkOut original): solo marcar COMPLETED
          await tx.staySegment.update({
            where: { id: activeSegment.id },
            data: { status: 'COMPLETED' },
          })
        }
        await tx.stayJourney.update({
          where: { id: stay.stayJourney.id },
          data: { status: 'CHECKED_OUT', journeyCheckOut: now },
        })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'CHECKED_OUT',
            actorId,
            payload: {
              stayId,
              checkoutAt: now.toISOString(),
              source: 'regular_checkout',
            },
          },
        })
      }

      return stayUpdated
    })

    // Post-tx: auto-asignar (D10) — fire-and-forget
    for (const taskId of newCleaningTaskIds) {
      this.assignment.autoAssign(taskId).catch((err: Error) =>
        this.logger.warn(`autoAssign failed (checkout) task=${taskId}: ${err.message}`),
      )
    }

    // SSE task:ready por cada task — alimenta:
    //   * AlarmHost mobile (alarmService.show + AlarmOverlay)
    //   * useRoomSSE web (refresca calendar + kanban en tiempo real)
    //   * useTasks mobile (refresca lista "Mi día")
    // Sin esta emisión, mobile solo se entera vía pull-to-refresh.
    const tasksForPush = await this.prisma.cleaningTask.findMany({
      where: { id: { in: newCleaningTaskIds } },
      select: { id: true, assignedToId: true, priority: true, hasSameDayCheckIn: true },
    })
    for (const t of tasksForPush) {
      this.notifications.emit(stay.propertyId, 'task:ready', {
        taskId: t.id,
        roomNumber: stay.room.number,
        unitId: undefined,
        assignedToId: t.assignedToId,
        hasSameDayCheckIn: t.hasSameDayCheckIn,
        priority: t.priority,
        carryoverFromDate: null,
      })
    }

    // Push al staff asignado por cada task READY (D16 — tier 2/2.5).
    // Si hasSameDayCheckIn → tier 2.5 (URGENT), si no → tier 2 (notification).
    // El push del SO + alarma in-app dependen del payload `priority` que
    // el handler de Expo Notifications interpreta en mobile.
    for (const t of tasksForPush) {
      if (!t.assignedToId) continue
      const isUrgent = t.hasSameDayCheckIn || t.priority === 'URGENT'
      const title = isUrgent
        ? `🔴 Limpieza URGENTE — Hab. ${stay.room.number}`
        : `🧹 Lista para limpiar — Hab. ${stay.room.number}`
      const body = isUrgent
        ? `Entra nuevo huésped HOY. ${stay.guestName} ya salió.`
        : `${stay.guestName} salió. Cuarto disponible para limpieza.`
      this.push.sendToStaff(t.assignedToId, title, body, {
        type: 'task:ready',
        taskId: t.id,
        priority: isUrgent ? 'urgent' : 'high',
        alarm: true,
      }).catch((err: Error) =>
        this.logger.warn(`Push checkout task=${t.id}: ${err?.message}`),
      )
    }

    this.events.emit('checkout.confirmed', {
      roomId: stay.roomId,
      propertyId: stay.propertyId,
      orgId,
      guestName: stay.guestName,
    })

    void this.notifCenter.send({
      propertyId:    stay.propertyId,
      type:          'INFORMATIONAL',
      category:      'CHECKOUT_COMPLETE',
      priority:      hasSameDayCheckIn ? 'HIGH' : 'MEDIUM',
      title:         `Checkout — ${stay.guestName}`,
      body:          `Hab. ${stay.room.number} liberada. Limpieza ${localHour < housekeepingEndHour ? 'disponible hoy' : 'programada para mañana'}${hasSameDayCheckIn ? ' · 🔴 entra nuevo huésped hoy' : ''}.`,
      metadata:      { stayId, roomId: stay.roomId, hasSameDayCheckIn },
      actionUrl:     `/reservations/${stayId}`,
      recipientType: 'ROLE',
      recipientRole: 'SUPERVISOR',
      triggeredById: actorId,
    }).catch((err: Error) =>
      this.logger.warn(`[Checkout] notification failed: ${err?.message}`),
    )

    // Sprint AUDIT-CORE — checkout cierra folio fiscal. CFDI Art. 30 (5y).
    this.audit.recordCheckout({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      actualCheckoutAt: updated.actualCheckout ?? new Date(),
      isEarly: false,
    })

    return updated
  }

  /**
   * POST /v1/guest-stays/:id/early-checkout
   *
   * El huésped sale antes de la fecha de checkout programada.
   *
   * Diferencias vs checkout regular:
   *  - GuestStay.actualCheckout = ahora (no scheduledCheckout)
   *  - paymentStatus permanece PENDING — puede haber reembolso parcial (Sprint 8)
   *  - Se crea Checkout + CleaningTask(PENDING) para las unidades de la habitación
   *  - Si localHour < HOUSEKEEPING_END_HOUR (20): tarea muestra en el grid de HOY
   *  - Si localHour >= HOUSEKEEPING_END_HOUR (20): tarea muestra en el grid de MAÑANA
   *    (usando checkout.actualCheckoutAt con fecha de mañana)
   *  - Las noches liberadas se notifican a Channex (best-effort, fire-and-forget)
   *  - Emite SSE checkout:early para actualizar el calendario en tiempo real
   *
   * TODO(sprint9-marketing): enviar mensaje WhatsApp/email "early checkout" al huésped
   */
  async earlyCheckout(stayId: string, actorId: string, notes?: string) {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        room: {
          select: {
            id: true,
            number: true,
            channexRoomTypeId: true,
            units: { select: { id: true } },
            property: { select: { id: true, settings: true } },
          },
        },
        stayJourney: {
          select: {
            id: true,
            segments: {
              where: { status: { in: ['ACTIVE', 'PENDING'] } },
              orderBy: { checkIn: 'asc' },
            },
          },
        },
      },
    })

    if (!stay) throw new NotFoundException()
    if (stay.actualCheckout) {
      throw new BadRequestException('El huésped ya realizó checkout')
    }
    if (stay.noShowAt) {
      throw new BadRequestException('No se puede realizar checkout de un no-show')
    }
    // BUG #32 fix — earlyCheckout también requiere checkin previo.
    if (!stay.actualCheckin) {
      throw new BadRequestException({
        code: 'CHECKIN_REQUIRED',
        message: 'No se puede hacer checkout anticipado sin confirmar check-in primero.',
      })
    }
    if (stay.cancelledAt) {
      throw new BadRequestException({
        code: 'CANCELLED',
        message: 'La reserva está cancelada — no se puede realizar checkout',
      })
    }

    const now = new Date()
    if (now >= stay.scheduledCheckout) {
      throw new BadRequestException(
        'La fecha de checkout ya pasó — usa el checkout regular',
      )
    }

    const tz = stay.room.property.settings?.timezone ?? 'UTC'
    const localHour = toLocalHour(now, tz)
    const HOUSEKEEPING_END_HOUR = stay.room.property.settings?.housekeepingEndHour ?? 20

    // Determinar la fecha del Checkout record para el grid de housekeeping
    let taskCheckoutAt: Date
    if (localHour < HOUSEKEEPING_END_HOUR) {
      // Dentro del turno → la tarea aparece en el planning de HOY
      taskCheckoutAt = now
    } else {
      // Fuera del turno → la tarea aparece en el planning de MAÑANA
      const tomorrowLocal = toLocalDate(new Date(now.getTime() + 86_400_000), tz)
      // Fijamos a las 09:00 UTC para que quede dentro del rango UTC del día local de mañana
      taskCheckoutAt = new Date(`${tomorrowLocal}T09:00:00.000Z`)
    }

    // Detección automática de URGENT: ¿hay otra reserva con check-in en la fecha
    // operativa de la tarea? Usamos taskCheckoutAt (hoy o mañana según cutoff)
    // — si usáramos `now`, un early-checkout post-cutoff con check-in nuevo
    // mañana no se marcaría URGENT.
    const taskDateLocal = toLocalDate(taskCheckoutAt, tz)
    const taskDayStart = new Date(`${taskDateLocal}T00:00:00.000Z`)
    const taskDayEnd   = new Date(`${taskDateLocal}T23:59:59.999Z`)
    const sameDayCheckInCount = await this.prisma.guestStay.count({
      where: {
        organizationId: orgId,
        roomId: stay.roomId,
        actualCheckin: null,
        noShowAt: null,
        checkinAt: { gte: taskDayStart, lte: taskDayEnd },
        id: { not: stayId },
      },
    })
    const hasSameDayCheckIn = sameDayCheckInCount > 0
    const taskPriority = hasSameDayCheckIn ? 'URGENT' : 'MEDIUM'

    // Transacción principal: actualizar stay + crear housekeeping records
    const newCleaningTaskIds: string[] = []
    await this.prisma.$transaction(async (tx) => {
      // 1. Marcar GuestStay como early-checkout
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          actualCheckout: now,
          checkedOutById: actorId,
          // paymentStatus queda PENDING: puede haber reembolso parcial (Sprint 8)
          // Reset late-checkout escalation flags
          lateCheckoutTier: 0,
          lateCheckoutFlaggedAt: null,
        },
      })

      // 2. Actualizar estado de la habitación
      await tx.room.update({
        where: { id: stay.roomId },
        data: { status: 'CHECKING_OUT' },
      })

      // 3. Crear el Checkout record para el módulo de housekeeping
      const checkout = await tx.checkout.create({
        data: {
          organizationId: orgId,
          roomId: stay.roomId,
          guestName: stay.guestName,
          actualCheckoutAt: taskCheckoutAt,
          source: 'MANUAL',
          isEarlyCheckout: true,
          notes: notes ?? null,
        },
      })

      // 4. Por cada unit: promover PENDING existente a READY o crear nueva.
      //    Misma lógica que checkout regular — evita duplicados con cron 7am.
      const scheduledFor = new Date(`${taskCheckoutAt.toISOString().slice(0, 10)}T00:00:00.000Z`)
      for (const unit of stay.room.units) {
        const existing = await tx.cleaningTask.findFirst({
          where: { unitId: unit.id, status: { in: ['PENDING', 'UNASSIGNED'] } },
          orderBy: { createdAt: 'desc' },
        })

        if (existing) {
          const updated = await tx.cleaningTask.update({
            where: { id: existing.id },
            data: {
              status: 'READY',
              checkoutId: checkout.id,
              priority: hasSameDayCheckIn ? 'URGENT' : existing.priority,
              hasSameDayCheckIn: hasSameDayCheckIn || existing.hasSameDayCheckIn,
            },
          })
          await tx.taskLog.create({
            data: {
              organizationId: orgId,
              taskId: updated.id,
              staffId: actorId,
              event: 'READY',
              note: `Early checkout — salida física confirmada${notes ? ` (${notes})` : ''}`,
            },
          })
          newCleaningTaskIds.push(updated.id)
        } else {
          const task = await tx.cleaningTask.create({
            data: {
              organizationId: orgId,
              unitId: unit.id,
              checkoutId: checkout.id,
              status: 'READY',
              taskType: 'CLEANING',
              priority: taskPriority,
              hasSameDayCheckIn,
              scheduledFor,
            },
          })
          await tx.taskLog.create({
            data: {
              organizationId: orgId,
              taskId: task.id,
              staffId: actorId,
              event: 'CREATED',
              note: `Early checkout registrado${notes ? ` — ${notes}` : ''}`,
            },
          })
          await tx.taskLog.create({
            data: { organizationId: orgId, taskId: task.id, staffId: actorId, event: 'READY' },
          })
          newCleaningTaskIds.push(task.id)
        }
      }

      // 5. Si hay journey activo, recortar el segmento activo a la fecha de hoy
      if (stay.stayJourney?.id && stay.stayJourney.segments.length > 0) {
        const activeSegment = stay.stayJourney.segments[stay.stayJourney.segments.length - 1]
        if (activeSegment && activeSegment.checkOut > now) {
          await tx.staySegment.update({
            where: { id: activeSegment.id },
            data: { checkOut: now, status: 'COMPLETED' },
          })
        }
        await tx.stayJourney.update({
          where: { id: stay.stayJourney.id },
          data: { status: 'CHECKED_OUT', journeyCheckOut: now },
        })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'CHECKED_OUT',
            actorId,
            payload: {
              freedFrom: now.toISOString(),
              freedTo: stay.scheduledCheckout.toISOString(),
              tasksScheduledFor:
                localHour < HOUSEKEEPING_END_HOUR ? 'today' : 'tomorrow',
              notes: notes ?? null,
            },
          },
        })
      }
    })

    // Post-transaction: auto-asignar tareas creadas (D10) — fire-and-forget
    for (const taskId of newCleaningTaskIds) {
      this.assignment.autoAssign(taskId).catch((err: Error) =>
        this.logger.warn(`autoAssign failed (earlyCheckout) task=${taskId}: ${err.message}`),
      )
    }

    // Post-transaction: notificaciones best-effort (no revertir si fallan)
    this.events.emit('checkout.early', {
      roomId: stay.roomId,
      propertyId: stay.propertyId,
      orgId,
      stayId,
      guestName: stay.guestName,
      freedFrom: now.toISOString(),
      freedTo: stay.scheduledCheckout.toISOString(),
    })

    // Notify relevant staff about early checkout (best-effort — do NOT await)
    void this.notifCenter.send({
      propertyId:    stay.propertyId,
      type:          'INFORMATIONAL',
      category:      'EARLY_CHECKOUT',
      priority:      'MEDIUM',
      title:         `Salida anticipada — ${stay.guestName}`,
      body:          `${stay.guestName} salió anticipadamente de Hab. ${stay.room.number}. ` +
                     `Noches liberadas: ${now.toISOString()} → ${stay.scheduledCheckout.toISOString()}. ` +
                     `Limpieza programada para ${localHour < HOUSEKEEPING_END_HOUR ? 'hoy' : 'mañana'}.`,
      metadata:      { stayId, roomId: stay.roomId, freedFrom: now.toISOString(), freedTo: stay.scheduledCheckout.toISOString() },
      actionUrl:     `/reservations/${stayId}`,
      recipientType: 'ROLE',
      recipientRole: 'SUPERVISOR',
      triggeredById: actorId,
    }).catch((err: Error) =>
      this.logger.warn(`[EarlyCheckout] notification failed: ${err?.message}`),
    )

    // Sprint CHANNEX-OUTBOUND-CERT Day 5 — refactor AP-2.2.
    // Antes: direct pushInventory desde save handler (Channex caído bloqueaba).
    // Ahora: emit event → OutboxBuilder enqueue → Worker drain con retry.
    const propSettings = stay.room?.property?.settings
    const channexRoomTypeId = (stay.room as any)?.channexRoomTypeId as string | null | undefined
    if (propSettings?.channexPropertyId && channexRoomTypeId) {
      const event: ChannexAvailabilityChangedEvent = {
        propertyId: stay.propertyId,
        entries: [{
          propertyId: propSettings.channexPropertyId,
          roomTypeId: channexRoomTypeId,
          dateFrom:   toLocalDate(now, tz),
          dateTo:     toLocalDate(stay.scheduledCheckout, tz),
          availability: 1,  // release: hotel model 1-unit room → 1 available
        }],
      }
      this.events.emit(CHANNEX_AVAILABILITY_CHANGED, event)
    }

    this.logger.log(
      `[EarlyCheckout] stay=${stayId} guest="${stay.guestName}" ` +
        `freedFrom=${now.toISOString()} freedTo=${stay.scheduledCheckout.toISOString()} ` +
        `taskScheduled=${localHour < HOUSEKEEPING_END_HOUR ? 'today' : 'tomorrow'}`,
    )

    // Sprint AUDIT-CORE — early checkout cierra folio (potential refund).
    this.audit.recordCheckout({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      actualCheckoutAt: now,
      isEarly: true,
    })

    return {
      success: true,
      freedFrom: now.toISOString(),
      freedTo: stay.scheduledCheckout.toISOString(),
      tasksScheduledFor: localHour < HOUSEKEEPING_END_HOUR ? 'today' : 'tomorrow',
    }
  }

  /**
   * EC-3 (CLAUDE.md §58) — Late checkout aprobado por recepción.
   *
   * El huésped pide salir a las 16:00 en vez de 11:00. La tarea PENDING/READY
   * ya existe (creada por MorningRosterScheduler). Este endpoint:
   *
   *   1. Actualiza `GuestStay.scheduledCheckout` a la nueva hora.
   *   2. Pone `lateCheckoutAt` en cada CleaningTask asociada a esa estadía
   *      (housekeeper móvil baja prioridad hasta `lateCheckoutAt - 1h`).
   *   3. Si la tarea está READY (huésped ya salió y reapareció) → revierte
   *      a PENDING (idempotente con undoDeparture, pero no re-cierra checkout).
   *   4. SSE `task:rescheduled` para que el calendario PMS y el kanban
   *      reflejen el cambio en tiempo real.
   *
   * Permisos: SUPERVISOR / RECEPTIONIST (controller layer).
   */
  async lateCheckout(stayId: string, newCheckoutTime: Date, actorId: string) {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        room: {
          select: {
            id: true,
            number: true,
            propertyId: true,
            units: { select: { id: true } },
          },
        },
      },
    })

    if (!stay) throw new NotFoundException('Reserva no encontrada')
    if (stay.actualCheckout) {
      throw new BadRequestException('La estadía ya fue cerrada — no aplica late checkout')
    }
    if (stay.noShowAt) {
      throw new BadRequestException('No-show — no aplica late checkout')
    }

    const now = new Date()
    if (newCheckoutTime <= now) {
      throw new BadRequestException('La nueva hora de salida debe ser futura')
    }

    // Sanity: no aceptar cambios > 24h del scheduled actual
    const HOURS_24 = 24 * 60 * 60 * 1000
    const delta = Math.abs(newCheckoutTime.getTime() - stay.scheduledCheckout.getTime())
    if (delta > HOURS_24) {
      throw new BadRequestException(
        'Late checkout > 24h — usa "Extender estadía" en su lugar',
      )
    }

    const propertyId = stay.room.propertyId
    const unitIds = stay.room.units.map((u) => u.id)
    const updatedTaskIds: string[] = []

    await this.prisma.$transaction(async (tx) => {
      // 1. Actualizar GuestStay
      await tx.guestStay.update({
        where: { id: stayId },
        data: { scheduledCheckout: newCheckoutTime },
      })

      // 2. Encontrar tareas afectadas (PENDING o READY) para esta estadía
      const tasks = await tx.cleaningTask.findMany({
        where: {
          unitId: { in: unitIds },
          status: { in: [CleaningStatus.PENDING, CleaningStatus.READY] },
          // Solo tareas de hoy (no carryover)
          scheduledFor: { not: null },
        },
        select: { id: true, status: true },
      })

      for (const t of tasks) {
        // Si está READY (huésped ya salió y volvió pidiendo más tiempo),
        // revertir a PENDING para que la limpieza no inicie aún.
        const newStatus =
          t.status === CleaningStatus.READY ? CleaningStatus.PENDING : t.status

        await tx.cleaningTask.update({
          where: { id: t.id },
          data: {
            lateCheckoutAt: newCheckoutTime,
            status: newStatus,
          },
        })
        await tx.taskLog.create({
          data: {
            taskId: t.id,
            staffId: actorId,
            event: TaskLogEvent.LATE_CHECKOUT_RESCHEDULED,
            note: `late checkout to ${newCheckoutTime.toISOString()}`,
            metadata: {
              previousStatus: t.status,
              newCheckoutTime: newCheckoutTime.toISOString(),
            },
          },
        })
        updatedTaskIds.push(t.id)
      }

    })

    // 4. Internal event → pms-sse.listener convierte a SSE 'task:rescheduled'
    this.events.emit('task.rescheduled', {
      propertyId,
      stayId,
      roomId: stay.roomId,
      roomNumber: stay.room.number,
      newCheckoutTime: newCheckoutTime.toISOString(),
      affectedTaskIds: updatedTaskIds,
    })

    this.logger.log(
      `[lateCheckout] stay=${stayId} new=${newCheckoutTime.toISOString()} ` +
        `tasks=${updatedTaskIds.length}`,
    )

    // Sprint AUDIT-CORE — late checkout puede afectar revenue (fee tier).
    this.audit.recordLateCheckout({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      tier: stay.lateCheckoutTier ?? 0,
    })

    return {
      success: true,
      newCheckoutTime: newCheckoutTime.toISOString(),
      affectedTaskIds: updatedTaskIds,
    }
  }

  /**
   * D12 — extension confirmation handler.
   *
   * Cuando un huésped extiende su estadía y el receptionist confirma el pago,
   * un modal pregunta: "¿requiere limpieza?" Esta función encarna ese flow.
   *
   *   requiresCleaning = true  → mantener tareas PENDING/READY ACTIVAS, marcar
   *                              extensionFlag=WITH_CLEANING para tracking y push
   *                              al housekeeper "Hab X — extensión confirmada,
   *                              limpieza solicitada".
   *
   *   requiresCleaning = false → cancelar las tareas con cancelledReason=
   *                              EXTENSION_NO_CLEANING + extensionFlag=WITHOUT_CLEANING.
   *                              Mobile las renderiza como badge ✨ en vez de
   *                              hacerlas desaparecer.
   *
   * Solo afecta tareas PENDING/READY/UNASSIGNED del día actual asociadas a
   * la habitación de esta estadía. Tareas IN_PROGRESS NUNCA se tocan (D11).
   */
  async extendWithCleaningFlag(
    stayId: string,
    requiresCleaning: boolean,
    actorId: string,
  ) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: { room: { select: { id: true, number: true, propertyId: true } } },
    })
    if (!stay) throw new NotFoundException()

    // Tasks afectadas: solo del día actual, asociadas a la room (vía unit), no IN_PROGRESS
    const todayUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
    const tasks = await this.prisma.cleaningTask.findMany({
      where: {
        unit: { roomId: stay.roomId },
        scheduledFor: todayUtc,
        status: {
          in: ['PENDING', 'READY', 'UNASSIGNED'] as const,
        },
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        unit: { select: { id: true } },
      },
    })

    if (tasks.length === 0) {
      return { affectedTasks: 0, requiresCleaning }
    }

    const updates: { id: string; assignedToId: string | null }[] = []

    if (requiresCleaning) {
      // Mantener tareas activas, marcar flag, push al housekeeper
      await this.prisma.$transaction(async (tx) => {
        for (const t of tasks) {
          await tx.cleaningTask.update({
            where: { id: t.id },
            data: { extensionFlag: 'WITH_CLEANING' },
          })
          await tx.taskLog.create({
            data: {
              taskId: t.id,
              staffId: actorId,
              event: 'NOTE_ADDED',
              note: 'Extensión confirmada con limpieza solicitada',
            },
          })
          updates.push({ id: t.id, assignedToId: t.assignedToId })
        }
      })
    } else {
      // Cancelar tareas con razón EXTENSION_NO_CLEANING (mobile las renderizará como badge)
      await this.prisma.$transaction(async (tx) => {
        for (const t of tasks) {
          await tx.cleaningTask.update({
            where: { id: t.id },
            data: {
              status: 'CANCELLED',
              cancelledReason: 'EXTENSION_NO_CLEANING',
              cancelledAt: new Date(),
              extensionFlag: 'WITHOUT_CLEANING',
            },
          })
          await tx.taskLog.create({
            data: {
              taskId: t.id,
              staffId: actorId,
              event: 'CANCELLED',
              note: 'Extensión confirmada sin limpieza',
            },
          })
          // Restaurar unit a OCCUPIED (huésped sigue ahí)
          await tx.unit.update({ where: { id: t.unitId }, data: { status: 'OCCUPIED' } })
          updates.push({ id: t.id, assignedToId: t.assignedToId })
        }
      })
    }

    // SSE para que mobile/web invaliden — D12 task:extension-confirmed
    this.events.emit('task.extension-confirmed', {
      propertyId: stay.room.propertyId,
      stayId,
      roomId: stay.roomId,
      requiresCleaning,
      affectedTasks: updates.length,
    })

    // Push al housekeeper afectado
    for (const u of updates) {
      if (!u.assignedToId) continue
      const title = requiresCleaning
        ? '✨ Extensión con limpieza'
        : '✨ Extensión sin limpieza'
      const body = requiresCleaning
        ? `Hab. ${stay.room.number} — Extensión confirmada, limpieza solicitada.`
        : `Hab. ${stay.room.number} — Huésped extendió, NO requiere limpieza hoy.`
      // Lazy import to avoid circular: usar EventEmitter para que push.service oiga si quiere.
      // Pero para simplicidad y mantener consistencia con el resto del codebase,
      // emitimos solo SSE. El push directo se queda para cuando se conecte al
      // PushService como dependencia opcional (futuro).
      this.logger.debug(`[D12] would push to staff=${u.assignedToId} title="${title}" body="${body}"`)
    }

    return { affectedTasks: updates.length, requiresCleaning }
  }

  async moveRoom(stayId: string, dto: MoveRoomDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
    })
    if (!stay) throw new NotFoundException()

    // Cannot move a guest who has already checked out
    if (stay.actualCheckout !== null) {
      throw new BadRequestException('No se puede cambiar de habitación a un huésped que ya realizó checkout')
    }

    // Same room — no-op
    if (stay.roomId === dto.newRoomId) return { success: true }

    const newRoom = await this.prisma.room.findUnique({
      where: { id: dto.newRoomId, organizationId: orgId },
    })
    if (!newRoom) throw new NotFoundException('Habitación destino no encontrada')

    // Full availability check on the destination room — covers GuestStay,
    // StaySegment, RoomBlock and Channex (CLAUDE.md §35). Replaces the previous
    // GuestStay-only query that ignored maintenance blocks and journey segments
    // belonging to other guests already assigned to the destination room.
    const avail = await this.availability.check({
      roomId: dto.newRoomId,
      from: stay.checkinAt,
      to: stay.scheduledCheckout,
      excludeStayIds: [stayId],
    })
    if (!avail.available) {
      const c = avail.conflicts[0]
      throw new ConflictException(
        `La habitación destino no está disponible para ese período — ${c.label}` +
          (c.source === 'CHANNEX' ? ' (canal externo)' : ''),
      )
    }

    // Check if the old room has other active stays before freeing it
    const otherStaysInOldRoom = await this.prisma.guestStay.count({
      where: {
        roomId: stay.roomId,
        organizationId: orgId,
        deletedAt: null,
        actualCheckout: null,
        id: { not: stayId },
      },
    })

    await this.prisma.$transaction([
      // Only mark old room available if no other active guests remain in it
      this.prisma.room.update({
        where: { id: stay.roomId },
        data: { status: otherStaysInOldRoom > 0 ? 'OCCUPIED' : 'AVAILABLE' },
      }),
      this.prisma.room.update({
        where: { id: dto.newRoomId },
        data: { status: 'OCCUPIED' },
      }),
      this.prisma.guestStay.update({
        where: { id: stayId },
        data: { roomId: dto.newRoomId },
      }),
    ])

    this.events.emit('room.moved', {
      stayId,
      fromRoomId: stay.roomId,
      toRoomId: dto.newRoomId,
      propertyId: stay.propertyId,
      orgId,
    })

    // Sprint AUDIT-CORE — room move puede afectar facturación (categoría/tarifa).
    this.audit.recordRoomMoved({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      fromRoomId: stay.roomId,
      toRoomId: dto.newRoomId,
    })

    return { success: true }
  }

  /**
   * swapStayRooms — Sprint CHECK-IN C3.1 v3 (2026-05-30).
   *
   * Intercambia las habitaciones de dos GuestStays activas. Use case crítico:
   * dentro de un ReservationGroup OTA (Familia García: Hab 101 Juan, 102 María,
   * 103 Carlos) recepción quiere swap "Juan → 102, María → 101" sin pasar por
   * 2 moveRoom secuenciales (rompe disponibilidad intermedia: tras mover Juan
   * fuera de 101, María no puede entrar a 102 sin que 101 esté libre primero).
   *
   * Diseño:
   *  - Single $transaction: actualiza ambos `roomId` simultáneamente
   *  - Skip availability check — el swap es atómico, no genera ventana de
   *    conflicto intermedio. Las únicas validaciones son guards de estado
   *    (no cancelled / no-show / checked-out).
   *  - Audit per stay con event `ROOM_SWAPPED` + metadata cross-referenciado
   *  - SSE emit para refresh calendar
   *
   * Justificación vs 2× moveRoom secuenciales:
   *  - Atomicidad: no hay window donde una room queda ocupada por 2 stays
   *  - Simplicidad: no requiere "habitación temporal de paso"
   *  - Pattern industry: OpenTable swap, FIFA lineup swap, chess piece swap
   *
   * Aplica también CROSS-GROUP swap (no se valida que sean del mismo group)
   * — el use case primario es dentro de grupo, pero la operación es genérica.
   * Si en el futuro se requiere "swap solo dentro del mismo grupo", agregar
   * guard al controller.
   */
  async swapStayRooms(stayIdA: string, stayIdB: string, actorId: string, reason?: string) {
    const orgId = this.tenant.getOrganizationId()

    if (stayIdA === stayIdB) {
      throw new BadRequestException('No se puede intercambiar una reserva consigo misma')
    }

    const [stayA, stayB] = await Promise.all([
      this.prisma.guestStay.findUnique({
        where: { id: stayIdA, organizationId: orgId },
      }),
      this.prisma.guestStay.findUnique({
        where: { id: stayIdB, organizationId: orgId },
      }),
    ])

    if (!stayA) throw new NotFoundException(`Reserva ${stayIdA} no encontrada`)
    if (!stayB) throw new NotFoundException(`Reserva ${stayIdB} no encontrada`)

    // Guards de estado — terminales
    if (stayA.actualCheckout || stayB.actualCheckout) {
      throw new BadRequestException(
        'No se puede intercambiar reservas con checkout completado',
      )
    }
    if (stayA.cancelledAt || stayB.cancelledAt) {
      throw new BadRequestException(
        'No se puede intercambiar reservas canceladas',
      )
    }
    if (stayA.noShowAt || stayB.noShowAt) {
      throw new BadRequestException(
        'No se puede intercambiar reservas en flujo no-show',
      )
    }
    if (stayA.roomId === stayB.roomId) {
      throw new BadRequestException(
        'Ambas reservas ya están en la misma habitación',
      )
    }
    if (stayA.propertyId !== stayB.propertyId) {
      throw new BadRequestException(
        'No se puede intercambiar reservas de propiedades distintas',
      )
    }

    const oldRoomIdA = stayA.roomId
    const oldRoomIdB = stayB.roomId

    await this.prisma.$transaction(async (tx) => {
      // Step 1 — swap roomId en las stays
      await tx.guestStay.update({
        where: { id: stayA.id },
        data: { roomId: oldRoomIdB },
      })
      await tx.guestStay.update({
        where: { id: stayB.id },
        data: { roomId: oldRoomIdA },
      })

      // Step 2 — swap roomId en los ACTIVE StaySegments que matcheen el
      // room viejo (preserva history de moves anteriores). Solo segments
      // del journey actual son afectados.
      await tx.staySegment.updateMany({
        where: { guestStayId: stayA.id, status: 'ACTIVE', roomId: oldRoomIdA },
        data: { roomId: oldRoomIdB },
      })
      await tx.staySegment.updateMany({
        where: { guestStayId: stayB.id, status: 'ACTIVE', roomId: oldRoomIdB },
        data: { roomId: oldRoomIdA },
      })

      // Step 3 — audit logs cross-referenciados (CLAUDE.md §11 append-only)
      await tx.guestStayLog.createMany({
        data: [
          {
            stayId: stayA.id,
            event: 'ROOM_SWAPPED',
            actorId,
            metadata: {
              swappedWithStayId: stayB.id,
              swappedWithGuestName: stayB.guestName,
              fromRoomId: oldRoomIdA,
              toRoomId: oldRoomIdB,
              reason: reason ?? null,
            },
          },
          {
            stayId: stayB.id,
            event: 'ROOM_SWAPPED',
            actorId,
            metadata: {
              swappedWithStayId: stayA.id,
              swappedWithGuestName: stayA.guestName,
              fromRoomId: oldRoomIdB,
              toRoomId: oldRoomIdA,
              reason: reason ?? null,
            },
          },
        ],
      })
    })

    // SSE — refresh calendar (mismo evento usado por moveRoom)
    this.notifications.emit(stayA.propertyId, 'room:moved', {
      stayId: stayA.id,
      field: 'roomId',
      fromRoomId: oldRoomIdA,
      toRoomId: oldRoomIdB,
      orgId,
    })
    this.notifications.emit(stayB.propertyId, 'room:moved', {
      stayId: stayB.id,
      field: 'roomId',
      fromRoomId: oldRoomIdB,
      toRoomId: oldRoomIdA,
      orgId,
    })

    // Sprint AUDIT-CORE — swap cross-stay puede afectar facturación de AMBOS folios.
    this.audit.recordRoomsSwapped({
      stayIdA: stayA.id,
      stayIdB: stayB.id,
      actorStaffId: actorId,
      organizationId: orgId,
      reason,
    })

    return {
      success: true,
      stayA: { id: stayA.id, newRoomId: oldRoomIdB },
      stayB: { id: stayB.id, newRoomId: oldRoomIdA },
    }
  }

  /**
   * extendStay — Extiende la fecha de checkout de una estadía activa.
   *
   * Validaciones:
   *  - newCheckOut debe ser posterior al scheduledCheckout actual
   *  - La habitación no debe tener otra reserva en el período de extensión
   *  - La estadía no debe haber sido marcada como no-show ni como checkout
   *
   * Recalcula totalAmount en base al nuevo número de noches × ratePerNight.
   */
  async extendStay(stayId: string, newCheckOut: Date, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: { stayJourney: { select: { id: true } } },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    if (stay.actualCheckout !== null) {
      throw new BadRequestException('No se puede extender una estadía que ya realizó checkout')
    }
    if (stay.noShowAt !== null) {
      throw new BadRequestException('No se puede extender una estadía marcada como no-show')
    }
    if (newCheckOut <= stay.scheduledCheckout) {
      throw new BadRequestException('La nueva fecha de checkout debe ser posterior a la actual')
    }

    // Sprint AUDIT-CORE — extend afecta totalAmount (revenue + facturación).
    // Emit antes del delegate journey — journey service tiene su propio
    // audit trail (StayJourneyEvent), pero el audit_log universal §165
    // necesita el cross-org snapshot del extend.
    this.audit.recordStayExtended({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      previousCheckOut: stay.scheduledCheckout,
      newCheckOut,
    })

    // Always route through the journey-aware path so the extend creates a new
    // EXTENSION_SAME_ROOM segment instead of stretching the original block.
    if (stay.stayJourney) {
      return this.journeyService.extendSameRoom({
        journeyId: stay.stayJourney.id,
        newCheckOut: newCheckOut.toISOString(),
        actorId,
      })
    }

    // Stay has no journey yet (e.g. legacy seed data): bootstrap journey + extension.
    return this.journeyService.initJourneyAndExtend({
      guestStayId: stayId,
      guestName: stay.guestName,
      guestEmail: stay.guestEmail,
      organizationId: orgId,
      propertyId: stay.propertyId,
      roomId: stay.roomId,
      checkinAt: stay.checkinAt,
      scheduledCheckout: stay.scheduledCheckout,
      newCheckOut,
      ratePerNight: stay.ratePerNight,
      actorId,
    })
  }

  /**
   * markAsNoShow — Marca una estadía como no-show.
   *
   * Precondiciones:
   *  - La estadía debe estar en estado activo (sin actualCheckout ni noShowAt).
   *  - La fecha de llegada ya debe haber pasado (no se puede marcar no-show anticipado).
   *  - Se evalúa la fecha de llegada en la timezone de la propiedad para evitar
   *    errores por diferencias UTC vs local (crítico para propiedades en UTC-5 a UTC-12).
   *
   * Efectos (todos en transacción):
   *  1. Registra noShowAt, noShowById, noShowReason, fee y chargeStatus en GuestStay.
   *  2. Libera la habitación (OCCUPIED → AVAILABLE) si no hay otros huéspedes activos.
   *  3. Cancela tareas de limpieza PENDING/UNASSIGNED de las unidades de la habitación.
   *  4. Actualiza StayJourney.status → NO_SHOW y registra StayJourneyEvent.
   *
   * El cargo (feeAmount) es la primera noche (ratePerNight). Para políticas distintas
   * se configurará en el futuro via RateCode.noShowPolicy (Roadmap P2-noshow).
   * El supervisor puede exonerar el cargo con waiveCharge: true.
   *
   * IMPORTANTE FISCAL: Este registro es inmutable (no se borra, solo se puede revertir).
   * noShowFeeAmount + noShowChargeStatus quedan en la auditoría permanente de la estadía.
   */
  async markAsNoShow(
    stayId: string,
    actorId: string,
    opts?: { reason?: string; waiveCharge?: boolean },
  ) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        room: {
          include: {
            units:    { select: { id: true } },
            property: { include: { settings: true } },
          },
        },
        stayJourney: { select: { id: true } },
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    if (stay.actualCheckout) throw new ConflictException('El huésped ya realizó checkout')
    if (stay.noShowAt)        throw new ConflictException('La estadía ya está marcada como no-show')
    if (stay.actualCheckin)   throw new ConflictException('El huésped ya realizó check-in — no se puede marcar como no-show')

    const tz = stay.room.property.settings?.timezone ?? 'UTC'
    const todayLocal    = toLocalDate(new Date(), tz)
    const checkinLocal  = toLocalDate(stay.checkinAt, tz)
    if (checkinLocal > todayLocal) {
      throw new ConflictException('No se puede marcar no-show antes de la fecha de llegada')
    }

    // Sprint SEC-α — bug NS-6 (CLAUDE.md §41 ventana día hotelero real).
    // Mismo día de llegada: bloquear marcado antes de potentialNoShowWarningHour
    // (default 20:00 local) excepto si actor tiene rol SUPERVISOR.
    // El huésped puede llegar tarde — marcar a las 4 PM es prematuro y
    // genera disputas / chargebacks injustificables (Visa Core Rules §5.9.2).
    if (checkinLocal === todayLocal) {
      const warningHour = stay.room.property.settings?.potentialNoShowWarningHour ?? 20
      const currentLocalHour = toLocalHour(new Date(), tz)
      const actorRole = (() => {
        try { return this.tenant.get().role } catch { return '' }
      })()
      if (currentLocalHour < warningHour && actorRole !== 'SUPERVISOR') {
        throw new ConflictException(
          `No se puede marcar no-show antes de las ${warningHour}:00 hora local en el día de llegada. ` +
          `El huésped aún puede llegar — espera hasta la hora de corte o pide al supervisor que lo marque.`,
        )
      }
    }

    const feeAmount    = opts?.waiveCharge ? new Prisma.Decimal(0) : stay.ratePerNight
    const chargeStatus = opts?.waiveCharge ? 'WAIVED' : 'PENDING'

    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      // 1. Marcar la estadía
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          noShowAt:          now,
          noShowById:        actorId,
          noShowReason:      opts?.reason ?? null,
          noShowFeeAmount:   feeAmount,
          noShowFeeCurrency: stay.currency,
          noShowChargeStatus: chargeStatus,
        },
      })

      // 2. Liberar habitación si no hay otros huéspedes activos
      const othersActive = await tx.guestStay.count({
        where: {
          roomId:       stay.roomId,
          organizationId: orgId,
          deletedAt:    null,
          actualCheckout: null,
          noShowAt:     null,
          id: { not: stayId },
        },
      })
      if (othersActive === 0 && stay.room.status === 'OCCUPIED') {
        await tx.room.update({ where: { id: stay.roomId }, data: { status: 'AVAILABLE' } })
      }

      // 3. Cancelar tareas de limpieza activas de las unidades de la habitación
      //    Solo cancela PENDING/UNASSIGNED/READY — las IN_PROGRESS las deja (equipo supervisará)
      const unitIds = stay.room.units.map((u) => u.id)
      if (unitIds.length > 0) {
        const dayStart = new Date(`${todayLocal}T00:00:00.000Z`)
        const dayEnd   = new Date(`${todayLocal}T23:59:59.999Z`)
        await tx.cleaningTask.updateMany({
          where: {
            unitId: { in: unitIds },
            status: { in: ['PENDING', 'UNASSIGNED', 'READY'] },
            createdAt: { gte: dayStart, lte: dayEnd },
          },
          data: { status: 'CANCELLED' },
        })
      }

      // 4. Actualizar StayJourney si existe
      if (stay.stayJourney?.id) {
        await tx.stayJourney.update({
          where: { id: stay.stayJourney.id },
          data: { status: 'NO_SHOW' },
        })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'NO_SHOW_MARKED',
            actorId,
            payload: {
              reason:      opts?.reason ?? null,
              feeAmount:   feeAmount.toString(),
              chargeStatus,
              markedAt:    now.toISOString(),
            },
          },
        })
      }
    })

    this.events.emit('stay.no_show', {
      stayId,
      roomId:     stay.roomId,
      propertyId: stay.propertyId,
      orgId,
      guestName:  stay.guestName,
    })

    // Notify supervisor about the no-show (best-effort — do NOT await)
    void this.notifCenter.send({
      propertyId:    stay.propertyId,
      type:          chargeStatus === 'PENDING' ? 'ACTION_REQUIRED' : 'INFORMATIONAL',
      category:      'NO_SHOW',
      priority:      'HIGH',
      title:         `No-show — ${stay.guestName}`,
      body:          `${stay.guestName} fue marcado como no-show en Hab. ${stay.room.number}.` +
                     (chargeStatus === 'PENDING' ? ' Cargo pendiente de procesamiento.' : ''),
      metadata:      { stayId, roomId: stay.roomId },
      actionUrl:     `/reservations/${stayId}`,
      recipientType: 'ROLE',
      recipientRole: 'SUPERVISOR',
      triggeredById: actorId ?? undefined,
    }).catch((err: Error) =>
      this.logger.warn(`[NoShow] notification failed: ${err?.message}`),
    )

    this.logger.log(`No-show marcado: stay=${stayId} guest="${stay.guestName}" fee=${feeAmount} ${chargeStatus}`)

    // Sprint AUDIT-CORE — Visa CRR §5.9.2 + ISAHC no-show audit trail.
    // El audit_log es la prueba primaria de "guest didn't show up + cobro intentado".
    this.audit.recordNoShowMarked({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      feeAmount: Number(feeAmount),
      feeCurrency: stay.currency,
      reason: opts?.reason,
    })

    return { success: true, feeAmount: feeAmount.toString(), chargeStatus }
  }

  /**
   * revertNoShow — Revierte un no-show dentro de la ventana de 48 horas.
   *
   * Casos de uso: vuelo retrasado, error del recepcionista, huésped llega tarde.
   *
   * Ventana de gracia de 48h: alineada con ISAHC (Int'l Society of Hospitality Consultants)
   * y práctica de Mews/Clock PMS+. Pasadas las 48h, la reversión solo puede hacerla
   * un manager manualmente a nivel de BD (fuera de scope de la app).
   *
   * El cargo (si ya procesado) se pone en estado PENDING para revisión manual;
   * no se hace refund automático (requiere integración de pasarela).
   */
  async revertNoShow(stayId: string, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        stayJourney: { select: { id: true } },
        room:        { select: { channexRoomTypeId: true } },
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    if (!stay.noShowAt) throw new ConflictException('La estadía no está marcada como no-show')

    const hoursSince = (Date.now() - stay.noShowAt.getTime()) / 3_600_000
    if (hoursSince > 48) {
      throw new ForbiddenException('La ventana de reversión de 48 horas ha expirado')
    }

    // Guard: si el cuarto fue reasignado después del no-show, revertir crearía overbooking.
    // El recepcionista debe primero mover al nuevo huésped a otra habitación.
    const bloqueante = await this.prisma.guestStay.findFirst({
      where: {
        id:                { not: stayId },
        roomId:            stay.roomId,
        organizationId:    orgId,
        noShowAt:          null,
        actualCheckout:    null,
        checkinAt:         { lt: stay.scheduledCheckout },
        scheduledCheckout: { gt: stay.checkinAt },
      },
      select: { guestName: true },
    })
    if (bloqueante) {
      throw new ConflictException(
        `No se puede revertir: la habitación fue reasignada a ${bloqueante.guestName}. ` +
        `Mueve a ${stay.guestName} a otra habitación antes de revertir el no-show.`,
      )
    }

    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          noShowAt:          null,
          noShowById:        null,
          noShowReason:      null,
          noShowFeeAmount:   null,
          noShowFeeCurrency: null,
          // Si el cargo estaba CHARGED lo ponemos PENDING para revisión manual
          noShowChargeStatus: stay.noShowChargeStatus === 'CHARGED' ? 'PENDING' : null,
          noShowRevertedAt:   now,
          noShowRevertedById: actorId,
        },
      })

      // Restaurar habitación a OCCUPIED si no hay otra razón para que esté disponible
      const room = await tx.room.findUnique({ where: { id: stay.roomId }, select: { status: true } })
      if (room?.status === 'AVAILABLE') {
        await tx.room.update({ where: { id: stay.roomId }, data: { status: 'OCCUPIED' } })
      }

      if (stay.stayJourney?.id) {
        await tx.stayJourney.update({
          where: { id: stay.stayJourney.id },
          data: { status: 'ACTIVE' },
        })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'NO_SHOW_REVERTED',
            actorId,
            payload: { revertedAt: now.toISOString() },
          },
        })
      }
    })

    this.events.emit('stay.no_show_reverted', {
      stayId,
      roomId:     stay.roomId,
      propertyId: stay.propertyId,
      orgId,
    })

    // Notificar a Channex que la unidad vuelve a estar ocupada — best-effort (§31).
    const propertySettings = await this.prisma.propertySettings.findUnique({
      where:  { propertyId: stay.propertyId },
      select: { channexPropertyId: true, timezone: true },
    })
    const channexRoomTypeId = stay.room?.channexRoomTypeId
    if (propertySettings?.channexPropertyId && channexRoomTypeId) {
      const tz        = propertySettings.timezone ?? 'UTC'
      const localDate = toLocalDate(new Date(), tz)
      // Sprint CHANNEX-OUTBOUND-CERT Day 5 — refactor AP-2.2
      const event: ChannexAvailabilityChangedEvent = {
        propertyId: stay.propertyId,
        entries: [{
          propertyId: propertySettings.channexPropertyId,
          roomTypeId: channexRoomTypeId,
          dateFrom:   localDate,
          dateTo:     toLocalDate(stay.scheduledCheckout, tz),
          availability: 0,  // re-occupy: hotel model → 0 available
        }],
      }
      this.events.emit(CHANNEX_AVAILABILITY_CHANGED, event)
    }

    this.logger.log(`No-show revertido: stay=${stayId}`)

    // Sprint AUDIT-CORE — revert no-show puede afectar Visa CRR dispute.
    // Crítico para audit trail: si OTA reclama "guest cancelled by hotel",
    // necesitamos prueba de quién hizo revert y cuándo.
    this.audit.recordNoShowReverted({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
    })

    return { success: true }
  }

  /**
   * Registra el resultado del cobro manual del no-show. Flujo administrativo
   * 100% — Zenix NO procesa Stripe en check-in. Recepción cobra fuera de
   * Zenix (efectivo, OTA card, transferencia) y registra aquí el outcome.
   *
   * Guards:
   *   · stay debe existir + tenant scope match
   *   · noShowAt no-null (debió pasar markAsNoShow primero)
   *   · noShowChargeStatus === 'PENDING' (no se sobrescribe historial CHARGED/WAIVED/FAILED)
   *   · status='WAIVED' requiere reason explícito (≥5 chars)
   *
   * Side effects:
   *   · GuestStay.noShowChargeStatus → status del DTO
   *   · GuestStay.noShowChargeMethod → method del DTO (cash/transfer/ota_card/...)
   *   · GuestStay.noShowChargeReference → reference (opcional, audit)
   *   · GuestStay.noShowChargeAt → now()
   *   · GuestStay.noShowChargeById → actorId
   *   · GuestStay.noShowChargeReason → reason (obligatorio si WAIVED)
   *
   * Estado post-call es INMUTABLE excepto via revertNoShow (que resetea todo).
   */
  async registerNoShowCharge(
    stayId: string,
    actorId: string,
    dto: {
      status: 'CHARGED' | 'FAILED' | 'WAIVED'
      method: 'cash' | 'transfer' | 'ota_card' | 'manual_card' | 'ota_collect' | 'other'
      reference?: string
      reason?: string
    },
  ) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    if (!stay.noShowAt) {
      throw new ConflictException(
        'La estadía no está marcada como no-show — marca primero con /no-show antes de registrar el cargo',
      )
    }
    if (stay.noShowChargeStatus !== 'PENDING') {
      throw new ConflictException(
        `El cargo ya está registrado como ${stay.noShowChargeStatus}. Para reabrir, usa revertNoShow primero.`,
      )
    }
    if (dto.status === 'WAIVED' && (!dto.reason || dto.reason.trim().length < 5)) {
      throw new BadRequestException(
        'Perdonar el cargo requiere una razón explícita (≥5 caracteres) para audit trail.',
      )
    }

    await this.prisma.guestStay.update({
      where: { id: stayId },
      data: {
        noShowChargeStatus: dto.status,
        noShowChargeMethod: dto.method,
        noShowChargeReference: dto.reference?.trim() || null,
        noShowChargeAt: new Date(),
        noShowChargeById: actorId,
        noShowChargeReason: dto.reason?.trim() || null,
      },
    })

    this.logger.log(
      `No-show charge registered: stay=${stayId} status=${dto.status} method=${dto.method} ref=${dto.reference ?? '∅'} actor=${actorId}`,
    )

    // Sprint AUDIT-CORE — outcome del cobro no-show es Visa CRR + ISAHC evidence.
    this.audit.recordNoShowChargeRegistered({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      status: dto.status,
      method: dto.method,
      reference: dto.reference?.trim() || null,
      amount: stay.noShowFeeAmount ? Number(stay.noShowFeeAmount) : undefined,
      currency: stay.noShowFeeCurrency ?? undefined,
      reason: dto.reason?.trim() || undefined,
    })

    return { success: true }
  }

  // ─── Helpers exposed for night-audit scheduler ────────────────────────────

  /** Exported so NightAuditScheduler can call it without tenant context (system actor). */
  async markAsNoShowSystem(stayId: string, orgId: string, propertyId: string) {
    const stay = await this.prisma.guestStay.findUnique({
      where: { id: stayId },
      include: {
        room: { include: { units: { select: { id: true } }, property: { include: { settings: true } } } },
        stayJourney: { select: { id: true } },
      },
    })
    if (!stay || stay.actualCheckout || stay.noShowAt) return

    const tz = stay.room.property.settings?.timezone ?? 'UTC'
    const todayLocal = toLocalDate(new Date(), tz)

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          noShowAt:           new Date(),
          noShowChargeStatus: 'PENDING',
          noShowFeeAmount:    stay.ratePerNight,
          noShowFeeCurrency:  stay.currency,
          noShowReason:       'Marcado automáticamente por night audit',
        },
      })

      const othersActive = await tx.guestStay.count({
        where: {
          roomId:        stay.roomId,
          organizationId: orgId,
          deletedAt:     null,
          actualCheckout: null,
          noShowAt:      null,
          id: { not: stayId },
        },
      })
      if (othersActive === 0 && stay.room.status === 'OCCUPIED') {
        await tx.room.update({ where: { id: stay.roomId }, data: { status: 'AVAILABLE' } })
      }

      const unitIds = stay.room.units.map((u) => u.id)
      if (unitIds.length > 0) {
        const dayStart = new Date(`${todayLocal}T00:00:00.000Z`)
        const dayEnd   = new Date(`${todayLocal}T23:59:59.999Z`)
        await tx.cleaningTask.updateMany({
          where: {
            unitId: { in: unitIds },
            status: { in: ['PENDING', 'UNASSIGNED', 'READY'] },
            createdAt: { gte: dayStart, lte: dayEnd },
          },
          data: { status: 'CANCELLED' },
        })
      }

      if (stay.stayJourney?.id) {
        await tx.stayJourney.update({ where: { id: stay.stayJourney.id }, data: { status: 'NO_SHOW' } })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'NO_SHOW_MARKED',
            actorId:   null,
            payload:   { source: 'NIGHT_AUDIT', markedAt: new Date().toISOString() },
          },
        })
      }
    })

    this.logger.log(`[NightAudit] No-show automático: stay=${stayId} guest="${stay.guestName}"`)
  }

  // ─── Check-in Confirmation (Sprint 8) ────────────────────────────────────

  /**
   * GET /v1/guest-stays/:id/checkin-context
   *
   * Sprint CHECK-IN-α §107 — endpoint consolidado que precarga TODO lo que
   * la UI del dialog de check-in necesita en un solo round-trip.
   *
   * Pattern Cloudbeds "action drawer": el frontend abre el dialog y recibe
   * en una llamada: datos del stay, modelo de pago (driver de auto-skip
   * para OTA prepaid), proyección de balance, flags `canCheckIn` con
   * razones machine-readable, e identidad capturada o no.
   *
   * Reduce 3 calls separadas (stay + payments + property settings) a 1.
   */
  async getCheckinContext(stayId: string) {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        room: {
          select: {
            id: true,
            number: true,
            status: true,
            property: {
              select: {
                id: true,
                settings: true,
                legalEntity: { select: { baseCurrency: true } },
              },
            },
          },
        },
        paymentLogs: {
          where:   { isVoid: false },
          orderBy: { createdAt: 'desc' },
          take:    50,
        },
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // AUTO-CHECKIN §D-AC4 — si la foto vive en disco (scope precheckin, subida
    // por el huésped), la resolvemos a data-URI aquí (endpoint auth-gated) para
    // que recepción la vea sin exponer el archivo por el GET público. Las fotos
    // capturadas en recepción ya son data-URI → pasan tal cual. Si el archivo
    // fue purgado por retención, queda null.
    const resolvedPhotoUrl =
      stay.documentPhotoUrl && stay.documentPhotoUrl.startsWith('/api/uploads/')
        ? (this.uploads ? await this.uploads.readAsDataUri(stay.documentPhotoUrl) : null)
        : stay.documentPhotoUrl

    // Sprint CHECK-IN-α — property currency primary (5/5 PMS analizados).
    // Fallback a stay.currency si LegalEntity aún no asignada (v1.0.5 transición).
    const propertyCurrency = stay.room.property.legalEntity?.baseCurrency ?? stay.currency

    // Rates secundarios USD/EUR para display. Sólo expongo lo que la DB tiene
    // (sin inventar). FX-CORE §103: ExchangeRate Banxico SF43718 (USD/MXN).
    // Para otras monedas o EUR, queda null y la UI omite la conversión.
    const secondaryRates = await this.getSecondaryFxRates(orgId, propertyCurrency, stay.room.property.id)

    const totalAmount = Number(stay.totalAmount)
    const amountPaid  = Number(stay.amountPaid)
    const balance     = Math.max(0, totalAmount - amountPaid)

    const tz = stay.room.property.settings?.timezone ?? 'UTC'
    const todayLocal   = toLocalDate(new Date(), tz)
    const checkinLocal = toLocalDate(stay.checkinAt, tz)

    // Razones machine-readable agregadas — la UI decide qué mostrar.
    const reasons: string[] = []
    if (stay.actualCheckin !== null) reasons.push('CHECKIN_ALREADY_CONFIRMED')
    if (stay.noShowAt !== null)      reasons.push('NOSHOW_LOCKED')
    if (stay.cancelledAt !== null)   reasons.push('CANCELLED')
    if (checkinLocal > todayLocal)   reasons.push('FUTURE_CHECKIN')

    // Balance no es bloqueo absoluto (puede cubrirse con pago al confirmar
    // o por OTA_COLLECT). Se reporta como warning para que UI decida.
    const warnings: string[] = []
    if (balance > 0 && stay.paymentModel !== 'OTA_COLLECT') {
      warnings.push('BALANCE_PENDING')
    }

    return {
      stay: {
        id:                 stay.id,
        bookingRef:         stay.bookingRef,
        guestName:          stay.guestName,
        // CHECK-IN C1.12 (2026-05-29) — split BI nombre/apellido expuesto al UI.
        // Si null (stays muy viejos sin backfill), UI deriva del guestName.
        guestFirstName:     stay.guestFirstName,
        guestLastName:      stay.guestLastName,
        guestEmail:         stay.guestEmail,
        guestPhone:         stay.guestPhone,
        documentType:       stay.documentType,
        documentNumber:     stay.documentNumber,
        documentPhotoUrl:   resolvedPhotoUrl,
        nationality:        stay.nationality,
        // Sprint CHECK-IN C1 (2026-05-29) — exponer guestSex opcional.
        // Diferenciador LATAM hostal: Mews fue criticado por NO agregar
        // campo de género en reservas para dorms mixtos (Capterra hostel
        // operator). Captura opcional al check-in cierra ese gap.
        guestSex:           stay.guestSex,
        paxCount:           stay.paxCount,
        checkinAt:          stay.checkinAt.toISOString(),
        scheduledCheckout:  stay.scheduledCheckout.toISOString(),
        source:             stay.source,
        currency:           stay.currency,
        arrivalNotes:       stay.arrivalNotes,
      },
      room: {
        id:     stay.room.id,
        number: stay.room.number,
        status: stay.room.status,
      },
      paymentModel: stay.paymentModel,
      // Sprint CHECK-IN-α — primary = property currency (operacional);
      // secondaryRates expresan cuánto vale 1 unidad de propertyCurrency
      // en USD/EUR (para mostrar conversión secundaria en UI).
      propertyCurrency,
      secondaryRates,
      balanceProjection: {
        totalAmount,
        amountPaid,
        balance,
        currency: stay.currency,
      },
      canCheckIn: {
        ok:       reasons.length === 0,
        reasons,
        warnings,
      },
      // identityCaptured ahora considera foto OR número (foto preferida).
      identityCaptured: !!(stay.documentPhotoUrl || (stay.documentType && stay.documentNumber)),
      // AUTO-CHECKIN §D-AC6 — recepción ve que el huésped hizo su pre-checkin +
      // qué campos confirmó/corrigió (para mostrar el badge "pre-cargado").
      precheckinSubmittedAt: stay.precheckinSubmittedAt?.toISOString() ?? null,
      guestVerifiedFields: stay.guestVerifiedFields ?? [],
      paymentLogs: stay.paymentLogs.map((p) => ({
        id:        p.id,
        method:    p.method,
        amount:    Number(p.amount),
        currency:  p.currency,
        reference: p.reference,
        createdAt: p.createdAt.toISOString(),
      })),
    }
  }

  /**
   * Sprint CHECK-IN-α — busca rates secundarios para las 3 monedas universales
   * de hospedaje turístico (USD, EUR, MXN) excluyendo la moneda primaria.
   * Cada rate expresa "1 unidad de propertyCurrency = X targetCurrency".
   *
   * Lookup bidireccional: si hay `propertyCurrency→target` la usa directo, si
   * sólo hay `target→propertyCurrency` (caso típico Banxico USD→MXN) usa el
   * inverso. Si no hay nada, devuelve null para ese target (la UI omite).
   *
   * Considera tanto ExchangeRate (oficial Banxico §103) como PropertyFxRate
   * (override del manager §103). PropertyFxRate tiene precedencia.
   */
  private async getSecondaryFxRates(
    organizationId: string,
    propertyCurrency: string,
    propertyId: string,
  ): Promise<Record<string, number | null>> {
    const universal = ['USD', 'EUR', 'MXN'] as const
    const targets = universal.filter((c) => c !== propertyCurrency)
    const out: Record<string, number | null> = {}
    for (const t of targets) {
      out[t] = await this.lookupFxRate(organizationId, propertyId, propertyCurrency, t)
    }
    return out
  }

  /** Resolución de rate con fallback PropertyFxRate → ExchangeRate, direcciones ambas. */
  private async lookupFxRate(
    organizationId: string,
    propertyId: string,
    from: string,
    to: string,
  ): Promise<number | null> {
    const now = new Date()

    // 1. PropertyFxRate override (manager) — direct
    const overrideDirect = await this.prisma.propertyFxRate.findFirst({
      where: {
        propertyId, baseCurrency: from, quoteCurrency: to,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { validFrom: 'desc' },
    })
    if (overrideDirect && Number(overrideDirect.rate) > 0) return Number(overrideDirect.rate)

    // 2. PropertyFxRate override — inverse
    const overrideInverse = await this.prisma.propertyFxRate.findFirst({
      where: {
        propertyId, baseCurrency: to, quoteCurrency: from,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { validFrom: 'desc' },
    })
    if (overrideInverse && Number(overrideInverse.rate) > 0) return 1 / Number(overrideInverse.rate)

    // 3. ExchangeRate oficial (Banxico) — direct
    const officialDirect = await this.prisma.exchangeRate.findFirst({
      where:   { organizationId, baseCurrency: from, quoteCurrency: to },
      orderBy: { effectiveDate: 'desc' },
    })
    if (officialDirect && Number(officialDirect.rate) > 0) return Number(officialDirect.rate)

    // 4. ExchangeRate oficial — inverse
    const officialInverse = await this.prisma.exchangeRate.findFirst({
      where:   { organizationId, baseCurrency: to, quoteCurrency: from },
      orderBy: { effectiveDate: 'desc' },
    })
    if (officialInverse && Number(officialInverse.rate) > 0) return 1 / Number(officialInverse.rate)

    return null
  }

  /**
   * POST /v1/guest-stays/:id/confirm-checkin
   *
   * Confirma la llegada física del huésped. Este es el único endpoint que escribe
   * `actualCheckin` — sin él el status permanece UNCONFIRMED y el night audit
   * puede marcar no-show.
   *
   * Guards (en orden, antes de cualquier mutación):
   *  1. Ya confirmado → ConflictException
   *  2. No-show → BadRequestException
   *  3. checkIn > hoy (localmente) → BadRequestException
   *  4. documentVerified !== true → BadRequestException
   *  5. balance > 0 sin pago ni override COMP → BadRequestException { code: 'BALANCE_UNPAID' }
   *  6. method = COMP sin approvedById + approvalReason → ForbiddenException
   *  7. CARD_TERMINAL / BANK_TRANSFER sin reference → BadRequestException
   *
   * Transacción:
   *  - Crear PaymentLog[] por cada entrada en dto.payments
   *  - Actualizar GuestStay: amountPaid, paymentStatus, actualCheckin, checkinConfirmedById
   *  - Actualizar Room.status → OCCUPIED
   *  - Crear StayJourneyEvent(CHECKED_IN)
   *
   * Post-tx (fire-and-forget):
   *  - SSE checkin:confirmed
   *  - NotificationCenter INFO → housekeeping (SUPERVISOR)
   */
  async confirmCheckin(stayId: string, dto: ConfirmCheckinDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        room: {
          select: {
            id: true,
            number: true,
            status: true,
            property: { select: { id: true, settings: true } },
          },
        },
        stayJourney: { select: { id: true } },
        paymentLogs:  { where: { isVoid: false } },
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // Guard 1: ya confirmado — código machine-readable (Sprint CHECK-IN-α §110)
    if (stay.actualCheckin !== null) {
      throw new ConflictException({
        code:          'CHECKIN_ALREADY_CONFIRMED',
        message:       'El check-in ya fue confirmado',
        actualCheckin: stay.actualCheckin.toISOString(),
      })
    }

    // Guard 2: no-show
    if (stay.noShowAt !== null) {
      throw new BadRequestException({
        code:    'NOSHOW_LOCKED',
        message: 'No se puede confirmar check-in de un no-show',
      })
    }

    // Guard 2.5: cancelada (Sprint CHECK-IN C1, 2026-05-29 — gap detectado
    // en auditoría: canCheckIn.reasons incluía 'CANCELLED' pero confirmCheckin
    // no lo bloqueaba como error code. Race condition posible si otra sesión
    // cancela entre getCheckinContext y este POST. Frontend hace branching
    // específico de este code para mostrar mensaje accionable "restaura primero").
    if (stay.cancelledAt !== null) {
      throw new BadRequestException({
        code:    'CANCELLED',
        message: 'No se puede confirmar check-in de una reserva cancelada — restáurala primero',
      })
    }

    // Guard 3: fecha aún no llegó
    const tz = stay.room.property.settings?.timezone ?? 'UTC'
    const todayLocal   = toLocalDate(new Date(), tz)
    const checkinLocal = toLocalDate(stay.checkinAt, tz)
    if (checkinLocal > todayLocal) {
      throw new BadRequestException({
        code:    'FUTURE_CHECKIN',
        message: 'La fecha de check-in aún no ha llegado',
      })
    }

    // Guard 4: documento no verificado
    if (!dto.documentVerified) {
      throw new BadRequestException('Se requiere verificar el documento de identidad del huésped')
    }

    // Guard 6 & 7: validar cada entrada de pago antes de tocar BD
    for (const p of dto.payments) {
      if (
        (p.method === PaymentMethod.CARD_TERMINAL || p.method === PaymentMethod.BANK_TRANSFER) &&
        !p.reference?.trim()
      ) {
        throw new BadRequestException(
          `El método ${p.method} requiere un número de referencia de la terminal`,
        )
      }
      // GROUP-CHECKIN Fase B — aprobación de manager para COMP/$0 REMOVIDA del
      // check-in (coherente con §C1.13 + §120-bis + el fix de Fase A en
      // registerPayment). El dialog Fase D dejó de capturar approvedById/Reason
      // para cortesía → este guard daba 403 a cualquier check-in con Cortesía.
      // El control anti-fraude vive en el arqueo del turno (CashierShift §85);
      // el motivo, si aplica, va en las notas de llegada. approvedById/Reason
      // se siguen persistiendo si la UI los envía (backward-compat).
    }

    // Guard 5: balance pendiente sin pago
    // Sprint CHECK-IN-α §106 — paymentModel=OTA_COLLECT skip-ea este guard:
    // la OTA ya cobró al guest vía VCC. Marcamos folio "paid via OTA".
    const paidSoFar        = Number(stay.amountPaid)
    const totalAmount      = Number(stay.totalAmount)
    const paymentSum       = dto.payments.reduce((s, p) => s + p.amount, 0)
    const projectedBalance = totalAmount - paidSoFar - paymentSum
    const hasOtaPrepaid    = dto.payments.some((p) => p.method === PaymentMethod.OTA_PREPAID)
    const hasComp          = dto.payments.some((p) => p.method === PaymentMethod.COMP)
    const isOtaCollect     = stay.paymentModel === 'OTA_COLLECT'

    if (projectedBalance > 0 && !hasOtaPrepaid && !hasComp && !isOtaCollect) {
      throw new BadRequestException({
        code:    'BALANCE_UNPAID',
        balance: projectedBalance,
        message: `Saldo pendiente de $${projectedBalance.toFixed(2)} ${stay.currency} sin cubrir`,
      })
    }

    // Sprint CHECK-IN-α §110b — bloquear overpayment. Opera Cloud + RoomRaccoon
    // hacen lo mismo (2/5 PMS analizados). Depósitos por incidentales son flujo
    // aparte (v1.0.1 PAY-CORE), no parte del check-in.
    // Tolerancia 0.01 para evitar falsos positivos por rounding de float JS.
    if (projectedBalance < -0.01 && !hasComp && !isOtaCollect) {
      throw new BadRequestException({
        code:      'BALANCE_OVERPAID',
        excess:    Math.abs(projectedBalance),
        message:   `El pago excede el saldo por $${Math.abs(projectedBalance).toFixed(2)} ${stay.currency}. Ajusta el monto al saldo exacto.`,
      })
    }

    const now = new Date()
    const shiftDate = shiftDateForTimezone(now, tz)

    await this.prisma.$transaction(async (tx) => {
      // BUG #7 fix 2026-06-04 — advisory lock + re-check actualCheckin null.
      //
      // Pre-prod testing detectó: 2 confirm-checkin concurrentes contra el
      // mismo stay ambos retornaban 201 (race entre los Guards 1 fuera de la
      // transaction y el commit). Sin lock, ambos pasaban "Guard 1: ya
      // confirmado" porque actualCheckin estaba null para ambos al leer.
      //
      // Lock keyed por hash(stayId) — serialize. Después re-check actualCheckin
      // dentro del tx; si otra request lo escribió entre el lock y aquí, lanzamos
      // CHECKIN_ALREADY_CONFIRMED para idempotencia clara.
      // Try/catch para no romper unit tests con mock $transaction client sin $executeRawUnsafe.
      try {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
          `checkin:${stayId}`,
        )
        // BUG #31 fix (Bloque GG4) — segundo advisory lock per-roomId.
        // El lock per-stayId NO serializa 2 confirm-checkin a stays DISTINTAS
        // en MISMA room. Sin este lock, 2 guests pueden "checkear-in" en la
        // misma habitación PRIVATE concurrentemente — overbooking real.
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
          `checkin:room:${stay.roomId}`,
        )
      } catch (e) {
        // En tests con mock prisma, $executeRawUnsafe no existe — la idempotencia
        // se valida con el findUnique recheck inmediato.
        if (!(e instanceof TypeError)) throw e
      }
      const recheck = await tx.guestStay.findUnique({
        where: { id: stayId },
        select: { actualCheckin: true },
      })
      if (recheck?.actualCheckin) {
        throw new ConflictException({
          code:          'CHECKIN_ALREADY_CONFIRMED',
          message:       'El check-in ya fue confirmado por otra sesión',
          actualCheckin: recheck.actualCheckin.toISOString(),
        })
      }

      // BUG #31 fix — guard contra room PRIVATE ya ocupada por otra stay.
      // Para rooms DORMITORY multi-bed el caso es legítimo (compartido). Para
      // PRIVATE, dos stays simultáneamente checked-in es overbooking visible.
      //
      // BUG E2E-13 fix (2026-06-08) — excluir zombies/overstayed (§128). Sin
      // este guard la query bloqueaba check-ins legítimos: si la stay previa
      // (Elena) tenía actualCheckin + null actualCheckout pero scheduledCheckout
      // ya pasó (huésped se fue, recepción olvidó marcar checkout), AvailabilityService
      // SÍ libera la room, pero confirmCheckin la sigue viendo "ocupada". Resulta
      // en check-in physically posible pero blocked por sistema. Mismo criterio
      // que dashboard.service.ts E2E-9 + AvailabilityService.effectiveCheckoutCutoff.
      const roomCategory = await tx.room.findUnique({
        where: { id: stay.roomId },
        select: { category: true },
      })
      if (roomCategory?.category === 'PRIVATE') {
        // startOfDay UTC — mismo cutoff que dashboard.service E2E-9
        const todayStart = new Date()
        todayStart.setUTCHours(0, 0, 0, 0)
        const otherActive = await tx.guestStay.findFirst({
          where: {
            roomId: stay.roomId,
            organizationId: orgId,
            deletedAt: null,
            actualCheckin: { not: null },
            actualCheckout: null,
            cancelledAt: null,
            noShowAt: null,
            scheduledCheckout: { gte: todayStart },
            id: { not: stayId },
          },
          select: { id: true, guestName: true },
        })
        if (otherActive) {
          throw new ConflictException({
            code: 'ROOM_ALREADY_OCCUPIED',
            message: `La habitación ya está ocupada por ${otherActive.guestName}. Mueve a una habitación libre antes de confirmar el check-in.`,
            occupyingStayId: otherActive.id,
          })
        }
      }

      // 1. Crear registros de pago (append-only)
      // CASH-DRAWER (D-CASH14) — liga los pagos en efectivo del check-in al turno
      // abierto. Se resuelve una vez (el turno es el mismo); null para no-CASH.
      const anyCash = dto.payments.some((p) => p.method === PaymentMethod.CASH)
      const cashShiftId = anyCash
        ? ((await this.cashierShift?.resolveShiftForCashPayment(
            stay.propertyId,
            actorId,
            PaymentMethod.CASH,
          )) ?? null)
        : null
      for (const p of dto.payments) {
        await tx.paymentLog.create({
          data: {
            organizationId: orgId,
            propertyId:     stay.propertyId,
            stayId,
            method:         p.method as any,
            amount:         p.amount,
            currency:       stay.currency,
            reference:      p.reference ?? null,
            approvedById:   p.approvedById ?? null,
            approvalReason: p.approvalReason ?? null,
            shiftDate,
            collectedById:  actorId,
            cashierShiftId: p.method === PaymentMethod.CASH ? cashShiftId : null,
          },
        })
      }

      // 2. Calcular nuevo amountPaid y paymentStatus
      // OTA_COLLECT: folio se considera PAID aunque no haya PaymentLog
      // (reconciliación contra VCC payout llega en v1.0.1 PAY-CORE).
      const newAmountPaid = paidSoFar + paymentSum
      const paymentStatus =
        hasOtaPrepaid || hasComp || isOtaCollect || newAmountPaid >= totalAmount
          ? 'PAID'
          : newAmountPaid > 0
            ? 'PARTIAL'
            : 'PENDING'

      // 3. Confirmar check-in
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          actualCheckin:          now,
          checkinConfirmedById:   actorId,
          amountPaid:             newAmountPaid,
          paymentStatus,
          documentType:           dto.documentType     ?? stay.documentType,
          documentNumber:         dto.documentNumber   ?? stay.documentNumber,
          documentPhotoUrl:       dto.documentPhotoUrl ?? stay.documentPhotoUrl,
          arrivalNotes:           dto.arrivalNotes     ?? null,
          // CHECK-IN C1 (2026-05-29) — opcionales BI/analytics.
          // Preserva valores existentes si dto vino vacío.
          nationality:            dto.nationality      ?? stay.nationality,
          guestSex:               dto.guestSex         ?? stay.guestSex,
          // CHECK-IN C1.11 (2026-05-29) — recepción corrige tel/email
          // si OTA pre-llenó con datos truncados/erróneos.
          guestPhone:             dto.guestPhone       ?? stay.guestPhone,
          guestEmail:             dto.guestEmail       ?? stay.guestEmail,
          // CHECK-IN C1.12 (2026-05-29) — split BI nombre/apellido con
          // title-case obligatorio (consistencia: "aa" → "Aa", "JOSE" → "Jose").
          // Si se provee, sync guestName = "firstName lastName" para back-compat.
          guestFirstName:         dto.guestFirstName  ? titleCase(dto.guestFirstName) : stay.guestFirstName,
          guestLastName:          dto.guestLastName   ? titleCase(dto.guestLastName)  : stay.guestLastName,
          guestName:              dto.guestFirstName || dto.guestLastName
                                    ? `${titleCase(dto.guestFirstName ?? stay.guestFirstName ?? '')} ${titleCase(dto.guestLastName ?? stay.guestLastName ?? '')}`.trim() || stay.guestName
                                    : stay.guestName,
          keyType:                dto.keyType          ?? null,
        },
      })

      // 4. Marcar habitación como ocupada
      await tx.room.update({
        where: { id: stay.roomId },
        data: { status: 'OCCUPIED' },
      })

      // 5. Audit trail
      if (stay.stayJourney?.id) {
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'CHECKED_IN',
            actorId,
            payload: {
              confirmedAt:      now.toISOString(),
              documentVerified: dto.documentVerified,
              documentType:     dto.documentType,
              // PII: enmascarar últimos 4 dígitos — nunca loguear número completo
              documentNumber:   dto.documentNumber ? `***${dto.documentNumber.slice(-4)}` : undefined,
              keyType:          dto.keyType,
              arrivalNotes:     dto.arrivalNotes,
              paymentSum,
              paymentStatus,
              methods:          dto.payments.map((p) => p.method),
            },
          },
        })
      }
    })

    // Post-tx: SSE + notificación (fire-and-forget)
    this.events.emit('checkin.confirmed', {
      stayId,
      roomId:     stay.roomId,
      propertyId: stay.propertyId,
      orgId,
      guestName:  stay.guestName,
    })

    void this.notifCenter.send({
      propertyId:    stay.propertyId,
      type:          'INFORMATIONAL',
      category:      'CHECKIN_UNCONFIRMED',
      priority:      'MEDIUM',
      title:         `Check-in confirmado — ${stay.guestName}`,
      body:          `${stay.guestName} ingresó a Hab. ${stay.room.number}. Habitación en estado OCCUPIED.`,
      metadata:      { stayId, roomId: stay.roomId },
      actionUrl:     `/reservations/${stayId}`,
      recipientType: 'ROLE',
      recipientRole: 'SUPERVISOR',
      triggeredById: actorId,
    }).catch((err: Error) =>
      this.logger.warn(`[ConfirmCheckin] notification failed: ${err?.message}`),
    )

    this.logger.log(`[ConfirmCheckin] stay=${stayId} guest="${stay.guestName}" paid=${paidSoFar + paymentSum}`)

    // Sprint AUDIT-CORE — emit audit event post-tx exitosa.
    // Visa CRR §5.9.2 chargeback evidence: la captura del documento + check-in
    // físico es la prueba primaria de "guest checked in and consumed the service".
    this.audit.recordStayCheckinConfirmed({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      documentVerified: !!dto.documentVerified,
      paymentModel: (stay as { paymentModel?: string | null }).paymentModel ?? null,
      balanceAtCheckin: Number(stay.totalAmount) - (paidSoFar + paymentSum),
    })

    return { success: true, actualCheckin: now.toISOString() }
  }

  /**
   * POST /v1/guest-stays/:id/payments
   * Registra un pago adicional sobre una estadía (sin tocar actualCheckin).
   * Útil para abonos parciales, cobros extra de mini-bar, extensiones, etc.
   */
  async registerPayment(stayId: string, dto: RegisterPaymentDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: {
        id: true, propertyId: true, currency: true, amountPaid: true, totalAmount: true,
        noShowAt: true, reservationGroupId: true,
        room: { select: { property: { select: { settings: { select: { timezone: true } } } } } },
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    if (stay.noShowAt) throw new BadRequestException('No se puede registrar pago en un no-show')

    if (
      (dto.method === PaymentMethod.CARD_TERMINAL || dto.method === PaymentMethod.BANK_TRANSFER) &&
      !dto.reference?.trim()
    ) {
      throw new BadRequestException(`El método ${dto.method} requiere número de referencia`)
    }
    // GROUP-PAYMENTS Fase A — aprobación de manager para COMP/$0 REMOVIDA
    // (coherente con §C1.13 + §120-bis del check-in: recepción conoce los
    // códigos de cortesía, el control anti-fraude vive en el arqueo del turno
    // CashierShift §85). El motivo, si aplica, va en las notas de la reserva.

    const now = new Date()
    const tz = stay.room?.property?.settings?.timezone ?? 'UTC'
    const shiftDate = shiftDateForTimezone(now, tz)

    // ── Group payment path (D-GRP-A1/A4) ─────────────────────────────────────
    // Si appliesToStayIds tiene >1 entrada (o una distinta a la stay en
    // contexto), el pago se distribuye entre varias habitaciones del grupo.
    const targetIds = dto.appliesToStayIds?.length ? dto.appliesToStayIds : [stayId]
    const isGroupPayment = targetIds.length > 1 || (targetIds.length === 1 && targetIds[0] !== stayId)

    if (isGroupPayment) {
      return this.registerGroupPayment({
        payerStayId: stayId,
        payerGroupId: stay.reservationGroupId,
        targetIds,
        dto,
        orgId,
        propertyId: stay.propertyId,
        currency: stay.currency,
        shiftDate,
        actorId,
      })
    }

    // ── Single payment path ──────────────────────────────────────────────────
    //
    // BUG #17 fix 2026-06-04 — natural-key dedup vía `reference` + advisory lock.
    //
    // Pre-prod testing detectó: POST /payments con MISMO body 3× concurrente
    // → 3 PaymentLogs creados → guest cobrado 3× ($75 en vez de $25). Risk
    // real en POS con red lenta + doble-click del recepcionista.
    //
    // Fix: lock + check + create EN LA MISMA $transaction. Las 3 requests
    // serializan en el advisory lock; la primera crea, las 2 restantes ven el
    // log ya creado en su findFirst dentro de su lock-window y retornan
    // idempotent. Pattern Stripe Idempotency-Key adaptado al field natural.
    //
    // Si NO trae reference (cash sin código), pago se permite duplicar — es
    // responsabilidad del operador no recobrar el mismo monto.
    const newAmountPaid = Number(stay.amountPaid) + dto.amount
    const totalAmount   = Number(stay.totalAmount)
    const ref = dto.reference?.trim() || null

    // CASH-DRAWER (D-CASH14) — liga el efectivo al turno de caja abierto del cajero.
    // best-effort: null si no-CASH o sin turno (bandera off); ConflictException si
    // cashShiftRequired está activo y no hay turno abierto.
    const cashierShiftId =
      (await this.cashierShift?.resolveShiftForCashPayment(stay.propertyId, actorId, dto.method)) ?? null

    const log = await this.prisma.$transaction(async (tx) => {
      // Lock primero (solo si hay reference) para serializar concurrent dups.
      if (ref) {
        try {
          await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
            `payment:dedup:${stayId}:${ref}`,
          )
        } catch (e) {
          if (!(e instanceof TypeError)) throw e
        }
        // Check: ¿ya existe pago no-void con esta (stay, reference) en 5min?
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000)
        const existing = await tx.paymentLog.findFirst({
          where: { stayId, reference: ref, isVoid: false, createdAt: { gte: fiveMinAgo } },
          orderBy: { createdAt: 'desc' },
        })
        if (existing) {
          this.logger.log(
            `[Payment.dedup] stay=${stayId} ref="${ref}" → returning existing log=${existing.id}`,
          )
          return existing
        }
      }
      // No-dedup path o primer caller con esta reference: crear + update stay.
      const created = await tx.paymentLog.create({
        data: {
          organizationId: orgId,
          propertyId:     stay.propertyId,
          stayId,
          method:         dto.method as any,
          amount:         dto.amount,
          // BUG #13 fix 2026-06-04 — accept opcional dto.currency ISO 4217.
          // Si no se envía, fallback a folio currency (backward-compat). El
          // FX lock + rate freeze para multi-divisa real entran en v1.0.1
          // PAY-CORE (§81 PaymentFxLock + Banxico SF43718).
          currency:       dto.currency ?? stay.currency,
          reference:      ref,
          approvedById:   dto.approvedById ?? null,
          approvalReason: dto.approvalReason ?? null,
          // paidByStayId: pago de la propia stay salvo que un pagador de grupo
          // se declare explícitamente (caso "Juan paga SOLO la hab de María").
          paidByStayId:   dto.paidByStayId && dto.paidByStayId !== stayId ? dto.paidByStayId : null,
          shiftDate,
          collectedById:  actorId,
          cashierShiftId,
        },
      })
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          amountPaid:    newAmountPaid,
          paymentStatus: newAmountPaid >= totalAmount ? 'PAID' : newAmountPaid > 0 ? 'PARTIAL' : 'PENDING',
        },
      })
      return created
    })

    this.logger.log(`[RegisterPayment] stay=${stayId} method=${dto.method} amount=${dto.amount}`)

    // Sprint AUDIT-CORE — Visa CRR §5.9.2 + CFDI Art. 30 (5y retention).
    // Cada pago es chargeback evidence + comprobante fiscal.
    this.audit.recordPaymentRegistered({
      paymentLogId: log.id,
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      method: dto.method,
      amount: Number(dto.amount),
      currency: stay.currency,
      reference: dto.reference ?? null,
    })

    return log
  }

  /**
   * GROUP-PAYMENTS Fase A (D-GRP-A1/A4) — distribuye UN cobro entre varias
   * habitaciones del mismo grupo. El monto se reparte proporcionalmente al
   * balance de cada stay; se crea un PaymentLog por stay (mismo
   * transactionGroupId + paidByStayId = el pagador). Arqueo correcto (el
   * dinero entró por el pagador) + balance correcto (cada habitación se salda).
   */
  private async registerGroupPayment(args: {
    payerStayId: string
    payerGroupId: string | null
    targetIds: string[]
    dto: RegisterPaymentDto
    orgId: string
    propertyId: string
    currency: string
    shiftDate: Date
    actorId: string
  }) {
    const { payerStayId, payerGroupId, targetIds, dto, orgId, propertyId, currency, shiftDate, actorId } = args

    if (!payerGroupId) {
      throw new BadRequestException('La habitación pagadora no pertenece a un grupo')
    }

    // Cargar las stays destino — deben ser del MISMO grupo, misma org, activas.
    const targets = await this.prisma.guestStay.findMany({
      where: { id: { in: targetIds }, organizationId: orgId },
      select: {
        id: true, amountPaid: true, totalAmount: true,
        noShowAt: true, cancelledAt: true, reservationGroupId: true,
      },
    })
    if (targets.length !== targetIds.length) {
      throw new NotFoundException('Una o más habitaciones del grupo no existen')
    }
    for (const t of targets) {
      if (t.reservationGroupId !== payerGroupId) {
        throw new BadRequestException('Todas las habitaciones deben pertenecer al mismo grupo')
      }
      if (t.noShowAt || t.cancelledAt) {
        throw new BadRequestException('No se puede cobrar a una habitación cancelada o no-show')
      }
    }

    // Balance pendiente por stay; solo se distribuye entre las que deben.
    const withBalance = targets
      .map((t) => ({ id: t.id, paid: Number(t.amountPaid), total: Number(t.totalAmount), balance: Math.max(0, Number(t.totalAmount) - Number(t.amountPaid)) }))
      .filter((t) => t.balance > 0.001)
    const totalBalance = withBalance.reduce((s, t) => s + t.balance, 0)
    if (totalBalance <= 0.001) {
      throw new BadRequestException('El grupo no tiene saldo pendiente')
    }

    // Distribución proporcional al balance; el remanente por redondeo se asigna
    // a la última stay para que la suma cuadre exactamente con dto.amount.
    const round2 = (n: number) => Math.round(n * 100) / 100
    let allocated = 0
    const transactionGroupId = randomUUID()
    const shares = withBalance.map((t, i) => {
      const isLast = i === withBalance.length - 1
      const share = isLast ? round2(dto.amount - allocated) : round2(dto.amount * (t.balance / totalBalance))
      allocated += share
      return { ...t, share }
    })

    // CASH-DRAWER (D-CASH14) — liga el cobro de grupo en efectivo al turno abierto.
    const cashierShiftId =
      (await this.cashierShift?.resolveShiftForCashPayment(propertyId, actorId, dto.method)) ?? null

    const logs = await this.prisma.$transaction(async (tx) => {
      const created: Array<Awaited<ReturnType<typeof tx.paymentLog.create>>> = []
      for (const s of shares) {
        if (s.share <= 0) continue
        const log = await tx.paymentLog.create({
          data: {
            organizationId: orgId,
            propertyId,
            stayId:             s.id,
            method:             dto.method as any,
            amount:             s.share,
            currency,
            reference:          dto.reference ?? null,
            paidByStayId:       payerStayId,
            transactionGroupId,
            shiftDate,
            collectedById:      actorId,
            cashierShiftId,
          },
        })
        const newPaid = s.paid + s.share
        await tx.guestStay.update({
          where: { id: s.id },
          data: {
            amountPaid:    newPaid,
            paymentStatus: newPaid >= s.total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'PENDING',
          },
        })
        created.push(log)
      }
      return created
    })

    this.logger.log(`[RegisterPayment][group] payer=${payerStayId} stays=${shares.length} total=${dto.amount} txn=${transactionGroupId}`)
    // Backward-compat: el frontend espera un PaymentLog. Devolvemos el del
    // pagador si pagó lo suyo, si no el primero del lote.
    return logs.find((l) => l.stayId === payerStayId) ?? logs[0]
  }

  /**
   * GET /v1/guest-stays/:id/group-balances
   * GROUP-PAYMENTS Fase A (D-GRP-A3) — desglose de balances por habitación del
   * grupo al que pertenece `stayId`. Alimenta la sección Grupo del
   * BookingDetailSheet ("Hab 101 · Juan · ✓ Pagado" / "Hab 102 · María · Debe $X")
   * + el selector "¿quién paga?" del check-in (D-GRP-A4).
   */
  async getGroupBalances(stayId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: { reservationGroupId: true },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    if (!stay.reservationGroupId) {
      return { groupId: null as string | null, currency: null as string | null, stays: [] }
    }

    const stays = await this.prisma.guestStay.findMany({
      where: { reservationGroupId: stay.reservationGroupId, organizationId: orgId },
      select: {
        id: true, guestName: true, currency: true, amountPaid: true, totalAmount: true,
        paymentStatus: true, paymentModel: true, actualCheckin: true, noShowAt: true, cancelledAt: true,
        groupRoomIndex: true,
        room: { select: { number: true } },
      },
      orderBy: { groupRoomIndex: 'asc' },
    })

    return {
      groupId: stay.reservationGroupId,
      currency: stays[0]?.currency ?? null,
      stays: stays.map((s) => ({
        stayId:        s.id,
        roomNumber:    s.room?.number ?? null,
        roomIndex:     s.groupRoomIndex ?? null,
        guestName:     s.guestName,
        totalAmount:   Number(s.totalAmount),
        amountPaid:    Number(s.amountPaid),
        balance:       Math.max(0, Number(s.totalAmount) - Number(s.amountPaid)),
        paymentStatus: s.paymentStatus,
        paymentModel:  s.paymentModel,
        checkedIn:     !!s.actualCheckin,
        cancelled:     !!s.cancelledAt,
        noShow:        !!s.noShowAt,
        isContext:     s.id === stayId,
      })),
    }
  }

  /**
   * POST /v1/guest-stays/group-checkin
   * GROUP-CHECKIN Fase B (D-GRP-B1/B2/B3) — check-in bulk de los miembros de un
   * grupo que LLEGARON. Las habitaciones ausentes simplemente no se incluyen en
   * `members` → quedan pendientes para el night audit (§4.3, "no llegó" = skip).
   *
   * Por miembro: valida (no checked-in / no no-show / no cancelada / fecha
   * llegada / saldo cubierto u OTA-collect) y, si pasa, confirma check-in +
   * room OCCUPIED + rename opcional (no bloqueante). El pago NO se procesa aquí
   * (se cubre en A4 group payment, OTA, o pago previo). Cada miembro es
   * independiente — un fallo de validación no aborta a los demás (partial
   * success deseado). Devuelve resultado per-miembro para feedback en la UI.
   */
  async bulkCheckin(dto: BulkCheckinDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    if (!dto.documentVerified) {
      throw new BadRequestException('Se requiere verificar la identidad de los huéspedes')
    }

    const ids = dto.members.map((m) => m.stayId)
    const stays = await this.prisma.guestStay.findMany({
      where: { id: { in: ids }, organizationId: orgId },
      select: {
        id: true, roomId: true, guestName: true, guestFirstName: true, guestLastName: true,
        actualCheckin: true, noShowAt: true, cancelledAt: true, checkinAt: true,
        amountPaid: true, totalAmount: true, paymentModel: true,
        stayJourney: { select: { id: true } },
        room: { select: { property: { select: { settings: { select: { timezone: true } } } } } },
      },
    })
    const byId = new Map(stays.map((s) => [s.id, s]))

    const results: Array<{ stayId: string; status: string; guestName?: string; balance?: number }> = []
    const now = new Date()

    for (const m of dto.members) {
      const stay = byId.get(m.stayId)
      if (!stay)                              { results.push({ stayId: m.stayId, status: 'not_found' }); continue }
      if (stay.actualCheckin)                 { results.push({ stayId: m.stayId, status: 'already_checked_in' }); continue }
      if (stay.noShowAt || stay.cancelledAt)  { results.push({ stayId: m.stayId, status: 'blocked' }); continue }

      const tz = stay.room?.property?.settings?.timezone ?? 'UTC'
      if (toLocalDate(stay.checkinAt, tz) > toLocalDate(now, tz)) {
        results.push({ stayId: m.stayId, status: 'future' }); continue
      }

      const balance   = Number(stay.totalAmount) - Number(stay.amountPaid)
      const isOtaColl  = stay.paymentModel === 'OTA_COLLECT'
      if (balance > 0.01 && !isOtaColl) {
        results.push({ stayId: m.stayId, status: 'balance_unpaid', balance }); continue
      }

      // Rename opcional (no bloqueante) — split + title-case, sync guestName.
      const rename = m.guestName?.trim()
      let firstName = stay.guestFirstName
      let lastName  = stay.guestLastName
      let fullName  = stay.guestName
      if (rename) {
        const parts = rename.split(/\s+/)
        firstName = titleCase(parts[0] ?? '')
        lastName  = titleCase(parts.slice(1).join(' '))
        fullName  = `${firstName} ${lastName}`.trim() || rename
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.guestStay.update({
          where: { id: stay.id },
          data: {
            actualCheckin:        now,
            checkinConfirmedById: actorId,
            paymentStatus:        'PAID',
            ...(rename ? { guestName: fullName, guestFirstName: firstName, guestLastName: lastName } : {}),
          },
        })
        await tx.room.update({ where: { id: stay.roomId }, data: { status: 'OCCUPIED' } })
        if (stay.stayJourney?.id) {
          await tx.stayJourneyEvent.create({
            data: {
              journeyId: stay.stayJourney.id,
              eventType: 'CHECKED_IN',
              actorId,
              payload: {
                confirmedAt:      now.toISOString(),
                documentVerified: dto.documentVerified,
                via:              'group_bulk',
                renamed:          !!rename,
              },
            },
          })
        }
      })

      results.push({ stayId: m.stayId, status: 'checked_in', guestName: fullName })
    }

    const checkedIn = results.filter((r) => r.status === 'checked_in').length
    this.logger.log(`[BulkCheckin] checkedIn=${checkedIn}/${dto.members.length}`)
    return { checkedIn, total: dto.members.length, results }
  }

  /**
   * POST /v1/guest-stays/payments/:paymentLogId/void
   * Anula un PaymentLog creando una entrada negativa (append-only).
   * El registro original nunca se modifica (USALI audit trail requirement).
   */
  async voidPayment(paymentLogId: string, dto: VoidPaymentDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()

    const original = await this.prisma.paymentLog.findUnique({
      where: { id: paymentLogId },
      include: {
        stay: {
          select: {
            organizationId: true, amountPaid: true, totalAmount: true, currency: true, propertyId: true,
            room: { select: { property: { select: { settings: { select: { timezone: true } } } } } },
          },
        },
      },
    })
    if (!original) throw new NotFoundException('Registro de pago no encontrado')
    if (original.stay.organizationId !== orgId) throw new ForbiddenException()
    if (original.isVoid) throw new ConflictException('Este registro ya fue anulado')

    const voidEntry = await this.prisma.paymentLog.findFirst({ where: { voidsLogId: paymentLogId } })
    if (voidEntry) throw new ConflictException('Ya existe una anulación para este pago')

    const now         = new Date()
    const tz          = original.stay.room?.property?.settings?.timezone ?? 'UTC'
    const shiftDate   = shiftDateForTimezone(now, tz)
    const voidAmount  = -Number(original.amount)
    const newPaid     = Math.max(0, Number(original.stay.amountPaid) + voidAmount)
    const totalAmount = Number(original.stay.totalAmount)

    // CASH-DRAWER (D-CASH14) — la devolución en efectivo SALE de la gaveta del
    // turno ACTIVO (no del turno donde se cobró). Liga el void al turno abierto del
    // cajero para que reste de SU arqueo. No-CASH → null.
    const cashierShiftId =
      (await this.cashierShift?.resolveShiftForCashPayment(original.stay.propertyId, actorId, original.method)) ?? null

    await this.prisma.$transaction([
      this.prisma.paymentLog.create({
        data: {
          organizationId: orgId,
          propertyId:     original.stay.propertyId,
          stayId:         original.stayId,
          method:         original.method,
          amount:         voidAmount,
          currency:       original.currency,
          isVoid:         true,
          voidedAt:       now,
          voidedById:     actorId,
          voidReason:     dto.voidReason,
          voidsLogId:     paymentLogId,
          shiftDate,
          collectedById:  actorId,
          cashierShiftId,
        },
      }),
      this.prisma.guestStay.update({
        where: { id: original.stayId },
        data: {
          amountPaid:    newPaid,
          paymentStatus: newPaid >= totalAmount ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'PENDING',
        },
      }),
    ])

    this.logger.log(`[VoidPayment] paymentLogId=${paymentLogId} amount=${original.amount} voided by ${actorId}`)

    // Sprint AUDIT-CORE — void de pago es operación sensible §28 USALI append-only.
    // Necesita trail explícito: quién voidió, cuándo, por qué.
    const voidEntry2 = await this.prisma.paymentLog.findFirst({
      where: { voidsLogId: paymentLogId }, select: { id: true },
    })
    this.audit.recordPaymentVoided({
      paymentLogId,
      voidingLogId: voidEntry2?.id ?? 'unknown',
      stayId: original.stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      reason: dto.voidReason,
    })

    return { success: true }
  }

  /**
   * GET /v1/guest-stays/:id/payments — Sprint EDIT-RESERVATION.
   * Devuelve TODOS los PaymentLogs (originales + voids) ordenados desc.
   * La UI distingue voided vía isVoid + voidsLogId.
   */
  /**
   * Timeline unificado: GuestStayLog (stay-level) + StayJourneyEvent (journey-level).
   * Ordenado cronológicamente. Sprint 2026-05-19.
   *
   * Resuelve nombres de actor en una sola batch (sin N+1). Devuelve eventos
   * con shape uniforme para el renderer del frontend.
   */
  async getTimeline(stayId: string): Promise<
    Array<{
      id: string
      source: 'STAY' | 'JOURNEY'
      eventType: string
      occurredAt: Date
      actorName: string | null
      metadata: Record<string, unknown> | null
    }>
  > {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: { id: true, createdAt: true, stayJourney: { select: { id: true } } },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    const journeyId = stay.stayJourney?.id ?? null

    const [stayLogs, journeyEvents] = await Promise.all([
      this.prisma.guestStayLog.findMany({
        where: { stayId },
        orderBy: { occurredAt: 'asc' },
      }),
      journeyId
        ? this.prisma.stayJourneyEvent.findMany({
            where: { journeyId },
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
    ])

    // Resolve actor names in single batch.
    const actorIds = [
      ...new Set(
        [...stayLogs, ...journeyEvents]
          .map((e) => e.actorId)
          .filter((id): id is string => !!id),
      ),
    ]
    const staff = actorIds.length === 0
      ? []
      : await this.prisma.staff.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
    const nameById = new Map(staff.map((s) => [s.id, s.name]))

    // Resolve roomIds → roomNumber so labels pueden decir "Hab. A2" en vez de
    // UUIDs. Recolectamos cualquier campo que parezca roomId en los payloads.
    const roomIdKeys = ['roomId', 'fromRoomId', 'toRoomId', 'previousRoomId']
    const collectRoomIds = (payload: unknown): string[] => {
      if (!payload || typeof payload !== 'object') return []
      const obj = payload as Record<string, unknown>
      return roomIdKeys
        .map((k) => obj[k])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    }
    const allRoomIds = [
      ...new Set([
        ...stayLogs.flatMap((l) => collectRoomIds(l.metadata)),
        ...journeyEvents.flatMap((e) => collectRoomIds(e.payload)),
      ]),
    ]
    const rooms = allRoomIds.length === 0
      ? []
      : await this.prisma.room.findMany({
          where: { id: { in: allRoomIds } },
          select: { id: true, number: true },
        })
    const roomNumberById = new Map(rooms.map((r) => [r.id, r.number]))

    // Decora cada payload con los room numbers resueltos. El frontend usa estos
    // campos `*RoomNumber` para construir labels específicos sin necesidad de
    // una query adicional. Si un roomId no resuelve (room eliminada legacy),
    // pasa null — el frontend cae a "Hab. (eliminada)".
    const decorate = (payload: Record<string, unknown> | null) => {
      if (!payload) return null
      const enriched: Record<string, unknown> = { ...payload }
      for (const key of roomIdKeys) {
        const val = payload[key]
        if (typeof val === 'string') {
          enriched[`${key}Number`] = roomNumberById.get(val) ?? null
        }
      }
      return enriched
    }

    const fromStay = stayLogs.map((log) => ({
      id: `stay:${log.id}`,
      source: 'STAY' as const,
      eventType: log.event,
      occurredAt: log.occurredAt,
      actorName: log.actorId ? nameById.get(log.actorId) ?? null : null,
      metadata: decorate(log.metadata as Record<string, unknown> | null),
    }))

    const fromJourney = journeyEvents.map((evt) => ({
      id: `journey:${evt.id}`,
      source: 'JOURNEY' as const,
      eventType: evt.eventType,
      occurredAt: evt.occurredAt,
      actorName: evt.actorId ? nameById.get(evt.actorId) ?? null : null,
      metadata: decorate(evt.payload as Record<string, unknown> | null),
    }))

    // Si no hay un GuestStayLog `CREATED` sintetizamos uno desde `stay.createdAt`
    // — stays legacy (pre-sprint EDIT-RESERVATION) no tienen ese log.
    const hasCreated = stayLogs.some((l) => l.event === 'CREATED' || l.event === 'STAY_CREATED')
    const synthetic = hasCreated
      ? []
      : [{
          id: `synthetic:created`,
          source: 'STAY' as const,
          eventType: 'CREATED',
          occurredAt: stay.createdAt,
          actorName: null,
          metadata: null,
        }]

    return [...synthetic, ...fromStay, ...fromJourney].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    )
  }

  /**
   * Guest stats agregadas — repeat guest indicator. Sprint 2026-05-20.
   * Mews + Opera top cross-PMS request: "¿es cliente recurrente o primera visita?"
   *
   * Aggregación por email O phone (cualquiera de los dos identifica al guest;
   * el mismo email + phone distintos pueden indicar cuentas separadas pero
   * mismo individual). Excluye:
   *   - La propia stay (current)
   *   - Stays canceladas (cancelledAt != null) — no-shows tampoco cuentan
   *
   * Privacy: email/phone son PII pero el usuario ya las capturó para esta
   * stay (legitimate interest GDPR Art. 6.1.f). Cross-stay lookup es ops
   * standard cross-PMS.
   */
  async getGuestStats(stayId: string): Promise<{
    previousStaysCount: number
    firstVisitAt: string | null
    lastVisitAt: string | null
    totalNightsHistorical: number
  }> {
    const orgId = this.tenant.getOrganizationId()

    const current = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: { id: true, guestEmail: true, guestPhone: true },
    })
    if (!current) throw new NotFoundException('Estadía no encontrada')
    if (!current.guestEmail && !current.guestPhone) {
      return { previousStaysCount: 0, firstVisitAt: null, lastVisitAt: null, totalNightsHistorical: 0 }
    }

    const orFilters: Array<{ guestEmail?: string; guestPhone?: string }> = []
    if (current.guestEmail) orFilters.push({ guestEmail: current.guestEmail })
    if (current.guestPhone) orFilters.push({ guestPhone: current.guestPhone })

    const previous = await this.prisma.guestStay.findMany({
      where: {
        organizationId: orgId,
        OR: orFilters,
        id: { not: stayId },
        cancelledAt: null,
        noShowAt: null,
      },
      select: {
        checkinAt: true,
        scheduledCheckout: true,
        actualCheckout: true,
      },
      orderBy: { checkinAt: 'asc' },
    })

    if (previous.length === 0) {
      return { previousStaysCount: 0, firstVisitAt: null, lastVisitAt: null, totalNightsHistorical: 0 }
    }

    const totalNights = previous.reduce((sum, s) => {
      const exit = s.actualCheckout ?? s.scheduledCheckout
      const ms = new Date(exit).getTime() - new Date(s.checkinAt).getTime()
      return sum + Math.max(0, Math.floor(ms / 86_400_000))
    }, 0)

    return {
      previousStaysCount: previous.length,
      firstVisitAt: previous[0].checkinAt.toISOString(),
      lastVisitAt: previous[previous.length - 1].checkinAt.toISOString(),
      totalNightsHistorical: totalNights,
    }
  }

  async listPaymentLogs(stayId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId), select: { id: true },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // Sprint EDIT-RESERVATION iter 4 — Pago tab redesign:
    // Cloudbeds/Mews UX pattern + USALI 12 ed §Cashier's Shift Report exigen
    // mostrar QUIÉN cobró cada pago (col "Collector" en el folio).
    // Visa CRR §5.9.2 chargeback evidence también requiere collector identifiable.
    const logs = await this.prisma.paymentLog.findMany({
      where:   { stayId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take:    100,
    })

    // Resolver staff names en batch. Sin N+1: 1 query agrupada por IDs únicos.
    const staffIds = [...new Set(logs.flatMap((l) => [l.collectedById, l.voidedById]).filter(Boolean) as string[])]
    const staff = staffIds.length === 0
      ? []
      : await this.prisma.staff.findMany({
          where:  { id: { in: staffIds } },
          select: { id: true, name: true, email: true },
        })
    const staffById = new Map(staff.map((s) => [s.id, s]))

    return logs.map((l) => ({
      ...l,
      collector: l.collectedById ? staffById.get(l.collectedById) ?? null : null,
      voider:    l.voidedById    ? staffById.get(l.voidedById)    ?? null : null,
    }))
  }

  // ─── Edit Reservation (Sprint EDIT-RESERVATION) ─────────────────────────

  /**
   * PATCH /v1/guest-stays/:id
   *
   * Update parcial de campos de la reserva. Aplica la matriz de guards
   * per-phase documentada en `docs/sprints/EDIT-RESERVATION-plan.md`.
   *
   * Matriz resumida:
   *   - Cancelled / NoShow → solo `notes` (campo interno) editable.
   *   - Post-checkout      → soft fields editables; rate/doc bloqueados (fiscal).
   *   - Post-checkin       → soft libre; rate/pax requieren managerApprovalCode + reason.
   *   - Pre-checkin        → todo libre, con audit log.
   *
   * Ojo: NO toca `checkinAt` / `scheduledCheckout` — esos viven en
   * `extendStay` / `moveRoom` por su lógica de AvailabilityService.
   *
   * Performance: 1 read + 1 transaction (update + GuestStayLog create).
   * Sin loops, sin re-reads — el diff se computa in-memory.
   */
  async updateGuestStay(stayId: string, dto: UpdateGuestStayDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findUnique({
      where:  { id: stayId, organizationId: orgId },
      select: {
        id: true, propertyId: true, roomId: true,
        guestName: true, guestEmail: true, guestPhone: true,
        documentType: true, documentNumber: true, documentPhotoUrl: true,
        nationality: true, notes: true, arrivalNotes: true,
        paxCount: true, ratePerNight: true, totalAmount: true,
        checkinAt: true, scheduledCheckout: true,
        actualCheckin: true, actualCheckout: true,
        noShowAt: true, cancelledAt: true,
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // Phase detection — orden importa (terminal states primero).
    const phase: 'CANCELLED' | 'NOSHOW' | 'POST_CHECKOUT' | 'POST_CHECKIN' | 'PRE_CHECKIN' =
      stay.cancelledAt    ? 'CANCELLED'
      : stay.noShowAt     ? 'NOSHOW'
      : stay.actualCheckout ? 'POST_CHECKOUT'
      : stay.actualCheckin  ? 'POST_CHECKIN'
      : 'PRE_CHECKIN'

    // ── Guards por phase ────────────────────────────────────────────────
    if (phase === 'CANCELLED') {
      // Solo `notes` (campo interno) editable — útil para registrar contexto
      // post-cancel ("disputa con OTA", "refund procesado", etc.).
      const allowed = ['notes']
      const blocked = Object.keys(dto).filter(
        (k) => dto[k as keyof UpdateGuestStayDto] !== undefined && !allowed.includes(k),
      )
      if (blocked.length > 0) {
        throw new BadRequestException({
          code:    'STAY_CANCELLED',
          message: 'Reserva cancelada — campos congelados para audit trail',
          blocked,
        })
      }
    }
    if (phase === 'NOSHOW') {
      const allowed = ['notes']
      const blocked = Object.keys(dto).filter(
        (k) => dto[k as keyof UpdateGuestStayDto] !== undefined && !allowed.includes(k),
      )
      if (blocked.length > 0) {
        throw new BadRequestException({
          code:    'STAY_NOSHOW',
          message: 'Reserva en flujo no-show — campos congelados',
          blocked,
        })
      }
    }
    if (phase === 'POST_CHECKOUT') {
      // Bloqueados por fiscal lock (CFDI evidence, Visa CRR 13.x).
      const fiscalLocked: (keyof UpdateGuestStayDto)[] = [
        'documentType', 'documentNumber', 'documentPhotoUrl',
        'ratePerNight', 'paxCount',
      ]
      const blocked = fiscalLocked.filter((k) => dto[k] !== undefined)
      if (blocked.length > 0) {
        throw new BadRequestException({
          code:    'STAY_CHECKED_OUT_IMMUTABLE_FIELD',
          message: 'Reserva ya cerrada — campos fiscales bloqueados. Usar nota crédito para correcciones monetarias.',
          blocked,
        })
      }
    }
    // Sprint EDIT-RESERVATION iter 6 — política Cloudbeds/Mews:
    // cambios post-checkin NO requieren approval bloqueante del manager.
    // Razón (opcional) queda en audit log; saldo negativo = crédito a favor.
    // Justificación: manager ocupado no debe ser cuello de botella para
    // operación de recepción. Audit trail + reversibilidad post-hoc bastan.
    // (Antes §117/§118: requería managerApprovalCode + managerApprovalReason.
    // Decisión revertida por feedback usuario — overhead operacional alto.)

    // ── Compute diff (in-memory, sin re-query) ──────────────────────────
    type FieldKey =
      | 'guestName' | 'guestEmail' | 'guestPhone'
      | 'documentType' | 'documentNumber' | 'documentPhotoUrl'
      | 'nationality' | 'notes' | 'arrivalNotes'
      | 'paxCount' | 'ratePerNight'
    const trackedFields: FieldKey[] = [
      'guestName', 'guestEmail', 'guestPhone',
      'documentType', 'documentNumber', 'documentPhotoUrl',
      'nationality', 'notes', 'arrivalNotes',
      'paxCount', 'ratePerNight',
    ]
    // JSON-safe value types — Prisma exige InputJsonValue compatible.
    type JsonChange = { from: string | number | null; to: string | number | null }
    const changes: Record<string, JsonChange> = {}
    for (const k of trackedFields) {
      const incoming = dto[k]
      if (incoming === undefined) continue
      const current = stay[k] as unknown
      // Decimal comparison: ratePerNight viene como number en DTO, Decimal en BD
      const currentNorm = current instanceof Object && 'toString' in (current as object)
        ? Number((current as { toString: () => string }).toString())
        : current
      if (currentNorm !== incoming) {
        changes[k] = {
          from: (currentNorm ?? null) as string | number | null,
          to:   incoming as string | number | null,
        }
      }
    }

    // Si no hay cambios, no escribimos — short-circuit elegante (NN/g H1
    // estado del sistema visible: el caller recibe ok=true, changed=false).
    if (Object.keys(changes).length === 0) {
      return { ok: true, changed: false, phase }
    }

    // Recompute totalAmount si rate cambió. nights derivado de fechas (no
    // se editan acá). Decimal-safe via Prisma.Decimal en el update.
    const newRate = dto.ratePerNight ?? Number(stay.ratePerNight)
    const nights = Math.max(
      1,
      Math.round(
        (stay.scheduledCheckout.getTime() - stay.checkinAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    )
    const recomputedTotal = dto.ratePerNight !== undefined ? newRate * nights : undefined

    // ── Transaction: 1 update + 1 audit log entry ───────────────────────
    await this.prisma.$transaction([
      this.prisma.guestStay.update({
        where: { id: stayId },
        data: {
          ...(dto.guestName        !== undefined && { guestName:        dto.guestName }),
          ...(dto.guestEmail       !== undefined && { guestEmail:       dto.guestEmail }),
          ...(dto.guestPhone       !== undefined && { guestPhone:       dto.guestPhone }),
          ...(dto.documentType     !== undefined && { documentType:     dto.documentType }),
          ...(dto.documentNumber   !== undefined && { documentNumber:   dto.documentNumber }),
          ...(dto.documentPhotoUrl !== undefined && { documentPhotoUrl: dto.documentPhotoUrl }),
          ...(dto.nationality      !== undefined && { nationality:      dto.nationality }),
          ...(dto.notes            !== undefined && { notes:            dto.notes }),
          ...(dto.arrivalNotes     !== undefined && { arrivalNotes:     dto.arrivalNotes }),
          ...(dto.paxCount         !== undefined && { paxCount:         dto.paxCount }),
          ...(dto.ratePerNight     !== undefined && { ratePerNight:     dto.ratePerNight }),
          ...(recomputedTotal      !== undefined && { totalAmount:      recomputedTotal }),
        },
      }),
      this.prisma.guestStayLog.create({
        data: {
          stayId,
          event:    'STAY_UPDATED',
          actorId,
          metadata: {
            phase,
            // PII: enmascarar documentNumber en audit (§109). Single source of
            // truth: construimos el objeto changes ya con el masking aplicado.
            changes: changes.documentNumber
              ? {
                  ...changes,
                  documentNumber: {
                    from: changes.documentNumber.from
                      ? `***${String(changes.documentNumber.from).slice(-4)}` : null,
                    to: changes.documentNumber.to
                      ? `***${String(changes.documentNumber.to).slice(-4)}` : null,
                  },
                }
              : changes,
            approval: dto.managerApprovalCode
              ? { code: dto.managerApprovalCode, reason: dto.managerApprovalReason }
              : null,
            reason: dto.reason ?? null,
          },
        },
      }),
    ])

    // Post-tx fire-and-forget: SSE para refresh concurrent sessions
    // (banner "Datos actualizados en otra sesión" en clientes con dialog abierto).
    this.events.emit('stay.updated', {
      stayId,
      propertyId: stay.propertyId,
      orgId,
      changedFields: Object.keys(changes),
      actorId,
    })

    this.logger.log(`[UpdateStay] stayId=${stayId} phase=${phase} fields=${Object.keys(changes).join(',')}`)

    // Sprint AUDIT-CORE — edit post-checkin es manipulation evidence.
    // PRE_CHECKIN edits son STANDARD; POST_CHECKIN son PERMANENT (audit
    // detecta cambios de guestName/contactos pre/post-stay).
    this.audit.recordStayUpdated({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      changes: changes as Record<string, { from: unknown; to: unknown }>,
      phase: phase as 'PRE_CHECKIN' | 'POST_CHECKIN',
      reason: dto.reason,
    })

    return { ok: true, changed: true, phase, changedFields: Object.keys(changes) }
  }

  /**
   * RESERVATION-EDIT-PRECHECKIN (D-REP-1..4) — reprograma el RANGO de fechas de
   * una reserva que aún NO ha hecho check-in (adelantar / retrasar / alargar /
   * acortar), sin cancelar + recrear. Estándar de industria (6/6 PMS).
   *
   *   - D-REP-1: si es OTA (`channexBookingId`), se aplica local + se levanta
   *     notif al SUPERVISOR para ajustar el extranet (push MODIFY no existe aún,
   *     §157). El frontend muestra el aviso ámbar con `requiresOtaManualAdjust`.
   *   - D-REP-2: rango libre; la llegada NUNCA antes de hoy (tz propiedad, §12).
   *     Recepcionista autónomo; todo queda en `GuestStayLog DATES_EDITED` (§11).
   *   - D-REP-3: `newRoomId` SÓLO para resolver conflicto del nuevo rango.
   *   - D-REP-4: Sprint 1 conserva la tarifa pactada (recalcula noches × rate).
   *     El toggle "recotizar" llega en Sprint 2 con preview del diff.
   */
  async editReservationDates(stayId: string, dto: EditReservationDatesDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()

    const stay = await this.prisma.guestStay.findFirst({
      where: this.stayScope(stayId),
      include: {
        stayJourney: { include: { segments: true } },
        room: { select: { property: { select: { settings: { select: { timezone: true } } } } } },
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // ── HU-1.1 — guards de elegibilidad (codes machine-readable §39/§110) ──
    if (stay.actualCheckin || stay.actualCheckout) {
      throw new BadRequestException({
        code: 'NOT_PRECHECKIN',
        message:
          'Solo se pueden reprogramar reservas que aún no han hecho check-in. ' +
          'Para huéspedes alojados usa extender / salida anticipada / mover habitación.',
      })
    }
    if (stay.cancelledAt) {
      throw new BadRequestException({
        code: 'CANCELLED',
        message: 'La reserva está cancelada — restáurala antes de reprogramarla.',
      })
    }
    if (stay.noShowAt) {
      throw new BadRequestException({
        code: 'NOSHOW_LOCKED',
        message: 'La reserva está marcada como no-show — revierte el no-show primero.',
      })
    }

    const activeSegments = (stay.stayJourney?.segments ?? []).filter((s) => s.status === 'ACTIVE')
    const original = activeSegments.find((s) => s.reason === 'ORIGINAL')
    if (activeSegments.length !== 1 || !original) {
      throw new BadRequestException({
        code: 'HAS_EXTENSIONS',
        message:
          'La reserva tiene extensiones o movimientos de habitación. Reprogramar el rango ' +
          'completo no está soportado para reservas con segmentos múltiples (cancela las extensiones primero).',
      })
    }

    // ── HU-1.2 — validación del nuevo rango ──
    const newCheckIn = new Date(dto.checkInAt)
    const newCheckOut = new Date(dto.scheduledCheckout)
    if (Number.isNaN(newCheckIn.getTime()) || Number.isNaN(newCheckOut.getTime())) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'Fechas inválidas.' })
    }
    if (newCheckOut.getTime() <= newCheckIn.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_RANGE',
        message: 'La fecha de salida debe ser posterior a la de llegada.',
      })
    }

    // D-REP-2 — la llegada nunca puede caer en un día anterior a hoy (tz de la
    // propiedad, §12). Comparación por día-calendario local (YYYY-MM-DD).
    const tz = stay.room.property.settings?.timezone ?? 'UTC'
    if (toLocalDate(newCheckIn, tz) < toLocalDate(new Date(), tz)) {
      throw new BadRequestException({
        code: 'PAST_ARRIVAL',
        message: 'La fecha de llegada no puede ser anterior a hoy.',
      })
    }

    // D-REP-3 — habitación destino: la actual, salvo alternativa explícita para
    // resolver un conflicto del nuevo rango.
    const targetRoomId = dto.newRoomId ?? stay.roomId
    const roomChanged = targetRoomId !== stay.roomId

    // §35 — disponibilidad con self-exclusion (la propia reserva no es conflicto).
    const avail = await this.checkAvailability(targetRoomId, newCheckIn, newCheckOut, stayId)
    if (!avail.available) {
      const hard = avail.conflicts.find((c) => c.severity === 'HARD')
      throw new ConflictException({
        code: 'RANGE_UNAVAILABLE',
        message: hard?.guestName
          ? `La habitación tiene una reserva de "${hard.guestName}" que se solapa con el nuevo rango.`
          : 'La habitación no está disponible para el nuevo rango.',
        conflicts: avail.conflicts,
      })
    }

    // ── HU-1.3 — D-REP-4 Sprint 1: conservar tarifa pactada ──
    const nights = Math.max(1, Math.round((newCheckOut.getTime() - newCheckIn.getTime()) / 86400000))
    const rate = Number(stay.ratePerNight)
    const newTotal = Math.round(rate * nights * 100) / 100
    const paid = Number(stay.amountPaid)
    const newPaymentStatus = paid >= newTotal ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING'

    const before = {
      checkIn: stay.checkinAt.toISOString(),
      checkOut: stay.scheduledCheckout.toISOString(),
      roomId: stay.roomId,
      total: Number(stay.totalAmount),
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          checkinAt: newCheckIn,
          scheduledCheckout: newCheckOut,
          ...(roomChanged && { roomId: targetRoomId }),
          totalAmount: newTotal,
          paymentStatus: newPaymentStatus,
        },
      })
      if (stay.stayJourney) {
        await tx.stayJourney.update({
          where: { id: stay.stayJourney.id },
          data: { journeyCheckIn: newCheckIn, journeyCheckOut: newCheckOut },
        })
      }
      await tx.staySegment.update({
        where: { id: original.id },
        data: {
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          ...(roomChanged && { roomId: targetRoomId }),
        },
      })
      await tx.guestStayLog.create({
        data: {
          stayId,
          event: 'DATES_EDITED',
          actorId,
          metadata: {
            checkInBefore: before.checkIn,
            checkInAfter: newCheckIn.toISOString(),
            checkOutBefore: before.checkOut,
            checkOutAfter: newCheckOut.toISOString(),
            roomBefore: before.roomId,
            roomAfter: targetRoomId,
            roomChanged,
            nights,
            rate,
            totalBefore: before.total,
            totalAfter: newTotal,
            reason: dto.reason ?? null,
          } as Prisma.InputJsonValue,
        },
      })
    })

    // D-REP-1 — reserva OTA: aplicar local + avisar (push MODIFY no existe, §157).
    let requiresOtaManualAdjust = false
    if (stay.channexBookingId && stay.channexOtaName) {
      requiresOtaManualAdjust = true
      const payload: ReservationOtaDatesAdjustEvent = {
        organizationId: orgId,
        propertyId: stay.propertyId,
        stayId,
        otaName: stay.channexOtaName,
        newCheckIn: toLocalDate(newCheckIn, tz),
        newCheckOut: toLocalDate(newCheckOut, tz),
      }
      this.events.emit(RESERVATION_OTA_DATES_ADJUST, payload)
    }

    // Channex ARI best-effort (§31, fail-soft): liberar rango viejo + ocupar nuevo.
    void this.availability.notifyRelease({
      roomId: stay.roomId,
      from: stay.checkinAt,
      to: stay.scheduledCheckout,
      reason: 'CANCELLATION',
      traceId: `edit-rel-${stayId}-${Date.now()}`,
    })
    void this.availability.notifyReservation({
      roomId: targetRoomId,
      from: newCheckIn,
      to: newCheckOut,
      reason: 'RESERVATION',
      traceId: `edit-res-${stayId}-${Date.now()}`,
    })

    // SSE refresco del calendario + sesiones concurrentes (§124).
    this.events.emit('stay.updated', {
      stayId,
      propertyId: stay.propertyId,
      orgId,
      changedFields: ['checkinAt', 'scheduledCheckout', ...(roomChanged ? ['roomId'] : [])],
      actorId,
    })

    this.logger.log(
      `[EditDates] stayId=${stayId} ${before.checkIn}→${newCheckIn.toISOString()} ` +
        `room=${roomChanged ? targetRoomId : 'same'} ota=${requiresOtaManualAdjust}`,
    )

    return {
      ok: true as const,
      stayId,
      nights,
      checkinAt: newCheckIn,
      scheduledCheckout: newCheckOut,
      roomId: targetRoomId,
      roomChanged,
      ratePerNight: rate,
      totalAmount: newTotal,
      paymentStatus: newPaymentStatus,
      requiresOtaManualAdjust,
      otaName: stay.channexOtaName ?? null,
    }
  }

  // ─── GuestStayNote — bitácora humana ────────────────────────────────────

  /** Ventana de edición post-creación para typos. 5 min, mismo autor. */
  private static readonly NOTE_EDIT_WINDOW_MS = 5 * 60 * 1000

  /** GET /v1/guest-stays/:id/notes — lista append-only de notas. */
  async listNotes(stayId: string) {
    const orgId = this.tenant.getOrganizationId()
    // Verify ownership via stay lookup (defense in depth — global guard ya scope).
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId), select: { id: true },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    return this.prisma.guestStayNote.findMany({
      where:   { stayId },
      orderBy: { createdAt: 'asc' },
      take:    200,
    })
  }

  /** POST /v1/guest-stays/:id/notes */
  async createNote(stayId: string, dto: CreateGuestStayNoteDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: { id: true, propertyId: true },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    const note = await this.prisma.guestStayNote.create({
      data: {
        stayId,
        authorId: actorId,
        content:  dto.content.trim(),
        channel:  dto.channel ?? 'GENERAL',
        kind:     dto.kind ?? 'CHAT', // Default CHAT; STICKY/SYSTEM solicitud explícita.
      },
    })

    // SSE para que clientes con BookingDetailSheet abierto refresquen el thread.
    this.events.emit('stay.note.created', {
      stayId, propertyId: stay.propertyId, orgId, noteId: note.id, actorId,
    })

    return note
  }

  /**
   * PATCH /v1/guest-stays/notes/:noteId — edit típico typo, ventana 5min,
   * mismo autor. Después de la ventana, la nota es inmutable (audit trail).
   */
  async editNote(noteId: string, dto: UpdateGuestStayNoteDto, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    const note = await this.prisma.guestStayNote.findUnique({
      where:  { id: noteId },
      include: { stay: { select: { organizationId: true, propertyId: true } } },
    })
    if (!note) throw new NotFoundException('Nota no encontrada')
    if (note.stay.organizationId !== orgId) throw new ForbiddenException()
    if (note.authorId !== actorId) {
      throw new ForbiddenException({
        code: 'NOTE_NOT_OWNER',
        message: 'Solo el autor original puede editar la nota',
      })
    }
    const ageMs = Date.now() - note.createdAt.getTime()
    if (ageMs > GuestStaysService.NOTE_EDIT_WINDOW_MS) {
      throw new ForbiddenException({
        code: 'NOTE_EDIT_WINDOW_EXPIRED',
        message: 'La ventana de edición de 5 minutos expiró. Agrega una nueva nota corrigiendo.',
      })
    }

    const updated = await this.prisma.guestStayNote.update({
      where: { id: noteId },
      data:  { content: dto.content.trim(), editedAt: new Date() },
    })

    this.events.emit('stay.note.updated', {
      stayId: note.stayId, propertyId: note.stay.propertyId, orgId, noteId, actorId,
    })

    return updated
  }

  /**
   * GET /v1/guest-stays/cash-summary?propertyId=X&date=YYYY-MM-DD
   * Suma PaymentLog del turno por colector — para reconciliación de caja al cierre.
   */
  async getCashSummary(propertyId: string, dateStr: string) {
    const orgId    = this.tenant.getOrganizationId()
    const shiftDate = new Date(`${dateStr}T00:00:00.000Z`)

    const logs = await this.prisma.paymentLog.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        shiftDate,
        method: 'CASH' as any,
        isVoid: false,
      },
      include: {
        collectedBy: { select: { id: true, name: true } },
      },
    })

    const byCollector = new Map<string, { name: string; total: number; count: number }>()
    let totalCash = 0

    for (const log of logs) {
      const amount = Number(log.amount)
      totalCash += amount
      const entry = byCollector.get(log.collectedById) ?? {
        name:  log.collectedBy.name,
        total: 0,
        count: 0,
      }
      entry.total += amount
      entry.count += 1
      byCollector.set(log.collectedById, entry)
    }

    return {
      date:        dateStr,
      propertyId,
      totalCash:   totalCash.toFixed(2),
      byCollector: Array.from(byCollector.entries()).map(([id, v]) => ({
        collectedById: id,
        collectorName: v.name,
        total:         v.total.toFixed(2),
        count:         v.count,
      })),
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Mobile-specific endpoints — Sprint 9 wiring
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /v1/guest-stays/search?q=
   * Búsqueda global de reservas (sin límite de fechas). Match case-insensitive
   * por nombre / email / bookingRef / channexBookingId (ID OTA) y substring por
   * teléfono (normalizado, ignora espacios/guiones/paréntesis). Server-side con
   * Prisma OR — escala sin traer todo a memoria. Excluye soft-deleted.
   */
  async searchStays(propertyId: string, q: string, take: number) {
    const term = q.trim()
    if (term.length < 2) return []

    // Teléfono: normaliza el término (sólo dígitos) para que "55 1234" matchee
    // "+52 55 1234". Se compara contra guestPhone crudo vía `contains` cuando el
    // término tiene dígitos; el resto de campos usa el término tal cual.
    const digits = term.replace(/[^\d]/g, '')

    const or: Prisma.GuestStayWhereInput[] = [
      { guestName: { contains: term, mode: 'insensitive' } },
      { guestEmail: { contains: term, mode: 'insensitive' } },
      { bookingRef: { contains: term, mode: 'insensitive' } },
      // Código de reserva de la OTA (Booking/Expedia number) — el que el
      // personal teclea en el extranet de la OTA para hallar la misma reserva.
      { otaReservationCode: { contains: term, mode: 'insensitive' } },
      { channexBookingId: { contains: term, mode: 'insensitive' } },
    ]
    if (digits.length >= 3) {
      or.push({ guestPhone: { contains: digits } })
      or.push({ guestPhone: { contains: term } })
    }

    const stays = await this.prisma.guestStay.findMany({
      where: { propertyId, deletedAt: null, OR: or },
      select: {
        id: true,
        guestName: true,
        guestPhone: true,
        guestEmail: true,
        bookingRef: true,
        otaReservationCode: true,
        channexBookingId: true,
        channexOtaName: true,
        source: true,
        checkinAt: true,
        scheduledCheckout: true,
        actualCheckin: true,
        actualCheckout: true,
        noShowAt: true,
        cancelledAt: true,
        room: { select: { number: true } },
      },
      orderBy: { checkinAt: 'desc' },
      take,
    })

    return stays.map((s) => ({
      id: s.id,
      guestName: s.guestName,
      guestPhone: s.guestPhone,
      guestEmail: s.guestEmail,
      bookingRef: s.bookingRef,
      otaReservationCode: s.otaReservationCode,
      channexBookingId: s.channexBookingId,
      otaName: s.channexOtaName,
      source: s.source,
      roomNumber: s.room?.number ?? null,
      checkinAt: s.checkinAt.toISOString(),
      checkoutAt: s.scheduledCheckout.toISOString(),
      status: s.cancelledAt
        ? 'CANCELLED'
        : s.noShowAt
          ? 'NO_SHOW'
          : s.actualCheckout
            ? 'CHECKED_OUT'
            : s.actualCheckin
              ? 'IN_HOUSE'
              : 'ARRIVING',
    }))
  }

  /**
   * GET /v1/guest-stays/mobile/list
   * Returns a filtered list of reservations pre-shaped for the mobile card.
   * All derived fields (status, arrivesToday, dateRangeLabel, etc.) are
   * computed server-side to guarantee timezone correctness.
   */
  async getMobileList(
    propertyId: string,
    actorRole: StaffRole,
    query: {
      search?: string
      statusFilter?: string[]
      dateFilter?: string
    },
  ) {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { timezone: true },
    })
    const tz = settings?.timezone ?? 'America/Mexico_City'
    const now = new Date()
    const todayLocal    = localYMD(now, tz)
    const tomorrowLocal = localYMD(addDays(now, 1), tz)
    const dayAfterLocal = localYMD(addDays(now, 2), tz)

    // Window: last 7 days (recent no-shows/departures) + next 60 days
    const windowEnd = addDays(now, 60)
    const windowStart = addDays(now, -7)

    const stays = await this.prisma.guestStay.findMany({
      where: {
        propertyId,
        deletedAt: null,
        checkinAt: { lte: windowEnd },
        OR: [
          { actualCheckout: null },
          { actualCheckout: { gte: windowStart } },
          { noShowAt: { gte: windowStart } },
        ],
      },
      include: { room: { select: { number: true } } },
      orderBy: { checkinAt: 'asc' },
    })

    const items = stays.map((stay) => {
      const checkinDay  = localYMD(stay.checkinAt, tz)
      const checkoutDay = localYMD(stay.scheduledCheckout, tz)
      const arrivesToday = checkinDay === todayLocal
      const departsToday = checkoutDay === todayLocal
      const isNoShow    = stay.noShowAt != null
      const isDeparted  = stay.actualCheckout != null
      const isConfirmed = stay.actualCheckin != null

      let status: string
      if (isNoShow)              status = 'NO_SHOW'
      else if (isDeparted)       status = 'DEPARTED'
      else if (departsToday)     status = 'DEPARTING'
      else if (isConfirmed)      status = 'IN_HOUSE'
      else if (arrivesToday)     status = 'UNCONFIRMED'
      else                       status = 'UPCOMING'

      const isRedacted = actorRole === StaffRole.HOUSEKEEPER
      return {
        id: stay.id,
        guestName: isRedacted ? `Hab. ${stay.room.number}` : stay.guestName,
        isRedacted,
        roomNumber: stay.room.number,
        unitLabel: null,
        status,
        source: this.mapReservationSource(stay.source),
        paxCount: stay.paxCount,
        checkinAt: stay.checkinAt.toISOString(),
        scheduledCheckout: stay.scheduledCheckout.toISOString(),
        arrivesToday,
        departsToday,
        isNoShow,
        dateRangeLabel: fmtReservationDateRange(stay.checkinAt, stay.scheduledCheckout, tz),
      }
    })

    // Apply filters in memory (status is derived, not stored)
    let result = items

    if (query.search?.trim()) {
      const needle = query.search.trim().toLowerCase()
      result = result.filter(
        (item) =>
          item.guestName.toLowerCase().includes(needle) ||
          (item.roomNumber ?? '').toLowerCase().includes(needle) ||
          item.id.toLowerCase().includes(needle),
      )
    }

    if (query.dateFilter && query.dateFilter !== 'all') {
      const df = query.dateFilter
      result = result.filter((item) => {
        if (df === 'today') {
          return (
            item.arrivesToday ||
            item.departsToday ||
            item.status === 'IN_HOUSE' ||
            item.status === 'NO_SHOW'
          )
        }
        const day = localYMD(new Date(item.checkinAt), tz)
        if (df === 'tomorrow')  return day === tomorrowLocal
        if (df === 'dayAfter')  return day === dayAfterLocal
        return true
      })
    }

    if (query.statusFilter?.length) {
      result = result.filter((item) => query.statusFilter!.includes(item.status))
    }

    return result
  }

  /**
   * GET /v1/guest-stays/mobile/:id
   * Full detail payload for the reservation detail screen.
   * Includes payments history and journey audit trail.
   * PII is redacted for HOUSEKEEPER role.
   */
  async getMobileDetail(stayId: string, actorRole: StaffRole) {
    const stay = await this.prisma.guestStay.findUnique({
      where: { id: stayId },
      include: {
        room: { select: { number: true } },
        paymentLogs: {
          include: { collectedBy: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        stayJourney: {
          include: { events: { orderBy: { occurredAt: 'desc' } } },
        },
      },
    })
    if (!stay) throw new NotFoundException('Reserva no encontrada')

    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId: stay.propertyId },
      select: { timezone: true },
    })
    const tz = settings?.timezone ?? 'America/Mexico_City'
    const now = new Date()
    const todayLocal = localYMD(now, tz)
    const checkinDay  = localYMD(stay.checkinAt, tz)
    const checkoutDay = localYMD(stay.scheduledCheckout, tz)
    const arrivesToday = checkinDay === todayLocal
    const departsToday = checkoutDay === todayLocal
    const isNoShow    = stay.noShowAt != null
    const isDeparted  = stay.actualCheckout != null
    const isConfirmed = stay.actualCheckin != null

    let status: string
    if (isNoShow)          status = 'NO_SHOW'
    else if (isDeparted)   status = 'DEPARTED'
    else if (departsToday) status = 'DEPARTING'
    else if (isConfirmed)  status = 'IN_HOUSE'
    else if (arrivesToday) status = 'UNCONFIRMED'
    else                   status = 'UPCOMING'

    const isRedacted = actorRole === StaffRole.HOUSEKEEPER

    // Resolve actor names for history events
    const actorIds = [
      ...new Set(
        (stay.stayJourney?.events ?? [])
          .filter((e) => e.actorId)
          .map((e) => e.actorId!),
      ),
    ]
    const actorNames = new Map<string, string>()
    if (actorIds.length > 0) {
      const actors = await this.prisma.staff.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
      for (const a of actors) actorNames.set(a.id, a.name)
    }

    // Mask document number — keep only last 4 chars for privacy
    const docNum = stay.documentNumber
    const documentNumberMasked =
      docNum && docNum.length >= 4 ? `***${docNum.slice(-4)}` : docNum ? '***' : null

    const payments = stay.paymentLogs.map((p) => ({
      id: p.id,
      method: p.method as string,
      amount: p.amount.toString(),
      currency: p.currency,
      collectedAt: p.createdAt.toISOString(),
      collectedByName: p.collectedBy.name ?? null,
      isVoid: p.isVoid,
      reference: p.reference ?? null,
    }))

    const ICON_MAP: Record<string, string> = {
      JOURNEY_CREATED: 'system',   SEGMENT_ADDED: 'system',
      SEGMENT_LOCKED: 'edit',      ROOM_MOVE_EXECUTED: 'edit',
      EXTENSION_APPROVED: 'edit',  JOURNEY_SPLIT: 'edit',
      CHECKED_IN: 'arrival',       CHECKED_OUT: 'departure',
      NO_SHOW_MARKED: 'noshow',    NO_SHOW_REVERTED: 'noshow',
      CANCELLED: 'system',
    }
    const DESC_MAP: Record<string, string> = {
      JOURNEY_CREATED: 'Reserva registrada',
      SEGMENT_ADDED: 'Segmento añadido',
      SEGMENT_LOCKED: 'Segmento confirmado',
      ROOM_MOVE_EXECUTED: 'Traslado de habitación',
      EXTENSION_APPROVED: 'Extensión aprobada',
      JOURNEY_SPLIT: 'Estadía dividida',
      CHECKED_IN: 'Check-in confirmado',
      CHECKED_OUT: 'Check-out registrado',
      NO_SHOW_MARKED: 'Marcado como no-show',
      NO_SHOW_REVERTED: 'No-show revertido',
      CANCELLED: 'Cancelado',
    }

    const history = (stay.stayJourney?.events ?? []).map((e) => ({
      id: e.id,
      whenLabel: fmtRelativeLabel(e.occurredAt),
      absoluteLabel: fmtAbsoluteLabel(e.occurredAt, tz),
      description: DESC_MAP[e.eventType] ?? String(e.eventType),
      actorName: e.actorId ? (actorNames.get(e.actorId) ?? null) : null,
      iconKey: ICON_MAP[e.eventType] ?? 'system',
    }))

    // Map PaymentStatus schema enum → mobile type
    const paymentStatusMap: Record<string, string> = {
      PENDING: 'UNPAID', PARTIAL: 'PARTIAL',
      PAID: 'PAID',       CREDIT: 'REFUNDED',
      OVERDUE: 'UNPAID',
    }

    return {
      // List fields
      id: stay.id,
      guestName: isRedacted ? `Hab. ${stay.room.number}` : stay.guestName,
      isRedacted,
      roomNumber: stay.room.number,
      unitLabel: null,
      status,
      source: this.mapReservationSource(stay.source),
      paxCount: stay.paxCount,
      checkinAt: stay.checkinAt.toISOString(),
      scheduledCheckout: stay.scheduledCheckout.toISOString(),
      arrivesToday,
      departsToday,
      isNoShow,
      dateRangeLabel: fmtReservationDateRange(stay.checkinAt, stay.scheduledCheckout, tz),
      // Detail fields
      guestEmail:            isRedacted ? null : (stay.guestEmail ?? null),
      guestPhone:            isRedacted ? null : (stay.guestPhone ?? null),
      nationality:           isRedacted ? null : (stay.nationality ?? null),
      documentType:          isRedacted ? null : (stay.documentType ?? null),
      documentNumberMasked:  isRedacted ? null : documentNumberMasked,
      ratePerNight:          stay.ratePerNight.toString(),
      currency:              stay.currency,
      totalAmount:           stay.totalAmount.toString(),
      amountPaid:            stay.amountPaid.toString(),
      paymentStatus:         paymentStatusMap[stay.paymentStatus] ?? 'UNPAID',
      notes:                 stay.notes ?? null,
      arrivalNotes:          stay.arrivalNotes ?? null,
      keyType:               stay.keyType ?? null,
      noShowAt:              stay.noShowAt?.toISOString() ?? null,
      noShowReason:          stay.noShowReason ?? null,
      payments,
      history,
    }
  }

  private mapReservationSource(source: string | null): string | null {
    const known = ['DIRECT', 'BOOKING', 'AIRBNB', 'EXPEDIA', 'HOSTELWORLD', 'WALK_IN']
    if (!source) return null
    return known.includes(source) ? source : 'OTHER'
  }

  /**
   * POST /v1/guest-stays/:id/contact-log
   * Registra un intento de contacto al huésped (WhatsApp, email, teléfono).
   * Append-only — el registro queda como evidencia ante disputas o chargebacks.
   */
  /**
   * GROUP-BILLING Fase C C2 — resuelve la política aplicable a una stay y calcula
   * el outcome (retención/reembolso) con el motor puro. Reutilizado por
   * cancelStay (snapshot al cancelar) y el endpoint cancellation-preview.
   * Orden de resolución: policy explícita de la stay → default de la property →
   * default conservador del motor.
   */
  private async computeCancellationFor(
    stay: {
      cancellationPolicyId: string | null
      propertyId: string
      checkinAt: Date
      totalAmount: Prisma.Decimal | number
      amountPaid: Prisma.Decimal | number
      ratePerNight: Prisma.Decimal | number
      currency: string
    },
    orgId: string,
    now: Date,
  ) {
    const policyRow = stay.cancellationPolicyId
      ? await this.prisma.cancellationPolicy.findFirst({
          where: { id: stay.cancellationPolicyId, organizationId: orgId },
        })
      : await this.prisma.cancellationPolicy.findFirst({
          where: { propertyId: stay.propertyId, organizationId: orgId, isDefault: true },
        })
    const policy = policyRow
      ? { freeWindowHours: policyRow.freeWindowHours, tiers: policyRow.tiers as unknown as PolicyTier[] }
      : { freeWindowHours: DEFAULT_FREE_WINDOW_HOURS, tiers: DEFAULT_POLICY_TIERS }
    return computeCancellationOutcome(
      policy,
      {
        checkinAt:    new Date(stay.checkinAt),
        totalAmount:  Number(stay.totalAmount),
        amountPaid:   Number(stay.amountPaid),
        ratePerNight: Number(stay.ratePerNight),
        currency:     stay.currency,
      },
      now,
    )
  }

  /**
   * GET /v1/guest-stays/:id/cancellation-preview
   * GROUP-BILLING Fase C C2 — preview de retención/reembolso si se cancela AHORA.
   * Read-only; alimenta el CancelReservationDialog antes de confirmar.
   */
  async getCancellationPreview(stayId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: {
        id: true, cancellationPolicyId: true, propertyId: true, checkinAt: true,
        totalAmount: true, amountPaid: true, ratePerNight: true, currency: true,
        cancelledAt: true,
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    const outcome = await this.computeCancellationFor(stay, orgId, new Date())
    return {
      stayId:       stay.id,
      alreadyCancelled: !!stay.cancelledAt,
      totalAmount:  Number(stay.totalAmount),
      amountPaid:   Number(stay.amountPaid),
      ...outcome,
    }
  }

  // ── Cancel-Archive (Sprint CANCEL-ARCHIVE 2026-05-16) ─────────────────────
  // Soft-delete una reserva. Patrón análogo a §11 (no-show inmutable):
  // jamás hard-delete. La fila permanece en DB con `cancelledAt != null`.
  // AvailabilityService excluye cancelled stays — ver availability.service.ts.
  // ──────────────────────────────────────────────────────────────────────────
  async cancelStay(
    stayId: string,
    actorId: string,
    dto: {
      initiator: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'
      reason?: string
      reasonCode?: string
      cancelledFromChannel?: 'PMS_DIRECT' | 'CHANNEX_WEBHOOK' | 'AUTO_SYSTEM'
      metadata?: Record<string, unknown>
    },
    // Sprint testing BUG #20 — actor.role para AuditLog universal (§165 D-NOVA-7).
    // Opcional para backward-compat con callers internos (Channex webhook, system
    // schedulers); cuando no presente, asume RECEPTIONIST (rol mínimo con
    // permiso de cancel — fail-safe conservador).
    actorRole?: SystemRole,
  ) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: {
        room: { include: { property: { include: { settings: true } } } },
        stayJourney: { select: { id: true } },
      },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')

    // Guards de estado — D-CAN3 del plan
    if (stay.cancelledAt)    throw new ConflictException('La estadía ya está cancelada')
    if (stay.noShowAt)       throw new ConflictException('La estadía está marcada como no-show. Usar revert no-show si fue error.')
    if (stay.actualCheckout) throw new ConflictException('La estadía ya hizo checkout — no se puede cancelar')
    if (stay.actualCheckin)  throw new ConflictException('El huésped ya hizo check-in — usar checkout anticipado en su lugar')

    // BUG #28 fix — cancellation iniciada por HOTEL o ADMIN_ERROR debe tener
    // razón ≥5 chars para audit trail (compliance + chargeback evidence).
    // GUEST/OTA/SYSTEM: razón opcional (la inicia el huésped o sistema).
    if (
      (dto.initiator === 'HOTEL' || dto.initiator === 'ADMIN_ERROR') &&
      (!dto.reason || dto.reason.trim().length < 5)
    ) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: `Cancelar con iniciador "${dto.initiator}" requiere una razón explícita (≥5 caracteres) para audit trail.`,
      })
    }

    const now = new Date()
    // Seed flag para v1.0.2 CFDI-CORE: si hubo CFDI I previo y la cancel es
    // legítima (no ADMIN_ERROR), v1.0.2 emitirá CFDI E + FormaPago=15 (§86).
    const requiresFiscalReview =
      dto.initiator !== 'ADMIN_ERROR' && stay.amountPaid.greaterThan(0)

    // GROUP-BILLING Fase C C2 — resolver política + calcular retención/reembolso
    // (snapshot inmutable al cancelar). Policy explícita de la stay → default de
    // la property → default conservador del motor. El reembolso se REGISTRA
    // después (no Stripe, §C5): status PENDING si hay reembolso, NONE si no.
    let outcome = await this.computeCancellationFor(stay, orgId, now)
    // ADMIN_ERROR (hab equivocada, duplicado) NO penaliza al huésped — la
    // reserva se creó por error. Reembolso total de lo pagado, sin retención.
    if (dto.initiator === 'ADMIN_ERROR') {
      outcome = { ...outcome, free: true, retention: 0, refund: Number(stay.amountPaid) }
    }
    const refundStatus = outcome.refund > 0.001 ? 'PENDING' : 'NONE'

    // Sprint testing BUG #20 — resolver User.id del Staff para AuditLog.
    // El JWT lleva Staff.id como `sub`, pero AuditLog.actor_real_id tiene FK
    // a users(id) (Audit H1 fix). Staff sin User vinculado (legacy data) →
    // skip auditLog con warning (fail-soft, no rompe el cancel).
    const actorStaff = await this.prisma.staff.findUnique({
      where: { id: actorId },
      select: { userId: true },
    })
    const actorUserId = actorStaff?.userId ?? null

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          cancelledAt:          now,
          cancelledById:        actorId,
          cancelInitiator:      dto.initiator,
          cancelReason:         dto.reason ?? null,
          cancelReasonCode:     dto.reasonCode ?? null,
          cancelMetadata:       (dto.metadata as Prisma.InputJsonValue) ?? Prisma.DbNull,
          cancelledFromChannel: dto.cancelledFromChannel ?? 'PMS_DIRECT',
          requiresFiscalReview,
          cancelRetentionAmount: outcome.retention,
          cancelRefundAmount:    outcome.refund,
          cancelRefundStatus:    refundStatus,
        },
      })

      // Cascade a segmentos + journey si existen
      if (stay.stayJourney?.id) {
        await tx.staySegment.updateMany({
          where: { journeyId: stay.stayJourney.id, status: { in: ['ACTIVE', 'PENDING'] } },
          data:  { status: 'CANCELLED' },
        })
        await tx.stayJourney.update({
          where: { id: stay.stayJourney.id },
          data:  { status: 'CANCELLED' },
        })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'CANCELLED',
            actorId,
            payload: { cancelInitiator: dto.initiator, reason: dto.reason ?? null },
          },
        })
      }

      // Liberar room status si la habitación estaba reservada para esta stay
      // (caso típico: misma fecha, marcada OCCUPIED por checkin auto-flip)
      if (stay.room.status === 'OCCUPIED') {
        const othersActive = await tx.guestStay.count({
          where: {
            roomId:         stay.roomId,
            organizationId: orgId,
            deletedAt:      null,
            actualCheckout: null,
            noShowAt:       null,
            cancelledAt:    null,
            id:             { not: stayId },
          },
        })
        if (othersActive === 0) {
          await tx.room.update({ where: { id: stay.roomId }, data: { status: 'AVAILABLE' } })
        }
      }

      // Audit log append-only — §28 pattern (PaymentLog)
      await tx.guestStayLog.create({
        data: {
          stayId,
          event:     'CANCELLED',
          actorId,
          actorType: 'USER',
          metadata: {
            initiator:            dto.initiator,
            reason:               dto.reason ?? null,
            reasonCode:           dto.reasonCode ?? null,
            cancelledFromChannel: dto.cancelledFromChannel ?? 'PMS_DIRECT',
            requiresFiscalReview,
            ...(dto.metadata ?? {}),
          },
        },
      })

      // Sprint testing BUG #20 — AuditLog universal §165 D-NOVA-7.
      // Compliance dual:
      //   (a) Visa CRR §5.9.2 — chargeback evidence ventana 120d. Sin esta
      //       entry, una disputa de huésped sobre cancel "no autorizado" deja
      //       a Zenix sin trail centralizado (guestStayLog es per-stay, no
      //       cross-org append-only DB-level).
      //   (b) CFDI Art. 30 CFF — 5 años retención. Si la cancel disparó CFDI E
      //       (FormaPago=15 Condonación) en v1.0.2+, el auditLog congela el
      //       contexto fiscal completo (initiator + retention + refund snapshot).
      //
      // retentionPolicy:
      //   - PERMANENT cuando hubo pago (requiresFiscalReview=true) o cuando el
      //     reembolso quedó PENDING — son los casos que pueden detonar disputa
      //     posterior, NUNCA expiran.
      //   - STANDARD (365d) para cancels gratis sin pago previo (informativo).
      const auditRetention: AuditLogRetention =
        requiresFiscalReview || refundStatus === 'PENDING'
          ? AuditLogRetention.PERMANENT
          : AuditLogRetention.STANDARD
      if (actorUserId) {
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorRealId:    actorUserId,
            actorRealRole:  actorRole ?? SystemRole.RECEPTIONIST,
            action:         'STAY_CANCELLED',
            target:         stayId,
            payload: {
              stayId,
              initiator:            dto.initiator,
              reason:               dto.reason ?? null,
              reasonCode:           dto.reasonCode ?? null,
              cancelledFromChannel: dto.cancelledFromChannel ?? 'PMS_DIRECT',
              requiresFiscalReview,
              outcome: {
                free:      outcome.free,
                retention: outcome.retention,
                refund:    outcome.refund,
                status:    refundStatus,
              },
              ...(dto.metadata ?? {}),
            },
            status:          AuditLogStatus.SUCCESS,
            reason:          dto.reason ?? null,
            retentionPolicy: auditRetention,
          },
        })
      } else {
        // Legacy staff sin User vinculado — audit_log inaccesible. Warning
        // visible para que el ops detecte el gap (todos los staff productivos
        // deben tener User vinculado, este path solo aplica a seeds antiguos).
        this.logger.warn(
          `cancelStay #${stayId}: actor staff ${actorId} sin userId vinculado — auditLog omitido. Audit completo solo en guest_stay_logs.`,
        )
      }
    })

    // Fire-and-forget Channex outbound — best-effort (§31).
    // El sprint CHANNEX-INBOUND cubre la sync real bidireccional.
    void this.availability.notifyRelease({
      roomId: stay.roomId,
      from:   stay.checkinAt,
      to:     stay.scheduledCheckout,
      reason: 'CANCELLATION',
      traceId: `cancel-${stayId}-${Date.now()}`,
    })

    this.events.emit('stay.cancelled', {
      stayId,
      orgId,
      propertyId: stay.propertyId,
      roomId:     stay.roomId,
      guestName:  stay.guestName,
      initiator:  dto.initiator,
    })

    // Sprint CHANNEX-UX-E2-E3 §150 (D-CHX-UX-E2.1) — push CRS al canal.
    // Solo si la cancel ORIGINA en el PMS (HOTEL/ADMIN_ERROR). Cancels que
    // vienen de OTA/SYSTEM/GUEST ya fueron orquestados por el canal (caso
    // CHANNEX_WEBHOOK) o por procesos internos que no deben rebotar al CRS.
    // Si no hay channexBookingId, el stay es direct → nada que sincronizar.
    const isPmsOriginatedCancel = dto.initiator === 'HOTEL' || dto.initiator === 'ADMIN_ERROR'
    if (stay.channexBookingId && isPmsOriginatedCancel) {
      const cancelEvent: ChannexBookingCancelRequestedEvent = {
        propertyId:       stay.propertyId,
        stayId,
        channexBookingId: stay.channexBookingId,
        channexOtaName:   stay.channexOtaName,
        reason:           dto.reason ?? null,
      }
      this.events.emit(CHANNEX_BOOKING_CANCEL_REQUESTED, cancelEvent)
    }

    // Notif al SUPERVISOR — paridad industria (Cloudbeds/Opera notifican,
    // Mews tiene feature request 2yr abierta). Self-suppress aplicado en
    // NotificationCenterService.sendPush (actor nunca recibe la suya).
    // ADMIN_ERROR es prioridad HIGH — patrón anómalo, supervisor debe revisar.
    const priorityByKind: Record<string, 'LOW' | 'MEDIUM' | 'HIGH'> = {
      ADMIN_ERROR: 'HIGH',
      HOTEL:       'HIGH',
      OTA:         'MEDIUM',
      GUEST:       'LOW',
      SYSTEM:      'LOW',
    }
    void this.notifCenter.send({
      propertyId:    stay.propertyId,
      type:          'INFORMATIONAL',
      category:      'STAY_CANCELLED',
      priority:      priorityByKind[dto.initiator] ?? 'LOW',
      title:         `Reserva cancelada — ${stay.guestName}`,
      body:          `Hab. ${stay.room.number} · ${dto.initiator === 'GUEST' ? 'Huésped' : dto.initiator === 'HOTEL' ? 'Hotel' : dto.initiator === 'OTA' ? 'OTA' : 'Error admin.'}${dto.reason ? ` · "${dto.reason.slice(0, 80)}"` : ''}`,
      metadata:      { stayId, roomId: stay.roomId, initiator: dto.initiator },
      actionUrl:     `/reservations/${stayId}`,
      recipientType: 'ROLE',
      recipientRole: 'SUPERVISOR',
      triggeredById: actorId,
    }).catch((err: Error) =>
      this.logger.warn(`[Cancel] notification failed: ${err?.message}`),
    )

    return { ok: true as const, cancelledAt: now }
  }

  /**
   * POST /v1/guest-stays/:id/register-cancel-refund
   * GROUP-BILLING Fase C C2 (D-GRP-C5) — registra el outcome del reembolso de una
   * reserva cancelada (procesado fuera de Zenix, §195). Append-only: solo se
   * sobrescribe desde PENDING. Mismo patrón que registerNoShowCharge (§198).
   */
  async registerCancelRefund(
    stayId: string,
    dto: RegisterCancelRefundDto,
    actorId: string,
  ) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: { id: true, cancelledAt: true, cancelRefundStatus: true, cancelRefundAmount: true },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    if (!stay.cancelledAt) {
      throw new BadRequestException('La reserva no está cancelada — no hay reembolso que registrar')
    }
    if (stay.cancelRefundStatus !== 'PENDING') {
      throw new BadRequestException(
        `El reembolso ya tiene estado "${stay.cancelRefundStatus ?? 'NONE'}" — no se puede sobrescribir`,
      )
    }
    if (dto.status === 'WAIVED' && (!dto.reason || dto.reason.trim().length < 5)) {
      throw new BadRequestException('Un reembolso renunciado (WAIVED) requiere una razón (≥5 caracteres)')
    }

    const finalAmount = typeof dto.amount === 'number' ? dto.amount : Number(stay.cancelRefundAmount ?? 0)
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.guestStay.update({
        where: { id: stayId },
        data: {
          cancelRefundStatus:    dto.status,
          cancelRefundMethod:    dto.method ?? null,
          cancelRefundReference: dto.reference?.trim() || null,
          cancelRefundReason:    dto.reason?.trim() || null,
          cancelRefundAt:        new Date(),
          cancelRefundById:      actorId,
          // Si el operador reembolsó un monto distinto al calculado (parcial),
          // lo persistimos como el monto realmente reembolsado.
          ...(typeof dto.amount === 'number' ? { cancelRefundAmount: dto.amount } : {}),
        },
      })
      // Audit append-only — visible en el timeline del huésped (§28). Sin esto el
      // registro del reembolso era un cambio silencioso (gap detectado 2026-06-02).
      await tx.guestStayLog.create({
        data: {
          stayId, event: 'CANCEL_REFUND_REGISTERED', actorId, actorType: 'USER',
          metadata: {
            status: dto.status, method: dto.method ?? null,
            reference: dto.reference?.trim() || null, amount: finalAmount,
            reason: dto.reason?.trim() || null,
          },
        },
      })
      return u
    })

    this.logger.log(`[CancelRefund] stay=${stayId} status=${dto.status} method=${dto.method ?? '—'}`)

    // Sprint AUDIT-CORE — refund post-cancel = CFDI E + Visa CRR evidence.
    this.audit.recordCancelRefundRegistered({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
      status: dto.status,
      amount: finalAmount,
      method: dto.method ?? 'unknown',
      reference: dto.reference?.trim() || null,
      reason: dto.reason?.trim() || undefined,
    })

    return { ok: true as const, cancelRefundStatus: updated.cancelRefundStatus }
  }

  /**
   * GET /v1/guest-stays/:id/group-cancellation-preview
   * GROUP-BILLING Fase C C4 — preview por miembro del grupo si se cancela AHORA.
   * Read-only; alimenta GroupCancelDialog. Cada miembro aplica su propia política.
   */
  async getGroupCancellationPreview(stayId: string) {
    const orgId = this.tenant.getOrganizationId()
    const ctx = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: { reservationGroupId: true },
    })
    if (!ctx) throw new NotFoundException('Estadía no encontrada')
    if (!ctx.reservationGroupId) {
      return { groupId: null, primaryGuestName: null, currency: null, channexBookingId: null, otaName: null, members: [] as Array<{
        stayId: string; roomNumber: string | null; roomIndex: number | null
        guestName: string; currency: string; totalAmount: number; amountPaid: number
        checkedIn: boolean; checkedOut: boolean; noShow: boolean; cancelled: boolean
        cancellable: boolean; isContext: boolean; retention: number; refund: number
        free: boolean; appliedTier: PolicyTier | null
      }> }
    }

    const group = await this.prisma.reservationGroup.findUnique({
      where: { id: ctx.reservationGroupId },
      select: { id: true, channexBookingId: true, channexOtaName: true, primaryGuestName: true },
    })
    const members = await this.prisma.guestStay.findMany({
      where: { reservationGroupId: ctx.reservationGroupId, organizationId: orgId },
      select: {
        id: true, guestName: true, groupRoomIndex: true, currency: true,
        cancellationPolicyId: true, propertyId: true, checkinAt: true,
        totalAmount: true, amountPaid: true, ratePerNight: true,
        actualCheckin: true, actualCheckout: true, noShowAt: true, cancelledAt: true,
        room: { select: { number: true } },
      },
      orderBy: { groupRoomIndex: 'asc' },
    })

    const now = new Date()
    const out: Array<{
      stayId: string; roomNumber: string | null; roomIndex: number | null
      guestName: string; currency: string; totalAmount: number; amountPaid: number
      checkedIn: boolean; checkedOut: boolean; noShow: boolean; cancelled: boolean
      cancellable: boolean; isContext: boolean; retention: number; refund: number
      free: boolean; appliedTier: PolicyTier | null
    }> = []
    for (const m of members) {
      const cancellable = !m.cancelledAt && !m.noShowAt && !m.actualCheckout && !m.actualCheckin
      const outcome = cancellable ? await this.computeCancellationFor(m, orgId, now) : null
      out.push({
        stayId:      m.id,
        roomNumber:  m.room?.number ?? null,
        roomIndex:   m.groupRoomIndex ?? null,
        guestName:   m.guestName,
        currency:    m.currency,
        totalAmount: Number(m.totalAmount),
        amountPaid:  Number(m.amountPaid),
        checkedIn:   !!m.actualCheckin,
        checkedOut:  !!m.actualCheckout,
        noShow:      !!m.noShowAt,
        cancelled:   !!m.cancelledAt,
        cancellable,
        isContext:   m.id === stayId,
        retention:   outcome?.retention ?? 0,
        refund:      outcome?.refund ?? 0,
        free:        outcome?.free ?? false,
        appliedTier: outcome?.appliedTier ?? null,
      })
    }

    return {
      groupId:          group?.id ?? ctx.reservationGroupId,
      primaryGuestName: group?.primaryGuestName ?? null,
      currency:         members[0]?.currency ?? null,
      channexBookingId: group?.channexBookingId ?? null,
      otaName:          group?.channexOtaName ?? null,
      members:          out,
    }
  }

  /**
   * POST /v1/guest-stays/group-cancel
   * GROUP-BILLING Fase C C4 (D-GRP-C6) — cancela N miembros de un grupo (parcial o
   * total). Cada stay aplica su propia política (snapshot retención/reembolso, igual
   * que cancelStay). Si tras cancelar NO queda ningún miembro activo → se marca
   * ReservationGroup.cancelledAt y, si es OTA, se emite CANCEL al canal (cancela la
   * reserva OTA completa). En cancel PARCIAL de un grupo OTA NO se auto-cancela el
   * canal — emitir CANCEL borraría TODA la reserva OTA. El push "modify" (quitar solo
   * algunas rooms) aún no está construido (sprint Channex MODIFY aparte), así que para
   * parciales OTA se levanta una notif ACTION_REQUIRED al SUPERVISOR para ajuste manual.
   * No atómico cross-Channex pero el DB sí es transaccional (todo-o-nada del cancel).
   */
  async cancelGroup(
    dto: {
      stayIds: string[]
      initiator: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'
      reason?: string
      reasonCode?: string
    },
    actorId: string,
  ) {
    const orgId = this.tenant.getOrganizationId()
    if (!dto.stayIds?.length) {
      throw new BadRequestException('Selecciona al menos una habitación para cancelar')
    }

    const selected = await this.prisma.guestStay.findMany({
      where: { id: { in: dto.stayIds }, organizationId: orgId },
      include: {
        room: { include: { property: { include: { settings: true } } } },
        stayJourney: { select: { id: true } },
      },
    })
    if (selected.length !== dto.stayIds.length) {
      throw new NotFoundException('Una o más estadías no se encontraron')
    }

    const groupId = selected[0].reservationGroupId
    if (!groupId) {
      throw new BadRequestException('Esta reserva no pertenece a un grupo')
    }
    if (selected.some((s) => s.reservationGroupId !== groupId)) {
      throw new BadRequestException('Todas las habitaciones deben pertenecer al mismo grupo')
    }

    // Guards por miembro (mismos que cancelStay).
    for (const s of selected) {
      if (s.cancelledAt)    throw new ConflictException(`La habitación ${s.room.number} ya está cancelada`)
      if (s.noShowAt)       throw new ConflictException(`La habitación ${s.room.number} está marcada como no-show`)
      if (s.actualCheckout) throw new ConflictException(`La habitación ${s.room.number} ya hizo checkout`)
      if (s.actualCheckin)  throw new ConflictException(`La habitación ${s.room.number} ya hizo check-in — usar checkout anticipado`)
    }

    const now = new Date()
    // Outcome por miembro (fuera de tx). ADMIN_ERROR = reembolso total sin retención.
    const outcomes = new Map<string, { retention: number; refund: number }>()
    for (const s of selected) {
      let outcome = await this.computeCancellationFor(s, orgId, now)
      if (dto.initiator === 'ADMIN_ERROR') {
        outcome = { ...outcome, free: true, retention: 0, refund: Number(s.amountPaid) }
      }
      outcomes.set(s.id, { retention: outcome.retention, refund: outcome.refund })
    }

    await this.prisma.$transaction(async (tx) => {
      for (const s of selected) {
        const outcome = outcomes.get(s.id)!
        const refundStatus = outcome.refund > 0.001 ? 'PENDING' : 'NONE'
        const requiresFiscalReview = dto.initiator !== 'ADMIN_ERROR' && Number(s.amountPaid) > 0

        await tx.guestStay.update({
          where: { id: s.id },
          data: {
            cancelledAt:           now,
            cancelledById:         actorId,
            cancelInitiator:       dto.initiator,
            cancelReason:          dto.reason ?? null,
            cancelReasonCode:      dto.reasonCode ?? null,
            cancelledFromChannel:  'PMS_DIRECT',
            requiresFiscalReview,
            cancelRetentionAmount: outcome.retention,
            cancelRefundAmount:    outcome.refund,
            cancelRefundStatus:    refundStatus,
          },
        })

        if (s.stayJourney?.id) {
          await tx.staySegment.updateMany({
            where: { journeyId: s.stayJourney.id, status: { in: ['ACTIVE', 'PENDING'] } },
            data:  { status: 'CANCELLED' },
          })
          await tx.stayJourney.update({ where: { id: s.stayJourney.id }, data: { status: 'CANCELLED' } })
          await tx.stayJourneyEvent.create({
            data: {
              journeyId: s.stayJourney.id,
              eventType: 'CANCELLED',
              actorId,
              payload: { cancelInitiator: dto.initiator, reason: dto.reason ?? null, groupCancel: true },
            },
          })
        }

        if (s.room.status === 'OCCUPIED') {
          const othersActive = await tx.guestStay.count({
            where: {
              roomId: s.roomId, organizationId: orgId, deletedAt: null,
              actualCheckout: null, noShowAt: null, cancelledAt: null, id: { not: s.id },
            },
          })
          if (othersActive === 0) {
            await tx.room.update({ where: { id: s.roomId }, data: { status: 'AVAILABLE' } })
          }
        }

        await tx.guestStayLog.create({
          data: {
            stayId: s.id, event: 'CANCELLED', actorId, actorType: 'USER',
            metadata: {
              initiator: dto.initiator, reason: dto.reason ?? null,
              reasonCode: dto.reasonCode ?? null, cancelledFromChannel: 'PMS_DIRECT',
              requiresFiscalReview, groupCancel: true, groupId,
            },
          },
        })
      }
    })

    // ¿Quedó algún miembro activo? Determina total vs parcial.
    const remainingActive = await this.prisma.guestStay.count({
      where: {
        reservationGroupId: groupId, organizationId: orgId,
        cancelledAt: null, noShowAt: null, actualCheckout: null,
      },
    })
    const groupCancelled = remainingActive === 0
    if (groupCancelled) {
      await this.prisma.reservationGroup.update({ where: { id: groupId }, data: { cancelledAt: now } })
    }

    // Liberar inventario + evento por miembro (best-effort).
    for (const s of selected) {
      void this.availability.notifyRelease({
        roomId: s.roomId, from: s.checkinAt, to: s.scheduledCheckout,
        reason: 'CANCELLATION', traceId: `cancel-group-${s.id}-${Date.now()}`,
      })
      this.events.emit('stay.cancelled', {
        stayId: s.id, orgId, propertyId: s.propertyId, roomId: s.roomId,
        guestName: s.guestName, initiator: dto.initiator,
      })
    }

    // Channex CRS — solo si la cancel ORIGINA en el PMS (HOTEL/ADMIN_ERROR).
    const group = await this.prisma.reservationGroup.findUnique({
      where: { id: groupId },
      select: { channexBookingId: true, channexOtaName: true, primaryGuestName: true },
    })
    const channexBookingId =
      group?.channexBookingId ?? selected.find((s) => s.channexBookingId)?.channexBookingId ?? null
    const isPmsOriginated = dto.initiator === 'HOTEL' || dto.initiator === 'ADMIN_ERROR'

    if (channexBookingId && isPmsOriginated) {
      if (groupCancelled) {
        // Total → cancela la reserva OTA completa.
        const cancelEvent: ChannexBookingCancelRequestedEvent = {
          propertyId:       selected[0].propertyId,
          stayId:           selected[0].id,
          channexBookingId,
          channexOtaName:   group?.channexOtaName ?? null,
          reason:           dto.reason ?? null,
        }
        this.events.emit(CHANNEX_BOOKING_CANCEL_REQUESTED, cancelEvent)
      } else {
        // Parcial de grupo OTA: NO auto-cancelar (borraría toda la reserva). El push
        // "modify" (quitar solo algunas rooms) aún no existe → ajuste manual en la OTA.
        void this.notifCenter.send({
          propertyId:    selected[0].propertyId,
          type:          'ACTION_REQUIRED',
          category:      'STAY_CANCELLED',
          priority:      'HIGH',
          title:         `Ajusta la reserva en ${group?.channexOtaName ?? 'la OTA'} — cancelación parcial de grupo`,
          body:          `Cancelaste ${selected.length} habitación(es) de un grupo de ${group?.channexOtaName ?? 'OTA'}. Zenix no puede modificar la reserva automáticamente; ajústala en el extranet de la OTA para liberar solo esas habitaciones.`,
          metadata:      { groupId, channexBookingId, cancelledStayIds: selected.map((s) => s.id) },
          recipientType: 'ROLE',
          recipientRole: 'SUPERVISOR',
          triggeredById: actorId,
          // Compliance/acción permanente — no se purga (§101).
        }).catch((err: Error) => this.logger.warn(`[CancelGroup] OTA notif failed: ${err?.message}`))
      }
    }

    // Una sola notif resumen al SUPERVISOR.
    void this.notifCenter.send({
      propertyId:    selected[0].propertyId,
      type:          'INFORMATIONAL',
      category:      'STAY_CANCELLED',
      priority:      dto.initiator === 'ADMIN_ERROR' || dto.initiator === 'HOTEL' ? 'HIGH' : 'MEDIUM',
      title:         `${groupCancelled ? 'Grupo cancelado' : 'Cancelación parcial de grupo'} — ${group?.primaryGuestName ?? selected[0].guestName}`,
      body:          `${selected.length} habitación(es) cancelada(s)${groupCancelled ? ' · grupo completo' : ` · quedan ${remainingActive} activa(s)`}${dto.reason ? ` · "${dto.reason.slice(0, 80)}"` : ''}`,
      metadata:      { groupId, cancelledCount: selected.length, groupCancelled },
      recipientType: 'ROLE',
      recipientRole: 'SUPERVISOR',
      triggeredById: actorId,
    }).catch((err: Error) => this.logger.warn(`[CancelGroup] notif failed: ${err?.message}`))

    return {
      ok: true as const,
      groupCancelled,
      cancelledCount: selected.length,
      remainingActive,
      results: selected.map((s) => ({
        stayId:       s.id,
        roomNumber:   s.room.number,
        retention:    outcomes.get(s.id)!.retention,
        refund:       outcomes.get(s.id)!.refund,
        refundStatus: outcomes.get(s.id)!.refund > 0.001 ? ('PENDING' as const) : ('NONE' as const),
      })),
    }
  }

  // Restaurar una reserva cancelada. Disponible solo si:
  // - cancelInitiator es 'HOTEL' o 'ADMIN_ERROR' (D-CAN7).
  // - Pasaron < 7 días desde `cancelledAt`.
  // - La habitación sigue disponible para las fechas originales.
  async restoreStay(stayId: string, actorId: string) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      include: { stayJourney: { select: { id: true } } },
    })
    if (!stay) throw new NotFoundException('Estadía no encontrada')
    if (!stay.cancelledAt) throw new ConflictException('La estadía no está cancelada')

    if (stay.cancelInitiator !== 'HOTEL' && stay.cancelInitiator !== 'ADMIN_ERROR') {
      throw new ConflictException(
        'Solo cancelaciones iniciadas por el hotel o por error administrativo pueden restaurarse. ' +
        'Si el huésped quiere volver, crea una nueva reserva.',
      )
    }

    const RESTORE_WINDOW_DAYS = 7
    const elapsedDays = (Date.now() - stay.cancelledAt.getTime()) / 86_400_000
    if (elapsedDays > RESTORE_WINDOW_DAYS) {
      throw new ConflictException(
        `La ventana de restauración es de ${RESTORE_WINDOW_DAYS} días. ` +
        `Esta cancelación tiene ${Math.floor(elapsedDays)} días — crear una reserva nueva.`,
      )
    }

    // Verificar disponibilidad excluyendo este mismo stay (que está cancelled
    // pero aún tiene los datos de fechas originales).
    const avail = await this.availability.check({
      roomId: stay.roomId,
      from:   stay.checkinAt,
      to:     stay.scheduledCheckout,
      excludeStayIds: [stayId],
    })
    if (!avail.available) {
      const c = avail.conflicts[0]
      throw new ConflictException(
        `No se puede restaurar — habitación ocupada por ${c.label} en esas fechas. ` +
        `Modifica la reserva original primero o crea una nueva en otra habitación.`,
      )
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stayId },
        data: {
          cancelledAt:          null,
          cancelledById:        null,
          cancelInitiator:      null,
          cancelReason:         null,
          cancelReasonCode:     null,
          cancelMetadata:       Prisma.DbNull,
          cancelledFromChannel: null,
          requiresFiscalReview: false,
        },
      })

      if (stay.stayJourney?.id) {
        await tx.staySegment.updateMany({
          where: { journeyId: stay.stayJourney.id, status: 'CANCELLED' },
          data:  { status: 'ACTIVE' },
        })
        await tx.stayJourney.update({
          where: { id: stay.stayJourney.id },
          data:  { status: 'ACTIVE' },
        })
        await tx.stayJourneyEvent.create({
          data: {
            journeyId: stay.stayJourney.id,
            eventType: 'RESTORED',
            actorId,
            payload: { originallyInitiator: stay.cancelInitiator },
          },
        })
      }

      await tx.guestStayLog.create({
        data: {
          stayId,
          event:     'RESTORED',
          actorId,
          actorType: 'USER',
          metadata: {
            originalCancelInitiator: stay.cancelInitiator,
            originalCancelReason:    stay.cancelReason,
            cancelledAtOriginal:     stay.cancelledAt!.toISOString(),
          },
        },
      })
    })

    void this.availability.notifyReservation({
      roomId: stay.roomId,
      from:   stay.checkinAt,
      to:     stay.scheduledCheckout,
      reason: 'CANCELLATION',
      traceId: `restore-${stayId}-${Date.now()}`,
    })

    this.events.emit('stay.restored', {
      stayId,
      orgId,
      propertyId: stay.propertyId,
      roomId:     stay.roomId,
      guestName:  stay.guestName,
    })

    // Sprint AUDIT-CORE — restore puede afectar disputa Visa post-chargeback.
    // Crítico para evidencia: "hotel decidió revivir la reserva" debe quedar trail.
    this.audit.recordStayRestored({
      stayId,
      actorStaffId: actorId,
      organizationId: orgId,
    })

    return { ok: true as const, restoredAt: new Date() }
  }

  // Lista de cancelaciones para archive UI. Pagination simple + filtros.
  /**
   * Lista UNIFICADA de cancelaciones — reservas (stay-level) Y extensiones
   * (segment-level). Patrón Mews/Cloudbeds "Cancellations report" que muestra
   * ambos tipos en una sola vista con distinción de tipo.
   *
   * Sprint 2026-05-17 (post EXT-CANCEL): el `cancelFutureSegment` registra
   * un StayJourneyEvent con eventType=CANCELLED + payload.subType='EXTENSION_CANCELLED'.
   * Esta query lee de ambas fuentes y devuelve un shape unificado.
   */
  async listCancelled(opts: {
    propertyId: string
    limit?: number
    offset?: number
    initiator?: string
    sinceISO?: string
  }) {
    const orgId = this.tenant.getOrganizationId()
    const takeLimit = Math.min(opts.limit ?? 50, 200)
    const skipOffset = opts.offset ?? 0
    const sinceDate = opts.sinceISO ? new Date(opts.sinceISO) : null

    // ── Stay-level cancellations ────────────────────────────────────────────
    const stayWhere: Prisma.GuestStayWhereInput = {
      organizationId: orgId,
      propertyId:     opts.propertyId,
      cancelledAt:    sinceDate
        ? { gte: sinceDate, not: null }
        : { not: null },
      ...(opts.initiator ? { cancelInitiator: opts.initiator } : {}),
    }
    const stayRows = await this.prisma.guestStay.findMany({
      where: stayWhere,
      orderBy: { cancelledAt: 'desc' },
      include: {
        room: { select: { number: true } },
      },
    })

    // ── Extension-level cancellations (subType discriminator) ───────────────
    // Initiator filter NO aplica a segment cancellations en v1 — son siempre
    // iniciadas por HOTEL (recepcionista cancela una extensión planeada).
    // Si initiator filter está activo y NO es 'HOTEL', omitimos extensions.
    const includeExtensions = !opts.initiator || opts.initiator === 'HOTEL'
    const extensionEvents = includeExtensions
      ? await this.prisma.stayJourneyEvent.findMany({
          where: {
            eventType: 'CANCELLED',
            payload: { path: ['subType'], equals: 'EXTENSION_CANCELLED' },
            ...(sinceDate ? { occurredAt: { gte: sinceDate } } : {}),
            journey: {
              guestStay: {
                organizationId: orgId,
                propertyId: opts.propertyId,
              },
            },
          },
          orderBy: { occurredAt: 'desc' },
          include: {
            journey: {
              include: {
                guestStay: {
                  select: {
                    id: true,
                    guestName: true,
                    bookingRef: true,
                  },
                },
              },
            },
          },
        })
      : []

    // ── Unificar shape ──────────────────────────────────────────────────────
    type UnifiedRow = {
      id: string
      type: 'STAY' | 'EXTENSION_SEGMENT'
      guestStayId: string
      guestName: string
      bookingRef: string | null
      roomNumber: string | null
      cancelledAt: Date
      cancelInitiator: string | null
      cancelReason: string | null
      // GROUP-BILLING Fase C C3b — outcome de reembolso (STAY-level).
      currency?: string | null
      cancelRetentionAmount?: number | null
      cancelRefundAmount?: number | null
      cancelRefundStatus?: string | null
      // Solo presente para EXTENSION_SEGMENT
      segmentId?: string
      previousCheckOut?: string
      newJourneyCheckOut?: string
    }

    const unified: UnifiedRow[] = []
    for (const s of stayRows) {
      unified.push({
        id: s.id,
        type: 'STAY',
        guestStayId: s.id,
        guestName: s.guestName,
        bookingRef: s.bookingRef ?? null,
        roomNumber: s.room?.number ?? null,
        cancelledAt: s.cancelledAt!,
        cancelInitiator: s.cancelInitiator ?? null,
        cancelReason: s.cancelReason ?? null,
        currency: s.currency,
        cancelRetentionAmount: s.cancelRetentionAmount != null ? Number(s.cancelRetentionAmount) : null,
        cancelRefundAmount: s.cancelRefundAmount != null ? Number(s.cancelRefundAmount) : null,
        cancelRefundStatus: s.cancelRefundStatus ?? null,
      })
    }
    for (const e of extensionEvents) {
      const payload = e.payload as Record<string, unknown> | null
      const stay = e.journey.guestStay
      if (!stay) continue
      unified.push({
        id: e.id,
        type: 'EXTENSION_SEGMENT',
        guestStayId: stay.id,
        guestName: stay.guestName,
        bookingRef: stay.bookingRef ?? null,
        roomNumber: null,  // segment.roomId está en el payload pero requiere extra join
        cancelledAt: e.occurredAt,
        cancelInitiator: 'HOTEL',
        cancelReason: (payload?.reason as string | null) ?? null,
        segmentId: (payload?.segmentId as string | undefined),
        previousCheckOut: (payload?.previousCheckOut as string | undefined),
        newJourneyCheckOut: (payload?.newJourneyCheckOut as string | undefined),
      })
    }

    // Sort merged by cancelledAt desc
    unified.sort((a, b) => b.cancelledAt.getTime() - a.cancelledAt.getTime())

    const total = unified.length
    const rows = unified.slice(skipOffset, skipOffset + takeLimit)
    return { rows, total }
  }

  /**
   * Counter para el slide footer "Canceladas hoy: N".
   * Suma stay-level + extension-segment cancellations dentro del día local.
   */
  async countCancelledToday(propertyId: string, timezone: string) {
    const orgId = this.tenant.getOrganizationId()
    const todayLocal = toLocalDate(new Date(), timezone)
    const dayStart = new Date(`${todayLocal}T00:00:00.000Z`)
    const dayEnd   = new Date(`${todayLocal}T23:59:59.999Z`)

    const [stayCount, extensionCount] = await Promise.all([
      this.prisma.guestStay.count({
        where: {
          organizationId: orgId,
          propertyId,
          cancelledAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      this.prisma.stayJourneyEvent.count({
        where: {
          eventType: 'CANCELLED',
          payload: { path: ['subType'], equals: 'EXTENSION_CANCELLED' },
          occurredAt: { gte: dayStart, lte: dayEnd },
          journey: {
            guestStay: {
              organizationId: orgId,
              propertyId,
            },
          },
        },
      }),
    ])
    return stayCount + extensionCount
  }

  async logContact(
    stayId: string,
    actorId: string | null,
    channel: import('@prisma/client').ContactChannel,
    messagePreview?: string,
  ) {
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findUnique({
      where: this.stayScope(stayId),
      select: { id: true },
    })
    if (!stay) throw new NotFoundException(`Estadía ${stayId} no encontrada`)

    return this.prisma.guestContactLog.create({
      data: {
        stayId,
        channel,
        sentById: actorId,
        messagePreview: messagePreview?.slice(0, 160),
      },
    })
  }
}
