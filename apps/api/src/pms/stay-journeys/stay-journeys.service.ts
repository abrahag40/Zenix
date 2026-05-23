import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma, StaySegment } from '@prisma/client'
import { eachDayOfInterval, isBefore, startOfDay, subDays } from 'date-fns'
import { NotificationsService } from '../../notifications/notifications.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AvailabilityService } from '../availability/availability.service'
import { AssignmentService } from '../../assignment/assignment.service'
import {
  ExtendNewRoomDto,
  ExtendSameRoomDto,
  RoomMoveDto,
  SplitReservationServiceDto,
} from './dto/stay-journey.dto'

type ActiveSegment = {
  id: string
  roomId: string
  checkIn: Date
  checkOut: Date
  status: string
  locked: boolean
  rateSnapshot: Prisma.Decimal | null
}

@Injectable()
export class StayJourneyService {
  private readonly logger = new Logger(StayJourneyService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
    private readonly availability: AvailabilityService,
    private readonly assignment: AssignmentService,
  ) {}

  async findById(journeyId: string) {
    const journey = await this.prisma.stayJourney.findUnique({
      where: { id: journeyId },
      include: {
        segments: {
          orderBy: { checkIn: 'asc' },
          include: {
            nights: true,
            room: { select: { id: true, number: true } },
          },
        },
      },
    })
    if (!journey) throw new NotFoundException(`Journey ${journeyId} not found`)
    return journey
  }

  async findActiveForTimeline(propertyId: string, from: Date, to: Date) {
    return this.prisma.stayJourney.findMany({
      where: {
        propertyId,
        // Include CHECKED_OUT journeys so segments de huéspedes que ya hicieron
        // checkout sigan visibles como bloques DEPARTED en el calendario
        // (mismo comportamiento que GuestStay con actualCheckout — preserva
        // contexto histórico, no oculta el bloque).
        // Include NO_SHOW journeys so their segments appear as NS stripe blocks
        // (frontend filters them when hideNoShows=true).
        // Date window filter abajo previene saturar con journeys antiguas.
        status: { in: ['ACTIVE', 'NO_SHOW', 'CHECKED_OUT'] },
        journeyCheckIn: { lt: to },
        journeyCheckOut: { gt: from },
      },
      include: {
        // bookingRef vive en GuestStay (parent) — sin esto el sheet header
        // muestra UUID short como fallback porque journey segments NO la
        // tienen. Sprint CANCEL-ARCHIVE 2026-05-16 fix.
        // actualCheckin: necesario para propagar a TODOS los segments del
        // journey. Sin esto, la extensión de un guest checked-in se renderiza
        // como "UNCONFIRMED" → muestra botón "Confirmar check-in" erróneo
        // (anti-pattern operacional: 5/5 PMS hacen extension auto-IN_HOUSE
        // si el parent stay ya está checked-in). Sprint 2026-05-17.
        guestStay: { select: { bookingRef: true, actualCheckin: true } },
        segments: {
          where: { status: { not: 'CANCELLED' } },
          include: {
            room: { select: { id: true, number: true } },
          },
        },
      },
      orderBy: { journeyCheckIn: 'asc' },
    })
  }

  async extendSameRoom(dto: ExtendSameRoomDto): Promise<StaySegment> {
    const journey = await this.findById(dto.journeyId)
    const activeSegment = this.getActiveSegment(journey.segments)

    const newCheckOut = startOfDay(new Date(dto.newCheckOut))
    if (newCheckOut <= activeSegment.checkOut) {
      throw new BadRequestException('newCheckOut must be after the current segment checkOut')
    }

    await this.assertRoomAvailable(
      activeSegment.roomId,
      activeSegment.checkOut,
      newCheckOut,
      activeSegment.id,
      dto.journeyId,
    )

    const newSegment = await this.prisma.$transaction(async (tx) => {
      const segment = await tx.staySegment.create({
        data: {
          journeyId: dto.journeyId,
          roomId: activeSegment.roomId,
          checkIn: startOfDay(activeSegment.checkOut),
          checkOut: newCheckOut,
          status: 'ACTIVE',
          locked: false,
          reason: 'EXTENSION_SAME_ROOM',
          rateSnapshot: activeSegment.rateSnapshot,
        },
      })

      await this.createSegmentNights(
        tx,
        segment.id,
        segment.checkIn,
        segment.checkOut,
        activeSegment.rateSnapshot,
      )

      await tx.stayJourney.update({
        where: { id: dto.journeyId },
        data: { journeyCheckOut: newCheckOut },
      })

      await tx.stayJourneyEvent.create({
        data: {
          journeyId: dto.journeyId,
          eventType: 'EXTENSION_APPROVED',
          actorId: dto.actorId,
          payload: {
            reason: 'EXTENSION_SAME_ROOM',
            roomId: activeSegment.roomId,
            previousCheckOut: activeSegment.checkOut,
            newCheckOut,
          },
        },
      })

      return segment
    })

    this.events.emit('stay.extended', {
      journeyId: dto.journeyId,
      roomId: activeSegment.roomId,
      newCheckOut,
    })

    return newSegment
  }

