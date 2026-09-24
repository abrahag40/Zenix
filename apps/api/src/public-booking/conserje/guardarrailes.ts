/**
 * Los guardarraíles de salida del conserje — el filtro que ve TODA respuesta
 * antes de que salga hacia el huésped.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ ESTO EXISTE, Y POR QUÉ NO BASTA EL SYSTEM PROMPT
 *
 * Escribir «nunca digas reserva confirmada» en las instrucciones del modelo
 * **no es un guardián, porque nada lo falla**. Es un deseo con buena redacción.
 * El antipatrón se llama *prompt-only enforcement* (ADR-0011 §5): la regla vive
 * en un texto que el propio sistema que debe cumplirla puede reinterpretar, y
 * no hay ninguna prueba que se ponga roja cuando deja de cumplirse.
 *
 * Aquí la regla es **código determinista con pruebas**. El prompt sigue
 * existiendo —sirve para que el modelo acierte la mayoría de las veces— pero no
 * es lo que garantiza nada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DISEÑO, Y LAS DECISIONES QUE LO SOSTIENEN
 *
 * · **Una regla = una función pura.** Sin red, sin base de datos, sin reloj. Se
 *   prueba con una tabla de casos y se razona de una en una. Es lo que permite
 *   que la suite adversaria sea exhaustiva en vez de anecdótica.
 *
 * · **Dos severidades, no una.** `transforma` corrige y sigue (la marca sin
 *   acento); `bloquea` corta y sustituye por un texto fijo. Un guardarraíl que
 *   sólo supiera bloquear obligaría a tirar una respuesta entera por un acento,
 *   y el operador acabaría apagándolo — que es cómo mueren los guardarraíles.
 *
 * · **Orden declarado: primero las transformaciones, después los bloqueos.**
 *   Un bloqueo debe juzgar el texto FINAL, no un borrador que todavía iba a
 *   cambiar.
 *
 * · **Fallar cerrado, también ante un error nuestro.** Si una regla lanza, el
 *   veredicto es bloquear. Un guardarraíl que se cae y deja pasar es peor que
 *   no tenerlo, porque además genera confianza.
 *
 * · **Cada regla lleva `id`.** Es lo que cita la bitácora y lo que afirma cada
 *   caso adversario. Sin identificador, «falló un guardarraíl» no es un dato.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 EL RIESGO QUE NO SE PUEDE IGNORAR: EL FALSO POSITIVO
 *
 * Un guardarraíl demasiado ancho bloquea respuestas legítimas, el conserje se
 * vuelve inútil y alguien lo desactiva. Por eso cada regla de bloqueo tiene, en
 * la suite, tantos casos de «esto SÍ debe pasar» como de «esto NO». La
 * precisión no es un lujo: es lo que hace que el guardarraíl sobreviva.
 */
import type { Procedencia } from './herramientas'

export type Severidad = 'transforma' | 'bloquea'

export interface Hallazgo {
  regla: string
  severidad: Severidad
  motivo: string
}

export interface Veredicto {
  /** false ⇒ `texto` es el reemplazo seguro, no lo que dijo el modelo. */
  permitido: boolean
  texto: string
  hallazgos: Hallazgo[]
}

export interface ContextoDelTurno {
  /** Procedencias emitidas por herramientas **en este mismo turno**. */
  procedencias: Procedencia[]
  /** Idioma del reemplazo cuando se bloquea. */
  idioma?: 'es' | 'en'
}

type ResultadoDeRegla =
  | { tipo: 'ok' }
  | { tipo: 'transforma'; texto: string; motivo: string }
  | { tipo: 'bloquea'; motivo: string }

export interface Regla {
  id: string
  severidad: Severidad
  /** Qué protege, en una línea, para que la bitácora se lea sin abrir el código. */
  protege: string
  aplicar(texto: string, ctx: ContextoDelTurno): ResultadoDeRegla
}

/** El texto que sale cuando se bloquea. Nunca explica QUÉ regla saltó. */
const REEMPLAZO: Record<'es' | 'en', string> = {
  es: 'Prefiero que esto te lo confirme el equipo del hotel. ¿Te paso con ellos?',
  en: 'I would rather have the hotel team confirm this for you. Shall I connect you?',
}

