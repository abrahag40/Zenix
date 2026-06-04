/**
 * ICompsetAdapter — Strategy pattern para fuente de datos del compset (D-COMPSET1).
 *
 * Implementaciones:
 *   · ScraperDiyCompsetAdapter (MVP)   — Playwright pool, 3-7 hoteles seleccionados,
 *                                        rate limit < 1 req/min/hotel, user-agent
 *                                        declarado, fail-soft per hotel. Chunk 2.
 *   · StubCompsetAdapter (chunk 1)     — devuelve datos deterministas mock; sirve
 *                                        para wirear endpoints + UI sin Playwright.
 *   · LighthouseCompsetAdapter (v1.1.x)— OTA Insight Lighthouse REST API (DLC partnership).
 *   · RategainCompsetAdapter (futuro)  — enterprise.
 *
 * Selección per LegalEntity vía `LegalEntity.compsetProvider`. Swap sin cambio
 * de código de runtime (analog §89 IFiscalAdapter).
 */
export interface ICompsetAdapter {
  /** Identificador del source. Se persiste en CompsetSnapshot.source. */
  readonly source: 'SCRAPER_DIY' | 'LIGHTHOUSE' | 'RATEGAIN' | 'STUB'

  /**
   * Trae rates por noche futura para un competidor. Fail-soft: si el hotel no
   * responde o el rate está oculto, retorna `null` (el caller decide el comportamiento).
   * Retorna warnings no-fatales en `warnings[]` (p.ej. "Only 7 days fetched of 14").
   */
  fetchRates(input: FetchRatesInput): Promise<FetchRatesOutput>

  /**
   * Search un hotel por nombre / location (Google Places / Booking Affiliate). Usado
   * por la UI Settings → Compset cuando el supervisor agrega un competidor manualmente.
   */
  searchHotel(query: string, near?: { lat: number; lng: number }): Promise<HotelSearchResult[]>
}

export interface FetchRatesInput {
  competitorId: string
  externalId: string | null
  externalSource: string | null
  externalUrl: string | null
  fromDate: Date
  toDate: Date
}

export interface FetchRatesOutput {
  /** Map ISO date "YYYY-MM-DD" → { lowestRate, currency, availability }. null si no se pudo leer. */
  ratesByDate: Record<string, { lowestRate: number | null; currency: string; availability: boolean } | null>
  ratingSnapshot: { starRating: number | null; guestRating: number | null; reviewCount: number | null } | null
  durationMs: number
  warnings: string[]
}

export interface HotelSearchResult {
  externalId: string
  externalSource: string // BOOKING | EXPEDIA | GOOGLE_PLACES
  externalUrl: string | null
  name: string
  address: string | null
  latitude: number
  longitude: number
  starRating: number | null
  roomCount: number | null
}
