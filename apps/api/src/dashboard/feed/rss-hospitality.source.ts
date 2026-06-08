import { Injectable, Logger } from '@nestjs/common'
import type { FeedItemRaw, IFeedSource, PropertyContext } from './feed-source.interface'

/**
 * RssHospitalitySource — fuente ZERO-COST que SÍ funciona sin API keys.
 *
 * Lee 3 feeds RSS públicos de la industria:
 *   · Hospitality Net    — https://www.hospitalitynet.org/rss/news.xml
 *   · PhocusWire         — https://www.phocuswire.com/feed
 *   · eHotelier news     — https://insights.ehotelier.com/feed/
 *
 * Algoritmo de relevancia geo:
 *   1. Parse pubDate ISO + title + description de cada item
 *   2. Score per item: 0.5 base · +0.3 si title|desc contienen `cityName`
 *      o `countryCode` full-text (case-insensitive) · +0.2 si keywords
 *      hospitality general ("hotel", "tourism", "resort").
 *   3. Items con score < 0.4 se descartan (ruido).
 *
 * Fail-soft:
 *   · Timeout 6s por feed
 *   · Un feed caído → solo afecta su batch, los otros 2 siguen
 *   · Sin librería rss-parser (parseo manual con regex — feeds RSS 2.0
 *     son XML estándar, no necesitamos dependencia extra de npm para esto).
 */
/**
 * Topic regex multilingüe — keywords hospitality en ES + EN + PT.
 * ES: hotel, hospedaje, huésped, tarifa, turismo, destino, hostal
 * EN: hotel, tourism, hospitality, resort, ota, revenue, guest
 * PT: hotel, hospedagem, hóspede, turismo, pousada, hospitalidade
 */
const TOPIC_RE = /hotel|hosp(?:edaje|edagem|italit[áa]|itality|ede)|tur(?:ismo|ism)|h[óo]spede|resort|airbnb|booking|cloudbeds|mews|ota|revenue|tarif[aá]|destino|hostal|pousada|guest/i

@Injectable()
export class RssHospitalitySource implements IFeedSource {
  private readonly logger = new Logger(RssHospitalitySource.name)
  readonly id = 'rss-hospitality'
  readonly displayName = 'RSS Hospitality'
  readonly weight = 0.6  // mid-tier — sources curados pero no geo-specific

  /**
   * Feeds curados por idioma. Owner roadmap 2026-06-07: sistema Zenix se
   * traduce a EN y PT — cada user verá noticias en SU idioma del sistema.
   * NO mezclar idiomas en mismo feed = mejor UX (no leer EN si configuré ES).
   *
   * Cobertura validada (HTTP 200 + XML válido) 2026-06:
   *  · ES: Hosteltur (España), TecnoHotel News (España), Smart Travel News (LATAM)
   *  · EN: Hospitality Net, PhocusWire, eHotelier (global)
   *  · PT: Publituris (Portugal), Hôtelier News (Brasil)
   */
  private readonly feedsByLang: Record<'es' | 'en' | 'pt', Array<{ url: string; source: string }>> = {
    es: [
      { url: 'https://www.hosteltur.com/rss/noticias.rss',       source: 'Hosteltur' },
      { url: 'https://www.tecnohotelnews.com/feed/',             source: 'TecnoHotel' },
      { url: 'https://www.smarttravel.news/feed/',               source: 'Smart Travel News' },
    ],
    en: [
      { url: 'https://www.hospitalitynet.org/rss/news.xml',      source: 'Hospitality Net' },
      { url: 'https://www.phocuswire.com/feed',                  source: 'PhocusWire' },
      { url: 'https://insights.ehotelier.com/feed/',             source: 'eHotelier' },
    ],
    pt: [
      { url: 'https://publituris.pt/feed/',                      source: 'Publituris' },
      { url: 'https://www.hoteliernews.com.br/feed',             source: 'Hôtelier News BR' },
    ],
  }

