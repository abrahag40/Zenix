/**
 * TaxCalculator — C1 del plan de conexión con el website (docs/vision/18).
 *
 * FUNCIÓN PURA. Sin Nest, sin Prisma, sin contexto de inquilino. Se prueba
 * entera sin base de datos, y por eso puede usarla IGUAL el módulo de
 * recepción (`guest-stays`) que el puerto público que publica la tarifa en el
 * sitio del hotel. Ésa es toda la razón de que exista separada.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ CENTAVOS ENTEROS, Y NUNCA `number` con decimales
 *
 * El cálculo anterior operaba en flotantes y redondeaba cada renglón por
 * separado con `.toFixed(2)`. Medido sobre los 4,990,001 totales posibles
 * entre $100.00 y $50,000.00: **1,554,265 (31.1%) NO cuadraban** — la suma de
 * base + IVA + ISH no daba el importe cobrado, con desfases de ±$0.01.
 * Un desglose que no suma lo que se cobra es un desglose que el huésped puede
 * refutar con una calculadora.
 *
 * Aquí todo importe es un ENTERO de centavos y toda tasa un ENTERO de puntos
 * base (1600 pb = 16%). No hay un solo flotante en el camino del dinero.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 📜 FUNDAMENTO DE LAS TASAS — fuente primaria, no secundaria
 *
 * · IVA 16% — Ley del IVA, art. 1.
 *
 * · ISH Quintana Roo — Ley del Impuesto al Hospedaje del Estado de Quintana
 *   Roo, texto vigente con última reforma POE **16-dic-2025** (Decreto 189):
 *
 *     «ARTÍCULO 8. El impuesto se calculará aplicando la tasa del **5%** sobre
 *      el valor de facturación y/o contratación de los servicios a que se
 *      refieren los artículos 4 y 9 de esta Ley.
 *      Tratándose de los supuestos contemplados en la **fracción V** del
 *      artículo 4 [...] calculará el impuesto aplicando la tasa del **6%**.»
 *
 *   🔴 La fracción V NO son las plataformas digitales: es «Departamento, casas
 *   y villas particulares». La fracción I es «Hoteles, moteles, mesones,
 *   posadas, hosterías». Es decir:
 *
 *     **La tasa la fija el TIPO DE ESTABLECIMIENTO, no el canal de venta.**
 *     Un hotel paga 5% lo venda directo o lo venda Booking.
 *
 *   Lo que sí cambia con el canal es **quién retiene**: el art. 4, último
 *   párrafo (reformado POE 16-12-2025), obliga al intermediario que cobra por
 *   plataforma digital a retener, enterar y expedir constancia en 5 días.
 *   Eso es una obligación de reporteo, no una tasa distinta — por eso
 *   `collectedBy` vive en el resultado y NO en el cálculo del importe.
 *
 *   ⚠️ El código anterior aplicaba **6% a un hotel**: la tasa de las villas
 *   particulares. Sobrecobraba un punto sobre la base.
 *
 * · Base del ISH — art. 4, penúltimo párrafo: «solo se considerará el albergue
 *   **sin incluir a los alimentos y demás servicios**». Por eso existe
 *   `ancillaryCents` separado: el IVA grava todo, el ISH sólo el hospedaje.
 *
 * · DSA (Derecho de Saneamiento Ambiental) — municipal, por persona y noche,
 *   referido a la UMA. El motor sabe expresarlo (`FIXED_PER_PERSON_NIGHT`),
 *   pero **NO se activa con una cifra sin fuente primaria**: la Ley de Hacienda
 *   del municipio de Tulum no está verificada todavía. Ver `dsaTulumPendiente`.
 *
 * ANTIPATRÓN EVITADO: hardcodear tasas dentro de la lógica. Aquí las tasas son
 * DATOS (`FiscalPolicy`), lo que permite que un hotel en Jalisco use el mismo
 * motor sin tocar una línea de código — y que el día que el cliente confirme su
 * régimen, sea un cambio de configuración y no un despliegue.
 */

/** Tasa en puntos base: 1600 = 16.00%. Entero, siempre. */
export type BasisPoints = number

export type TaxRule =
  | {
      code: string
      label: string
      kind: 'PERCENT_OF_BASE'
      rateBp: BasisPoints
      /** `LODGING_ONLY` excluye alimentos y otros servicios (ISH). */
      appliesTo: 'LODGING_ONLY' | 'LODGING_AND_ANCILLARY'
    }
  | {
      code: string
      label: string
      kind: 'FIXED_PER_PERSON_NIGHT'
      /** Valor unitario de referencia en centavos (p. ej. la UMA diaria). */
      unitCents: number
      /**
       * Proporción en puntos base aplicada a `unitCents` para el 1.º, 2.º, 3.º…
       * ocupante. En Tulum el patrón reportado es 30/20/15/10%.
       */
      scaleBpByOccupant: BasisPoints[]
      /**
       * Qué hacer con el ocupante N+1 cuando se agota `scaleBpByOccupant`.
       * 🔴 No hay default: inventar aquí es inventar un cobro.
       */
      beyondScale: 'REPEAT_LAST' | 'UNSUPPORTED'
    }

