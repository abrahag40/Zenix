/**
 * El «sobre de tarifas» — C4 del plan de conexión (docs/vision/18 §4).
 *
 * Un documento por propiedad, **versionado, firmado y con caducidad explícita**,
 * que Zenix empuja al sitio del hotel. Todo lo de este archivo es PURO: se
 * prueba entero sin base de datos y sin red.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 EL DEFECTO QUE ESTE ARCHIVO NO REPITE
 *
 * La firma de webhooks que Zenix ya usa es `HMAC-SHA256(cuerpoCrudo)` — medido
 * en `webhook-dispatcher.service.ts:57`. **No lleva marca de tiempo**, así que
 * una entrega capturada se puede reenviar indefinidamente y su firma sigue
 * siendo válida. Contra un receptor que escribe el precio publicado del hotel,
 * eso significa **reponer una tarifa vieja cuando al atacante le convenga**.
 *
 * Aquí la firma es sobre `envelopeId.issuedAt.cuerpoCrudo`, con ventana de
 * tolerancia — el esquema de Stripe y de Standard Webhooks. Es el mismo patrón
 * que Zenix usará el día que corrija sus webhooks; empezar bien cuesta lo mismo
 * que empezar mal.
 *
 * ANTIPATRÓN EVITADO: *firma sin marca de tiempo*. Autentica el origen y no la
 * frescura, que es justo la mitad que hace falta aquí.
 */
import { createHmac, timingSafeEqual } from 'crypto'

export const SCHEMA_VERSION = 1

/** Tolerancia temporal de la firma. Stripe usa 5 minutos; no hay razón para más. */
export const TOLERANCIA_FIRMA_MS = 5 * 60 * 1000

export interface EnvelopeTaxLine {
  code: string
  /** Fracción decimal para MOSTRAR (0.16). El importe va en centavos, aparte. */
  rate: number
  /** Qué grava: sólo hospedaje, o también servicios. */
  base: 'ROOM' | 'ROOM_AND_SERVICES'
}

export interface EnvelopePrice {
  /** 🔴 Centavos enteros. Nunca decimales — el dinero en coma flotante es un defecto con fecha. */
  net: number
  taxes: number
  total: number
}

export interface EnvelopeRoomType {
  id: string
  code: string
  name: string
  maxOccupancy: number
  /** Lo que va en la ficha y en el marcado. Obligatorio. */
  from: EnvelopePrice
  /** Opcional, sólo para sitios que pinten disponibilidad. Su ausencia es válida. */
  calendar?: Array<{ date: string; net: number; total: number; available: boolean; minStay?: number }>
}

export interface RateEnvelope {
  schemaVersion: number
  /** Monótono. Sirve de clave de idempotencia y de defensa contra el desorden. */
  envelopeId: string
  issuedAt: string
  /** 🔴 Pasado esto, el sitio NO publica precio. */
  validUntil: string
  propertyId: string
  propertySlug: string
  currency: string
  taxPolicy: {
    displayMode: 'TAX_INCLUSIVE'
    lines: EnvelopeTaxLine[]
    /** false = la jurisdicción no está verificada; el sitio debe degradar. */
    verified: boolean
    /** Fundamento normativo, para que el desglose publicado sea auditable. */
    legalBasis?: string
  }
  roomTypes: EnvelopeRoomType[]
  /** El sitio NO cablea a dónde manda el botón: lo dice Zenix. */
  bookingUrl: string
}

export class RateEnvelopeError extends Error {}

/**
 * 🔴 Invariantes que se comprueban ANTES de firmar.
 *
 * Firmar un sobre inválido es peor que no mandarlo: el receptor lo acepta —la
 * firma cuadra— y publica una incoherencia con el sello de Zenix encima. La
 * validación va antes de la firma, no después.
 */
export function assertEnvelopeValido(e: RateEnvelope): void {
  const fallo = (m: string): never => { throw new RateEnvelopeError(m) }

  if (e.schemaVersion !== SCHEMA_VERSION) fallo(`schemaVersion desconocida: ${e.schemaVersion}`)
  if (!e.roomTypes.length) fallo('un sobre sin tipos de habitación no publica nada')
  if (Date.parse(e.validUntil) <= Date.parse(e.issuedAt)) {
    fallo('validUntil debe ser posterior a issuedAt: un sobre nace caducado')
  }
  for (const rt of e.roomTypes) {
    const p = rt.from
    for (const [k, v] of Object.entries(p)) {
      if (!Number.isInteger(v) || v < 0) fallo(`${rt.code}.from.${k} debe ser un entero de centavos >= 0; llegó ${v}`)
    }
    // El mismo invariante que garantiza el calculador fiscal, verificado otra
    // vez en la frontera: lo que sale de Zenix cuadra, o no sale.
    if (p.net + p.taxes !== p.total) {
      fallo(`${rt.code}: el desglose no suma — ${p.net} + ${p.taxes} ≠ ${p.total}`)
    }
    for (const d of rt.calendar ?? []) {
      if (!Number.isInteger(d.net) || !Number.isInteger(d.total)) {
        fallo(`${rt.code}, ${d.date}: el calendario también va en centavos enteros`)
      }
    }
  }
}

