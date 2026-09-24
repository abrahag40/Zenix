/**
 * Cuánto tiempo se retiene una habitación mientras el huésped paga.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ LA CADUCIDAD DEPENDE DEL MEDIO DE PAGO Y NO DE LA PROPIEDAD
 *
 * El esquema ya tenía dónde guardarla: `BookingEngineConfig.holdTtlMinutes`,
 * con 1440 (24 h) por omisión. Nadie lo leía, así que nunca se notó que el
 * campo está en el sitio equivocado.
 *
 * 24 h es el número CORRECTO para un vale de OXXO o una transferencia SPEI:
 * el huésped tiene que salir de casa, ir a la tienda y pagar en efectivo, y el
 * aviso de Stripe puede tardar. Si la retención caduca antes, cobramos un
 * dinero cuya habitación ya vendimos.
 *
 * 24 h es DESASTROSO para una tarjeta. Una tarjeta responde en segundos, así
 * que ese día entero sólo lo consumen los carritos abandonados — y la tasa de
 * abandono en checkout de viajes es alta. Un hotel de 24 unidades con unos
 * pocos abandonos al día amanece sin disponibilidad que vender: **inventario
 * fantasma**, ocupado por gente que nunca quiso reservar.
 *
 * O sea: el mismo hotel necesita **dos números a la vez**, según cómo pague
 * cada huésped. Un campo por propiedad no puede expresar eso. Por eso la
 * política es una función del medio de pago, y la propiedad sólo puede
 * ajustarla dentro de límites.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LOS NÚMEROS, Y DE DÓNDE SALEN
 *
 * · **Tarjeta — 15 min.** Es el consenso de la industria para un checkout
 *   síncrono, y coincide con lo que un huésped tolera sin abandonar. Margen de
 *   sobra para un 3-D Secure, que es el paso lento.
 * · **Vale en efectivo (OXXO) — 72 h.** El plazo de vencimiento habitual de un
 *   voucher OXXO es de días; retener menos que el vale sería vender la
 *   habitación de alguien que todavía puede pagar a tiempo.
 * · **Transferencia (SPEI) — 24 h.** Las transferencias entre bancos liquidan
 *   el mismo día hábil, pero un pago hecho un viernes por la noche se acredita
 *   el lunes.
 * · **Sin cobro (paga en el hotel) — sin retención.** No hay nada que esperar:
 *   la reserva es firme desde el primer momento. Es el comportamiento actual.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 EL SESGO QUE ESTO INTRODUCE, DICHO EN VOZ ALTA
 *
 * Toda retención se equivoca hacia algún lado, y conviene saber hacia cuál:
 *
 * · **Demasiado corta** → el huésped paga y su habitación ya no está. Hay que
 *   devolverle el dinero. Cuesta soporte, reputación y la venta.
 * · **Demasiado larga** → la habitación no se puede vender a nadie más
 *   mientras tanto. Cuesta ocupación.
 *
 * Los dos son errores reales, pero **no son simétricos**: el primero le pasa a
 * una persona concreta que ya pagó; el segundo es una pérdida difusa. Por eso
 * cada número de arriba se inclina al lado largo dentro de lo razonable.
 *
 * **Antipatrón evitado:** una sola constante global «15 minutos» para todo.
 * Es la simplificación que rompe el pago en efectivo, que en México NO es un
 * caso marginal.
 */

/** Cómo va a pagar el huésped. Determina cuánto se le guarda la habitación. */
export type MedioDePago =
  | 'TARJETA'
  | 'VALE_EFECTIVO'
  | 'TRANSFERENCIA'
  | 'EN_EL_HOTEL'

export interface Retencion {
  /** Minutos que se retiene. `null` = no se retiene, la reserva es firme ya. */
  minutos: number | null
  /** Por qué ese número, en lenguaje del hotel. Se muestra en la interfaz. */
  motivo: string
}

/** Techo duro por medio de pago. Nadie puede configurar por encima de esto. */
const LIMITES: Record<MedioDePago, { porOmision: number | null; maximo: number }> = {
  // 3-D Secure cabe de sobra en 15 minutos; más allá sólo se acumulan
  // carritos abandonados ocupando habitaciones.
  TARJETA: { porOmision: 15, maximo: 60 },
  // El vale de OXXO vence en días: retener menos sería vender la habitación
  // de alguien que todavía puede pagar a tiempo.
  VALE_EFECTIVO: { porOmision: 72 * 60, maximo: 96 * 60 },
  // SPEI liquida el mismo día hábil, pero un viernes por la noche se acredita
  // el lunes.
  TRANSFERENCIA: { porOmision: 24 * 60, maximo: 72 * 60 },
  // No hay nada que esperar.
  EN_EL_HOTEL: { porOmision: null, maximo: 0 },
}

const MOTIVOS: Record<MedioDePago, string> = {
  TARJETA: 'Pago con tarjeta: la habitación se guarda mientras se completa el cobro.',
  VALE_EFECTIVO: 'Pago en efectivo: la habitación se guarda hasta que venza el vale.',
  TRANSFERENCIA: 'Transferencia: la habitación se guarda hasta que el banco confirme.',
  EN_EL_HOTEL: 'Se paga en el hotel: la reserva queda firme desde ahora.',
}

/**
 * Resuelve la retención de una reserva.
 *
 * `minutosConfigurados` es lo que la propiedad pidió —hoy, el viejo
 * `holdTtlMinutes`—. Se respeta **sólo dentro del límite del medio de pago**:
 * un hotel puede acortar, y puede alargar hasta el techo, pero no puede
 * configurar 24 h de retención sobre una tarjeta. Los topes no son negociables
 * porque el daño de equivocarlos no lo paga quien los configura.
 */
export function resolverRetencion(
  medio: MedioDePago,
  minutosConfigurados?: number | null,
): Retencion {
  const limite = LIMITES[medio]
  if (!limite) {
    // Medio desconocido: se trata como el caso más conservador que existe —
    // sin retención—, porque retener inventario por algo que no entendemos es
    // peor que no retenerlo. Fail closed.
    return { minutos: null, motivo: 'Medio de pago no reconocido: la reserva no retiene inventario.' }
  }
  if (limite.porOmision === null) return { minutos: null, motivo: MOTIVOS[medio] }

  const pedido =
    typeof minutosConfigurados === 'number' && Number.isFinite(minutosConfigurados)
      ? Math.floor(minutosConfigurados)
      : limite.porOmision

  // Un minuto es el suelo: cero significaría «sin retención», que es una
  // decisión distinta y se expresa con `EN_EL_HOTEL`.
  const minutos = Math.min(Math.max(pedido, 1), limite.maximo)
  return { minutos, motivo: MOTIVOS[medio] }
}

/** Cuándo caduca una retención que empieza ahora. `null` = no caduca. */
export function caducaEn(medio: MedioDePago, ahora: Date, minutosConfigurados?: number | null): Date | null {
  const { minutos } = resolverRetencion(medio, minutosConfigurados)
  return minutos === null ? null : new Date(ahora.getTime() + minutos * 60_000)
}
