/**
 * Las herramientas del conserje conversacional — el NÚCLEO PURO.
 *
 * Aquí no hay red, ni Prisma, ni modelo de lenguaje. Sólo los contratos que el
 * conserje podrá llamar y las funciones que traducen lo que el motor público ya
 * devuelve a lo que un modelo puede ver. Se prueba sin base de datos, que es
 * justo el motivo de que exista separado: **la garantía anti-overbooking tiene
 * que ser verificable sin que haya nada capaz de mentir en la sala.**
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS TRES REGLAS QUE ESTE ARCHIVO EXISTE PARA CUMPLIR
 *
 * 1. **Sin procedencia no hay afirmación.** Toda respuesta sale envuelta en un
 *    `Procedencia` con el identificador de la llamada y el instante. Una frase
 *    del conserje sobre inventario o precio que no pueda citar uno de estos es,
 *    por definición, inventada.
 *
 * 2. **El conteo NO entra al contexto.** `checkAvailability` devuelve
 *    `availableRooms: number` y el calendario devuelve `available`/`total` por
 *    tipo. Al modelo le llega `hay: boolean`. No es pudor: **lo que el modelo
 *    no ve no lo puede decir**, y publicar cuántas quedan invita a la escasez
 *    artificial y le regala la ocupación a la competencia.
 *
 * 3. **Sin respaldo fiscal, "consultar".** El motor ya calcula `pricing.firm`
 *    (`fiscal.configured && policy.verified`). Cuando es falso no se redondea
 *    ni se aproxima: se devuelve `'consultar'`, y el conserje no tiene ningún
 *    número que enseñar. Fallar cerrado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO VIVE DENTRO DE `public-booking/` Y NO EN UN MÓDULO PROPIO
 *
 * La decisión 10 de CLAUDE.md: los módulos son *bounded contexts* y se
 * comunican por eventos, **nunca importando servicios entre ellos**. Un módulo
 * `concierge` aparte tendría que inyectar `PublicBookingService` — o sea,
 * romperla en su primera línea.
 *
 * Y mirándolo bien, un módulo aparte era el error: el conserje no es otro
 * contexto, es **otra superficie del mismo** — vender la habitación al huésped.
 * Igual que `pago/`, `holds/` y `rate-envelope/`, que ya viven aquí por la
 * misma razón.
 */

/** El catálogo cerrado. Si no está aquí, el conserje no puede pedirlo. */
export const HERRAMIENTAS = [
  'consultar_disponibilidad',
  'calendario_del_mes',
  'cotizar',
  'apartar',
  'estado_de_reserva',
] as const

export type NombreDeHerramienta = (typeof HERRAMIENTAS)[number]

/**
 * Herramientas del catálogo que TODAVÍA no tienen implementación, con el motivo.
 *
 * Existe para que «falta una» sea un dato comprobable y no un olvido: hay una
 * prueba que exige que el servicio implemente exactamente el catálogo menos
 * esto. Añadir una herramienta sin implementarla y sin anotarla aquí pone la
 * suite en rojo.
 */
export const PENDIENTES: Partial<Record<NombreDeHerramienta, string>> = {
  estado_de_reserva:
    'requiere un lector first-party por slug: hoy getReservation() exige una VerifiedApiKey, ' +
    'y el conserje corre dentro de Zenix sin llave. Exponerlo es alcance nuevo y pasa por el gate.',
}

