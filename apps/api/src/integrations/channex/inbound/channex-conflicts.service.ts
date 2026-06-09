import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { AvailabilityService } from '../../../pms/availability/availability.service'
import { PrismaService } from '../../../prisma/prisma.service'
import { TenantContextService } from '../../../common/tenant-context.service'
import { ChannexGateway, ChannexHttpError } from '../channex.gateway'
import { NotificationsService } from '../../../notifications/notifications.service'
import { isSameDayInTimezone } from '../../../scheduling/listeners/hk-realtime.helpers'

/**
 * ChannexConflictsService — D-CHX5 resolution surface.
 *
 * Lista stays con `channexConflict=true` para que el SUPERVISOR resuelva
 * manualmente. 3 acciones disponibles:
 *
 *   1. MOVE_ROOM     → mueve la stay a otra habitación libre, clear conflict
 *   2. CANCEL_LOCAL  → soft-cancel local (no toca Channex)
 *   3. CANCEL_AT_OTA → soft-cancel local + PUT Channex CRS para propagar al OTA
 *   4. MARK_REVIEWED → solo clear flag (manager decidió que es válido)
 *
 * Acceso restringido a SUPERVISOR (gestiona overbooking + chargebacks).
 *
 * Auditabilidad: cada resolución escribe GuestStayLog con event='CONFLICT_RESOLVED'
 * + metadata { action, actorId, channexRevisionId, newRoomId? }.
 */
