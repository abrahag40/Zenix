import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { RssHospitalitySource } from './rss-hospitality.source'
import { NewsDataIoSource } from './newsdata-io.source'
import { PredictHqEventsSource } from './predicthq-events.source'
import type { FeedItemRaw, IFeedSource, PropertyContext } from './feed-source.interface'

/**
 * FeedAggregatorService — el algoritmo central que el owner pidió.
 *
 * 1. Resolve PropertyContext desde Property.{city, lat, lng, country}.
 * 2. Pull paralelo de TODAS las sources configuradas (Promise.allSettled).
 * 3. Dedup por id estable cross-source (URL hash).
 * 4. Scoring per item:
 *      score = sourceWeight × recencyDecay × geoMatch × topicMatch
 *    donde:
 *      · sourceWeight = 0..1 declarado por cada source
 *      · recencyDecay = exp(-daysOld / 14) → items <14d full peso, decae después
 *      · geoMatch = 1.0 si keyword city/country en title|desc|fullText; 0.5 si solo país; 0.3 si nada
 *      · topicMatch = 1.0 si keywords hospitality; 0.5 si genérico
 *    Items con score < 0.25 se descartan (umbral de relevancia).
 * 5. Filtro de fechas:
 *      · Eventos (effectiveDate): solo si están en ventana [today, today+45d]
 *      · Noticias: solo si publishedAt >= today-60d
 * 6. Sort por score desc, top 8.
 * 7. Cache in-memory 6h por propertyId.
 *
 * Cache: simple Map<propertyId, { items, ttlAt }>. Para v1.0.5+ con multi-pod
 * se sustituye por Redis. Para piloto 1 backend instance, Map es suficiente.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000   // 6 horas
// 0.18 calibrado contra RSS hospitality: items industry-wide sin mención de
// ciudad puntúan ~0.28 (sourceWeight 0.6 × recency 0.93 × geo 0.5 × topic 1.0).
// Items con city match puntúan ~0.55. Threshold permite ambos sin ruido.
const SCORE_THRESHOLD = 0.18
const TOP_N = 8
const RECENCY_HALF_LIFE_DAYS = 14
const RELEVANCE_FUTURE_DAYS = 45
const RECENCY_PAST_DAYS = 60

interface CacheEntry { items: ScoredItem[]; ttlAt: number }
export interface ScoredItem extends FeedItemRaw { score: number }
type Lang = 'es' | 'en' | 'pt'

@Injectable()
export class FeedAggregatorService {
  private readonly logger = new Logger(FeedAggregatorService.name)
  private readonly cache = new Map<string, CacheEntry>()
  private readonly sources: IFeedSource[]

  constructor(
    private readonly prisma: PrismaService,
    rss: RssHospitalitySource,
    newsdata: NewsDataIoSource,
    phq: PredictHqEventsSource,
  ) {
    this.sources = [rss, newsdata, phq]
    const enabled = this.sources.filter((s) => s.isConfigured()).map((s) => s.id)
    this.logger.log(`FeedAggregator sources enabled: ${enabled.join(', ')}`)
  }

  /**
   * getFeed — entry point del controller. Usa cache 6h; force=true reconstruye.
   * Cache key incluye `language` para que ES y EN no se contaminen entre sí.
   */
  async getFeed(propertyId: string, force = false, language: Lang = 'es'): Promise<ScoredItem[]> {
    const cacheKey = `${propertyId}:${language}`
    const cached = this.cache.get(cacheKey)
    if (!force && cached && cached.ttlAt > Date.now()) return cached.items

    const ctx = await this.resolveContext(propertyId, language)
    if (!ctx) return []

    // Pull paralelo (fail-soft per source)
    const settled = await Promise.allSettled(
      this.sources.filter((s) => s.isConfigured()).map((s) => s.fetch(ctx).then((items) => ({ source: s, items }))),
    )

    const allRaw: Array<FeedItemRaw & { _weight: number }> = []
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue
      const { source, items } = r.value
      for (const it of items) allRaw.push({ ...it, _weight: source.weight })
    }

    // Dedup por id (sources distintos a veces traen mismo URL via syndication)
    const dedupedMap = new Map<string, FeedItemRaw & { _weight: number }>()
    for (const it of allRaw) {
      const existing = dedupedMap.get(it.id)
      if (!existing || it._weight > existing._weight) dedupedMap.set(it.id, it)
    }
    const deduped = [...dedupedMap.values()]

    // Filtro de fechas + scoring
    const todayIso = new Date().toISOString().slice(0, 10)
    const futureMaxIso = this.daysFromNow(RELEVANCE_FUTURE_DAYS)
    const pastMinIso = this.daysFromNow(-RECENCY_PAST_DAYS)

    const scored: ScoredItem[] = []
    for (const it of deduped) {
      // Filtro temporal
      if (it.effectiveDate) {
        if (it.effectiveDate < todayIso || it.effectiveDate > futureMaxIso) continue
      } else {
        if (it.publishedAt < pastMinIso) continue
      }
      // Scoring
      const score = this.computeScore(it, ctx, it._weight)
      if (score < SCORE_THRESHOLD) continue
      const { _weight: _, ...clean } = it
      scored.push({ ...clean, score })
    }

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, TOP_N)

    this.cache.set(cacheKey, { items: top, ttlAt: Date.now() + CACHE_TTL_MS })
    this.logger.log(`Feed property=${propertyId} lang=${language} sources=${settled.length} raw=${allRaw.length} deduped=${deduped.length} scored=${scored.length} top=${top.length}`)
    return top
  }

  /**
   * computeScore — heurístico documentado en encabezado del archivo.
   * Pure function — testeable sin BD.
   */
  private computeScore(item: FeedItemRaw, ctx: PropertyContext, sourceWeight: number): number {
    const recencyDays = item.effectiveDate
      ? this.daysBetween(item.effectiveDate, new Date().toISOString().slice(0, 10))
      : this.daysBetween(new Date().toISOString().slice(0, 10), item.publishedAt)
    const recencyDecay = Math.exp(-Math.abs(recencyDays) / RECENCY_HALF_LIFE_DAYS)

    const hay = `${item.title} ${item.description} ${item.fullText ?? ''}`.toLowerCase()
    const cityHit = ctx.cityName && hay.includes(ctx.cityName.toLowerCase())
    const countryHit = hay.includes(ctx.countryCode.toLowerCase())
    // Floor 0.5 (no 0.3): items hospitality industry-wide siguen siendo relevantes
    // para cualquier hotel boutique aunque no mencionen su city. Reduce el penalty.
    const geoMatch = cityHit ? 1.0 : countryHit ? 0.7 : 0.5

    const topicHit = /hotel|hospedaje|tourism|hospitality|resort|airbnb|booking|cloudbeds|mews|ota|revenue|tarifa|huésped|turismo|destino|festival|evento|concert|expo/i.test(hay)
    const topicMatch = topicHit ? 1.0 : 0.5

    return sourceWeight * recencyDecay * geoMatch * topicMatch
  }

  /**
   * resolveContext — pull lat/lng/city/country desde Property + LegalEntity.
   * Property.countryCode no existe en el schema; lo resolvemos desde LegalEntity.
   */
  private async resolveContext(propertyId: string, language: Lang): Promise<PropertyContext | null> {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        city: true,
        latitude: true,
        longitude: true,
        legalEntity: { select: { countryCode: true } },
      },
    })
    if (!prop || !prop.city) return null
    const countryCode = prop.legalEntity?.countryCode ?? 'MX'
    const cityName = prop.city
    const citySlug = cityName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
    return {
      citySlug,
      cityName,
      countryCode,
      lat: prop.latitude ?? null,
      lng: prop.longitude ?? null,
      radiusKm: 30,
      language,
    }
  }

  /** Invalida cache manualmente (post-config change) o por cron. */
  invalidate(propertyId: string, language?: Lang) {
    if (language) this.cache.delete(`${propertyId}:${language}`)
    else {
      // Invalida todas las langs de la property
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${propertyId}:`)) this.cache.delete(key)
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private daysFromNow(n: number): string {
    const d = new Date(); d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }
  private daysBetween(isoA: string, isoB: string): number {
    const a = new Date(isoA).getTime()
    const b = new Date(isoB).getTime()
    return Math.floor((b - a) / 86400000)
  }
}