/**
 * 🔴 Frases que no pueden llegar al huésped, en ningún idioma y por ningún camino.
 *
 * ── POR QUÉ ESTA LISTA VIVE AQUÍ, Y EL HALLAZGO QUE LA PUSO ────────────────
 * `createReservationBySlug` devuelve hoy, literalmente:
 *
 *     message: 'Reserva confirmada. El pago se realiza al llegar al hotel.'
 *
 * Esa frase es exactamente la que el CI del sitio de Azucar prohíbe y falla el
 * build (ADR-0003 §2, que ADR-0010 deja expresamente vigente): una reserva sólo
 * es firme cuando está pagada, y el cobro todavía no existe.
 *
 * Y aquí está lo que lo hace grave: **el guardián de Azucar mira SU build, no
 * las respuestas de Zenix.** La frase entra por la API, se pinta en el sitio, y
 * el CI sigue en verde porque no está mirando ahí. Es la misma familia de fallo
 * que el proyecto ya se ha hecho dos veces.
 *
 * Esta capa lo cierra para el conserje construyendo objetos nuevos campo por
 * campo —`message` nunca se copia— y comprobándolo al salir. 🔴 **Lo que NO
 * arregla es la API pública**, que sigue devolviendo la frase a cualquier otro
 * consumidor. Eso es un cambio de contrato público y va en su propia historia.
 */
export const FRASES_PROHIBIDAS = ['reserva confirmada', 'booking confirmed'] as const

export function contieneFraseProhibida(valor: unknown): string | null {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor ?? '')
  const plano = texto.toLowerCase()
  return FRASES_PROHIBIDAS.find((f) => plano.includes(f)) ?? null
}

/**
 * El sello que hace auditable una afirmación. `llamadaId` es lo que se registra
 * junto a la respuesta del modelo: sin él, la frase no se puede rastrear hasta
 * el dato que la respalda.
 */
export interface Procedencia {
  herramienta: NombreDeHerramienta
  llamadaId: string
  consultadoEn: string
  fuente: 'zenix'
  /** ¿El precio de esta respuesta se puede publicar? (ADR-0008 / ADR-0010). */
  firme: boolean
}

export interface Respuesta<T> {
  datos: T
  procedencia: Procedencia
}

/** Un importe publicable, o la ausencia explícita de uno. */
export type Importe = { total: number; impuestos: number; moneda: string } | 'consultar'

export interface TipoDisponible {
  roomTypeId: string
  nombre: string
  maxOcupacion: number
  /** 🔴 Booleano a propósito. El conteo no sale de aquí. */
  hay: boolean
  /** Total CON impuestos — la regla 3 del proyecto — o 'consultar'. */
  importe: Importe
}

export interface NocheDelCalendario {
  fecha: string
  hay: boolean
}

/** Campos con forma de conteo. Ninguno puede cruzar esta frontera. */
const CAMPOS_DE_CONTEO = [
  'availableRooms',
  'available',
  'total',
  'rooms',
  'cuartosLibres',
  'habitacionesLibres',
  'roomsLeft',
]

/**
 * La red de seguridad, no el mecanismo. Los mapeadores de abajo ya construyen
 * objetos nuevos campo por campo; esto existe para que **añadir un campo nuevo
 * al motor público no filtre un conteo por descuido**, que es exactamente cómo
 * se filtran las cosas: nadie lo decide, simplemente se hereda un objeto.
 */
export function sinConteos<T>(objeto: T): T {
  if (Array.isArray(objeto)) return objeto.map((x) => sinConteos(x)) as unknown as T
  if (objeto === null || typeof objeto !== 'object') return objeto
  const salida: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(objeto as Record<string, unknown>)) {
    if (CAMPOS_DE_CONTEO.includes(clave) && typeof valor === 'number') continue
    salida[clave] = sinConteos(valor)
  }
  return salida as T
}

/** Identificador de llamada. Ordenable en el tiempo para poder auditar por rango. */
export function nuevaLlamadaId(ahora: Date = new Date(), azar: () => number = Math.random): string {
  const t = ahora.getTime().toString(36).padStart(9, '0')
  const r = Math.floor(azar() * 0xffffff)
    .toString(36)
    .padStart(5, '0')
  return `zc_${t}${r}`
}