  /**
   * Creates a StayJourney from scratch for a plain GuestStay and adds an
   * EXTENSION_SAME_ROOM segment. Called when the receptionist drags the extend
   * handle on a block that has no journey yet.
   */
  async initJourneyAndExtend(params: {
    guestStayId: string
    guestName: string
    guestEmail: string | null
    organizationId: string
    propertyId: string
    roomId: string
    checkinAt: Date
    scheduledCheckout: Date
    newCheckOut: Date
    ratePerNight: Prisma.Decimal
    actorId: string | null
  }): Promise<StaySegment> {
    const {
      guestStayId, guestName, guestEmail, organizationId, propertyId,
      roomId, checkinAt, scheduledCheckout, newCheckOut: rawNewCheckOut, ratePerNight, actorId,
    } = params

    const origCheckIn = startOfDay(checkinAt)
    const origCheckOut = startOfDay(scheduledCheckout)
    const extCheckOut = startOfDay(rawNewCheckOut)

    if (extCheckOut <= origCheckOut) {
      throw new BadRequestException('newCheckOut must be after the current scheduledCheckout')
    }

    // La GuestStay padre todavía no tiene journey (este endpoint lo crea). Hay
    // que excluirla explícitamente del check porque sus fechas raw (checkinAt
    // con hora 15:00, scheduledCheckout 12:00) extienden levemente más allá del
    // startOfDay normalizado y se contarían como conflicto consigo misma.
    await this.assertRoomAvailable(roomId, origCheckOut, extCheckOut, undefined, undefined, [guestStayId])

    const extSegment = await this.prisma.$transaction(async (tx) => {
      const journey = await tx.stayJourney.create({
        data: {
          organizationId,
          propertyId,
          guestStayId,
          guestName,
          guestEmail,
          journeyCheckIn: origCheckIn,
          journeyCheckOut: extCheckOut,
          status: 'ACTIVE',
        },
      })

      const origSeg = await tx.staySegment.create({
        data: {
          journeyId: journey.id,
          roomId,
          guestStayId,
          checkIn: origCheckIn,
          checkOut: origCheckOut,
          status: 'ACTIVE',
          locked: true,
          reason: 'ORIGINAL',
          rateSnapshot: ratePerNight,
        },
      })
      await this.createSegmentNights(tx, origSeg.id, origCheckIn, origCheckOut, ratePerNight)

      const extSeg = await tx.staySegment.create({
        data: {
          journeyId: journey.id,
          roomId,
          checkIn: origCheckOut,
          checkOut: extCheckOut,
          status: 'ACTIVE',
          locked: false,
          reason: 'EXTENSION_SAME_ROOM',
          rateSnapshot: ratePerNight,
        },
      })
      await this.createSegmentNights(tx, extSeg.id, origCheckOut, extCheckOut, ratePerNight)

      await tx.stayJourneyEvent.create({
        data: {
          journeyId: journey.id,
          eventType: 'EXTENSION_APPROVED',
          actorId,
          payload: {
            reason: 'EXTENSION_SAME_ROOM',
            roomId,
            previousCheckOut: origCheckOut,
            newCheckOut: extCheckOut,
          },
        },
      })

      return extSeg
    })

    this.events.emit('stay.extended', {
      guestStayId,
      roomId,
      newCheckOut: extCheckOut,
    })

    return extSegment
  }

  async extendNewRoom(dto: ExtendNewRoomDto): Promise<StaySegment> {
    const journey = await this.findById(dto.journeyId)
    const activeSegment = this.getActiveSegment(journey.segments)

    const newCheckOut = startOfDay(new Date(dto.newCheckOut))
    if (newCheckOut <= activeSegment.checkOut) {
      throw new BadRequestException('newCheckOut must be after the current segment checkOut')
    }

    await this.assertRoomAvailable(
      dto.newRoomId,
      activeSegment.checkOut,
      newCheckOut,
      undefined,
      dto.journeyId,
    )

    const newSegment = await this.prisma.$transaction(async (tx) => {
      const segment = await tx.staySegment.create({
        data: {
          journeyId: dto.journeyId,
          roomId: dto.newRoomId,
          checkIn: startOfDay(activeSegment.checkOut),
          checkOut: newCheckOut,
          status: 'ACTIVE',
          locked: false,
          reason: 'EXTENSION_NEW_ROOM',
          rateSnapshot: activeSegment.rateSnapshot,
        },
      })

      await this.createSegmentNights(
        tx,
        segment.id,
        segment.checkIn,
        segment.checkOut,
        activeSegment.rateSnapshot,
      )

      await tx.stayJourney.update({
        where: { id: dto.journeyId },
        data: { journeyCheckOut: newCheckOut },
      })

      await tx.stayJourneyEvent.create({
        data: {
          journeyId: dto.journeyId,
          eventType: 'EXTENSION_APPROVED',
          actorId: dto.actorId,
          payload: {
            reason: 'EXTENSION_NEW_ROOM',
            previousRoomId: activeSegment.roomId,
            newRoomId: dto.newRoomId,
            previousCheckOut: activeSegment.checkOut,
            newCheckOut,
          },
        },
      })

      return segment
    })

    this.events.emit('stay.extended', {
      journeyId: dto.journeyId,
      roomId: dto.newRoomId,
      newCheckOut,
    })

    // Housekeeping bridge: the old room is vacated at activeSegment.checkOut.
    // Create PENDING cleaning tasks for each unit scheduled for the MOVE DAY
    // (not booking day). Sprint 2026-05-17 fix — antes scheduledFor=today
    // creaba la task en el grid del día equivocado si la extension era para
    // un día futuro. Ahora la task aparece en el grid del día del move.
    // Morning roster valida idempotencia, así que si la extension se booked
    // hoy para hoy, ambos paths (eager + cron) NO duplican.
    await this.createRoomChangeTasks(
      journey.propertyId,
      activeSegment.roomId,
      activeSegment.checkOut,
    )

    return newSegment
  }