@Injectable()
export class ChannexConflictsService {
  private readonly logger = new Logger(ChannexConflictsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly availability: AvailabilityService,
    private readonly gateway: ChannexGateway,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * GET /v1/channex/conflicts
   * Listar stays en conflicto Channex para la property en scope.
   * Excluye los ya cancelados (no se pueden resolver).
   */
  async listConflicts(): Promise<ConflictListItem[]> {
    const propertyId = this.tenant.getPropertyId()
    const orgId = this.tenant.getOrganizationId()
    const stays = await this.prisma.guestStay.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        channexConflict: true,
        cancelledAt: null,
      },
      orderBy: { checkinAt: 'asc' },
      include: {
        room: { select: { id: true, number: true, category: true } },
      },
    })

    return stays.map<ConflictListItem>((s) => ({
      stayId: s.id,
      channexBookingId: s.channexBookingId,
      channexRevisionId: null, // not stored separately; pull from log if needed
      channexOtaName: s.channexOtaName,
      guestName: s.guestName,
      checkinAt: s.checkinAt,
      scheduledCheckout: s.scheduledCheckout,
      roomId: s.room.id,
      roomNumber: s.room.number,
      roomCategory: s.room.category,
      totalAmount: s.totalAmount,
      currency: s.currency,
      paymentModel: s.paymentModel,
      notes: s.notes,
      channexLastSyncAt: s.channexLastSyncAt,
    }))
  }

  /**
   * POST /v1/channex/conflicts/:stayId/resolve
   */
  async resolve(
    stayId: string,
    actorId: string,
    action: ConflictResolutionAction,
  ): Promise<ConflictResolutionResult> {
    const propertyId = this.tenant.getPropertyId()
    const orgId = this.tenant.getOrganizationId()
    const stay = await this.prisma.guestStay.findFirst({
      where: { id: stayId, organizationId: orgId, propertyId },
      include: { room: true },
    })
    if (!stay) throw new NotFoundException('Stay no encontrada')
    if (!stay.channexConflict) {
      throw new ConflictException('Esta reserva ya no está en estado de conflicto')
    }
    if (stay.cancelledAt) {
      throw new ConflictException('Esta reserva ya está cancelada')
    }

    switch (action.kind) {
      case 'MOVE_ROOM':
        return this.moveRoom(stay, action.newRoomId, actorId)
      case 'CANCEL_LOCAL':
        return this.cancelLocal(stay, action.reason, actorId, /*propagate*/ false)
      case 'CANCEL_AT_OTA':
        return this.cancelLocal(stay, action.reason, actorId, /*propagate*/ true)
      case 'MARK_REVIEWED':
        return this.markReviewed(stay, action.reason, actorId)
    }
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  private async moveRoom(
    stay: PrismaStayWithRoom,
    newRoomId: string,
    actorId: string,
  ): Promise<ConflictResolutionResult> {
    if (newRoomId === stay.roomId) {
      throw new ConflictException('La habitación destino es la misma que la actual')
    }
    const newRoom = await this.prisma.room.findFirst({
      where: { id: newRoomId, propertyId: stay.propertyId, deletedAt: null },
      select: { id: true, number: true },
    })
    if (!newRoom) throw new NotFoundException('Habitación destino no encontrada')

    // Verify availability in the new room
    const check = await this.availability.check({
      roomId: newRoomId,
      from: stay.checkinAt,
      to: stay.scheduledCheckout,
      excludeStayIds: [stay.id],
    })
    if (!check.available) {
      throw new ConflictException(
        `La habitación ${newRoom.number} no está disponible para esas fechas`,
      )
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stay.id },
        data: {
          roomId: newRoomId,
          channexConflict: false,
        },
      })
      await tx.guestStayLog.create({
        data: {
          stayId: stay.id,
          event: 'CONFLICT_RESOLVED',
          actorId,
          actorType: 'USER',
          metadata: {
            action: 'MOVE_ROOM',
            previousRoomId: stay.roomId,
            previousRoomNumber: stay.room.number,
            newRoomId,
            newRoomNumber: newRoom.number,
          },
        },
      })
    })

    this.notifications.emit(stay.propertyId, 'stay:updated', {
      stayId: stay.id,
      changes: ['roomId', 'channexConflict'],
    })

    // BUG-10 fix (2026-06-08) — emit `room.moved` para que
    // `RoomMovedHkListener` migre las CleaningTasks de fromRoom → toRoom.
    // El path normal `GuestStaysService.moveRoom` lo emite; aquí estábamos
    // saltándolo porque hacemos UPDATE directo sobre `stay.roomId`.
    // Resultado pre-fix: recamarista limpiaba la room antigua (donde
    // estaba el conflict) en lugar de la nueva. Idempotente — listener
    // tolera double-fire vía `take: 1` ordenado.
    this.events.emit('room.moved', {
      stayId: stay.id,
      fromRoomId: stay.roomId,
      toRoomId: newRoomId,
      propertyId: stay.propertyId,
      orgId: stay.organizationId,
      actorId,
    })

    // Si el stay arranca HOY (local timezone de la property), también
    // escalamos URGENT la task de la nueva room — paridad con flow normal.
    const propSettings = await this.prisma.propertySettings.findUnique({
      where: { propertyId: stay.propertyId },
      select: { timezone: true },
    })
    const timezone = propSettings?.timezone ?? 'UTC'
    if (isSameDayInTimezone(stay.checkinAt.toISOString(), timezone)) {
      this.events.emit('channex.booking.same-day-arrival', {
        stayId: stay.id,
        roomId: newRoomId,
        propertyId: stay.propertyId,
        checkInIso: stay.checkinAt.toISOString(),
        otaName: stay.channexOtaName ?? null,
      })
    }

    this.logger.log(
      `[Channex conflict] MOVE_ROOM stay=${stay.id} ${stay.room.number} → ${newRoom.number} actor=${actorId}`,
    )
    return { kind: 'moved', stayId: stay.id, newRoomId, newRoomNumber: newRoom.number }
  }

  private async cancelLocal(
    stay: PrismaStayWithRoom,
    reason: string | undefined,
    actorId: string,
    propagateToChannex: boolean,
  ): Promise<ConflictResolutionResult> {
    // Soft-cancel via the same writes BookingCancelHandler uses, but with
    // HOTEL as the initiator (manager decided to cancel) and PMS_DIRECT
    // as the channel since the action originated in our UI.
    const now = new Date()
    const pmsCollectedAmount = new Prisma.Decimal(stay.amountPaid)
    const requiresFiscalReview = pmsCollectedAmount.greaterThan(0)

    const metadata: Prisma.InputJsonValue = {
      channexBookingId: stay.channexBookingId,
      channexOtaName: stay.channexOtaName,
      conflictResolution: true,
      propagatedToChannex: propagateToChannex,
      manualReason: reason ?? null,
    }

    // Cert audit B3 fix (2026-05-22) — outbound-first ordering.
    // ANTES: local cancel commit PRIMERO, Channex push DESPUÉS (best-effort §31).
    //   Problem: si Channex falla, OTA seguía creyendo activa la reserva
    //   → double-booking real (lo que cert pretende prevenir).
    // AHORA: para CANCEL_AT_OTA, push a Channex PRIMERO. Si Channex acked,
    //   commit local. Si falla, throw 503 → supervisor reintenta o usa
    //   extranet OTA manualmente.
    // Trade-off: +500ms-2s latencia en el modal supervisor. Aceptable —
    // es 1 supervisor decision, no ruta hot recepcionista.
    if (propagateToChannex && stay.channexBookingId) {
      try {
        await this.gateway.cancelBookingAtChannex(stay.channexBookingId, reason)
        // Channex acked → safe to commit local
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const status = err instanceof ChannexHttpError ? err.status : null
        this.logger.error(
          `[Channex conflict] CANCEL_AT_OTA aborted — Channex rejected ` +
            `(status=${status ?? 'N/A'}): ${msg}. Local stay NOT cancelled.`,
        )
        throw new ConflictException(
          `Channex rejected the cancellation (HTTP ${status ?? 'error'}). ` +
            `Local stay was NOT cancelled. Retry or cancel via OTA extranet manually.`,
        )
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stay.id },
        data: {
          cancelledAt: now,
          cancelledById: actorId,
          cancelInitiator: 'HOTEL',
          cancelReason: reason ?? 'Channex conflict resolved by manager — local cancel',
          cancelMetadata: metadata,
          cancelledFromChannel: 'PMS_DIRECT',
          channexConflict: false,
          requiresFiscalReview,
        },
      })

      // Free room if applicable (same logic as BookingCancelHandler)
      if (stay.room.status === 'OCCUPIED') {
        const othersActive = await tx.guestStay.count({
          where: {
            roomId: stay.roomId,
            organizationId: stay.organizationId,
            deletedAt: null,
            actualCheckout: null,
            noShowAt: null,
            cancelledAt: null,
            id: { not: stay.id },
          },
        })
        if (othersActive === 0) {
          await tx.room.update({ where: { id: stay.roomId }, data: { status: 'AVAILABLE' } })
        }
      }

      await tx.guestStayLog.create({
        data: {
          stayId: stay.id,
          event: 'CONFLICT_RESOLVED',
          actorId,
          actorType: 'USER',
          metadata: {
            action: propagateToChannex ? 'CANCEL_AT_OTA' : 'CANCEL_LOCAL',
            requiresFiscalReview,
            channexBookingId: stay.channexBookingId,
            reason: reason ?? null,
          },
        },
      })
    })

    // Cert audit B3 — outbound ya se hizo PRE-commit (líneas arriba).
    // Si llegamos aquí, Channex acked OR no era CANCEL_AT_OTA.
    const channexAck = propagateToChannex && !!stay.channexBookingId
    const channexError: string | null = null

    this.notifications.emit(stay.propertyId, 'channex:stay:cancelled', {
      stayId: stay.id,
      bookingId: stay.channexBookingId,
      otaName: stay.channexOtaName,
      requiresFiscalReview,
    })

    this.logger.log(
      `[Channex conflict] ${propagateToChannex ? 'CANCEL_AT_OTA' : 'CANCEL_LOCAL'} ` +
        `stay=${stay.id} actor=${actorId} channexAck=${channexAck}`,
    )

    return {
      kind: 'cancelled',
      stayId: stay.id,
      propagatedToChannex: propagateToChannex,
      channexAck,
      channexError,
    }
  }

  private async markReviewed(
    stay: PrismaStayWithRoom,
    reason: string | undefined,
    actorId: string,
  ): Promise<ConflictResolutionResult> {
    await this.prisma.$transaction(async (tx) => {
      await tx.guestStay.update({
        where: { id: stay.id },
        data: { channexConflict: false },
      })
      await tx.guestStayLog.create({
        data: {
          stayId: stay.id,
          event: 'CONFLICT_RESOLVED',
          actorId,
          actorType: 'USER',
          metadata: {
            action: 'MARK_REVIEWED',
            reason: reason ?? null,
          },
        },
      })
    })

    this.logger.log(`[Channex conflict] MARK_REVIEWED stay=${stay.id} actor=${actorId}`)
    return { kind: 'marked_reviewed', stayId: stay.id }
  }
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface ConflictListItem {
  stayId: string
  channexBookingId: string | null
  channexRevisionId: string | null
  channexOtaName: string | null
  guestName: string
  checkinAt: Date
  scheduledCheckout: Date
  roomId: string
  roomNumber: string
  roomCategory: string
  totalAmount: Prisma.Decimal
  currency: string
  paymentModel: string
  notes: string | null
  channexLastSyncAt: Date | null
}

export type ConflictResolutionAction =
  | { kind: 'MOVE_ROOM'; newRoomId: string; reason?: string }
  | { kind: 'CANCEL_LOCAL'; reason?: string }
  | { kind: 'CANCEL_AT_OTA'; reason?: string }
  | { kind: 'MARK_REVIEWED'; reason?: string }

export type ConflictResolutionResult =
  | { kind: 'moved'; stayId: string; newRoomId: string; newRoomNumber: string }
  | {
      kind: 'cancelled'
      stayId: string
      propagatedToChannex: boolean
      channexAck: boolean
      channexError: string | null
    }
  | { kind: 'marked_reviewed'; stayId: string }

type PrismaStayWithRoom = {
  id: string
  organizationId: string
  propertyId: string
  roomId: string
  guestName: string
  checkinAt: Date
  scheduledCheckout: Date
  amountPaid: Prisma.Decimal
  channexBookingId: string | null
  channexConflict: boolean
  channexOtaName: string | null
  cancelledAt: Date | null
  room: { id: string; number: string; status: string }
}
