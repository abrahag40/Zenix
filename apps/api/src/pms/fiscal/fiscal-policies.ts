/**
 * Resolución de la política fiscal aplicable — la capa que traduce
 * «esta propiedad, esta fecha» en «estas reglas».
 *
 * Tres dimensiones que la versión anterior no tenía, y que son exactamente las
 * que rompen un producto nacional:
 *
 *   1. **JURISDICCIÓN, no ciudad.** Antes se comparaba el nombre de la ciudad
 *      contra un conjunto de cadenas. «Tulum» existe en Quintana Roo, pero
 *      «Morelos» existe en nueve estados y el municipio manda para el estímulo
 *      fronterizo. Ahora la entrada es el **código ISO 3166-2 del estado** más
 *      el municipio.
 *
 *   2. **FECHA.** Una tasa es un número CON VIGENCIA. El estímulo de IVA al 8%
 *      caduca el 31-dic-2026; las leyes de ingresos estatales se reforman cada
 *      diciembre. Cotizar una estancia de enero con la tasa de hoy es publicar
 *      un precio que no será el precio.
 *
 *   3. **RÉGIMEN DE LA PROPIEDAD.** El estímulo fronterizo exige aviso ante el
 *      SAT: no lo da la geografía, lo da el contribuyente. Dos hoteles de la
 *      misma calle pueden tener IVA distinto, y eso NO es un error de datos.
 *
 * ANTIPATRÓN EVITADO: *geocodificación como sustituto de la configuración
 * fiscal.* La ubicación acota las opciones; no decide.
 */
import type { FiscalPolicy, TaxRule } from './tax-calculator'
import {
  CATALOGO_POR_ESTADO,
  type CatalogRule,
  type JurisdictionEntry,
  type LodgingKind,
} from './tax-catalog'

export type { LodgingKind } from './tax-catalog'

export interface FiscalProfile {
  countryCode: string
  /** ISO 3166-2 sin prefijo: 'ROO', 'CMX'… */
  stateCode: string | null
  /** Nombre del municipio según INEGI. Decide el estímulo fronterizo. */
  municipality: string | null
  /** Sólo para mostrar; ya no decide nada. */
  city?: string | null
  lodgingKind: LodgingKind
  /** Regímenes que la propiedad declara tener dados de alta ante la autoridad. */
  optIns?: string[]
  /** Fecha en que se aplica la tarifa. Por defecto, hoy. */
  on?: Date
}

export interface ResolvedPolicy extends FiscalPolicy {
  /** true = la jurisdicción quedó verificada contra fuente primaria. */
  verified: boolean
  /** true = el estado se DEDUJO del nombre de la ciudad. Señal de configuración incompleta. */
  inferred: boolean
  /** Reglas que existen en el catálogo pero NO aplicaron, y por qué. */
  descartadas: Array<{ code: string; motivo: string }>
}

const normaliza = (s: string | null | undefined): string =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const NOMBRE_PAIS: Record<string, string> = {
  MX: 'México', CO: 'Colombia', PE: 'Perú', CR: 'Costa Rica', PA: 'Panamá',
  GT: 'Guatemala', DO: 'República Dominicana', EC: 'Ecuador', SV: 'El Salvador',
  HN: 'Honduras',
}

/**
 * Deducción de emergencia: de qué estado es una ciudad. Existe SÓLO para que
 * las propiedades ya dadas de alta sigan funcionando mientras se les carga el
 * `stateCode`. Marca el resultado como `inferred` para que se vea.
 *
 * 🔴 No se amplía esta tabla. Si hace falta otra ciudad, lo que hace falta es
 * configurar la propiedad.
 */
const CIUDAD_A_ESTADO: Record<string, string> = {
  cancun: 'ROO', 'playa del carmen': 'ROO', tulum: 'ROO', cozumel: 'ROO',
  chetumal: 'ROO', bacalar: 'ROO', holbox: 'ROO', akumal: 'ROO',
  'puerto morelos': 'ROO', 'isla mujeres': 'ROO',
}

/** Municipio deducido de la ciudad, sólo donde cabecera y municipio difieren. */
const CIUDAD_A_MUNICIPIO: Record<string, string> = {
  chetumal: 'Othón P. Blanco',
}

const enVigencia = (r: CatalogRule, on: Date): boolean => {
  const dia = on.toISOString().slice(0, 10)
  if (dia < r.validFrom) return false
  if (r.validUntil && dia > r.validUntil) return false
  return true
}

/**
 * De entre varias reglas con el mismo `code`, gana la MÁS ESPECÍFICA.
 * Especificidad = exige opción declarada (2) + está acotada a municipios (1).
 * Así el estímulo fronterizo le gana al IVA general sin necesidad de ordenar el
 * catálogo a mano — y si mañana entra otra excepción, el orden no importa.
 */
const especificidad = (r: CatalogRule): number =>
  (r.requiresOptIn ? 2 : 0) + (r.onlyInMunicipalities ? 1 : 0)

