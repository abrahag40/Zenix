import { Injectable, Logger } from '@nestjs/common'
import type { HotelSearchResult } from './compset-adapter.interface'

/**
 * GooglePlacesService — busca hoteles reales con la Places API (New) de Google.
 *
 * Endpoint: POST https://places.googleapis.com/v1/places:searchText
 * Auth: X-Goog-Api-Key header (NUNCA exponer al frontend).
 * Field mask: pedimos solo los campos que usa el UI para minimizar costo
 * ($0.032/req SKU Text Search vs $0.017 si solo "ids" — vale la pena por UX).
 *
 * Owner kickoff doc 2026-05-22 confirma activación Google Cloud empresarial
 * como parte de v1.0.0 — esta service es el primer consumer. Fail-soft total:
 * sin `GOOGLE_PLACES_API_KEY` → retorna [] (el caller cae al stub adapter).
 *
 * Filtro `includedType=lodging` restringe a hoteles/hostales/B&B (oficial Google).
 * `locationBias` con `circle: {center, radius}` prioriza resultados cerca de la
 * propiedad — si el supervisor está en Tulum no muestra hoteles de CDMX.
 *
 * Quota free tier (Map Tier 1): 10k consultas / mes. Caching deferido a v1.0.1
 * (LRU 24h por query+near key) — para piloto el volumen es bajo (~10 búsquedas
 * por nuevo cliente al setup, ~0 después).
 */
@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name)
  private readonly apiKey: string | null

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || null
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY no configurada — searchHotel cae al stub adapter.')
    }
  }

  /** True si la integración está habilitada (env key configurada). */
  isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Busca hoteles por nombre + opcional sesgo geográfico.
   * Retorna max 8 resultados (suficiente para autocomplete UX, evita cognitive overload).
   * Fail-soft: cualquier error de red/Google retorna []  (caller decide fallback).
   */
  async searchHotel(query: string, near?: { lat: number; lng: number; radiusKm?: number }): Promise<HotelSearchResult[]> {
    if (!this.apiKey) return []
    const body: Record<string, unknown> = {
      textQuery: query,
      includedType: 'lodging',
      maxResultCount: 8,
      languageCode: 'es',
    }
    if (near) {
      const radiusMeters = Math.min(50_000, Math.max(1_000, (near.radiusKm ?? 30) * 1000))
      body.locationBias = {
        circle: {
          center: { latitude: near.lat, longitude: near.lng },
          radius: radiusMeters,
        },
      }
    }

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.location',
            'places.rating',
            'places.userRatingCount',
            'places.googleMapsUri',
            'places.types',
          ].join(','),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        this.logger.warn(`Google Places HTTP ${res.status}: ${text.slice(0, 200)}`)
        return []
      }
      const json = (await res.json()) as GooglePlacesResponse
      const places = json.places ?? []
      return places
        .filter((p) => p.location?.latitude != null && p.location?.longitude != null)
        .map((p): HotelSearchResult => ({
          externalId: p.id,
          externalSource: 'GOOGLE_PLACES',
          externalUrl: p.googleMapsUri ?? null,
          name: p.displayName?.text ?? 'Sin nombre',
          address: p.formattedAddress ?? null,
          latitude: p.location!.latitude,
          longitude: p.location!.longitude,
          starRating: null, // Google rating es de huéspedes (0-5), NO estrellas hoteleras — no mezclar
          roomCount: null,  // Places API New no expone room count
        }))
    } catch (e) {
      this.logger.warn(`Google Places error: ${(e as Error).message}`)
      return []
    }
  }
}

interface GooglePlacesResponse {
  places?: Array<{
    id: string
    displayName?: { text: string; languageCode?: string }
    formattedAddress?: string
    location?: { latitude: number; longitude: number }
    rating?: number
    userRatingCount?: number
    googleMapsUri?: string
    types?: string[]
  }>
}