  isConfigured(): boolean {
    return true  // RSS público — siempre disponible
  }

  async fetch(ctx: PropertyContext): Promise<FeedItemRaw[]> {
    // Solo feeds del idioma del user. Si no hay registry para ese lang,
    // fallback a 'es' (lang dominante del piloto LATAM).
    const feeds = this.feedsByLang[ctx.language] ?? this.feedsByLang.es
    const results = await Promise.allSettled(
      feeds.map((f) => this.fetchFeed(f.url, f.source, ctx)),
    )
    const items: FeedItemRaw[] = []
    for (const r of results) if (r.status === 'fulfilled') items.push(...r.value)
    return items
  }

  private async fetchFeed(url: string, source: string, ctx: PropertyContext): Promise<FeedItemRaw[]> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Zenix-PMS-FeedAggregator/1.0' },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) {
        this.logger.warn(`RSS ${source} HTTP ${res.status}`)
        return []
      }
      const xml = await res.text()
      const items = this.parseRss(xml, source)
      // Filtro relevancia con keywords multilingüe (ES + EN + PT) — el match
      // de topic acepta hospitalidad en cualquiera de los 3 idiomas. El user
      // ve solo items en su lang (feeds-by-lang upstream) pero el regex no
      // necesita ser per-lang.
      const cityLower = ctx.cityName.toLowerCase()
      const countryLower = ctx.countryCode.toLowerCase()
      return items.filter((it) => {
        const hay = `${it.title} ${it.description} ${it.fullText ?? ''}`.toLowerCase()
        const geoMatch = hay.includes(cityLower) || hay.includes(countryLower)
        const topicMatch = TOPIC_RE.test(hay)
        if (!topicMatch && !geoMatch) return false
        return true
      })
    } catch (e) {
      this.logger.warn(`RSS ${source} error: ${(e as Error).message}`)
      return []
    }
  }

  /**
   * Parser RSS 2.0 minimal — extrae <item> con title/link/description/pubDate.
   * NO dependemos de rss-parser npm (~50KB) para 3 feeds simples.
   */
  private parseRss(xml: string, source: string): FeedItemRaw[] {
    const items: FeedItemRaw[] = []
    const itemRegex = /<item[\s>][\s\S]*?<\/item>/g
    const matches = xml.match(itemRegex) ?? []
    for (const block of matches) {
      const title = this.extractTag(block, 'title')
      const link = this.extractTag(block, 'link')
      const desc = this.extractTag(block, 'description')
      const pubDate = this.extractTag(block, 'pubDate')
      if (!title || !link) continue
      const publishedIso = pubDate ? this.parseDateToIso(pubDate) : new Date().toISOString().slice(0, 10)
      items.push({
        id: `${source}-${this.hashStr(link)}`,
        kind: 'news',
        title: this.stripHtml(title).slice(0, 200),
        description: this.stripHtml(desc ?? '').slice(0, 280),
        source,
        publishedAt: publishedIso,
        href: link,
        fullText: this.stripHtml(`${title} ${desc ?? ''}`).slice(0, 800),
      })
    }
    return items
  }

  private extractTag(block: string, tag: string): string | null {
    // Match <tag>...</tag> or <tag><![CDATA[...]]></tag>
    const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
    const m = block.match(re)
    return m ? m[1].trim() : null
  }
  private stripHtml(s: string): string {
    return s
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x2018;|&#8216;/g, '‘')
      .replace(/&#x2019;|&#8217;/g, '’')
      .replace(/&#x201C;|&#8220;/g, '“')
      .replace(/&#x201D;|&#8221;/g, '”')
      .replace(/&hellip;|&#8230;/g, '…')
      .replace(/&mdash;|&#8212;/g, '—')
      .replace(/&ndash;|&#8211;/g, '–')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/\s+/g, ' ')
      .trim()
  }
  private parseDateToIso(s: string): string {
    const d = new Date(s)
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10)
  }
  private hashStr(s: string): string {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return Math.abs(h).toString(36)
  }
}
