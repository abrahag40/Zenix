import { Injectable } from '@nestjs/common'
import type {
  FetchRatesInput,
  FetchRatesOutput,
  HotelSearchResult,
  ICompsetAdapter,
} from './compset-adapter.interface'

/**
 * StubCompsetAdapter — implementación determinista para chunk 1 de Fase 3.
 *
 * Devuelve rates pseudo-aleatorios pero estables (basados en hash del competitorId
 * + offset del día) para que la UI tenga algo creíble que pintar mientras el
 * `ScraperDiyCompsetAdapter` Playwright real se construye en chunk 2.
 *
 * No-op para producción — el wireado real usa `getAdapterForProperty` que resuelve
 * vía `LegalEntity.compsetProvider`. Cuando ese campo sea SCRAPER_DIY, el stub se
 * usa hasta que el adapter Playwright esté listo (y el campo será `STUB` durante
 * dev/test). Esta decisión queda documentada para el chunk 2.
 */
@Injectable()
export class StubCompsetAdapter implements ICompsetAdapter {
  readonly source = 'STUB' as const

  async fetchRates(input: FetchRatesInput): Promise<FetchRatesOutput> {
    const ratesByDate: FetchRatesOutput['ratesByDate'] = {}
    const seed = hashString(input.competitorId)
    const from = startOfUtcDay(input.fromDate)
    const to = startOfUtcDay(input.toDate)
    for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10)
      const dayOffset = Math.round((t - from.getTime()) / 86400000)
      // Rate base 110-260 estable por competidor + variación day-of-week
      const base = 110 + (seed % 90)
      const dow = new Date(t).getUTCDay()
      const dowBoost = dow === 5 || dow === 6 ? 30 : 0 // viernes/sábado
      const noise = ((seed >> 3) + dayOffset) % 20
      ratesByDate[iso] = {
        lowestRate: base + dowBoost + noise,
        currency: 'USD',
        availability: dayOffset % 11 !== 0, // simula 1 noche sold-out cada 11
      }
    }
    return {
      ratesByDate,
      ratingSnapshot: {
        starRating: 4 + ((seed >> 5) % 2) * 0.5,
        guestRating: 8 + ((seed >> 7) % 20) / 10,
        reviewCount: 200 + (seed % 800),
      },
      durationMs: 12,
      warnings: ['STUB adapter — datos sintéticos, no representativos del compset real'],
    }
  }

  async searchHotel(query: string, near?: { lat: number; lng: number }): Promise<HotelSearchResult[]> {
    const seed = hashString(query)
    return [
      {
        externalId: `stub-${seed.toString(16)}`,
        externalSource: 'GOOGLE_PLACES',
        externalUrl: null,
        name: `${query} Hotel`,
        address: 'Av. ejemplo 123',
        latitude: (near?.lat ?? 21.2) + 0.01,
        longitude: (near?.lng ?? -86.7) + 0.01,
        starRating: 4 + (seed % 2) * 0.5,
        roomCount: 30 + (seed % 50),
      },
    ]
  }
}

function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}
