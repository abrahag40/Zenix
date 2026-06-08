/**
 * IFeedSource — Strategy pattern para fuentes de contenido del InsightsFeed.
 *
 * Análogo a §89 IFiscalAdapter y §111 IFxAdapter. Cada source es independiente,
 * fail-soft (un source caído NO bloquea los demás), y aporta items con scoring
 * uniforme que el FeedAggregator usa para ranking.
 *
 * Implementaciones (chunk 1):
 *   · RssHospitalitySource    — RSS gratis: Hospitality Net, PhocusWire, eHotelier.
 *                                Zero-cost, sin keys. Activo desde día 1.
 *   · NewsDataIoSource        — REST API geo-filtrada por country+city. Requiere
 *                                NEWSDATA_API_KEY. Free tier 200 req/día.
 *   · PredictHQEventsSource   — Eventos por lat/lng + radio. Requiere
 *                                PREDICTHQ_TOKEN. Trial 14d.
 *
 * Implementaciones futuras:
 *   · NewsCatcherLocalSource — 31k+ ubicaciones, GeoNames filter.
 *   · CurrentsApiSource       — Filter por country/language.
 *   · StrGlobalRssSource      — Reportes hospitality (suscripción).
 */

export interface PropertyContext {
  /** Slug normalizado de la city (para keyword matching). */
  citySlug: string
  /** Nombre display de la city (para Spanish full-text match). */
  cityName: string
  /** ISO-3166-1 alpha-2. */
  countryCode: string
  /** Lat/lng del hotel (para sources geo-aware como PredictHQ). */
  lat: number | null
  lng: number | null
  /** Radio (km) para "eventos cerca". Default 30. */
  radiusKm?: number
  /** ISO 639-1 — idioma preferido del usuario. Cada source filtra sus feeds
   *  por este código. Default 'es'. Soporta 'es' | 'en' | 'pt' (sistema
   *  Zenix se traduce a esos 3 — owner roadmap 2026-06-07). */
  language: 'es' | 'en' | 'pt'
}

export interface FeedItemRaw {
  /** ID estable cross-fetch (idealmente la URL hashed). */
  id: string
  kind: 'news' | 'event' | 'report' | 'idea'
  title: string
  description: string
  source: string
  /** ISO YYYY-MM-DD. Fecha real de publicación (no string "hace X"). */
  publishedAt: string
  href: string
  /** ISO YYYY-MM-DD. Para eventos futuros, fecha del evento. */
  effectiveDate?: string
  /** Coordenadas del item si las trae el source (geo-scoring). */
  lat?: number
  lng?: number
  /** Texto completo para keyword matching adicional (no se renderea). */
  fullText?: string
}

export interface IFeedSource {
  /** Identificador del source. Persiste en cache key + audit. */
  readonly id: string
  /** Display name del source en la UI ("PredictHQ", "Hospitality Net"). */
  readonly displayName: string
  /** Weight base del source [0..1]. Reuters/STR/PredictHQ alto (0.9+),
   *  RSS genérico bajo (0.5). Multiplica el score final. */
  readonly weight: number
  /** True si la integración está configurada (keys + env). Si false,
   *  fetch() retorna [] sin throw. */
  isConfigured(): boolean
  /** Fetch best-effort. Cualquier error → log + return []. NO throws. */
  fetch(ctx: PropertyContext): Promise<FeedItemRaw[]>
}
