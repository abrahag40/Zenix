/**
 * City search híbrido — Nominatim API + catálogo LATAM local.
 *
 * Estrategia (ordenada por prioridad):
 *   1. Búsqueda local en LATAM_CITIES (instant, sin red). Cubre ~60 ciudades
 *      top + accent-insensitive matching (queretaro → Querétaro).
 *   2. Si el query tiene ≥3 caracteres y no se encontraron suficientes
 *      matches locales, fetch a Nominatim (OpenStreetMap) — gratis, sin
 *      api-key, rate-limited a 1 req/sec.
 *   3. Merge results: locales primero (más relevantes para piloto LATAM),
 *      luego Nominatim (cualquier pueblo/localidad LATAM).
 *
 * Hierarchy País → Estado → Ciudad → Localidad:
 *   Nominatim devuelve `address` con campos jerárquicos:
 *     - country, state, county, city, town, village, hamlet, suburb
 *   Construimos display "Pueblo, Estado · País" para mostrar al consultor.
 *
 * Privacy: 1 fetch per typed query (debounce 250ms en el CityPicker).
 * No PII, no API key required, no billing.
 *
 * Rate limit: Nominatim docs piden max 1 req/sec + User-Agent claro.
 * Para wizard de setup el consultor no excede el rate (typing humano).
 *
 * Failure mode: si Nominatim caído / network error, search degrada
 * gracefully al catálogo local. Cliente siempre puede ingresar texto libre.
 */
import { LATAM_CITIES, type CityRow } from './latam-cities'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_USER_AGENT = 'Zenix PMS / Wizard Activate (contact: soporte@zenix.com)'

/** Resultado unificado — del catálogo o de Nominatim. */
export interface CitySearchResult {
  /** ID estable. Catálogo: 'mx_tulum'. Nominatim: 'osm_<place_id>'. */
  id: string
  name: string
  /** Estado / departamento / provincia. */
  region: string
  /** Localidad sub-region (pueblo, suburb). Vacío si la búsqueda fue ciudad-level. */
  locality?: string
  countryCode: string
  countryDisplay?: string
  lat: number
  lng: number
  timezone?: string
  source: 'local' | 'osm'
  /** Hierarchy display para chips/tooltip: "Pueblo · Estado · País" */
  hierarchyLabel: string
}

// ─── Accent-insensitive matching ──────────────────────────────────────

/** Normaliza string: lowercase + remove accents/diacritics. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function matchesLocal(c: CityRow, normalizedQuery: string): boolean {
  return (
    normalize(c.name).includes(normalizedQuery) ||
    normalize(c.region).includes(normalizedQuery) ||
    c.id.toLowerCase().includes(normalizedQuery)
  )
}

function cityRowToResult(c: CityRow): CitySearchResult {
  return {
    id: c.id,
    name: c.name,
    region: c.region,
    countryCode: c.countryCode,
    lat: c.lat,
    lng: c.lng,
    timezone: c.timezone,
    source: 'local',
    hierarchyLabel: `${c.name} · ${c.region} · ${c.countryCode}`,
  }
}

// ─── Nominatim ────────────────────────────────────────────────────────

interface NominatimResponse {
  place_id: number
  lat: string
  lon: string
  display_name: string
  address?: {
    country?: string
    country_code?: string
    state?: string
    region?: string
    county?: string
    city?: string
    town?: string
    village?: string
    hamlet?: string
    suburb?: string
    municipality?: string
    state_district?: string
  }
  type?: string
}

/** Países LATAM soportados — filtramos resultados Nominatim a esta lista. */
const LATAM_COUNTRY_CODES = new Set([
  'mx', 'co', 'cr', 'pe', 'ar', 'gt', 'pa', 'sv', 'hn', 'br', 'cl', 'ec', 'uy', 'py', 'bo', 've', 'ni', 'do', 'cu', 'pr',
])

