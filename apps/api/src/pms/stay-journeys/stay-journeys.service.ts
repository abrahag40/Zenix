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
import { ExtendNewRoomDto, ExtendSameRoomDto, RoomMoveDto } from './dto/stay-journey.dto'

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
        status: 'ACTIVE',
        journeyCheckIn: { lt: to },
        journeyCheckOut: { gt: from },
      },
      include: {
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

    await this.assertRoomAvailable(roomId, origCheckOut, extCheckOut)

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

    await this.assertRoomAvailable(dto.newRoomId, activeSegment.checkOut, newCheckOut)

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
    // Create PENDING cleaning tasks for each unit in that room so housekeeping
    // knows it needs servicing (room change, not checkout — guest is still in-house).
    await this.createRoomChangeTasks(
      journey.propertyId,
      activeSegment.roomId,
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

    if (dto.newRoomId === activeSegment.roomId) {
      throw new BadRequestException('newRoomId must be different from the current room')
    }

    await this.assertRoomAvailable(dto.newRoomId, effectiveDate, activeSegment.checkOut)

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
    // Create PENDING cleaning tasks so housekeeping is notified of the room change.
    await this.createRoomChangeTasks(
      journey.propertyId,
      activeSegment.roomId,
    )

    return newSegment
  }

  /**
   * moveExtensionRoom — Reasigna un segmento de extensión a una habitación diferente.
   *
   * Solo aplica a segmentos EXTENSION_SAME_ROOM o EXTENSION_NEW_ROOM.
   * Si el nuevo cuarto coincide con el cuarto del segmento ORIGINAL del journey,
   * el reason se ajusta a EXTENSION_SAME_ROOM; de lo contrario EXTENSION_NEW_ROOM.
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

    if (
      segment.reason !== 'EXTENSION_SAME_ROOM' &&
      segment.reason !== 'EXTENSION_NEW_ROOM'
    ) {
      throw new BadRequestException(
        'Solo se pueden reubicar segmentos de extensión',
      )
    }

    await this.assertRoomAvailable(newRoomId, segment.checkIn, segment.checkOut, segmentId)

    const originalRoomId = segment.journey.segments[0]?.roomId
    const newReason =
      newRoomId === originalRoomId ? 'EXTENSION_SAME_ROOM' : 'EXTENSION_NEW_ROOM'

    return this.prisma.staySegment.update({
      where: { id: segmentId },
      data: { roomId: newRoomId, reason: newReason },
    })
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Creates PENDING cleaning tasks for all units in a vacated room (room-change bridge
   *  to housekeeping) and emits `task:planned` SSE so the dashboard updates immediately. */
  private async createRoomChangeTasks(
    propertyId: string,
    roomId: string,
  ): Promise<void> {
    const units = await this.prisma.unit.findMany({
      where: { roomId },
      select: { id: true },
    })

    if (units.length === 0) return

    await this.prisma.cleaningTask.createMany({
      data: units.map((unit) => ({
        unitId: unit.id,
        taskType: 'CLEANING' as const,
        status: 'PENDING' as const,
        priority: 'MEDIUM' as const,
      })),
    })

    this.notifications.emit(propertyId, 'task:planned', { roomId })
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

  private async assertRoomAvailable(
    roomId: string,
    from: Date,
    to: Date,
    excludeSegmentId?: string,
  ) {
    const conflict = await this.prisma.staySegment.findFirst({
      where: {
        roomId,
        status: { in: ['ACTIVE', 'PENDING'] },
        ...(excludeSegmentId && { id: { not: excludeSegmentId } }),
        checkIn: { lt: to },
        checkOut: { gt: from },
      },
    })
    if (conflict) {
      throw new ConflictException(`Room ${roomId} is not available for the requested period`)
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
