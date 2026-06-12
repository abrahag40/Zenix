import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { WebhookDispatcherService } from './webhook-dispatcher.service'

/**
 * WebhookEventsListener — BOOKING-ENGINE B3.
 *
 * Traduce eventos de dominio internos a webhooks del booking engine. Reusa el
 * evento `channex.availability.changed` (§141) que YA se emite cuando el
 * inventario cambia (reserva/cancelación/no-show de CUALQUIER fuente) → el
 * website mantiene su calendario en sync. `reservation.created` lo dispara la
 * propia reserva directa.
 *
 * Fail-soft: un error encolando un webhook NO debe afectar la operación que lo
 * originó (la reserva ya está salvada). @OnEvent async + try/catch.
 */
@Injectable()
export class WebhookEventsListener {
  private readonly logger = new Logger(WebhookEventsListener.name)

  constructor(private readonly dispatcher: WebhookDispatcherService) {}

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
   * El inventario cambió — el website debe invalidar su calendario cacheado.
   * Escucha dos fuentes: `channex.availability.changed` (§141 — reservas/cancels
   * de OTA y manuales) y `booking.availability.changed` (reserva directa propia).
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
