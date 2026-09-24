import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { INVENTORY_CHANGED, type InventoryChangedEvent } from '../../pms/availability/inventory-events'
import { WebhookDispatcherService } from './webhook-dispatcher.service'

/**
 * WebhookEventsListener — BOOKING-ENGINE B3.
 *
 * Traduce eventos de dominio internos a webhooks del booking engine.
 *
 * 🔴 CORRECCIÓN 2026-09-24. Este comentario decía que
 * `channex.availability.changed` «YA se emite cuando el inventario cambia de
 * CUALQUIER fuente». **Era falso, y de ahí salió el defecto.** Ese evento se
 * emite dentro de `computeAndPushInventory`, detrás de
 * `if (!this.channex.enabled) return`: un hotel sin channel manager cambiaba
 * su inventario y su sitio web no se enteraba nunca.
 *
 * Ahora la fuente de verdad es `inventory.changed`, un hecho de dominio sin
 * guardas de integración (ver `pms/availability/inventory-events.ts`). El de
 * Channex se mantiene por compatibilidad, y es inofensivo que lleguen los dos:
 * el webhook es idempotente para el consumidor —dice «relee», no «aplica
 * esto»—.
 *
 * Fail-soft: un error encolando un webhook NO debe afectar la operación que lo
 * originó (la reserva ya está salvada). @OnEvent async + try/catch.
 */
@Injectable()
export class WebhookEventsListener {
  private readonly logger = new Logger(WebhookEventsListener.name)

  constructor(
    private readonly dispatcher: WebhookDispatcherService,
    private readonly prisma: PrismaService,
  ) {}

  /** Reserva directa creada (emitido por PublicReservationsService). */
  @OnEvent('booking.reservation.created', { async: true })
  async onReservationCreated(payload: {
    propertyId: string
    reservationRef: string
    isGroup: boolean
    groupId: string | null
    rooms: unknown[]
  }) {
    try {
      await this.dispatcher.enqueue(payload.propertyId, 'reservation.created', {
        reservationRef: payload.reservationRef,
        isGroup: payload.isGroup,
        groupId: payload.groupId,
        rooms: payload.rooms,
      })
    } catch (e) {
      this.logger.warn(`[Webhook] enqueue reservation.created falló: ${e}`)
    }
  }

  /**
   * 🔑 El hecho de dominio: cambió el inventario de una habitación, venga de
   * donde venga —un bloqueo del manager, una cancelación, una mudanza, una
   * reserva que entró de Booking.com—. El sitio del hotel debe invalidar su
   * calendario.
   *
   * La `propertyId` se resuelve AQUÍ y no en el emisor: en el emisor sería una
   * consulta más en el camino caliente de cada reserva y cada bloqueo, se haya
   * suscrito alguien o no. Aquí se paga sólo cuando hay a quién avisar.
   */
  @OnEvent(INVENTORY_CHANGED, { async: true })
  async onInventoryChanged(payload: InventoryChangedEvent) {
    try {
      if (!payload?.roomId) return
      const room = await this.prisma.room.findUnique({
        where: { id: payload.roomId },
        select: { propertyId: true },
      })
      if (!room) return
      await this.dispatcher.enqueue(room.propertyId, 'availability.changed', {
        roomId: payload.roomId,
        from: payload.from instanceof Date ? payload.from.toISOString() : payload.from,
        to: payload.to instanceof Date ? payload.to.toISOString() : payload.to,
        reason: payload.reason,
      })
    } catch (e) {
      this.logger.warn(`[Webhook] enqueue availability.changed (dominio) falló: ${e}`)
    }
  }

  /**
   * Las dos fuentes anteriores. Se conservan: `booking.availability.changed` lo
   * emite el motor público, y el de Channex llega cuando el channel manager
   * está configurado. Ninguna de las dos cubre el caso sin Channex — para eso
   * está `inventory.changed` de arriba.
   */
  @OnEvent('channex.availability.changed', { async: true })
  @OnEvent('booking.availability.changed', { async: true })
  async onAvailabilityChanged(payload: { propertyId: string; entries?: unknown[] }) {
    try {
      if (!payload?.propertyId) return
      await this.dispatcher.enqueue(payload.propertyId, 'availability.changed', {
        changedCount: payload.entries?.length ?? null,
      })
    } catch (e) {
      this.logger.warn(`[Webhook] enqueue availability.changed falló: ${e}`)
    }
  }
}