export function resolveFiscalPolicyForProfile(profile: FiscalProfile): ResolvedPolicy {
  const country = (profile.countryCode || 'MX').toUpperCase()
  const on = profile.on ?? new Date()
  const optIns = new Set(profile.optIns ?? [])
  const descartadas: Array<{ code: string; motivo: string }> = []

  let inferred = false
  let stateCode = profile.stateCode?.toUpperCase() ?? null
  let municipality = profile.municipality

  if (!stateCode && country === 'MX') {
    const c = normaliza(profile.city)
    if (CIUDAD_A_ESTADO[c]) {
      stateCode = CIUDAD_A_ESTADO[c]
      municipality = municipality ?? CIUDAD_A_MUNICIPIO[c] ?? profile.city ?? null
      inferred = true
    }
  }

  const jurisdiction = {
    country,
    countryName: NOMBRE_PAIS[country] ?? country,
    state: stateCode,
    stateName: null as string | null,
    city: profile.city ?? municipality ?? null,
  }

  if (country !== 'MX') {
    return {
      jurisdiction,
      rules: [],
      verified: false,
      inferred,
      descartadas,
      note: `Régimen fiscal de ${NOMBRE_PAIS[country] ?? country} sin cargar. No se publica un total con impuestos hasta verificarlo contra la ley de ese país.`,
    }
  }

  const entrada: JurisdictionEntry | undefined = stateCode
    ? CATALOGO_POR_ESTADO.get(stateCode)
    : undefined

  if (!entrada) {
    return {
      jurisdiction,
      rules: [],
      verified: false,
      inferred,
      descartadas,
      note: stateCode
        ? `El estado ${stateCode} no está en el catálogo fiscal.`
        : 'La propiedad no tiene estado fiscal configurado y no se pudo deducir de la ciudad. Sin jurisdicción no hay total: configúralo antes de publicar precios.',
    }
  }

  jurisdiction.stateName = entrada.stateName

  // ── Filtrado: vigencia, tipo de establecimiento, municipio, opción declarada
  const muni = normaliza(municipality)
  const aplicables: CatalogRule[] = []
  for (const r of entrada.rules) {
    if (!enVigencia(r, on)) {
      descartadas.push({ code: r.rule.code, motivo: `fuera de vigencia (${r.validFrom} → ${r.validUntil ?? 'sin término'})` })
      continue
    }
    if (!r.lodgingKinds.includes(profile.lodgingKind)) continue
    if (r.onlyInMunicipalities && !r.onlyInMunicipalities.map(normaliza).includes(muni)) continue
    if (r.exceptInMunicipalities && r.exceptInMunicipalities.map(normaliza).includes(muni)) continue
    if (r.requiresOptIn && !optIns.has(r.requiresOptIn)) {
      descartadas.push({ code: r.rule.code, motivo: `la propiedad no declara «${r.requiresOptIn}»` })
      continue
    }
    aplicables.push(r)
  }

  // ── Una sola regla por código: gana la más específica ──────────────────────
  const porCodigo = new Map<string, CatalogRule>()
  for (const r of aplicables) {
    const previa = porCodigo.get(r.rule.code)
    if (!previa || especificidad(r) > especificidad(previa)) porCodigo.set(r.rule.code, r)
  }

  const elegidas = [...porCodigo.values()]
  const rules: TaxRule[] = elegidas.map((r) => r.rule)

  const notas: string[] = []
  if (entrada.estado === 'SIN_VERIFICAR') {
    notas.push(`🔴 ${entrada.stateName}: impuesto estatal de hospedaje SIN VERIFICAR. ${entrada.pendiente ?? ''}`.trim())
  }
  if (inferred) {
    notas.push(
      'El estado fiscal se dedujo del nombre de la ciudad porque la propiedad no lo tiene configurado. Cárgalo: la deducción no cubre todos los municipios.',
    )
  }
  if (stateCode === 'ROO') {
    notas.push(
      'No incluye el Derecho de Saneamiento Ambiental (DSA), municipal y por persona/noche: pendiente de confirmar contra la Ley de Hacienda municipal.',
    )
  }

  return {
    jurisdiction,
    rules,
    verified: entrada.estado === 'VERIFICADO',
    inferred,
    descartadas,
    legalBasis: elegidas.map((r) => r.provenance.legalBasis).join(' · ') || undefined,
    note: notas.length ? notas.join(' ') : undefined,
  }
}

/**
 * Firma antigua, conservada para los llamadores que aún no pasan el perfil
 * completo. Delega y marca `inferred`. *Patrón: strangler fig* — la ruta nueva
 * existe, la vieja sigue viva, y el resultado dice cuál se usó.
 */
export function resolveFiscalPolicy(input: {
  countryCode: string
  city: string | null
  lodgingKind: LodgingKind
}): ResolvedPolicy {
  return resolveFiscalPolicyForProfile({
    countryCode: input.countryCode,
    stateCode: null,
    municipality: null,
    city: input.city,
    lodgingKind: input.lodgingKind,
  })
}