/**
 * Serialización CANÓNICA: el cuerpo que se firma es exactamente el que se envía.
 *
 * Si se firmara un objeto y se enviara otra serialización —una con las claves
 * en otro orden, o con espacios— la firma no cuadraría en el receptor y el
 * fallo sería intermitente y carísimo de diagnosticar. Se firma la CADENA, y
 * esa misma cadena es el cuerpo del POST.
 */
export function serializar(e: RateEnvelope): string {
  return JSON.stringify(e)
}

/**
 * 🔄 DESVIACIÓN DECLARADA respecto de `docs/vision/18 §4`.
 *
 * El plan decía firmar `envelopeId.issuedAt.cuerpoCrudo`. Al implementarlo
 * apareció la razón para no hacerlo: el sobre viaja por la infraestructura de
 * webhooks que ya existe, y ésa envuelve el cuerpo en
 * `{event, propertyId, data, sentAt}`. Firmar campos del sobre obligaría al
 * receptor a PARSEAR el JSON antes de poder verificar la firma — es decir, a
 * procesar datos no autenticados para decidir si autenticarlos. Al revés.
 *
 * Se firma `timestamp.cuerpoCrudo`, que es el esquema de Stripe y de Standard
 * Webhooks: el receptor verifica ANTES de parsear, y el `envelopeId` sigue
 * cubierto por el HMAC porque va dentro del cuerpo.
 */

/** `HMAC-SHA256(t.cuerpoCrudo)` en hexadecimal. `t` en segundos Unix. */
export function firmar(secreto: string, t: number, cuerpoCrudo: string): string {
  return createHmac('sha256', secreto).update(`${t}.${cuerpoCrudo}`).digest('hex')
}

/** Cabecera `X-Zenix-Signature-V2`, formato Stripe: `t=<unix>,v1=<hmac>`. */
export function cabeceraFirma(t: number, firma: string): string {
  return `t=${t},v1=${firma}`
}

/** Extrae `t` y `v1` de la cabecera. Tolera espacios y orden invertido. */
export function parsearCabecera(cabecera: string): { t: number; v1: string } | null {
  const partes = Object.fromEntries(
    cabecera.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  const t = Number(partes.t)
  if (!Number.isFinite(t) || !partes.v1) return null
  return { t, v1: partes.v1 }
}

/**
 * Verificación del lado del receptor. Vive aquí —y no sólo en el PHP— para que
 * la suite de Zenix pueda probar el contrato de las dos puntas sin levantar un
 * servidor. El PHP implementará exactamente esta lógica.
 *
 * 🔴 Orden deliberado: se verifica la VENTANA y la FIRMA antes de tocar el
 * JSON. El cuerpo no autenticado no se parsea.
 */
export function verificar(args: {
  secreto: string
  cuerpoCrudo: string
  cabecera: string
  ahora?: number
  toleranciaMs?: number
}): { ok: true } | { ok: false; motivo: string } {
  const partes = parsearCabecera(args.cabecera)
  if (!partes) return { ok: false, motivo: 'cabecera de firma ilegible' }

  const ahora = args.ahora ?? Date.now()
  const tolerancia = args.toleranciaMs ?? TOLERANCIA_FIRMA_MS
  // Ventana de DOS lados: un sobre del futuro es tan sospechoso como uno viejo.
  if (Math.abs(ahora - partes.t * 1000) > tolerancia) {
    return { ok: false, motivo: 'fuera de la ventana de tolerancia' }
  }

  const esperada = firmar(args.secreto, partes.t, args.cuerpoCrudo)
  const a = Buffer.from(esperada, 'utf8')
  const b = Buffer.from(partes.v1, 'utf8')
  // Longitudes distintas: `timingSafeEqual` lanza. La longitud no es secreta
  // (hexadecimal de 64), así que cortar antes no filtra nada.
  if (a.length !== b.length) return { ok: false, motivo: 'firma inválida' }
  if (!timingSafeEqual(a, b)) return { ok: false, motivo: 'firma inválida' }
  return { ok: true }
}

/**
 * Identificador monótono y ordenable lexicográficamente: milisegundos en base
 * 36 con relleno, más un sufijo aleatorio.
 *
 * 🔑 Que sea MONÓTONO es lo que permite al receptor descartar un sobre viejo
 * comparando cadenas, sin parsear fechas ni guardar estado más allá del último
 * identificador visto. El contador rompe los empates dentro del mismo
 * milisegundo — dos emisiones seguidas no pueden quedar iguales.
 */
let contador = 0
export function nuevoEnvelopeId(ahora: number = Date.now()): string {
  contador = (contador + 1) % 0x1000
  return `${ahora.toString(36).padStart(9, '0')}-${contador.toString(36).padStart(3, '0')}`
}
