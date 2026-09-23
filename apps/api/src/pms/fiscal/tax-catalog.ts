/**
 * Catálogo fiscal nacional — la referencia normativa, como CÓDIGO.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA CERRAR
 *
 * La primera versión resolvía la jurisdicción comparando el NOMBRE DE LA CIUDAD
 * contra un conjunto de once cadenas de Quintana Roo, y le daba IVA 16% a todas.
 * Entre esas once estaba **Chetumal** — cabecera de Othón P. Blanco, que está en
 * la **región fronteriza sur**, donde el IVA es **8%**.
 *
 * O sea: el código estaba mal para una ciudad **del mismo estado que modelaba**.
 * Y el 8% además **caduca**: el decreto vigente se prorrogó sólo hasta el
 * 31-dic-2026. Dos defectos de la misma familia:
 *
 *   · la tasa no depende de la CIUDAD, depende de la JURISDICCIÓN FISCAL
 *   · la tasa no es un número, es **un número con fecha de vigencia**
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL CATÁLOGO ES CÓDIGO Y NO UNA TABLA
 *
 * La configuración fiscal POR PROPIEDAD sí es dato —cada hotel elige su régimen—
 * pero el CATÁLOGO DE LA LEY no lo es: es referencia. Como código obtiene tres
 * cosas que una tabla no da gratis:
 *
 *   1. **Historial auditable.** `git blame` dice quién cambió una tasa, cuándo y
 *      con qué justificación en el mensaje del commit. Un UPDATE no deja eso.
 *   2. **Revisión antes de producción.** Un cambio de tasa pasa por PR. Un
 *      cambio en una tabla lo hace quien tenga la credencial, a las 3 a.m.
 *   3. **Un guardián ejecutable.** `tax-catalog.spec.ts` rechaza una regla sin
 *      fundamento legal, sin URL de la fuente y sin fecha de verificación.
 *
 * El volumen lo permite: son 32 estados, no 32 millones de filas.
 *
 * ANTIPATRÓN EVITADO: *configuración como código para lo que el cliente cambia,
 * base de datos para lo que cambia el legislador.* Está exactamente al revés.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 LA REGLA DE LA CASA: SIN FUENTE PRIMARIA NO SE EMBARCA UNA TASA
 *
 * Al construir esto se intentaron dos estados:
 *
 *   · **Quintana Roo** quedó RESUELTO contra el texto compilado de la ley.
 *   · **Ciudad de México** NO. El art. 164 del Código Fiscal dice 3%, y la
 *     propia ficha de esa fuente apunta a una reforma de 2020 que lo habría
 *     movido a 3.5%. Tres sitios fiscales especializados decían 2.5%, 3.5% y
 *     5% según el supuesto. **No se embarca ninguno.**
 *
 * Un estado sin verificar aparece aquí con `estado: 'SIN_VERIFICAR'` y con la
 * lista de lo que falta. El motor entonces **se niega a publicar un total** en
 * esa jurisdicción, en vez de publicar uno plausible. Es la misma decisión que
 * en el resto del producto: un número ausente se nota y se pregunta; un número
 * inventado se publica y nadie se entera.
 */
import type { TaxRule } from './tax-calculator'

/** Tipo de establecimiento, en vocabulario de Zenix. Cada ley lo mapea al suyo. */
export type LodgingKind = 'HOTEL' | 'PRIVATE_RENTAL'

/** Dónde vive el impuesto en el CFDI 4.0. NO es cosmético: son nodos distintos. */
export type CfdiNode =
  /** Nodo `Impuestos` estándar — federales (IVA, IEPS). */
  | 'IMPUESTOS'
  /** **Complemento de Impuestos Locales** — estatales y municipales, como el ISH. */
  | 'IMPUESTOS_LOCALES'

export interface Provenance {
  /** Cita normativa exacta: ley, artículo y fecha de la reforma vigente. */
  legalBasis: string
  /** De dónde se leyó el texto. Fuente PRIMARIA; un blog no califica. */
  sourceUrl: string
  /** Cuándo se verificó por última vez, en ISO. */
  verifiedOn: string
}