export interface FiscalPolicy {
  /** Etiqueta legible de la jurisdicción, para el desglose. */
  jurisdiction: {
    country: string
    countryName: string
    state: string | null
    stateName: string | null
    city: string | null
  }
  /** Vacío = jurisdicción sin configurar. Se reporta, no se inventa. */
  rules: TaxRule[]
  /** Por qué esta política está incompleta, si lo está. */
  note?: string
  /** Referencia normativa. Va al desglose para que sea auditable. */
  legalBasis?: string
}

export type TaxMode =
  /** El importe recibido YA lleva los impuestos dentro. */
  | 'INCLUSIVE'
  /** El importe recibido es neto; los impuestos se suman. */
  | 'EXCLUSIVE'

export interface TaxCalcInput {
  /** Hospedaje, en CENTAVOS enteros. */
  lodgingCents: number
  /** Alimentos y otros servicios, en CENTAVOS. El ISH no los grava. */
  ancillaryCents?: number
  mode: TaxMode
  nights: number
  occupants: number
  policy: FiscalPolicy
  currency: string
  /** Sólo informativo: decide quién retiene, no cuánto se cobra. */
  collectedBy?: 'DIRECT' | 'PLATFORM'
}

export interface TaxLine {
  code: string
  label: string
  kind: TaxRule['kind']
  /** Puntos base para porcentajes; null para cuotas fijas. */
  rateBp: BasisPoints | null
  amountCents: number
  detail: string
}

export interface TaxResult {
  jurisdiction: FiscalPolicy['jurisdiction']
  currency: string
  /** Base gravable del hospedaje, en centavos. */
  lodgingBaseCents: number
  ancillaryBaseCents: number
  lines: TaxLine[]
  totalTaxesCents: number
  /** 🔴 Invariante: siempre === lodgingBase + ancillaryBase + totalTaxes. */
  totalCents: number
  configured: boolean
  note?: string
  legalBasis?: string
  /** Quién debe retener y enterar. Reporteo, no aritmética. */
  withholding?: 'PROPERTY' | 'PLATFORM'
}

export class TaxCalculationError extends Error {}

/** Redondeo half-up sobre enteros. `roundDiv(7, 2) === 4`, `roundDiv(-7, 2) === -4`. */
const roundDiv = (numerator: number, denominator: number): number => {
  const sign = numerator < 0 ? -1 : 1
  return sign * Math.floor((Math.abs(numerator) * 2 + denominator) / (2 * denominator))
}

const assertEnteroNoNegativo = (v: number, nombre: string): void => {
  if (!Number.isInteger(v) || v < 0) {
    throw new TaxCalculationError(`${nombre} debe ser un entero de centavos >= 0; llegó ${v}`)
  }
}

/**
 * Calcula el desglose fiscal. Determinista, sin efectos, sin E/S.
 *
 * 🔴 Garantía dura: `totalCents === lodgingBaseCents + ancillaryBaseCents +
 * totalTaxesCents`, exacto, en los dos modos. Lo verifica `tax-calculator.spec.ts`
 * sobre un barrido exhaustivo, no sobre un puñado de ejemplos.
 */
