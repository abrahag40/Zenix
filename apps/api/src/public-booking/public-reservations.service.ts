import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AvailabilityService } from '../pms/availability/availability.service'
import { BookingSystemStaffService } from './booking-system-staff.service'
import { VerifiedApiKey } from './booking-api-key.service'
import { CreateReservationDto, ReservationRoomDto } from './dto/create-reservation.dto'

/** Maps source → single SRC char del bookingRef (mirror SOURCE_CHAR §). */
const SRC_CHAR_DIRECT_WEB = 'W'

interface ResolvedLine {
  line: ReservationRoomDto
  roomTypeId: string
  roomTypeName: string
  chosenRoomId: string
  roomNumber: string | null
  checkIn: Date
  checkOut: Date
  nights: number
  pax: number
  nightlyRate: number
  total: number
  currency: string
}

/**
 * PublicReservationsService — BOOKING-ENGINE B2 (WRITE).
 *
 * Crea reservas directas (`source='DIRECT_WEB'`, `paymentModel='HOTEL_COLLECT'`)
 * desde un website externo. Mirror del path canónico de Channex inbound
 * (booking-new.handler §137): el cliente reserva un TIPO de habitación; Zenix
 * asigna la habitación física libre validando vía AvailabilityService.check
 * (§35). Atómico: si CUALQUIER línea no se puede satisfacer, se rechaza TODA la
 * reserva (no parcial). Idempotente por (apiKey, Idempotency-Key).
 *
 * Opción B (Fase 1): PAY_AT_HOTEL — no se procesa cobro online; el saldo queda
 * pendiente para registrarse en recepción.
 */
@Injectable()
export class PublicReservationsService {
  private readonly logger = new Logger(PublicReservationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly notifications: NotificationsService,
    private readonly systemStaff: BookingSystemStaffService,
    private readonly events: EventEmitter2,
  ) {}

  /** Crea una reserva por API key (Tier 3 — website externo con pk_live_). */
  async createReservation(
    apiKey: VerifiedApiKey,
    dto: CreateReservationDto,
    idempotencyKey: string | undefined,
  ) {
    return this.create({ scopeId: apiKey.id, propertyId: apiKey.propertyId }, dto, idempotencyKey)
  }

  /**
   * Crea una reserva por SLUG (hosted page first-party — sin API key). La hosted
   * page `book.zenix.com/{slug}` la sirve Zenix, así que no expone pk_live_ en el
   * cliente; reserva por slug + Idempotency-Key, protegida por rate-limit per-IP.
   * Patrón Cloudbeds/Mews: reservar en la hosted page no requiere key.
   */
  async createReservationBySlug(slug: string, dto: CreateReservationDto, idempotencyKey: string | undefined) {
    const config = await this.prisma.bookingEngineConfig.findUnique({
      where: { slug },
      select: { propertyId: true, enabled: true },
    })
    if (!config || !config.enabled) throw new NotFoundException('Página de reservas no encontrada')
    return this.create({ scopeId: `hosted:${config.propertyId}`, propertyId: config.propertyId }, dto, idempotencyKey)
  }

  /** Núcleo de creación, agnóstico al método de auth (API key o slug). */
  private async create(
    ctx: { scopeId: string; propertyId: string },
    dto: CreateReservationDto,
    idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Falta el header Idempotency-Key')
    }
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex')