// ─── G1 · Nunca «reserva confirmada» ────────────────────────────────────────

/**
 * Regla 1 del proyecto, ADR-0003 §2, que ADR-0010 deja expresamente vigente.
 * Una reserva sólo es firme cuando está pagada, y el cobro todavía no existe.
 */
export const FRASES_DE_CONFIRMACION = ['reserva confirmada', 'booking confirmed'] as const

export const g1Confirmacion: Regla = {
  id: 'G1-confirmacion',
  severidad: 'bloquea',
  protege: 'nunca se promete una reserva confirmada',
  aplicar(texto) {
    const plano = normalizar(texto)
    const hit = FRASES_DE_CONFIRMACION.find((f) => plano.includes(f))
    return hit ? { tipo: 'bloquea', motivo: `promete «${hit}»` } : { tipo: 'ok' }
  },
}

// ─── G2 · Nunca cuántas habitaciones quedan ─────────────────────────────────

const NUMERO = '(?:\\d{1,3}|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)'
const UNIDAD =
  '(?:habitacion|habitaciones|cuarto|cuartos|bungalow|bungalows|villa|villas|suite|suites)'

/**
 * ADR-0010: se publica **si hay o no hay**, nunca **cuántas**. Saber que quedan
 * dos es dato del hotel; publicarlo invita a la escasez artificial y le regala
 * la ocupación en tiempo real a la competencia.
 *
 * 🔴 La precisión importa más que en ninguna otra regla, porque los números son
 * ubicuos en una conversación de hotel: «2 adultos», «3 noches», «km 7.5». Sólo
 * se marca un número **pegado a una unidad de alojamiento**, o un «quedan/queda»
 * seguido de número. «Para 2 adultos, 3 noches» no dispara nada.
 */
export const g2Conteo: Regla = {
  id: 'G2-conteo',
  severidad: 'bloquea',
  protege: 'no se publica cuántas habitaciones quedan',
  aplicar(texto) {
    const plano = normalizar(texto)
    const cantidadPegada = new RegExp(`\\b${NUMERO}\\s+${UNIDAD}\\b`)
    const quedan = new RegExp(`\\b(?:quedan|queda|restan|resta|disponibles?:?)\\s+${NUMERO}\\b`)
    if (cantidadPegada.test(plano)) return { tipo: 'bloquea', motivo: 'dice cuántas unidades hay' }
    if (quedan.test(plano)) return { tipo: 'bloquea', motivo: 'dice cuántas quedan' }
    return { tipo: 'ok' }
  },
}

// ─── G3 · Todo importe lleva impuestos y respaldo ───────────────────────────

/** Importes: `$8,323.59`, `8323 MXN`, `8,323 pesos`, `USD 450`. */
const IMPORTE =
  /(?:\$\s?\d[\d.,]*)|(?:\b\d[\d.,]*\s?(?:mxn|usd|pesos|dolares)\b)|(?:\b(?:mxn|usd)\s?\d[\d.,]*)/

const DICE_IMPUESTOS =
  /(?:impuestos?\s+incluidos?|con\s+impuestos?|incluye\s+impuestos?|iva|ish|taxes?\s+included|incl\.?\s+tax)/

/**
 * Regla 3 del proyecto: **el total cotizado incluye impuestos**, y es el
 * diferenciador frente a las OTAs. Dos condiciones, y las dos son necesarias:
 *
 *  1. si hay un importe, el texto tiene que decir que lleva impuestos;
 *  2. **y** el turno tiene que traer una procedencia con `firme: true`.
 *
 * La segunda es la que de verdad protege: un modelo puede escribir «impuestos
 * incluidos» junto a un número que se inventó. Sin respaldo fiscal verificado,
 * el precio no se publica — se dice «Consultar» (ADR-0008 / ADR-0010 §3).
 */
