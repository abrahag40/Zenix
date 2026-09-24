/**
 * El hecho «el huésped pagó», como evento de integración.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ UN EVENTO Y NO UNA LLAMADA DIRECTA
 *
 * El webhook de Stripe vive en `billing/`, que es el cobro **del hotel a
 * ZaharDev** — la suscripción del SaaS. El cobro **del huésped al hotel** vive
 * en `public-booking/`. Son dos contextos distintos que comparten una sola
 * cosa: la pasarela.
 *
 * Si `WebhookHandlerService` llamara a `PagoDeReservaService`, `BillingModule`
 * importaría `PublicBookingModule` — y ése ya importa `BillingModule` para
 * crear la intención. **Ciclo.** Nest lo resuelve con `forwardRef`, pero
 * `forwardRef` no arregla el diseño: sólo silencia el síntoma.
 *
 * La inversión de dependencia con un evento es el arreglo real (Martin, DIP;
 * Vernon, *Implementing DDD* cap. 8 — *integration events*): billing publica
 * un hecho, y **no sabe ni le importa** quién lo escucha. Es el mismo criterio
 * que ya se aplicó a `inventory.changed`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 SE EMITE EN EL WEBHOOK, NUNCA EN EL NAVEGADOR
 *
 * Si la confirmación dependiera de que el huésped vuelva a la página de
 * «gracias», cerrar la pestaña dejaría un pago sin reserva. El webhook llega
 * aunque el huésped se haya ido, y Stripe lo reintenta si no respondemos 2xx.
 */

/** Stripe autorizó (o capturó) el pago de una reserva del motor público. */
export const PAGO_DE_HUESPED_AUTORIZADO = 'huesped.pago.autorizado'

/** El pago falló o se anuló: la retención deja de estar justificada. */
export const PAGO_DE_HUESPED_FALLIDO = 'huesped.pago.fallido'

export interface PagoDeHuespedAutorizado {
  /** La referencia de la reserva, tal como viaja en `metadata.bookingRef`. */
  bookingRef: string
  propertyId: string
  /** Lo que Stripe autorizó, en centavos. Se compara con el total guardado. */
  importeCentavos: number
  moneda: string
  paymentIntentId: string
  /** `true` si el dinero ya se capturó; `false` si sólo está autorizado. */
  capturado: boolean
}

export interface PagoDeHuespedFallido {
  bookingRef: string
  propertyId: string
  paymentIntentId: string
  motivo: string
}
