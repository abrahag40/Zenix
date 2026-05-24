/**
 * Channex Outbound — domain event contracts.
 *
 * Estos contratos son **públicos** y consumidos por:
 *   · ChannexOutboundBuilderService (via @OnEvent listeners)
 *   · AvailabilityService.notifyChannex / computeAndPushInventory (Day 3 ya wired)
 *   · RatesService (sprint RATES-METRICS-COMPSET-CORE — wiring pendiente)
 *   · RestrictionsService (sprint RATES-METRICS-COMPSET-CORE — wiring pendiente)
 *
 * **Por qué un archivo separado**: que el feature service (RatesService) NO
 * tenga que importar nada del ChannexOutboundModule. Solo importa estos
 * types + el EventEmitter2 (que es global NestJS). Esto rompe el cycle:
 *
 *   ChannexOutboundModule  ──depends on──►  Domain events (este archivo)
 *                                                  ▲
 *                                                  │ depends on
 *                                                  │
 *   PmsModule/RatesModule  ──emits via──►  EventEmitter2 (global)
 *
 * Ningún módulo PMS importa ChannexOutbound. Channex es la integración —
 * el dominio no debe saber que existe (Hexagonal Architecture).
 */

import type {
  ChannexAvailabilityEntry,
  ChannexRestrictionEntry,
} from '../channex.gateway'

/**
 * Emitido cuando cambia la disponibilidad de un room (cualquier causa:
 * reservation, cancellation, block, no-show, move). Builder lo escucha
 * y persiste row en ChannexOutboundQueue kind=AVAILABILITY priority=100.
 *
 * `entries` deben ser ABSOLUTE counts (Channex requirement). Pre-computed
 * por el emitter (que tiene la info de Prisma para hacer el count).
 *
 * Event name: `channex.availability.changed`
 */
export interface ChannexAvailabilityChangedEvent {
  propertyId: string
  entries: ChannexAvailabilityEntry[]
}

/**
 * Emitido cuando cambia el rate o cualquier restricción de un rate plan.
 * Builder lo escucha y persiste row kind=RATES_RESTRICTIONS priority=50.
 *
 * Cada entry debe tener al menos UN restriction field populated (rate,
 * minStay*, maxStay, closedTo*, stopSell) — Channex requirement enforced
 * por Gateway.pushRestrictions throw.
 *
 * Emitters esperados (sprint RATES-METRICS-COMPSET-CORE):
 *   · RatesService.updateRate / setRateOverride / applyRateSeason
 *   · RestrictionsService.setMinStay / setStopSell / batchUpdateRestrictions
 *   · PromotionService.applyPromotion (delta = promoRate)
 *
 * Event name: `channex.restriction.updated`
 */
export interface ChannexRestrictionUpdatedEvent {
  propertyId: string
  entries: ChannexRestrictionEntry[]
}

/**
 * Emitido cuando recepción cancela manualmente una reserva OTA desde el PMS
 * (cancelInitiator=HOTEL) y el stay tiene `channexBookingId` mapeado. Builder
 * lo escucha y persiste row kind=BOOKING_CANCEL priority=80 (entre AVAILABILITY
 * y RATES_RESTRICTIONS — la cancel debe propagarse rápido para liberar
 * inventario en la OTA, pero no preempt la avail count broadcast).
 *
 * Sprint CHANNEX-UX-E2-E3 §150 (D-CHX-UX-E2.1).
 *
 * Event name: `channex.booking.cancel.requested`
 */
export interface ChannexBookingCancelRequestedEvent {
  propertyId: string
  stayId: string
  channexBookingId: string
  channexOtaName: string | null
  reason: string | null
}

/**
 * Event name constants — imports en services para emit():
 *
 *   import { CHANNEX_AVAILABILITY_CHANGED } from '...'
 *   this.events.emit(CHANNEX_AVAILABILITY_CHANGED, { propertyId, entries })
 *
 * Evita typos en el event name (que Nest no chequea en runtime).
 */
export const CHANNEX_AVAILABILITY_CHANGED = 'channex.availability.changed' as const
export const CHANNEX_RESTRICTION_UPDATED = 'channex.restriction.updated' as const
export const CHANNEX_BOOKING_CANCEL_REQUESTED = 'channex.booking.cancel.requested' as const