export const g3Impuestos: Regla = {
  id: 'G3-impuestos',
  severidad: 'bloquea',
  protege: 'todo importe incluye impuestos y lo respalda Zenix',
  aplicar(texto, ctx) {
    const plano = normalizar(texto)
    if (!IMPORTE.test(plano)) return { tipo: 'ok' }
    if (!ctx.procedencias.some((p) => p.firme)) {
      return { tipo: 'bloquea', motivo: 'importe sin precio firme que lo respalde' }
    }
    if (!DICE_IMPUESTOS.test(plano)) {
      return { tipo: 'bloquea', motivo: 'importe sin decir que incluye impuestos' }
    }
    return { tipo: 'ok' }
  },
}

// ─── G4 · Nunca datos de tarjeta ────────────────────────────────────────────

const PIDE_TARJETA =
  /(?:numero de (?:la )?tarjeta|card number|cvv|cvc|codigo de seguridad|security code|fecha de vencimiento de (?:la )?tarjeta)/

/**
 * Regla 4 del proyecto: **nunca capturar datos de tarjeta**. Es el hallazgo
 * crítico del sitio vigente —guardaba PAN y CVV en su base— y el sitio nuevo no
 * lo reproduce.
 *
 * Un chat abre un camino que el formulario no tenía: el huésped puede **teclear
 * su tarjeta por iniciativa propia**. Por eso hay dos mitades:
 *
 *  · esta regla impide que el conserje la PIDA o la repita;
 *  · `redactarDatosDeTarjeta()` limpia la ENTRADA antes de registrarla o de
 *    mandarla al modelo — lo que no guardas no se te filtra.
 */
export const g4Tarjeta: Regla = {
  id: 'G4-tarjeta',
  severidad: 'bloquea',
  protege: 'no se piden ni se repiten datos de tarjeta',
  aplicar(texto) {
    const plano = normalizar(texto)
    if (PIDE_TARJETA.test(plano)) return { tipo: 'bloquea', motivo: 'pide datos de tarjeta' }
    if (contienePan(plano)) return { tipo: 'bloquea', motivo: 'repite un número de tarjeta' }
    return { tipo: 'ok' }
  },
}

// ─── G5 · Sin procedencia no hay afirmación ─────────────────────────────────

/**
 * Sólo términos de **inventario y precio**. Deliberadamente NO incluye «hay»,
 * que en español es demasiado común —«hay estacionamiento», «hay wifi»— y
 * convertiría la regla en un bloqueo permanente.
 *
 * 🔴 Un guardarraíl que bloquea de más se desactiva, y un guardarraíl
 * desactivado protege cero. La precisión es parte de la protección.
 */
const AFIRMA_INVENTARIO =
  /(?:disponib|libre(?:s)?\b|ocupad|sin cupo|con cupo|precio|tarifa|cuesta|total de|noche cuesta)/

export const g5Procedencia: Regla = {
  id: 'G5-procedencia',
  severidad: 'bloquea',
  protege: 'toda afirmación sobre inventario o precio cita la llamada que la respalda',
  aplicar(texto, ctx) {
    const plano = normalizar(texto)
    if (!AFIRMA_INVENTARIO.test(plano)) return { tipo: 'ok' }
    if (ctx.procedencias.length === 0) {
      return { tipo: 'bloquea', motivo: 'afirma inventario o precio sin haber preguntado a Zenix' }
    }
    return { tipo: 'ok' }
  },
}

// ─── G6 · La marca va sin acento ────────────────────────────────────────────

/**
 * Requisito literal del cliente del 2026-09-07. Es la única regla que
 * **transforma**: tirar una respuesta útil por un acento sería desproporcionado,
 * y corregirlo es exacto y sin ambigüedad.
 */
export const g6Marca: Regla = {
  id: 'G6-marca',
  severidad: 'transforma',
  protege: 'la marca se escribe «Azucar», sin acento',
  aplicar(texto) {
    const corregido = texto.replace(/Azúcar/g, 'Azucar').replace(/AZÚCAR/g, 'AZUCAR')
    return corregido === texto
      ? { tipo: 'ok' }
      : { tipo: 'transforma', texto: corregido, motivo: 'marca con acento' }
  },
}

/** Orden declarado: transformaciones primero; los bloqueos juzgan el texto final. */
export const REGLAS: readonly Regla[] = [
  g6Marca,
  g1Confirmacion,
  g2Conteo,
  g3Impuestos,
  g4Tarjeta,
  g5Procedencia,
]

