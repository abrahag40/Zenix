/**
 * Catálogo de políticas fiscales. DATOS, no lógica.
 *
 * Cada entrada cita su fuente. La regla de la casa: si no hay fuente primaria
 * verificada, la política se queda con `rules: []` y una nota — nunca con una
 * cifra plausible. Un total ausente se nota y se pregunta; un total inventado
 * se publica y nadie se entera hasta que un huésped lo revisa.
 */
import type { FiscalPolicy, TaxRule } from './tax-calculator'

/** Tipo de establecimiento según el art. 4 de la Ley del ISH de Quintana Roo. */
export type LodgingKind =
  /** Art. 4 fr. I — hoteles, moteles, mesones, posadas, hosterías. */
  | 'HOTEL'
  /** Art. 4 fr. V — departamento, casas y villas particulares. */
  | 'PRIVATE_RENTAL'

/** Ley del IVA, art. 1. Federal, aplica a hospedaje y a servicios. */
const IVA_MX: TaxRule = {
  code: 'IVA',
  label: 'IVA (federal)',
  kind: 'PERCENT_OF_BASE',
  rateBp: 1600,
  appliesTo: 'LODGING_AND_ANCILLARY',
}

/**
 * ISH Quintana Roo. Ley del Impuesto al Hospedaje del Estado de Quintana Roo,
 * art. 8, texto vigente tras la reforma POE 16-dic-2025 (Decreto 189).
 * Grava SÓLO el albergue: art. 4, «sin incluir a los alimentos y demás
 * servicios».
 */
const ISH_QR = (kind: LodgingKind): TaxRule => ({
  code: 'ISH',
  label: 'Impuesto al Hospedaje (Quintana Roo)',
  kind: 'PERCENT_OF_BASE',
  // 🔴 5% para hoteles (art. 8 ¶1) · 6% SÓLO para los supuestos de la fr. V
  // del art. 4, que son casas y villas particulares (art. 8 ¶2).
  // El canal de venta NO mueve esta tasa.
  rateBp: kind === 'PRIVATE_RENTAL' ? 600 : 500,
  appliesTo: 'LODGING_ONLY',
})

const CIUDADES_QR = new Set([
  'cancun', 'cancún', 'playa del carmen', 'tulum', 'cozumel', 'chetumal',
  'bacalar', 'holbox', 'akumal', 'puerto morelos', 'isla mujeres',
])

const NOMBRE_PAIS: Record<string, string> = {
  MX: 'México', CO: 'Colombia', PE: 'Perú', CR: 'Costa Rica', PA: 'Panamá',
  GT: 'Guatemala', DO: 'República Dominicana', EC: 'Ecuador', SV: 'El Salvador',
  HN: 'Honduras',
}

const normaliza = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

export interface ResolvePolicyInput {
  countryCode: string
  city: string | null
  lodgingKind: LodgingKind
}

/**
 * 🔴 DSA — Derecho de Saneamiento Ambiental (municipal, Quintana Roo).
 *
 * El motor SABE expresarlo: es `FIXED_PER_PERSON_NIGHT` sobre la UMA, y en
 * Tulum la prensa especializada reporta el patrón 30/20/15/10% de la UMA para
 * el 1.º, 2.º, 3.º y 4.º ocupante (UMA 2026 = MXN 117.31 → ≈ MXN 35 el
 * primero). **Pero eso es fuente secundaria.** La Ley de Hacienda del
 * municipio de Tulum no está verificada, y tampoco qué pasa a partir del
 * quinto ocupante.
 *
 * Mientras no haya fuente primaria, el DSA NO entra en el cálculo y se dice
 * en la nota. Cuando se confirme, esto se vuelve una constante y nada más:
 *
 *   { code: 'DSA', label: 'Derecho de Saneamiento Ambiental',
 *     kind: 'FIXED_PER_PERSON_NIGHT', unitCents: 11731,
 *     scaleBpByOccupant: [3000, 2000, 1500, 1000], beyondScale: 'UNSUPPORTED' }
 */
const NOTA_DSA =
  'No incluye el Derecho de Saneamiento Ambiental (DSA), municipal y por persona/noche: ' +
  'pendiente de confirmar contra la Ley de Hacienda municipal. Si el hotel lo cobra en ' +
  'recepción, el total publicado no es el total que paga el huésped.'

export function resolveFiscalPolicy(input: ResolvePolicyInput): FiscalPolicy {
  const country = (input.countryCode || 'MX').toUpperCase()
  const city = input.city
  const jurisdictionBase = {
    country,
    countryName: NOMBRE_PAIS[country] ?? country,
    city,
  }

  if (country !== 'MX') {
    return {
      jurisdiction: { ...jurisdictionBase, state: null, stateName: null },
      rules: [],
      note: `Régimen fiscal de ${NOMBRE_PAIS[country] ?? country} sin configurar. No se publica un total con impuestos hasta cargarlo.`,
    }
  }

  if (CIUDADES_QR.has(normaliza(city))) {
    return {
      jurisdiction: { ...jurisdictionBase, state: 'QR', stateName: 'Quintana Roo' },
      rules: [IVA_MX, ISH_QR(input.lodgingKind)],
      legalBasis:
        'LIVA art. 1 · Ley del Impuesto al Hospedaje de Quintana Roo art. 8 (POE 16-dic-2025)',
      note: NOTA_DSA,
    }
  }

  // Resto de México: el IVA es federal y no admite duda. El ISH existe en los
  // 32 estados con tasas distintas, y ninguna está verificada aquí. Se publica
  // el IVA y se DICE que falta el estatal, en lugar de callarlo.
  return {
    jurisdiction: { ...jurisdictionBase, state: null, stateName: null },
    rules: [IVA_MX],
    legalBasis: 'LIVA art. 1',
    note: `Falta el Impuesto Sobre Hospedaje estatal de ${city ?? 'esta jurisdicción'}: sin verificar contra la ley local. El total mostrado está incompleto.`,
  }
}
