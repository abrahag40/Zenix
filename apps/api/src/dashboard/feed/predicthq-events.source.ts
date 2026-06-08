import { Injectable, Logger } from '@nestjs/common'
import type { FeedItemRaw, IFeedSource, PropertyContext } from './feed-source.interface'

/**
 * PredictHQEventsSource — eventos por lat/lng + radio.
 *
 * Endpoint: GET https://api.predicthq.com/v1/events
 *   ?within={radius}km@{lat},{lng}
 *   &category=concerts,festivals,conferences,expos
 *   &active.gte=NOW&active.lte=NOW+90d
 *
 * Auth: Bearer token (PREDICTHQ_TOKEN env). Trial 14 días con local_rank.
 *
 * Patterns documentados §111-§115 + MARKET-INTEL-PRO plan. Estos eventos son
 * los más valiosos para hotelería — alimentan tanto el InsightsFeed visible
 * como el DemandScore heurístico futuro (v1.1.x).
 */
@Injectable()
export class PredictHqEventsSource implements IFeedSource {
  private readonly logger = new Logger(PredictHqEventsSource.name)
  readonly id = 'predicthq-events'
  readonly displayName = 'PredictHQ'
  readonly weight = 0.95
  private readonly token: string | null

  constructor() {
    this.token = process.env.PREDICTHQ_TOKEN?.trim() || null
  }

  isConfigured(): boolean { return !!this.token }

  async fetch(ctx: PropertyContext): Promise<FeedItemRaw[]> {
    if (!this.token) return []
    if (ctx.lat == null || ctx.lng == null) return []
    try {
      const radius = ctx.radiusKm ?? 30
      const now = new Date().toISOString().slice(0, 10)
      const future = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
      const url = new URL('https://api.predicthq.com/v1/events')
      url.searchParams.set('within', `${radius}km@${ctx.lat},${ctx.lng}`)
      url.searchParams.set('category', 'concerts,festivals,conferences,expos,community,sports')
      url.searchParams.set('active.gte', now)
      url.searchParams.set('active.lte', future)
      url.searchParams.set('sort', '-local_rank')
      url.searchParams.set('limit', '10')

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        this.logger.warn(`PredictHQ HTTP ${res.status}`)
        return []
      }
      const json = (await res.json()) as PhqResponse
      const events = json.results ?? []
      return events.map((ev): FeedItemRaw => ({
        id: `phq-${ev.id}`,
        kind: 'event',
        title: ev.title.slice(0, 200),
        description: (ev.description ?? `Evento ${ev.category} cerca del hotel. Local rank ${ev.local_rank ?? '—'}.`).slice(0, 280),
        source: 'PredictHQ',
        publishedAt: new Date().toISOString().slice(0, 10),
        href: `https://www.predicthq.com/events/${ev.id}`,
        effectiveDate: ev.start ? ev.start.slice(0, 10) : undefined,
        lat: ev.location?.[1],
        lng: ev.location?.[0],
        fullText: `${ev.title} ${ev.description ?? ''}`,
      }))
    } catch (e) {
      this.logger.warn(`PredictHQ error: ${(e as Error).message}`)
      return []
    }
  }
}

interface PhqResponse {
  results?: Array<{
    id: string
    title: string
    description?: string
    category: string
    start?: string
    end?: string
    local_rank?: number
    location?: [number, number]  // [lng, lat]
  }>
}