    // ── Idempotencia ──────────────────────────────────────────────────────────
    const prior = await this.prisma.bookingIdempotencyRecord.findUnique({
      where: {
        apiKeyId_idempotencyKey: { apiKeyId: ctx.scopeId, idempotencyKey },
      },
    })
    if (prior) {
      if (prior.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency-Key reutilizado con un body distinto',
        )
      }
      return prior.responseJson // replay → misma respuesta, no crea duplicado
    }

    // ── Property (del scope auth — API key o slug) ─────────────────────────────
    const property = await this.prisma.property.findUnique({
      where: { id: ctx.propertyId },
      select: {
        id: true,
        organizationId: true,
        propCode: true,
        settings: { select: { timezone: true } },
        legalEntity: { select: { countryCode: true, baseCurrency: true } },
        bookingEngineConfig: { select: { enabled: true, paymentPolicy: true, displayCurrency: true } },
      },
    })
    if (!property || !property.bookingEngineConfig?.enabled) {
      throw new NotFoundException('Motor de reservas no disponible para esta llave')
    }
    if (!property.organizationId) {
      throw new BadRequestException('Property sin organización (integridad)')
    }
    const organizationId = property.organizationId
    const currency =
      property.bookingEngineConfig.displayCurrency ??
      property.legalEntity?.baseCurrency ??
      'USD'

    // ── Validación read-only por línea: roomType + capacidad + noches + tarifa ──
    // La ASIGNACIÓN de la habitación física + re-check de disponibilidad se hace
    // DENTRO de la $transaction bajo advisory lock (anti-overbook §35 — mismo
    // patrón que guest-stays.create BUG #9). Sin el lock, dos reservas web
    // concurrentes por el último cuarto pasan ambas el check → overbooking.
    interface PreLine {
      line: ReservationRoomDto
      roomTypeName: string
      candidateRooms: { id: string; number: string | null }[]
      checkIn: Date
      checkOut: Date
      nights: number
      pax: number
      nightlyRate: number
      currency: string
    }
    const preLines: PreLine[] = []
    for (const line of dto.rooms) {
      const roomType = await this.prisma.roomType.findFirst({
        where: { id: line.roomTypeId, propertyId: property.id, isActive: true, deletedAt: null },
        include: { rooms: { where: { deletedAt: null }, select: { id: true, number: true } } },
      })
      if (!roomType) {
        throw new NotFoundException(`Tipo de habitación no encontrado: ${line.roomTypeId}`)
      }
      const pax = line.adults + (line.children ?? 0)
      if (pax > roomType.maxOccupancy) {
        throw new BadRequestException(
          `"${roomType.name}" admite hasta ${roomType.maxOccupancy} huéspedes; se solicitaron ${pax}`,
        )
      }
      const checkIn = new Date(line.checkIn)
      const checkOut = new Date(line.checkOut)
      if (utcDay(checkOut) <= utcDay(checkIn)) {
        throw new BadRequestException('checkOut debe ser posterior a checkIn')
      }
      preLines.push({
        line,
        roomTypeName: roomType.name,
        candidateRooms: roomType.rooms,
        checkIn,
        checkOut,
        nights: Math.round((utcDay(checkOut) - utcDay(checkIn)) / 86400000),
        pax,
        nightlyRate: Number(roomType.baseRate),
        currency: roomType.currency ?? currency,
      })
    }

    const checkedInById = await this.systemStaff.getOrCreate(property.id, organizationId)
    const isGroup = preLines.length > 1
    const countryCode = property.legalEntity?.countryCode ?? 'MX'
    const propCode = property.propCode ?? '000'
    // M2 fix: la moneda del response = la tarifa real (uniforme por property),
    // no el displayCurrency (evita rotular una tarifa USD como MXN).
    const responseCurrency = preLines[0]?.currency ?? currency

    // ── Crear todo en UNA transacción con advisory lock anti-overbook ───────────
    type StayOut = { id: string; bookingRef: string; roomTypeName: string; roomNumber: string | null; total: number; currency: string; checkIn: Date; checkOut: Date }
    let txResult: { replay?: unknown; response?: any; stays?: StayOut[]; groupId?: string | null }
    try {
      txResult = await this.prisma.$transaction(async (tx) => {
        // Serializa la creación de reservas de ESTA property (cubre el re-check de
        // disponibilidad + el contador del bookingRef). Se libera al commit.
        // try/catch TypeError → no rompe unit tests con $transaction mockeado.
        try {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, `booking:${property.id}`)
        } catch (e) {
          if (!(e instanceof TypeError)) throw e
        }

        // Idempotencia BAJO lock: si una request concurrente con la misma key ya
        // commiteó, devolvemos su respuesta (no creamos doble reserva).
        const dup = await tx.bookingIdempotencyRecord.findUnique({
          where: { apiKeyId_idempotencyKey: { apiKeyId: ctx.scopeId, idempotencyKey } },
        })
        if (dup) {
          if (dup.requestHash !== requestHash) {
            throw new ConflictException('Idempotency-Key reutilizado con un body distinto')
          }
          return { replay: dup.responseJson }
        }

        // Asignar habitación física re-chequeando disponibilidad DENTRO del lock.
        const usedRoomIds = new Set<string>() // evita asignar la misma room 2× en el grupo
        const resolved: ResolvedLine[] = []
        for (const pre of preLines) {
          let chosen: { id: string; number: string | null } | null = null
          for (const room of pre.candidateRooms) {
            if (usedRoomIds.has(room.id)) continue
            const res = await this.availability.check({ roomId: room.id, from: pre.checkIn, to: pre.checkOut })
            if (res.available) { chosen = room; break }
          }
          if (!chosen) {
            throw new ConflictException(
              `Sin disponibilidad para "${pre.roomTypeName}" en ${pre.line.checkIn} → ${pre.line.checkOut}`,
            )
          }
          usedRoomIds.add(chosen.id)
          resolved.push({
            line: pre.line,
            roomTypeId: pre.line.roomTypeId,
            roomTypeName: pre.roomTypeName,
            chosenRoomId: chosen.id,
            roomNumber: chosen.number,
            checkIn: pre.checkIn,
            checkOut: pre.checkOut,
            nights: pre.nights,
            pax: pre.pax,
            nightlyRate: pre.nightlyRate,
            total: pre.nightlyRate * pre.nights,
            currency: pre.currency,
          })
        }

        let groupId: string | null = null
        if (isGroup) {
          const group = await tx.reservationGroup.create({
            data: {
              organizationId,
              propertyId: property.id,
              primaryGuestName: dto.guest.name,
              primaryGuestEmail: dto.guest.email ?? null,
              primaryGuestPhone: dto.guest.phone ?? null,
              groupSize: resolved.reduce((s, r) => s + r.pax, 0),
              roomCount: resolved.length,
              groupCheckIn: resolved.reduce((min, r) => (r.checkIn < min ? r.checkIn : min), resolved[0].checkIn),
              groupCheckOut: resolved.reduce((max, r) => (r.checkOut > max ? r.checkOut : max), resolved[0].checkOut),
            },
            select: { id: true },
          })
          groupId = group.id
        }

        const stays: StayOut[] = []
        for (let i = 0; i < resolved.length; i++) {
          const r = resolved[i]
          const bookingRef = await this.buildBookingRef(tx, countryCode, propCode, r.checkIn)
          const created = await tx.guestStay.create({
            data: {
              organizationId,
              propertyId: property.id,
              roomId: r.chosenRoomId,
              bookingRef,
              guestName: r.line.guestName ?? dto.guest.name,
              guestEmail: dto.guest.email ?? null,
              guestPhone: dto.guest.phone ?? null,
              paxCount: r.pax,
              checkinAt: r.checkIn,
              scheduledCheckout: r.checkOut,
              ratePerNight: new Prisma.Decimal(r.nightlyRate),
              currency: r.currency,
              totalAmount: new Prisma.Decimal(r.total),
              amountPaid: new Prisma.Decimal(0),
              paymentStatus: 'PENDING',
              paymentModel: 'HOTEL_COLLECT',
              source: 'DIRECT_WEB',
              notes: dto.notes ?? null,
              checkedInById,
              ...(isGroup ? { reservationGroupId: groupId, groupRoomIndex: i + 1 } : {}),
            },
            select: { id: true, roomId: true, checkinAt: true, scheduledCheckout: true, guestName: true, guestEmail: true },
          })

          // StayJourney + ORIGINAL StaySegment — mirror del flujo canónico (§137).
          const journey = await tx.stayJourney.create({
            data: {
              organizationId,
              propertyId: property.id,
              guestName: created.guestName,
              guestEmail: created.guestEmail,
              guestStayId: created.id,
              journeyCheckIn: created.checkinAt,
              journeyCheckOut: created.scheduledCheckout,
            },
            select: { id: true },
          })
          await tx.staySegment.create({
            data: {
              journeyId: journey.id,
              roomId: created.roomId,
              guestStayId: created.id,
              checkIn: created.checkinAt,
              checkOut: created.scheduledCheckout,
              status: 'ACTIVE',
              reason: 'ORIGINAL',
              rateSnapshot: new Prisma.Decimal(r.nightlyRate),
            },
          })

          stays.push({
            id: created.id, bookingRef, roomTypeName: r.roomTypeName, roomNumber: r.roomNumber,
            total: r.total, currency: r.currency, checkIn: r.checkIn, checkOut: r.checkOut,
          })
        }

        const response = {
          reservationRef: stays[0].bookingRef,
          isGroup,
          groupId,
          paymentPolicy: property.bookingEngineConfig!.paymentPolicy, // PAY_AT_HOTEL
          currency: responseCurrency,
          totalAmount: stays.reduce((s, r) => s + r.total, 0),
          rooms: stays.map((s) => ({
            bookingRef: s.bookingRef,
            roomType: s.roomTypeName,
            roomNumber: s.roomNumber,
            checkIn: isoDate(s.checkIn),
            checkOut: isoDate(s.checkOut),
            total: s.total,
            currency: s.currency,
          })),
          message: 'Reserva confirmada. El pago se realiza al llegar al hotel.',
        }

        // Idempotencia persistida DENTRO del lock → segura contra concurrencia.
        await tx.bookingIdempotencyRecord.create({
          data: {
            apiKeyId: ctx.scopeId,
            idempotencyKey,
            requestHash,
            responseJson: response as unknown as Prisma.InputJsonValue,
            statusCode: 201,
          },
        })

        return { response, stays, groupId }
      })
    } catch (e) {
      // P2002 (bookingRef o idempotency) bajo carrera extrema → 409 limpio
      // en vez de 500 (la causa real ya está serializada por el advisory lock).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Reserva duplicada o en proceso; reintenta.')
      }
      throw e
    }

    // Replay concurrente detectado bajo lock → devolver la respuesta cacheada.
    if (txResult.replay) return txResult.replay
    const stays = txResult.stays!

    // ── SSE → recepción ve la reserva al instante (§124) ───────────────────────
    for (const s of stays) {
      this.notifications.emit(property.id, 'booking:created', {
        stayId: s.id,
        bookingRef: s.bookingRef,
        groupId: txResult.groupId ?? null,
      })
    }

    // ── Webhook outbound (B3) → el website del hotel se entera ──────────────────
    this.events.emit('booking.reservation.created', {
      propertyId: property.id,
      reservationRef: stays[0].bookingRef,
      isGroup,
      groupId: txResult.groupId ?? null,
      rooms: stays.map((s) => ({ bookingRef: s.bookingRef, roomType: s.roomTypeName })),
    })
    // La reserva ocupó inventario → invalidar el calendario cacheado del website.
    this.events.emit('booking.availability.changed', { propertyId: property.id })

    return txResult.response
  }

  /** Estado público de una reserva por bookingRef, scoped a la property de la llave. */
  async getReservation(apiKey: VerifiedApiKey, ref: string) {
    const stay = await this.prisma.guestStay.findFirst({
      where: { bookingRef: ref, propertyId: apiKey.propertyId },
      select: {
        bookingRef: true,
        guestName: true,
        checkinAt: true,
        scheduledCheckout: true,
        paymentStatus: true,
        totalAmount: true,
        amountPaid: true,
        currency: true,
        actualCheckin: true,
        actualCheckout: true,
        cancelledAt: true,
        noShowAt: true,
        reservationGroupId: true,
      },
    })
    if (!stay) throw new NotFoundException('Reserva no encontrada')

    const status = stay.cancelledAt
      ? 'CANCELLED'
      : stay.noShowAt
        ? 'NO_SHOW'
        : stay.actualCheckout
          ? 'CHECKED_OUT'
          : stay.actualCheckin
            ? 'IN_HOUSE'
            : 'CONFIRMED'

    return {
      reservationRef: stay.bookingRef,
      guestName: stay.guestName,
      checkIn: isoDate(stay.checkinAt),
      checkOut: isoDate(stay.scheduledCheckout),
      status,
      paymentStatus: stay.paymentStatus,
      totalAmount: Number(stay.totalAmount),
      amountPaid: Number(stay.amountPaid),
      currency: stay.currency,
      isGroup: !!stay.reservationGroupId,
    }
  }

  /** bookingRef estructurado `[CC]-W-[propCode]-[YYMM]-[SEQ]` (mirror §generateBookingRef). */
  private async buildBookingRef(
    tx: Prisma.TransactionClient,
    country: string,
    propCode: string,
    checkIn: Date,
  ): Promise<string> {
    const cc = /^[A-Z]{2}$/.test(country.toUpperCase()) ? country.toUpperCase() : 'MX'
    const yy = String(checkIn.getFullYear()).slice(-2)
    const mm = String(checkIn.getMonth() + 1).padStart(2, '0')
    const prefix = `${cc}-${SRC_CHAR_DIRECT_WEB}-${propCode}-${yy}${mm}-`
    const count = await tx.guestStay.count({ where: { bookingRef: { startsWith: prefix } } })
    return `${prefix}${String(count + 1).padStart(4, '0')}`
  }
}

/** UTC midnight epoch (ms) — TZ-safe para contar noches (§12, §128). */
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