export function calculateTaxes(input: TaxCalcInput): TaxResult {
  const { mode, nights, occupants, policy, currency } = input
  const ancillaryIn = input.ancillaryCents ?? 0

  assertEnteroNoNegativo(input.lodgingCents, 'lodgingCents')
  assertEnteroNoNegativo(ancillaryIn, 'ancillaryCents')
  if (!Number.isInteger(nights) || nights < 1) {
    throw new TaxCalculationError(`nights debe ser un entero >= 1; llegó ${nights}`)
  }
  if (!Number.isInteger(occupants) || occupants < 1) {
    throw new TaxCalculationError(`occupants debe ser un entero >= 1; llegó ${occupants}`)
  }

  const base = {
    jurisdiction: policy.jurisdiction,
    currency,
    legalBasis: policy.legalBasis,
    withholding: (input.collectedBy === 'PLATFORM' ? 'PLATFORM' : 'PROPERTY') as
      | 'PROPERTY'
      | 'PLATFORM',
  }

  // Jurisdicción sin configurar: se devuelve el importe tal cual y se DICE.
  // Antipatrón evitado: aplicar las tasas de Quintana Roo fuera de Quintana Roo
  // "porque es México". Un número inventado es peor que un número ausente.
  if (policy.rules.length === 0) {
    return {
      ...base,
      lodgingBaseCents: input.lodgingCents,
      ancillaryBaseCents: ancillaryIn,
      lines: [],
      totalTaxesCents: 0,
      totalCents: input.lodgingCents + ancillaryIn,
      configured: false,
      note: policy.note ?? 'Jurisdicción sin configurar: no se calcula desglose.',
    }
  }

  const fixedRules = policy.rules.filter(
    (r): r is Extract<TaxRule, { kind: 'FIXED_PER_PERSON_NIGHT' }> =>
      r.kind === 'FIXED_PER_PERSON_NIGHT',
  )
  const percentRules = policy.rules.filter(
    (r): r is Extract<TaxRule, { kind: 'PERCENT_OF_BASE' }> => r.kind === 'PERCENT_OF_BASE',
  )

  // ── Cuotas fijas: importe absoluto, independiente de la base ──────────────
  const fixedLines: TaxLine[] = []
  for (const rule of fixedRules) {
    if (occupants > rule.scaleBpByOccupant.length && rule.beyondScale === 'UNSUPPORTED') {
      return {
        ...base,
        lodgingBaseCents: input.lodgingCents,
        ancillaryBaseCents: ancillaryIn,
        lines: [],
        totalTaxesCents: 0,
        totalCents: input.lodgingCents + ancillaryIn,
        configured: false,
        note:
          `${rule.code}: la tarifa publicada sólo cubre hasta ${rule.scaleBpByOccupant.length} ` +
          `ocupantes y se pidieron ${occupants}. No se inventa la cuota del siguiente.`,
      }
    }
    let perNight = 0
    for (let i = 0; i < occupants; i++) {
      const bp =
        rule.scaleBpByOccupant[i] ?? rule.scaleBpByOccupant[rule.scaleBpByOccupant.length - 1]
      perNight += roundDiv(rule.unitCents * bp, 10000)
    }
    fixedLines.push({
      code: rule.code,
      label: rule.label,
      kind: 'FIXED_PER_PERSON_NIGHT',
      rateBp: null,
      amountCents: perNight * nights,
      detail: `${occupants} ocupante(s) × ${nights} noche(s)`,
    })
  }
  const fixedTotal = fixedLines.reduce((a, l) => a + l.amountCents, 0)

  // ── Base gravable ─────────────────────────────────────────────────────────
  const bpLodging = percentRules.reduce((a, r) => a + r.rateBp, 0)
  const bpAncillary = percentRules
    .filter((r) => r.appliesTo === 'LODGING_AND_ANCILLARY')
    .reduce((a, r) => a + r.rateBp, 0)

  let lodgingBase: number
  let ancillaryBase: number

  if (mode === 'EXCLUSIVE') {
    lodgingBase = input.lodgingCents
    ancillaryBase = ancillaryIn
  } else {
    // INCLUSIVE con dos bases distintas y un solo total es un sistema
    // indeterminado: hay infinitas particiones que dan el mismo importe.
    // Se rechaza en lugar de adivinar.
    if (ancillaryIn !== 0) {
      throw new TaxCalculationError(
        'Modo INCLUSIVE con `ancillaryCents` distinto de 0 está indeterminado: ' +
          'la partición hospedaje/servicios no se puede derivar del total. ' +
          'Pasa los netos y usa EXCLUSIVE.',
      )
    }
    const afterFixed = input.lodgingCents - fixedTotal
    if (afterFixed < 0) {
      throw new TaxCalculationError(
        `Las cuotas fijas (${fixedTotal}) superan el importe recibido (${input.lodgingCents}).`,
      )
    }
    lodgingBase = roundDiv(afterFixed * 10000, 10000 + bpLodging)
    ancillaryBase = 0
  }

  // ── Renglones porcentuales ────────────────────────────────────────────────
  const percentLines: TaxLine[] = percentRules.map((r) => {
    const gravado =
      r.appliesTo === 'LODGING_AND_ANCILLARY' ? lodgingBase + ancillaryBase : lodgingBase
    return {
      code: r.code,
      label: r.label,
      kind: 'PERCENT_OF_BASE' as const,
      rateBp: r.rateBp,
      amountCents: roundDiv(gravado * r.rateBp, 10000),
      detail: `${(r.rateBp / 100).toFixed(2)}% sobre ${
        r.appliesTo === 'LODGING_ONLY' ? 'hospedaje' : 'hospedaje y servicios'
      }`,
    }
  })

  // ── Cuadre exacto ─────────────────────────────────────────────────────────
  // En INCLUSIVE el total está DADO: el residuo del redondeo se asigna al
  // renglón porcentual de mayor importe. Se elige el mayor porque minimiza el
  // error relativo introducido, y porque deja el ajuste siempre en el mismo
  // renglón — predecible para quien audite. El residuo es de ±1 centavo.
  if (mode === 'INCLUSIVE' && percentLines.length > 0) {
    const sumaActual =
      lodgingBase + fixedTotal + percentLines.reduce((a, l) => a + l.amountCents, 0)
    const residuo = input.lodgingCents - sumaActual
    if (residuo !== 0) {
      let mayor = 0
      for (let i = 1; i < percentLines.length; i++) {
        if (percentLines[i].amountCents > percentLines[mayor].amountCents) mayor = i
      }
      percentLines[mayor] = {
        ...percentLines[mayor],
        amountCents: percentLines[mayor].amountCents + residuo,
      }
    }
  }

  const lines = [...percentLines, ...fixedLines]
  const totalTaxesCents = lines.reduce((a, l) => a + l.amountCents, 0)

  return {
    ...base,
    lodgingBaseCents: lodgingBase,
    ancillaryBaseCents: ancillaryBase,
    lines,
    totalTaxesCents,
    totalCents: lodgingBase + ancillaryBase + totalTaxesCents,
    configured: true,
    note: policy.note,
  }
}
