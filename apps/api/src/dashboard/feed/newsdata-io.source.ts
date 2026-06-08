import { Injectable, Logger } from '@nestjs/common'
import type { FeedItemRaw, IFeedSource, PropertyContext } from './feed-source.interface'

/**
 * NewsDataIoSource — REST API geo-filtrada (https://newsdata.io).
 *
 * Endpoint: GET https://newsdata.io/api/1/latest?apikey=X&country=mx&q=hotel,tourism
 * Free tier: 200 requests/day. Pro $199/mes 5000 req/day.
 *
 * Pull strategy:
 *   · Query keywords hospitality enfocado al país de la property
 *   · Filter category: tourism, business
 *   · `language=es` para LATAM
 *
 * Sin NEWSDATA_API_KEY: isConfigured() → false → aggregator lo skipa.
 */
@Injectable()
export class NewsDataIoSource implements IFeedSource {
  private readonly logger = new Logger(NewsDataIoSource.name)
  readonly id = 'newsdata-io'
  readonly displayName = 'NewsData.io'
  readonly weight = 0.85
  private readonly apiKey: string | null

  constructor() {
    this.apiKey = process.env.NEWSDATA_API_KEY?.trim() || null
  }

  isConfigured(): boolean { return !!this.apiKey }

  async fetch(ctx: PropertyContext): Promise<FeedItemRaw[]> {
    if (!this.apiKey) return []
    try {
      const url = new URL('https://newsdata.io/api/1/latest')
      url.searchParams.set('apikey', this.apiKey)
      url.searchParams.set('country', ctx.countryCode.toLowerCase())
      url.searchParams.set('language', ctx.language)  // 'es' | 'en' | 'pt' del user
      url.searchParams.set('q', `${ctx.cityName} OR hospedaje OR turismo OR hotel`)
      url.searchParams.set('size', '10')
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        this.logger.warn(`NewsData.io HTTP ${res.status}`)
        return []
      }
      const json = (await res.json()) as NewsDataResponse
      const results = json.results ?? []
      return results
        .filter((r) => r.title && r.link)
        .map((r): FeedItemRaw => ({
          id: `newsdata-${this.hashStr(r.link)}`,
          kind: 'news',
          title: r.title,
          description: (r.description ?? '').slice(0, 280),
          source: r.source_id ?? 'NewsData',
          publishedAt: (r.pubDate ?? new Date().toISOString()).slice(0, 10),
          href: r.link,
          fullText: `${r.title} ${r.description ?? ''} ${r.content ?? ''}`.slice(0, 800),
        }))
    } catch (e) {
      this.logger.warn(`NewsData.io error: ${(e as Error).message}`)
      return []
    }
  }

  private hashStr(s: string): string {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return Math.abs(h).toString(36)
  }
}

interface NewsDataResponse {
  results?: Array<{
    title: string
    link: string
    description?: string
    content?: string
    pubDate?: string
    source_id?: string
  }>
}