  async executeMidStayRoomMove(dto: RoomMoveDto): Promise<StaySegment> {
    const journey = await this.findById(dto.journeyId)

    if (journey.status !== 'ACTIVE') {
      throw new BadRequestException('No se puede cambiar de habitación a un huésped que ya realizó checkout')
    }

    const activeSegment = this.getActiveSegment(journey.segments)

    const effectiveDate = startOfDay(new Date(dto.effectiveDate))
    const today = startOfDay(new Date())

    if (isBefore(effectiveDate, today)) {
      throw new BadRequestException('effectiveDate cannot be in the past')
    }

    // CAL-10: el room-move no puede tener fecha efectiva anterior al checkIn del
    // segmento activo — crearía un segmento con fecha retroactiva inválida.
    if (isBefore(effectiveDate, startOfDay(new Date(activeSegment.checkIn)))) {
      throw new BadRequestException('effectiveDate cannot be before the active segment checkIn')
    }

    if (dto.newRoomId === activeSegment.roomId) {
      throw new BadRequestException('newRoomId must be different from the current room')
    }

    await this.assertRoomAvailable(
      dto.newRoomId,
      effectiveDate,
      activeSegment.checkOut,
      undefined,
      dto.journeyId,
    )

    const originalCheckOut = activeSegment.checkOut

    const newSegment = await this.prisma.$transaction(async (tx) => {
      await tx.segmentNight.updateMany({
        where: {
          segmentId: activeSegment.id,
          date: { lt: effectiveDate },
          locked: false,
        },
        data: { locked: true, status: 'LOCKED' },
      })

      await tx.segmentNight.deleteMany({
        where: {
          segmentId: activeSegment.id,
          date: { gte: effectiveDate },
          locked: false,
        },
      })

      await tx.staySegment.update({
        where: { id: activeSegment.id },
        data: { checkOut: effectiveDate, status: 'COMPLETED', locked: true },
      })

      const segment = await tx.staySegment.create({
        data: {
          journeyId: dto.journeyId,
          roomId: dto.newRoomId,
          checkIn: effectiveDate,
          checkOut: originalCheckOut,
          status: 'ACTIVE',
          locked: false,
          reason: 'ROOM_MOVE',
          rateSnapshot: activeSegment.rateSnapshot,
        },
      })

      await this.createSegmentNights(
        tx,
        segment.id,
        segment.checkIn,
        segment.checkOut,
        activeSegment.rateSnapshot,
      )

      await tx.stayJourneyEvent.create({
        data: {
          journeyId: dto.journeyId,
          eventType: 'ROOM_MOVE_EXECUTED',
          actorId: dto.actorId,
          payload: {
            fromRoomId: activeSegment.roomId,
            toRoomId: dto.newRoomId,
            effectiveDate,
            fromSegmentId: activeSegment.id,
            toSegmentId: segment.id,
          },
        },
      })

      return segment
    })

    this.events.emit('stay.room_moved', {
      journeyId: dto.journeyId,
      fromRoomId: activeSegment.roomId,
      toRoomId: dto.newRoomId,
      effectiveDate,
    })

    // Housekeeping bridge: the old room is vacated at effectiveDate.
    // Sprint 2026-05-17 — scheduledFor ahora es la fecha real del move.
    await this.createRoomChangeTasks(
      journey.propertyId,
      activeSegment.roomId,
      effectiveDate,
    )

    // Channel manager sync — fire-and-forget (CLAUDE.md §31).
    // Release old room from effectiveDate onward; reserve new room for the same window.
    const mmTraceId = `room-move-${dto.journeyId}-${Date.now()}`
    void this.availability.notifyRelease({
      roomId: activeSegment.roomId,
      from: effectiveDate,
      to: originalCheckOut,
      reason: 'ROOM_MOVE',
      traceId: mmTraceId,
    })
    void this.availability.notifyReservation({
      roomId: dto.newRoomId,
      from: effectiveDate,
      to: originalCheckOut,
      reason: 'ROOM_MOVE',
      traceId: mmTraceId,
    })

    return newSegment
  }

  /**
   * splitReservation — Reemplaza los segmentos ACTIVE del journey con N segmentos
   * nuevos, cada uno en su propia habitación y rango. Soporta ARRIVING (toda la
   * reserva futura) e IN_HOUSE (conserva las noches ya pasadas en la habitación
   * actual; el primer part debe usar esa misma habitación).
   *
   * Validaciones:
   *   - journey ACTIVE
   *   - parts cubren exactamente [journey.checkIn, journey.checkOut] sin gaps/overlaps
   *   - cada part.roomId disponible en su rango
   *   - IN_HOUSE: parts[0].roomId === activeSegment.roomId y parts[0].checkOut > today
   */
  async splitReservation(dto: SplitReservationServiceDto): Promise<StaySegment[]> {
    const journey = await this.findById(dto.journeyId)

    if (journey.status !== 'ACTIVE') {
      throw new BadRequestException(
        'No se puede dividir una reserva que no está ACTIVE',
      )
    }

    const today = startOfDay(new Date())
    const parts = dto.parts
      .map((p) => ({
        roomId: p.roomId,
        checkIn: startOfDay(new Date(p.checkIn)),
        checkOut: startOfDay(new Date(p.checkOut)),
      }))
      .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime())

    const journeyIn = startOfDay(new Date(journey.journeyCheckIn))
    const journeyOut = startOfDay(new Date(journey.journeyCheckOut))
    if (parts[0].checkIn.getTime() !== journeyIn.getTime()) {
      throw new BadRequestException(
        'La primera parte debe empezar en el check-in del journey',
      )
    }
    if (parts[parts.length - 1].checkOut.getTime() !== journeyOut.getTime()) {
      throw new BadRequestException(
        'La última parte debe terminar en el check-out del journey',
      )
    }
    for (let i = 0; i < parts.length; i++) {
      if (!isBefore(parts[i].checkIn, parts[i].checkOut)) {
        throw new BadRequestException(`Parte ${i + 1}: checkIn debe ser anterior a checkOut`)
      }
      if (i > 0 && parts[i].checkIn.getTime() !== parts[i - 1].checkOut.getTime()) {
        throw new BadRequestException(
          `Gap u overlap entre parte ${i} y parte ${i + 1}`,
        )
      }
    }

    // Detección IN_HOUSE: algún segmento ACTIVE cuyo checkIn ya pasó
    const activeSegments = journey.segments.filter(
      (s) => s.status === 'ACTIVE',
    )
    const isInHouse = activeSegments.some(
      (s) => !isBefore(today, startOfDay(s.checkIn)),
    )

    let activeSegment: ActiveSegment | null = null
    if (isInHouse) {
      activeSegment = this.getActiveSegment(journey.segments)
      if (parts[0].roomId !== activeSegment.roomId) {
        throw new BadRequestException(
          'IN_HOUSE: la primera parte debe mantener la habitación actual del huésped',
        )
      }
      if (!isBefore(today, parts[0].checkOut)) {
        throw new BadRequestException(
          'IN_HOUSE: la primera parte debe incluir al menos hasta hoy',
        )
      }
    }