export interface CatalogRule {
  rule: TaxRule
  scope: 'FEDERAL' | 'STATE' | 'MUNICIPAL'
  cfdiNode: CfdiNode
  cfdiKind: 'TRASLADO' | 'RETENCION'
  /** A qué tipos de establecimiento aplica esta regla. */
  lodgingKinds: LodgingKind[]
  /** Desde cuándo rige, inclusive. ISO `YYYY-MM-DD`. */
  validFrom: string
  /** Hasta cuándo rige, inclusive. `null` = sin fecha de término conocida. */
  validUntil: string | null
  /**
   * Si está presente, la regla **sólo aplica cuando la propiedad declara esta
   * opción**. No es geografía: el estímulo fronterizo exige un aviso ante el
   * SAT, así que dos hoteles de la misma calle pueden tener tasas distintas.
   */
  requiresOptIn?: string
  /** Si está presente, la regla sólo aplica en estos municipios (nombre INEGI). */
  onlyInMunicipalities?: string[]
  /** Si está presente, la regla NO aplica en estos municipios. */
  exceptInMunicipalities?: string[]
  provenance: Provenance
}

export interface JurisdictionEntry {
  /** ISO 3166-2 sin el prefijo de país: 'ROO', 'CMX', 'JAL'… */
  stateCode: string
  stateName: string
  estado: 'VERIFICADO' | 'SIN_VERIFICAR'
  rules: CatalogRule[]
  /** Qué falta por verificar. Obligatorio si `estado === 'SIN_VERIFICAR'`. */
  pendiente?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// FEDERAL
// ═══════════════════════════════════════════════════════════════════════════

const IVA_GENERAL: CatalogRule = {
  rule: {
    code: 'IVA',
    label: 'IVA (federal)',
    kind: 'PERCENT_OF_BASE',
    rateBp: 1600,
    appliesTo: 'LODGING_AND_ANCILLARY',
  },
  scope: 'FEDERAL',
  cfdiNode: 'IMPUESTOS',
  cfdiKind: 'TRASLADO',
  lodgingKinds: ['HOTEL', 'PRIVATE_RENTAL'],
  validFrom: '2014-01-01',
  validUntil: null,
  provenance: {
    legalBasis: 'Ley del Impuesto al Valor Agregado, art. 1 fr. II (prestación de servicios), tasa general 16%',
    sourceUrl: 'https://www.diputados.gob.mx/LeyesBiblio/ref/liva.htm',
    verifiedOn: '2026-09-23',
  },
}

/**
 * 🔴 IVA al 8% en región fronteriza. Tres cosas que lo hacen peligroso:
 *
 *   1. **No es automático por ubicación.** Exige aviso ante el SAT para aplicar
 *      el estímulo → `requiresOptIn`. Dos hoteles vecinos pueden diferir.
 *   2. **Caduca.** La prórroga publicada en el DOF el 31-dic-2025 acotó la
 *      vigencia al ejercicio 2026. El 1-ene-2027 vuelve al 16% salvo nueva
 *      prórroga — y el sistema debe hacerlo SOLO, no esperar a que alguien se
 *      acuerde.
 *   3. **Rompe la intuición de «un estado, una tasa»:** Othón P. Blanco está en
 *      Quintana Roo y está en la región fronteriza sur.
 */
const IVA_FRONTERIZO_SUR = (municipios: string[]): CatalogRule => ({
  rule: {
    code: 'IVA',
    label: 'IVA (estímulo región fronteriza sur)',
    kind: 'PERCENT_OF_BASE',
    rateBp: 800,
    appliesTo: 'LODGING_AND_ANCILLARY',
  },
  scope: 'FEDERAL',
  cfdiNode: 'IMPUESTOS',
  cfdiKind: 'TRASLADO',
  lodgingKinds: ['HOTEL', 'PRIVATE_RENTAL'],
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  requiresOptIn: 'IVA_REGION_FRONTERIZA_SUR',
  onlyInMunicipalities: municipios,
  provenance: {
    legalBasis:
      'Decreto de estímulos fiscales región fronteriza sur; prórroga publicada en el DOF el 31-dic-2025, acotada al ejercicio 2026. Crédito equivalente al 50% de la tasa del IVA.',
    sourceUrl: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5777697&fecha=31/12/2025',
    verifiedOn: '2026-09-23',
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// ESTATAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ISH Quintana Roo — Ley del Impuesto al Hospedaje del Estado de Quintana Roo,
 * art. 8, texto compilado con última reforma POE 16-dic-2025 (Decreto 189):
 *
 *   «El impuesto se calculará aplicando la tasa del 5% sobre el valor de
 *    facturación y/o contratación de los servicios a que se refieren los
 *    artículos 4 y 9 de esta Ley.
 *    Tratándose de los supuestos contemplados en la fracción V del artículo 4
 *    [...] calculará el impuesto aplicando la tasa del 6%.»
 *
 * Art. 4 fr. I = hoteles, moteles, mesones, posadas, hosterías.
 * Art. 4 fr. V = departamento, casas y villas particulares.
 *
 * Base: art. 4 — «solo se considerará el albergue **sin incluir a los alimentos
 * y demás servicios**». De ahí `appliesTo: 'LODGING_ONLY'`.
 */
const ISH_ROO_HOTEL: CatalogRule = {
  rule: {
    code: 'ISH',
    label: 'Impuesto al Hospedaje (Quintana Roo)',
    kind: 'PERCENT_OF_BASE',
    rateBp: 500,
    appliesTo: 'LODGING_ONLY',
  },
  scope: 'STATE',
  cfdiNode: 'IMPUESTOS_LOCALES',
  cfdiKind: 'TRASLADO',
  lodgingKinds: ['HOTEL'],
  validFrom: '2023-01-01',
  validUntil: null,
  provenance: {
    legalBasis:
      'Ley del Impuesto al Hospedaje del Estado de Quintana Roo, art. 8 ¶1 (5%); art. 4 fr. I. Texto compilado, última reforma POE 16-dic-2025 (Decreto 189); el art. 8 fue reformado POE 23-dic-2022.',
    sourceUrl: 'https://www.congresoqroo.gob.mx/leyes/187/',
    verifiedOn: '2026-09-23',
  },
}

const ISH_ROO_PARTICULAR: CatalogRule = {
  ...ISH_ROO_HOTEL,
  // Escrito completo y no con *spread*: `TaxRule` es una unión discriminada y
  // extender una variante con `...` deja al compilador sin saber cuál es.
  rule: {
    code: 'ISH',
    label: 'Impuesto al Hospedaje (Quintana Roo, art. 4 fr. V)',
    kind: 'PERCENT_OF_BASE',
    rateBp: 600,
    appliesTo: 'LODGING_ONLY',
  },
  lodgingKinds: ['PRIVATE_RENTAL'],
  provenance: {
    ...ISH_ROO_HOTEL.provenance,
    legalBasis:
      'Ley del Impuesto al Hospedaje del Estado de Quintana Roo, art. 8 ¶2 (6%) para los supuestos de la fr. V del art. 4 — «departamento, casas y villas particulares». NO es la tasa de las plataformas digitales: el canal no mueve la tasa.',
  },
}

/** Municipios de Quintana Roo dentro de la región fronteriza sur. */
const ROO_FRONTERA_SUR = ['othón p. blanco']

// ═══════════════════════════════════════════════════════════════════════════
// EL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

const SIN_VERIFICAR = (stateCode: string, stateName: string, pendiente: string): JurisdictionEntry => ({
  stateCode,
  stateName,
  estado: 'SIN_VERIFICAR',
  // El IVA federal SÍ está verificado y aplica en todo el país: se publica.
  // Lo que falta es el impuesto estatal de hospedaje.
  rules: [IVA_GENERAL],
  pendiente,
})

const PENDIENTE_GENERICO =
  'Falta leer la ley estatal de hospedaje (o el código fiscal local) en su texto compilado vigente y registrar tasa, base, supuestos por tipo de establecimiento y régimen de retención por plataformas.'

export const CATALOGO_MX: JurisdictionEntry[] = [
  {
    stateCode: 'ROO',
    stateName: 'Quintana Roo',
    estado: 'VERIFICADO',
    rules: [
      IVA_GENERAL,
      IVA_FRONTERIZO_SUR(ROO_FRONTERA_SUR),
      ISH_ROO_HOTEL,
      ISH_ROO_PARTICULAR,
      // 🔴 DSA (Derecho de Saneamiento Ambiental) NO va aquí: es municipal y
      // sólo hay fuente secundaria. El motor sabe expresarlo
      // (`FIXED_PER_PERSON_NIGHT` sobre la UMA) y la advertencia viaja en la
      // nota de la jurisdicción. Entra el día que se lea la Ley de Hacienda
      // del municipio.
    ],
  },
  {
    stateCode: 'CMX',
    stateName: 'Ciudad de México',
    estado: 'SIN_VERIFICAR',
    rules: [IVA_GENERAL],
    pendiente:
      '🔴 CONTRADICCIÓN ABIERTA. El art. 164 del Código Fiscal de la CDMX dice 3%, y la propia ficha de esa fuente apunta a una reforma del 20-dic-2020 que lo habría movido a 3.5%. Tres sitios fiscales especializados reportan 2.5%, 3.5% y 5% según el supuesto. Hay que leer el texto en la Gaceta Oficial antes de publicar cualquier cifra. Además, el art. 162 bis obliga a las plataformas a inscribirse en un padrón — régimen de retención propio, distinto al de Quintana Roo.',
  },
  SIN_VERIFICAR('AGU', 'Aguascalientes', PENDIENTE_GENERICO),
  SIN_VERIFICAR('BCN', 'Baja California', `${PENDIENTE_GENERICO} Además: municipios en región fronteriza NORTE — falta la lista oficial para el IVA al 8%.`),
  SIN_VERIFICAR('BCS', 'Baja California Sur', PENDIENTE_GENERICO),
  SIN_VERIFICAR('CAM', 'Campeche', `${PENDIENTE_GENERICO} Calakmul y Candelaria están en región fronteriza sur.`),
  SIN_VERIFICAR('CHP', 'Chiapas', `${PENDIENTE_GENERICO} 19 municipios en región fronteriza sur.`),
  SIN_VERIFICAR('CHH', 'Chihuahua', `${PENDIENTE_GENERICO} Municipios en región fronteriza norte.`),
  SIN_VERIFICAR('COA', 'Coahuila', `${PENDIENTE_GENERICO} Municipios en región fronteriza norte.`),
  SIN_VERIFICAR('COL', 'Colima', PENDIENTE_GENERICO),
  SIN_VERIFICAR('DUR', 'Durango', PENDIENTE_GENERICO),
  SIN_VERIFICAR('GUA', 'Guanajuato', PENDIENTE_GENERICO),
  SIN_VERIFICAR('GRO', 'Guerrero', PENDIENTE_GENERICO),
  SIN_VERIFICAR('HID', 'Hidalgo', PENDIENTE_GENERICO),
  SIN_VERIFICAR('JAL', 'Jalisco', PENDIENTE_GENERICO),
  SIN_VERIFICAR('MEX', 'Estado de México', PENDIENTE_GENERICO),
  SIN_VERIFICAR('MIC', 'Michoacán', PENDIENTE_GENERICO),
  SIN_VERIFICAR('MOR', 'Morelos', PENDIENTE_GENERICO),
  SIN_VERIFICAR('NAY', 'Nayarit', PENDIENTE_GENERICO),
  SIN_VERIFICAR('NLE', 'Nuevo León', `${PENDIENTE_GENERICO} Municipios en región fronteriza norte.`),
  SIN_VERIFICAR('OAX', 'Oaxaca', PENDIENTE_GENERICO),
  SIN_VERIFICAR('PUE', 'Puebla', PENDIENTE_GENERICO),
  SIN_VERIFICAR('QUE', 'Querétaro', PENDIENTE_GENERICO),
  SIN_VERIFICAR('SLP', 'San Luis Potosí', PENDIENTE_GENERICO),
  SIN_VERIFICAR('SIN', 'Sinaloa', PENDIENTE_GENERICO),
  SIN_VERIFICAR('SON', 'Sonora', `${PENDIENTE_GENERICO} Municipios en región fronteriza norte.`),
  SIN_VERIFICAR('TAB', 'Tabasco', `${PENDIENTE_GENERICO} Balancán y Tenosique están en región fronteriza sur.`),
  SIN_VERIFICAR('TAM', 'Tamaulipas', `${PENDIENTE_GENERICO} Municipios en región fronteriza norte.`),
  SIN_VERIFICAR('TLA', 'Tlaxcala', PENDIENTE_GENERICO),
  SIN_VERIFICAR('VER', 'Veracruz', PENDIENTE_GENERICO),
  SIN_VERIFICAR('YUC', 'Yucatán', PENDIENTE_GENERICO),
  SIN_VERIFICAR('ZAC', 'Zacatecas', PENDIENTE_GENERICO),
]

export const CATALOGO_POR_ESTADO = new Map(CATALOGO_MX.map((j) => [j.stateCode, j]))
