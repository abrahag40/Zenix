/**
 * El texto de la carta de registro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ ESTO ES UN BORRADOR PARA QUE LO REVISE UN ABOGADO. No es asesoría legal.
 *
 * Está redactado para cubrir lo que las redes de tarjetas esperan encontrar en
 * la evidencia de una disputa y lo que la LFPC exige en México. Pero quién
 * puede obligar a quién, y con qué palabras, lo dice un abogado — no yo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ CADA CLÁUSULA ESTÁ AQUÍ
 *
 * No son relleno. Cada una responde a un motivo de disputa concreto:
 *
 *   · **Autorización del cargo** → contra «no reconozco el cargo»
 *     (`fraudulent`). Es la que convierte el documento en prueba de que el
 *     titular aceptó.
 *   · **Servicio recibido** → contra «no recibí el servicio»
 *     (`product_not_received`).
 *   · **Política de cancelación y no-show** → contra «cancelé»
 *     (`subscription_canceled`, `credit_not_processed`). Stripe pide
 *     explícitamente `cancellation_policy` y su *disclosure*: no basta tenerla,
 *     hay que probar que se le enseñó.
 *   · **Consumos adicionales** → contra disputar un cargo posterior al
 *     check-in.
 *   · **Aviso de privacidad** → LFPDPPP. Se recoge identificación y firma:
 *     son datos personales y hay que decirlo en el momento de recogerlos.
 *
 * 🔴 Y la de «se le entregó copia» no es cortesía: la LFPC obliga a entregar
 * comprobante, y en una disputa demuestra que el huésped se fue sabiendo lo
 * que había firmado.
 */

export interface DatosDeClausulas {
  hotel: string
  totalFormateado: string
  moneda: string
  politicaCancelacion?: string
  politicaNoShow?: string
}

export function clausulasDeRegistro(d: DatosDeClausulas): string[] {
  return [
    `Autorizo a ${d.hotel} a cargar a mi tarjeta el importe de ${d.totalFormateado} ` +
      `${d.moneda}, correspondiente al hospedaje descrito en este documento, ` +
      `impuestos incluidos.`,

    `Reconozco que soy el titular de la tarjeta utilizada o que cuento con su ` +
      `autorización expresa para usarla.`,

    `Confirmo que los datos de la reserva y de mi identificación que aparecen en ` +
      `este documento son correctos.`,

    d.politicaCancelacion
      ? `Se me informó la política de cancelación antes de firmar: ${d.politicaCancelacion}`
      : `Se me informó la política de cancelación antes de firmar.`,

    d.politicaNoShow
      ? `Se me informó la política de no presentación: ${d.politicaNoShow}`
      : `Se me informó la política aplicable en caso de no presentarme.`,

    `Acepto que los consumos y servicios adicionales que solicite durante mi ` +
      `estancia se carguen a la misma tarjeta, previa notificación de su importe.`,

    `Se me puso a disposición el aviso de privacidad de ${d.hotel}. Entiendo que ` +
      `se recaban mi identificación y mi firma con la finalidad de acreditar el ` +
      `hospedaje y el consentimiento del cargo.`,

    `Se me entregó copia de este documento en formato electrónico.`,
  ]
}