export function sellar<T>(
  herramienta: NombreDeHerramienta,
  datos: T,
  opciones: { firme: boolean; ahora?: Date; llamadaId?: string },
): Respuesta<T> {
  const ahora = opciones.ahora ?? new Date()
  return {
    datos,
    procedencia: {
      herramienta,
      llamadaId: opciones.llamadaId ?? nuevaLlamadaId(ahora),
      consultadoEn: ahora.toISOString(),
      fuente: 'zenix',
      firme: opciones.firme,
    },
  }
}

// ─── Lo que devuelve el motor público, sólo lo que aquí se lee ───────────────

interface PricingDelMotor {
  totalCents: number
  taxesCents: number
  currency?: string
  firm: boolean
}

interface TipoDelMotor {
  roomTypeId: string
  name: string
  maxOccupancy: number
  availableRooms: number
  available: boolean
  currency: string
  pricing?: PricingDelMotor | null
}

interface DiaDelMotor {
  date: string
  roomTypes: { roomTypeId: string; name: string; available: number; total: number }[]
}

/**
 * Traduce la disponibilidad del motor a lo que el modelo puede ver.
 *
 * Nótese lo que NO se copia: `availableRooms`. El motor lo calcula porque el
 * date-picker lo necesita para pintar; el conserje no, y dárselo sería confiar
 * en que no lo diga.
 */
export function aTiposDisponibles(tipos: TipoDelMotor[]): TipoDisponible[] {
  return tipos.map((t) => ({
    roomTypeId: t.roomTypeId,
    nombre: t.name,
    maxOcupacion: t.maxOccupancy,
    hay: t.available === true,
    importe: aImporte(t.pricing ?? null, t.currency),
  }))
}

/**
 * Un precio sólo se publica si Zenix lo respalda. Si no, la ausencia se muestra
 * como ausencia — nunca como un número aproximado, que es la forma educada de
 * mentir.
 */
export function aImporte(pricing: PricingDelMotor | null, monedaPorDefecto: string): Importe {
  if (!pricing || pricing.firm !== true) return 'consultar'
  return {
    total: pricing.totalCents / 100,
    impuestos: pricing.taxesCents / 100,
    moneda: pricing.currency ?? monedaPorDefecto,
  }
}

/**
 * Calendario noche a noche: del `{available, total}` por tipo a un solo
 * booleano por noche. Una noche tiene sitio si **algún** tipo lo tiene.
 */
export function aNoches(dias: DiaDelMotor[], roomTypeId?: string): NocheDelCalendario[] {
  return dias.map((d) => {
    const tipos = roomTypeId ? d.roomTypes.filter((t) => t.roomTypeId === roomTypeId) : d.roomTypes
    return { fecha: d.date, hay: tipos.some((t) => t.available > 0) }
  })
}

/**
 * ¿La respuesta trae al menos un precio publicable? Decide el `firme` del sello:
 * si ningún tipo lo tiene, el conserje no puede hablar de dinero en ese turno.
 */
export function hayPrecioFirme(tipos: TipoDisponible[]): boolean {
  return tipos.some((t) => t.importe !== 'consultar')
}

/**
 * 🔴 La frontera de lo que el conserje puede prometer.
 *
 * Una reserva es firme cuando está pagada, y el cobro todavía no existe. Hasta
 * entonces el estado que sale de aquí es `solicitada` o `apartada`, nunca
 * `confirmada`. No es un matiz de redacción: es ADR-0003 §2 del proyecto de
 * Azucar, que su CI verifica sobre el HTML y el JavaScript publicados.
 */
export type EstadoParaElHuesped = 'solicitada' | 'apartada' | 'caducada' | 'cancelada'

export function aEstadoParaElHuesped(
  estadoInterno: string,
  tieneRetencion: boolean,
): EstadoParaElHuesped {
  const e = estadoInterno.toUpperCase()
  if (e === 'CANCELLED' || e === 'CANCELED') return 'cancelada'
  if (e === 'EXPIRED') return 'caducada'
  return tieneRetencion ? 'apartada' : 'solicitada'
}