async function searchNominatim(
  query: string,
  countryCode?: string,
  signal?: AbortSignal,
): Promise<CitySearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    'accept-language': 'es',
    limit: '10',
  })
  if (countryCode) {
    // Nominatim espera ISO 3166-1 alpha-2 lowercase, comma-separated
    params.set('countrycodes', countryCode.toLowerCase())
  } else {
    // Limita a LATAM si no hay country específico
    params.set('countrycodes', Array.from(LATAM_COUNTRY_CODES).join(','))
  }
  // Tipos relevantes para hotelería: cities, towns, villages, suburbs
  params.set('featuretype', 'settlement')

  const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT,
      Accept: 'application/json',
    },
    signal,
  })
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`)
  }
  const data = (await res.json()) as NominatimResponse[]
  return data
    .filter((r) => {
      const cc = (r.address?.country_code || '').toLowerCase()
      return LATAM_COUNTRY_CODES.has(cc)
    })
    .map((r) => nominatimToResult(r))
}

function nominatimToResult(r: NominatimResponse): CitySearchResult {
  const addr = r.address ?? {}
  // Picks best display name + hierarchy
  const name =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.municipality ||
    r.display_name.split(',')[0]?.trim() ||
    'Unknown'
  const region = addr.state || addr.region || addr.state_district || addr.county || '—'
  const locality =
    addr.suburb && addr.suburb !== name ? addr.suburb : undefined
  const countryDisplay = addr.country || ''
  const countryCode = (addr.country_code || '').toUpperCase()

  // Hierarchy display "Localidad · Ciudad · Estado · País" (skip empty levels)
  const parts: string[] = []
  if (locality) parts.push(locality)
  parts.push(name)
  if (region && region !== '—') parts.push(region)
  if (countryDisplay) parts.push(countryDisplay)
  const hierarchyLabel = parts.join(' · ')

  return {
    id: `osm_${r.place_id}`,
    name,
    region,
    locality,
    countryCode,
    countryDisplay,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    source: 'osm',
    hierarchyLabel,
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Search híbrido: catálogo local + (si necesita) Nominatim.
 *
 * @param query  — texto del usuario (e.g. "queretaro")
 * @param countryCode  — opcional, restringe búsqueda a un país
 * @param signal — AbortSignal para cancelar fetch in-flight si user sigue tecleando
 */
export async function searchCitiesHybrid(
  query: string,
  countryCode?: string,
  signal?: AbortSignal,
): Promise<CitySearchResult[]> {
  const q = query.trim()
  const normalized = normalize(q)

  // (1) Local catalog primero — accent-insensitive
  let localCandidates = LATAM_CITIES
  if (countryCode) {
    localCandidates = localCandidates.filter((c) => c.countryCode === countryCode)
  }
  const localResults = normalized
    ? localCandidates.filter((c) => matchesLocal(c, normalized))
    : localCandidates.slice(0, 10)

  // Empty query → solo top-10 local (no fetch a Nominatim para evitar
  // rate limit accidental en wizard recién abierto).
  if (!normalized) {
    return localResults.map(cityRowToResult)
  }

  // (2) Si hay suficientes locales, no consultamos Nominatim
  if (localResults.length >= 5) {
    return localResults.slice(0, 10).map(cityRowToResult)
  }

  // (3) Fetch Nominatim — fail-soft (si error → solo locales)
  try {
    const nomResults = await searchNominatim(q, countryCode, signal)
    // Dedup: si Nominatim devuelve algo que ya está en local catalog (mismo
    // name + region), preferimos local (más metadata curada: timezone, tags).
    const localKeys = new Set(localResults.map((c) => normalize(c.name + c.region)))
    const filtered = nomResults.filter(
      (r) => !localKeys.has(normalize(r.name + r.region)),
    )
    return [...localResults.map(cityRowToResult), ...filtered].slice(0, 15)
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      // Cancelled — bubble up so caller knows
      throw err
    }
    // Network / Nominatim down — degrade gracefully a catálogo local
    return localResults.map(cityRowToResult)
  }
}

/**
 * Look up resultado por ID. Soporta IDs del catálogo (mx_tulum) y de OSM
 * (osm_12345). Para OSM no podemos resolver post-mortem (no persistimos
 * Nominatim data), retorna null.
 */
export function findCityResultById(id: string): CitySearchResult | null {
  if (id.startsWith('osm_')) return null
  const local = LATAM_CITIES.find((c) => c.id === id)
  return local ? cityRowToResult(local) : null
}