    // Validación de disponibilidad vía AvailabilityService — cubre local DB
    // (GuestStay + StaySegment + RoomBlock) Y Channex.io (channel manager).
    // Sprint 8+: un split rechaza si Channex reporta stop-sell o allotment=0.
    // Ver CLAUDE.md §29 — toda operación de inventario pasa por este servicio.
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const result = await this.availability.check({
        roomId: part.roomId,
        from: part.checkIn,
        to: part.checkOut,
        // Los segmentos del propio journey se van a cancelar/reemplazar — excluirlos.
        excludeJourneyId: dto.journeyId,
      })
      if (!result.available) {
        const c = result.conflicts[0]
        throw new ConflictException(
          `Parte ${i + 1}: habitación no disponible — ${c.label}` +
            (c.source === 'CHANNEX' ? ' (canal externo)' : ''),
        )
      }
    }

    const rateSnapshot =
      activeSegment?.rateSnapshot ?? activeSegments[0]?.rateSnapshot ?? null

    const createdSegments = await this.prisma.$transaction(async (tx) => {
      // Lock noches pasadas, borrar noches futuras de cada segmento ACTIVE
      for (const seg of activeSegments) {
        await tx.segmentNight.updateMany({
          where: { segmentId: seg.id, date: { lt: today }, locked: false },
          data: { locked: true, status: 'LOCKED' },
        })
        await tx.segmentNight.deleteMany({
          where: { segmentId: seg.id, date: { gte: today }, locked: false },
        })
      }

      // Truncar/cancelar segmentos ACTIVE
      for (const seg of activeSegments) {
        if (isInHouse && activeSegment && seg.id === activeSegment.id) {
          // Truncar el segmento activo principal a `today` como COMPLETED+locked
          await tx.staySegment.update({
            where: { id: seg.id },
            data: { checkOut: today, status: 'COMPLETED', locked: true },
          })
        } else {
          // Resto: cancelar. En ARRIVING esto incluye el ORIGINAL.
          await tx.staySegment.update({
            where: { id: seg.id },
            data: { status: 'CANCELLED' },
          })
        }
      }

      // Crear N segmentos nuevos
      const created: StaySegment[] = []
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        // En IN_HOUSE parts[0] se materializa como: (truncated original hasta today) + (nuevo segment hoy→part.checkOut)
        // Por eso, para parts[0] en IN_HOUSE creamos un segmento SPLIT que arranca en `today`.
        const segCheckIn =
          isInHouse && i === 0 ? today : part.checkIn
        if (!isBefore(segCheckIn, part.checkOut)) {
          // Defensivo: si por timezone el rango queda vacío, saltar
          continue
        }
        const isFirstAndArriving = !isInHouse && i === 0
        const reason = isFirstAndArriving ? 'ORIGINAL' : 'SPLIT'
        const segment = await tx.staySegment.create({
          data: {
            journeyId: dto.journeyId,
            roomId: part.roomId,
            guestStayId: isFirstAndArriving ? journey.guestStayId : null,
            checkIn: segCheckIn,
            checkOut: part.checkOut,
            status: 'ACTIVE',
            locked: false,
            reason,
            rateSnapshot,
          },
        })
        await this.createSegmentNights(
          tx,
          segment.id,
          segCheckIn,
          part.checkOut,
          rateSnapshot,
        )
        created.push(segment)
      }

      await tx.stayJourneyEvent.create({
        data: {
          journeyId: dto.journeyId,
          eventType: 'JOURNEY_SPLIT',
          actorId: dto.actorId,
          payload: {
            parts: parts.map((p) => ({
              roomId: p.roomId,
              checkIn: p.checkIn,
              checkOut: p.checkOut,
            })),
            isInHouse,
          },
        },
      })

      return created
    })

    this.events.emit('stay.split', {
      journeyId: dto.journeyId,
      partsCount: parts.length,
    })

    // Housekeeping bridge: crear CleaningTask(PENDING) para cada habitación
    // liberada (estaba en algún segmento activo previo y NO aparece en ningún part).
    // Split sucede INMEDIATAMENTE — scheduledFor=today (la habitación libera ahora).
    const previousRoomIds = new Set(activeSegments.map((s) => s.roomId))
    const newRoomIds = new Set(parts.map((p) => p.roomId))
    const splitToday = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
    for (const roomId of previousRoomIds) {
      if (!newRoomIds.has(roomId)) {
        await this.createRoomChangeTasks(journey.propertyId, roomId, splitToday)
      }
    }

    // Channel manager sync (Channex.io) — fire-and-forget. Each new part
    // decrements allotment for its range, each fully-released room increments.
    // Gateway is a stub until Sprint 8; calls are already wired so the migration
    // is zero-refactor. Failures are logged inside the service, never thrown.
    const traceId = `split-${dto.journeyId}-${Date.now()}`
    for (const part of parts) {
      void this.availability.notifyReservation({
        roomId: part.roomId,
        from: part.checkIn,
        to: part.checkOut,
        reason: 'SPLIT',
        traceId,
      })
    }
    for (const roomId of previousRoomIds) {
      if (!newRoomIds.has(roomId)) {
        const prev = activeSegments.find((s) => s.roomId === roomId)
        if (prev) {
          void this.availability.notifyRelease({
            roomId,
            from: prev.checkIn,
            to: prev.checkOut,
            reason: 'SPLIT',
            traceId,
          })
        }
      }
    }

    return createdSegments
  }

  /**
   * moveExtensionRoom — Reasigna un segmento del journey a una habitación diferente.
   *
   * Acepta segmentos **no bloqueados** con reason ORIGINAL, EXTENSION_SAME_ROOM,
   * EXTENSION_NEW_ROOM o ROOM_MOVE. SPLIT sigue siendo inmutable (representa
   * decisión histórica de partir la reserva).
   *
   * 2026-05-19 — bug fix: ROOM_MOVE unlocked previamente rechazado. Un ROOM_MOVE
   * con `locked=false` significa "el guest todavía no ha llegado a ese cuarto";
   * cambiar el destino es re-planear la mudanza, no romper auditoría. El segment
   * locked=true (move ejecutado y noches consumidas) sigue protegido por el
   * guard `segment.locked` abajo.
   *
   * Para extensiones, el `reason` se recalcula según si el nuevo cuarto coincide
   * con el ORIGINAL del journey (EXTENSION_SAME_ROOM vs EXTENSION_NEW_ROOM).
   * Para ROOM_MOVE el reason se mantiene (sigue siendo una mudanza, sólo cambia
   * el destino). Para ORIGINAL, el reason se mantiene y, si hay `guestStayId`
   * asociado, también se sincroniza `GuestStay.roomId` para que vistas legacy
   * (planning, housekeeping) queden consistentes.
   */
  async moveExtensionRoom(segmentId: string, newRoomId: string) {
    const segment = await this.prisma.staySegment.findUniqueOrThrow({
      where: { id: segmentId },
      include: {
        journey: {
          include: {
            segments: {
              where: { reason: 'ORIGINAL' },
              select: { roomId: true },
            },
          },
        },
      },
    })

    const movableReasons: Array<typeof segment.reason> = [
      'ORIGINAL',
      'EXTENSION_SAME_ROOM',
      'EXTENSION_NEW_ROOM',
      'ROOM_MOVE',
    ]
    if (!movableReasons.includes(segment.reason)) {
      throw new BadRequestException(
        'Solo se pueden reubicar segmentos ORIGINAL, de extensión o ROOM_MOVE (SPLIT es inmutable)',
      )
    }
    if (segment.locked) {
      throw new BadRequestException(
        'El segmento está bloqueado y no puede reubicarse',
      )
    }

    await this.assertRoomAvailable(
      newRoomId,
      segment.checkIn,
      segment.checkOut,
      segmentId,
      segment.journeyId,
    )

    const originalRoomId = segment.journey.segments[0]?.roomId
    // ORIGINAL → ORIGINAL (siempre). ROOM_MOVE → ROOM_MOVE (sigue siendo una
    // mudanza, sólo cambia el destino). EXTENSION_* → recalcular según si el
    // nuevo cuarto coincide con el ORIGINAL del journey.
    const newReason =
      segment.reason === 'ORIGINAL'
        ? 'ORIGINAL'
        : segment.reason === 'ROOM_MOVE'
          ? 'ROOM_MOVE'
          : newRoomId === originalRoomId
            ? 'EXTENSION_SAME_ROOM'
            : 'EXTENSION_NEW_ROOM'

    const updated = await this.prisma.$transaction(async (tx) => {
      const seg = await tx.staySegment.update({
        where: { id: segmentId },
        data: { roomId: newRoomId, reason: newReason },
      })

      // For ORIGINAL segments linked to a GuestStay, keep GuestStay.roomId in
      // sync so planning/housekeeping queries resolve the right room. Skipped
      // for extensions (they live only in the journey layer).
      if (segment.reason === 'ORIGINAL' && segment.guestStayId) {
        await tx.guestStay.update({
          where: { id: segment.guestStayId },
          data: { roomId: newRoomId },
        })
      }

      // 2026-05-19 — Bug fix: este método no escribía StayJourneyEvent, por
      // lo que cada `moveExtensionRoom` desaparecía del historial. El usuario
      // movió Elena 2 veces pero sólo veía 1 en Historial. Ahora cada
      // re-asignación queda registrada con el room transition.
      await tx.stayJourneyEvent.create({
        data: {
          journeyId: segment.journeyId,
          eventType: 'ROOM_MOVE_EXECUTED',
          payload: {
            segmentId,
            fromRoomId: segment.roomId,
            toRoomId: newRoomId,
            fromReason: segment.reason,
            toReason: newReason,
            mode: 'EXTENSION_REASSIGN',
          },
        },
      })

      return seg
    })

    // Channel manager sync — fire-and-forget (CLAUDE.md §31).
    const erTraceId = `ext-move-${segmentId}-${Date.now()}`
    void this.availability.notifyRelease({
      roomId: segment.roomId,
      from: segment.checkIn,
      to: segment.checkOut,
      reason: 'ROOM_MOVE',
      traceId: erTraceId,
    })
    void this.availability.notifyReservation({
      roomId: newRoomId,
      from: segment.checkIn,
      to: segment.checkOut,
      reason: 'ROOM_MOVE',
      traceId: erTraceId,
    })

    return updated
  }

  /**
   * Cancela un segmento FUTURO de un journey (típicamente una extensión que el
   * huésped, ya checked-in, decide no tomar). NO confunde con cancelar la
   * estadía entera ni con early checkout — el huésped sigue alojado en el
   * segmento activo; solo se revoca la prolongación planeada.
   *
   * Justificación (Sprint EXT-CANCEL 2026-05-17, validado vs 5/5 PMS):
   *   - Cancelar una extensión ≠ early checkout (Mews, Cloudbeds, Opera,
   *     RR, LH consensus). El guest no se va HOY, simplemente revierte un
   *     plan futuro a su fecha original.
   *   - Forzar early checkout en este caso genera audit trail erróneo +
   *     housekeeping task prematura + balance/refund incorrecto.
   *
   * Guards:
   *   - El segmento debe estar ACTIVE (no ya CANCELLED ni COMPLETED).
   *   - El segmento.checkIn debe ser estrictamente futuro (no es el actual).
   *   - El journey debe tener al menos otro segmento ACTIVE (no podemos
   *     dejarlo huérfano — cancelar el ÚNICO segmento = cancelar la stay
   *     entera, que tiene su propio flujo con guards distintos).
   *   - El stay parent NO debe estar cancelled/no-show/checked-out.
   *
   * Efectos:
   *   1. Segment.status = 'CANCELLED'
   *   2. Journey.journeyCheckOut = max(checkOut de segmentos activos restantes)
   *   3. GuestStay.scheduledCheckout = ídem (la fecha "oficial" para reports)
   *   4. Availability: liberar las noches del segmento cancelado (Channex push)
   *   5. Audit log + SSE
   */
  async cancelFutureSegment(segmentId: string, actorId: string, reason?: string) {
    const segment = await this.prisma.staySegment.findUnique({
      where: { id: segmentId },
      include: {
        journey: {
          include: {
            segments: { orderBy: { checkIn: 'asc' } },
            guestStay: {
              select: {
                id: true,
                cancelledAt: true,
                noShowAt: true,
                actualCheckout: true,
              },
            },
          },
        },
      },
    })
    if (!segment) throw new NotFoundException('Segmento no encontrado')

    // Stay-level guards
    const stay = segment.journey.guestStay
    if (!stay) throw new ConflictException('Segmento sin estadía asociada — estado inconsistente')
    if (stay.cancelledAt) {
      throw new ConflictException('La estadía ya está cancelada')
    }
    if (stay.noShowAt) {
      throw new ConflictException('La estadía está marcada como no-show')
    }
    if (stay.actualCheckout) {
      throw new ConflictException('La estadía ya hizo checkout')
    }

    // Segment-level guards
    if (segment.status !== 'ACTIVE') {
      throw new ConflictException(`Solo se puede cancelar un segmento ACTIVE (estado actual: ${segment.status})`)
    }
    const now = new Date()
    if (segment.checkIn <= now) {
      throw new BadRequestException(
        'Solo se puede cancelar un segmento FUTURO. Este segmento ya está en curso — para terminarlo antes usa checkout anticipado.',
      )
    }

    // Verificar que NO sea el único segmento activo del journey
    const otherActive = segment.journey.segments.filter(
      (s) => s.id !== segmentId && s.status === 'ACTIVE',
    )
    if (otherActive.length === 0) {
      throw new ConflictException(
        'No se puede cancelar el único segmento activo del journey — cancela la estadía completa en su lugar',
      )
    }

    // Calcular la nueva fecha de checkout del journey (el max checkOut entre los segmentos activos restantes)
    const newJourneyCheckOut = otherActive.reduce(
      (max, s) => (s.checkOut > max ? s.checkOut : max),
      new Date(0),
    )

    await this.prisma.$transaction(async (tx) => {
      // 1. Cancelar el segmento
      await tx.staySegment.update({
        where: { id: segmentId },
        data: { status: 'CANCELLED' },
      })

      // 2. Revertir journey.journeyCheckOut a la nueva fecha máxima
      await tx.stayJourney.update({
        where: { id: segment.journey.id },
        data: { journeyCheckOut: newJourneyCheckOut },
      })

      // 3. Sincronizar GuestStay.scheduledCheckout (fuente de verdad fiscal)
      await tx.guestStay.update({
        where: { id: stay.id },
        data: { scheduledCheckout: newJourneyCheckOut },
      })

      // 4. Audit trail — usamos enum existente CANCELLED + subType en payload
      // (en lugar de agregar EXTENSION_CANCELLED al enum que requeriría migration).
      // El payload.subType permite filtrar/distinguir en reportes futuros.
      await tx.stayJourneyEvent.create({
        data: {
          journeyId: segment.journey.id,
          eventType: 'CANCELLED',
          actorId,
          payload: {
            subType: 'EXTENSION_CANCELLED',
            segmentId,
            previousCheckOut: segment.checkOut.toISOString(),
            newJourneyCheckOut: newJourneyCheckOut.toISOString(),
            reason: reason ?? null,
            roomId: segment.roomId,
          },
        },
      })
    })

    // 5. Availability: liberar las noches (best-effort fire-and-forget)
    void this.availability.notifyReservation({
      roomId: segment.roomId,
      from: segment.checkIn,
      to: segment.checkOut,
      reason: 'CANCELLATION',
      traceId: `ext-cancel-${segmentId}-${Date.now()}`,
    })

    // 6. Emit SSE para refresh del calendar
    this.events.emit('stay.extended', {
      journeyId: segment.journey.id,
      roomId: segment.roomId,
      newCheckOut: newJourneyCheckOut,
    })

    this.logger.log(
      `[CancelExtension] segment=${segmentId} journey=${segment.journey.id} ` +
      `newCheckOut=${newJourneyCheckOut.toISOString()} actor=${actorId}`,
    )

    return {
      segmentId,
      journeyId: segment.journey.id,
      newJourneyCheckOut,
    }
  }

  /**
   * Confirma físicamente que el guest cambió de habitación (recepción entregó
   * la nueva llave). Sprint MOVE-CONFIRM 2026-05-18.
   *
   * Distinto de `executeMidStayRoomMove` (que CREA el segmento de move) y de
   * `extendNewRoom` (que registra la intención futura). Este endpoint
   * representa la EJECUCIÓN OPERATIVA del move ya planificado: recepcionista
   * confirma con un click que la mudanza física sucedió. Triggera HK task
   * idempotente para la habitación anterior.
   *
   * Justificación operativa (validada vs 5/5 PMS — Mews, Cloudbeds, Opera,
   * Little Hotelier, RoomRaccoon todos tienen este "Confirm move executed"
   * o "Mark move complete" pattern, separado del re-check-in):
   *   - El move puede planificarse días antes (extension creada con anticipación)
   *   - El día del move, recepción necesita "checkbox" para marcar que la
   *     mudanza física ya pasó (llaves entregadas)
   *   - HK no debe limpiar el cuarto previo HASTA que el move se confirme
   *     (si no, recamarista entra a un cuarto que el guest aún ocupa)
   *
   * Guards:
   *   - Segment debe ser EXTENSION_NEW_ROOM o ROOM_MOVE (no aplica a ORIGINAL
   *     ni EXTENSION_SAME_ROOM — no hay mudanza física)
   *   - segment.status === 'ACTIVE'
   *   - segment.checkIn <= now (no se puede confirmar un move futuro)
   *   - segment.moveConfirmedAt === null (idempotency — no doble confirm)
   *   - Stay parent NO cancelled/no-show/checked-out
   */
  async confirmSegmentMove(segmentId: string, actorId: string) {
    const segment = await this.prisma.staySegment.findUnique({
      where: { id: segmentId },
      include: {
        journey: {
          include: {
            guestStay: {
              select: {
                id: true,
                cancelledAt: true,
                noShowAt: true,
                actualCheckout: true,
                propertyId: true,
              },
            },
            segments: {
              orderBy: { checkIn: 'asc' },
              select: { id: true, roomId: true, status: true, checkOut: true, reason: true },
            },
          },
        },
      },
    })
    if (!segment) throw new NotFoundException('Segmento no encontrado')

    const stay = segment.journey.guestStay
    if (!stay) throw new ConflictException('Segmento sin estadía asociada')
    if (stay.cancelledAt)    throw new ConflictException('Estadía cancelada')
    if (stay.noShowAt)       throw new ConflictException('Estadía en flujo no-show')
    if (stay.actualCheckout) throw new ConflictException('Estadía ya hizo checkout')

    // Solo segments que representan un cambio físico de cuarto
    if (segment.reason !== 'EXTENSION_NEW_ROOM' && segment.reason !== 'ROOM_MOVE') {
      throw new BadRequestException(
        `Este segmento (${segment.reason}) no requiere confirmación de mudanza. Solo EXTENSION_NEW_ROOM y ROOM_MOVE tienen mudanza física.`,
      )
    }
    if (segment.status !== 'ACTIVE') {
      throw new ConflictException(`Solo se puede confirmar mudanza de segments ACTIVE (estado: ${segment.status})`)
    }
    if (segment.moveConfirmedAt) {
      throw new ConflictException('La mudanza ya fue confirmada anteriormente')
    }
    const now = new Date()
    if (segment.checkIn > now) {
      throw new BadRequestException(
        'El segmento es futuro — no se puede confirmar la mudanza antes de la fecha del move',
      )
    }

    // Detectar habitación previa: el segmento anterior cronológico que tenía
    // un roomId distinto. Sin previousRoom, no hay HK task que crear.
    const sortedSegments = [...segment.journey.segments].sort(
      (a, b) => a.checkOut.getTime() - b.checkOut.getTime(),
    )
    const idx = sortedSegments.findIndex((s) => s.id === segmentId)
    const previousSegment = idx > 0 ? sortedSegments[idx - 1] : null
    const previousRoomId =
      previousSegment && previousSegment.roomId !== segment.roomId
        ? previousSegment.roomId
        : null

    // Transacción atómica
    await this.prisma.$transaction(async (tx) => {
      await tx.staySegment.update({
        where: { id: segmentId },
        data: {
          moveConfirmedAt: now,
          moveConfirmedById: actorId,
        },
      })

      await tx.stayJourneyEvent.create({
        data: {
          journeyId: segment.journey.id,
          eventType: 'ROOM_MOVE_EXECUTED',
          actorId,
          payload: {
            subType: 'MOVE_CONFIRMED',
            segmentId,
            roomId: segment.roomId,
            previousRoomId,
            confirmedAt: now.toISOString(),
          },
        },
      })
    })

    // Post-tx: si hubo previousRoom, asegurar HK task READY para HOY.
    // Consistente con §1 ciclo 2-phase checkout: PENDING (planning) → READY
    // (housekeeping puede actuar). Antes de moveConfirmed, la task estaba
    // PENDING (creada eagerly por extendNewRoom o por morning roster) y la
    // recamarista la veía pero no iniciaba — evita limpiar un cuarto aún
    // ocupado por el guest.
    if (previousRoomId) {
      await this.promoteRoomChangeTaskToReady(stay.propertyId, previousRoomId, actorId)
    }

    this.events.emit('stay.move_confirmed', {
      journeyId: segment.journey.id,
      segmentId,
      roomId: segment.roomId,
      previousRoomId,
    })

    this.logger.log(
      `[ConfirmMove] segment=${segmentId} previousRoom=${previousRoomId ?? '(none)'} actor=${actorId}`,
    )

    return {
      segmentId,
      moveConfirmedAt: now,
      previousRoomId,
    }
  }

  /**
   * Promueve la PENDING task de room change a READY tras `confirmSegmentMove`.
   * Si no existe task PENDING (caso defensive: extendNewRoom no la creó eager,
   * o el cron aún no ha corrido), la CREA directamente como READY.
   *
   * Pattern §1 (CLAUDE.md): 2-phase checkout. PENDING = planning visibility,
   * READY = housekeeping puede actuar. Sin esta promoción, la recamarista
   * vería la task PENDING pero no sabría que la mudanza fue confirmada.
   */
  private async promoteRoomChangeTaskToReady(
    propertyId: string,
    roomId: string,
    actorId: string,
  ): Promise<void> {
    const units = await this.prisma.unit.findMany({
      where: { roomId },
      select: { id: true },
    })
    if (units.length === 0) return

    const todayMidnight = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    )

    const promotedTaskIds: string[] = []
    for (const unit of units) {
      const existing = await this.prisma.cleaningTask.findFirst({
        where: {
          unitId: unit.id,
          scheduledFor: todayMidnight,
          status: { in: ['PENDING', 'UNASSIGNED'] },
        },
        select: { id: true, status: true },
      })

      if (existing) {
        // PENDING → READY (mismo pattern que confirmDeparture)
        await this.prisma.cleaningTask.update({
          where: { id: existing.id },
          data: { status: 'READY' },
        })
        await this.prisma.taskLog.create({
          data: {
            taskId: existing.id,
            staffId: actorId,
            event: 'READY',
            note: 'mudanza confirmada por recepción',
          },
        })
        promotedTaskIds.push(existing.id)
      } else {
        // Defensive: no había PENDING, creamos READY directamente
        const task = await this.prisma.cleaningTask.create({
          data: {
            unitId: unit.id,
            taskType: 'CLEANING',
            status: 'READY',
            priority: 'MEDIUM',
            scheduledFor: todayMidnight,
          },
        })
        await this.prisma.taskLog.create({
          data: {
            taskId: task.id,
            staffId: actorId,
            event: 'READY',
            note: 'mudanza confirmada (task creada al confirmar)',
          },
        })
        promotedTaskIds.push(task.id)
      }
    }

    // Auto-asignación fire-and-forget — task READY puede asignarse YA
    for (const taskId of promotedTaskIds) {
      this.assignment.autoAssign(taskId).catch((err: Error) =>
        this.logger.warn(`autoAssign failed (move-confirm) task=${taskId}: ${err.message}`),
      )
    }

    // SSE task:ready para refresh de calendar/kanban + alarma mobile
    if (promotedTaskIds.length > 0) {
      this.notifications.emit(propertyId, 'task:ready', { roomId })
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Creates PENDING cleaning tasks for all units in a vacated room (room-change bridge
   *  to housekeeping) and emits `task:planned` SSE so the dashboard updates immediately. */
  /**
   * Crea CleaningTask(PENDING) por cada unit de la habitación que será desalojada
   * por una room change (extension new room / mid-stay move / split).
   *
   * Sprint 2026-05-17 fix: `scheduledFor` ahora es REQUERIDO (antes hardcoded
   * a "today" del booking). Bug operacional: si la extension se booked hoy
   * pero el move sucede en 3 días, la tarea aparecía en grid de hoy aunque
   * la habitación seguía ocupada. Ahora cada caller especifica la fecha
   * correcta del move (= la fecha en que la habitación queda libre).
   *
   * Idempotencia: el caller no debería invocar dos veces para el mismo
   * (roomId, scheduledFor). El morning roster sí valida idempotencia antes
   * de crear, así que el doble path eager + cron coexiste sin duplicar.
   *
   * @param propertyId  Propiedad — para SSE emit
   * @param roomId      Habitación que será desalojada (origen del move)
   * @param scheduledFor Día (UTC midnight) en que la habitación queda libre
   *                    y la limpieza debe aparecer en el grid del staff.
   */
  private async createRoomChangeTasks(
    propertyId: string,
    roomId: string,
    scheduledFor: Date,
  ): Promise<void> {
    const units = await this.prisma.unit.findMany({
      where: { roomId },
      select: { id: true },
    })

    if (units.length === 0) return

    // Normalizar a UTC midnight para que la idempotencia del morning roster
    // (que también compara contra UTC midnight) funcione correctamente.
    const scheduledForDay = new Date(
      `${scheduledFor.toISOString().slice(0, 10)}T00:00:00.000Z`,
    )

    const newTaskIds: string[] = []
    for (const unit of units) {
      // Idempotencia local: si ya existe task para esta unit+día, NO duplicar.
      // (Caso: doble call accidental, o el cron ya pre-pobló y ahora una
      // nueva extension se confirma para el mismo día.)
      const existing = await this.prisma.cleaningTask.findFirst({
        where: {
          unitId: unit.id,
          scheduledFor: scheduledForDay,
          status: { notIn: ['CANCELLED'] },
        },
        select: { id: true },
      })
      if (existing) continue

      const task = await this.prisma.cleaningTask.create({
        data: {
          unitId: unit.id,
          taskType: 'CLEANING',
          status: 'PENDING',
          priority: 'MEDIUM',
          scheduledFor: scheduledForDay,
        },
      })
      newTaskIds.push(task.id)
      await this.prisma.taskLog.create({
        data: { taskId: task.id, staffId: null, event: 'CREATED', note: 'room change' },
      })
    }

    // Auto-asignación post-creación (D10) — fire-and-forget.
    for (const taskId of newTaskIds) {
      this.assignment.autoAssign(taskId).catch((err: Error) =>
        this.logger.warn(`autoAssign failed (room change) task=${taskId}: ${err.message}`),
      )
    }

    if (newTaskIds.length > 0) {
      this.notifications.emit(propertyId, 'task:planned', { roomId })
    }
  }

  private getActiveSegment(segments: ActiveSegment[]): ActiveSegment {
    // The "active" segment is the LAST one chronologically that is ACTIVE and unlocked.
    // Using find() (first match) was wrong: when a ROOM_MOVE is followed by an
    // EXTENSION_SAME_ROOM, both are unlocked ACTIVE — find() returned the ROOM_MOVE
    // causing assertRoomAvailable to conflict against the existing EXTENSION.
    const active = [...segments]
      .filter((s) => s.status === 'ACTIVE' && !s.locked)
      .sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime())[0]
    if (!active) {
      throw new BadRequestException('No active unlocked segment found for this journey')
    }
    return active
  }

  // Thin wrapper around AvailabilityService.check — single source of truth for
  // inventory validation (CLAUDE.md §35). Covers GuestStay + StaySegment +
  // RoomBlock + Channex. Same-journey segments are excluded via excludeJourneyId;
  // cuando la estadía aún no tiene journey (initJourneyAndExtend bootstrap),
  // el caller debe pasar excludeStayIds para que la propia GuestStay padre no
  // colisione consigo misma (regresión post-migración v1, bug Kevin Park).
  private async assertRoomAvailable(
    roomId: string,
    from: Date,
    to: Date,
    excludeSegmentId?: string,
    excludeJourneyId?: string,
    excludeStayIds?: string[],
  ) {
    const result = await this.availability.check({
      roomId,
      from,
      to,
      excludeSegmentIds: excludeSegmentId ? [excludeSegmentId] : undefined,
      excludeJourneyId,
      excludeStayIds,
    })
    if (!result.available) {
      const c = result.conflicts[0]
      throw new ConflictException(
        `Room ${roomId} is not available for the requested period — ${c.label}` +
          (c.source === 'CHANNEX' ? ' (canal externo)' : ''),
      )
    }
  }

  private async createSegmentNights(
    tx: Prisma.TransactionClient,
    segmentId: string,
    checkIn: Date,
    checkOut: Date,
    rate: Prisma.Decimal | null,
  ) {
    if (checkIn >= checkOut) return

    const lastNight = subDays(checkOut, 1)
    const dates = eachDayOfInterval({ start: checkIn, end: lastNight })
    const today = startOfDay(new Date())

    await tx.segmentNight.createMany({
      data: dates.map((date) => {
        const locked = isBefore(date, today)
        return {
          segmentId,
          date,
          rate: rate ?? 0,
          locked,
          status: locked ? ('LOCKED' as const) : ('PENDING' as const),
        }
      }),
    })
  }
}
