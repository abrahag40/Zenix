import { Controller, Get, Query, Headers } from '@nestjs/common'
import { FeedAggregatorService } from './feed-aggregator.service'

/**
 * Feed endpoint — InsightsFeed real algorithm.
 *
 * Idioma del feed:
 *   1. Query `?lang=es|en|pt` (override explícito del frontend)
 *   2. Header `Accept-Language` (browser locale)
 *   3. Default 'es' (v1.0.x piloto LATAM)
 *
 * Cache es per (propertyId, language). Cambiar idioma del sistema no invalida
 * el cache del idioma anterior — útil para users multi-lingüe que switcheen.
 */
@Controller('v1/dashboard/feed')
export class FeedController {
  constructor(private readonly aggregator: FeedAggregatorService) {}

  /** GET /v1/dashboard/feed?propertyId=X&force=1&lang=es */
  @Get()
  async getFeed(
    @Query('propertyId') propertyId: string,
    @Query('force') force?: string,
    @Query('lang') langQuery?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    if (!propertyId) return { items: [] }
    const lang = resolveLanguage(langQuery, acceptLanguage)
    const items = await this.aggregator.getFeed(propertyId, force === '1', lang)
    return { items, generatedAt: new Date().toISOString(), language: lang }
  }
}

/**
 * Resuelve idioma según prioridad: query → header → default 'es'.
 * Solo acepta 'es' | 'en' | 'pt' (los 3 soportados por Zenix).
 */
function resolveLanguage(query?: string, header?: string): 'es' | 'en' | 'pt' {
  const normalize = (s: string): 'es' | 'en' | 'pt' | null => {
    const code = s.toLowerCase().slice(0, 2)
    return code === 'es' || code === 'en' || code === 'pt' ? code : null
  }
  if (query) {
    const q = normalize(query)
    if (q) return q
  }
  if (header) {
    // Accept-Language: "es-MX,es;q=0.9,en;q=0.8" → primer match
    const langs = header.split(',').map((s) => s.trim().split(';')[0])
    for (const l of langs) {
      const n = normalize(l)
      if (n) return n
    }
  }
  return 'es'
}