/**
 * Pasa una respuesta candidata por todas las reglas.
 *
 * Se evalúan TODAS aunque una ya haya bloqueado: el veredicto se decide con el
 * primer bloqueo, pero la bitácora quiere saber si fallaron tres cosas o una.
 * Diagnosticar con un solo hallazgo cuando había tres es cómo se arregla el
 * síntoma y se deja la causa.
 */
export function revisar(
  texto: string,
  ctx: ContextoDelTurno,
  reglas: readonly Regla[] = REGLAS,
): Veredicto {
  const hallazgos: Hallazgo[] = []
  let actual = texto
  let bloqueada = false

  for (const regla of reglas) {
    let r: ResultadoDeRegla
    try {
      r = regla.aplicar(actual, ctx)
    } catch (e) {
      // Fallar CERRADO: una regla rota bloquea. Dejar pasar por un error
      // nuestro es lo peor de los dos mundos — no protege y da confianza.
      hallazgos.push({
        regla: regla.id,
        severidad: 'bloquea',
        motivo: `la regla lanzó: ${e instanceof Error ? e.message : String(e)}`,
      })
      bloqueada = true
      continue
    }
    if (r.tipo === 'ok') continue
    if (r.tipo === 'transforma') {
      actual = r.texto
      hallazgos.push({ regla: regla.id, severidad: 'transforma', motivo: r.motivo })
      continue
    }
    hallazgos.push({ regla: regla.id, severidad: 'bloquea', motivo: r.motivo })
    bloqueada = true
  }

  if (bloqueada) {
    return { permitido: false, texto: REEMPLAZO[ctx.idioma ?? 'es'], hallazgos }
  }
  return { permitido: true, texto: actual, hallazgos }
}

// ─── Entrada del huésped: lo que no guardas no se te filtra ──────────────────

/**
 * Algoritmo de Luhn (ISO/IEC 7812-1). Se usa **para reducir falsos positivos**,
 * no por elegancia: una referencia de reserva o un teléfono con 16 dígitos casi
 * nunca pasa Luhn, y una tarjeta real siempre lo pasa. Sin esta comprobación
 * habría que redactar cualquier ristra larga de dígitos, y el conserje empezaría
 * a censurar números de vuelo.
 */
export function pasaLuhn(digitos: string): boolean {
  if (digitos.length < 13 || digitos.length > 19) return false
  let suma = 0
  let doble = false
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = digitos.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (doble) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
    doble = !doble
  }
  return suma % 10 === 0
}

const CANDIDATO_PAN = /\b(?:\d[ -]?){13,19}\b/g

function contienePan(texto: string): boolean {
  for (const m of texto.matchAll(CANDIDATO_PAN)) {
    if (pasaLuhn(m[0].replace(/[ -]/g, ''))) return true
  }
  return false
}

/**
 * Limpia la entrada del huésped ANTES de registrarla o de mandarla al modelo.
 *
 * 🔴 Se sustituye por una marca, no se borra: si desapareciera sin dejar rastro,
 * nadie sabría nunca que un huésped intentó pagar por el chat — y ese es
 * justamente el dato que el hotel necesita para dejar de pedírselo.
 *
 * El CVV se redacta **sólo cuando va etiquetado** («cvv 123»). Tres dígitos
 * sueltos son una hora, un número de habitación o un precio; redactarlos todos
 * mutilaría la conversación.
 */
export function redactarDatosDeTarjeta(entrada: string): { texto: string; hubo: boolean } {
  let hubo = false
  let salida = entrada.replace(CANDIDATO_PAN, (m) => {
    if (!pasaLuhn(m.replace(/[ -]/g, ''))) return m
    hubo = true
    return '[tarjeta retirada]'
  })
  salida = salida.replace(
    /\b(cvv|cvc|codigo de seguridad|security code)\b\s*:?\s*\d{3,4}\b/gi,
    (m) => {
      hubo = true
      return `${m.split(/[\s:]/)[0]} [retirado]`
    },
  )
  return { texto: salida, hubo }
}

/** Minúsculas y sin diacríticos: las reglas se escriben una sola vez. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
