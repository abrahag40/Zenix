/**
 * El hecho «nos llegó un contracargo».
 *
 * 🔴 Se publica como evento por la misma razón que el pago del huésped: el
 * webhook vive en `billing/` —el cobro del hotel a ZaharDev— y quien tiene que
 * reaccionar es el motor público. Una llamada directa cerraría un ciclo de
 * módulos; el evento invierte la dependencia.
 */

/** Llegó una disputa formal o una solicitud de información. */
export const CONTRACARGO_ABIERTO = 'contracargo.abierto'

/** El emisor decidió. */
export const CONTRACARGO_CERRADO = 'contracargo.cerrado'

export interface ContracargoAbierto {
  bookingRef: string
  propertyId: string
  disputaId: string
  importeCentavos: number
  moneda: string
  /** `fraudulent`, `product_not_received`… La categoría manda la evidencia. */
  motivo: string
  /**
   * `warning_needs_response` es una SOLICITUD DE INFORMACIÓN, no un
   * contracargo todavía.
   *
   * 🔴 En México importa especialmente: Stripe documenta que «los cargos
   * nacionales de México que se disputan entre marcas de tarjetas usan las
   * solicitudes de información antes de crear una disputa formal. Si no se
   * responden, algunas disputas pueden convertirse en contracargos imposibles
   * de ganar». Responder aquí evita la comisión y salva el caso.
   */
  estado: string
  /** Hasta cuándo se puede responder. Pasado eso, se pierde sin remedio. */
  respondeAntesDe: string | null
}

export interface ContracargoCerrado {
  bookingRef: string
  propertyId: string
  disputaId: string
  /** `won` o `lost`. */
  resultado: string
}
