/**
 * El hecho de dominio «cambió el inventario de una habitación».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ ESTE EVENTO EXISTE, SI YA HABÍA UNO
 *
 * Había `channex.availability.changed`, y parecía cubrir esto: el oyente del
 * motor público (`webhook-events.listener.ts`) lo escuchaba justamente para
 * avisarle al sitio del hotel que invalidara su calendario.
 *
 * Pero se emite dentro de `computeAndPushInventory`, **después** de cuatro
 * guardas de integración:
 *
 *     if (!this.channex.enabled) return            // ← Azucar sale por aquí
 *     if (!room?.channexRoomTypeId) return
 *     if (!settings?.channexPropertyId) return
 *     if (totalUnits === 0) return
 *
 * Es decir: **el sitio del hotel sólo se entera de que cambió su inventario si
 * el hotel paga un channel manager.** Un hotel sin Channex —el piloto, hoy—
 * bloquea habitaciones y su web no se entera nunca.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA DISTINCIÓN QUE FALTABA: HECHO DE DOMINIO ≠ ACCIÓN DE INTEGRACIÓN
 *
 * «El inventario de la habitación 204 cambió del 3 al 7 de octubre» es un
 * **hecho de dominio**: es verdad tenga el hotel Channex, Cloudbeds o una
 * libreta. «Empújale a Channex la disponibilidad absoluta de ese tipo» es una
 * **acción de integración**: sólo tiene sentido si Channex existe.
 *
 * Estaban fundidos en el mismo método, así que no se podía tener uno sin el
 * otro. De ahí los dos síntomas:
 *
 *   · Sin Channex, nadie se entera de nada.
 *   · Una reserva que ENTRA de una OTA no puede avisar, porque avisar
 *     implicaría reempujarla a Channex — un eco.
 *
 * La separación es la de Vernon (*Implementing Domain-Driven Design*, cap. 8)
 * y la que usa la guía de eShopOnContainers: el hecho se publica siempre; la
 * integración decide si le interesa.
 *
 * **Antipatrón evitado:** repetir `events.emit(...)` en los dieciocho sitios
 * que cambian inventario —bloqueos, recepción, mantenimiento, estancias, las
 * OTAs—. Eso es *shotgun surgery* (Fowler, *Refactoring*), y su modo de fallo
 * es exactamente el que produjo este defecto: alguien añade un camino nuevo y
 * se le olvida uno.
 */

/** Nombre del evento. Constante para que nadie lo escriba a mano con un typo. */
export const INVENTORY_CHANGED = 'inventory.changed' as const

export interface InventoryChangedEvent {
  /** La habitación física cuyo inventario cambió. */
  roomId: string
  /** Rango afectado, semiabierto `[from, to)` como todo el dominio. */
  from: Date
  to: Date
  /**
   * Qué lo provocó. Es trazabilidad, no lógica: ningún consumidor debe
   * ramificar sobre esto — si alguien lo necesita para decidir, es que le
   * falta un evento propio.
   */
  reason: string
}
