import { Module } from '@nestjs/common'
import { FeedAggregatorService } from './feed-aggregator.service'
import { FeedController } from './feed.controller'
import { RssHospitalitySource } from './rss-hospitality.source'
import { NewsDataIoSource } from './newsdata-io.source'
import { PredictHqEventsSource } from './predicthq-events.source'

/**
 * FeedModule — InsightsFeed real algorithm (NO parche §103).
 *
 * Strategy pattern §89 IFiscalAdapter / §111 IFxAdapter. Agregar source =
 * 1 class + 1 línea providers. Activar requires keys en env:
 *   · RssHospitalitySource    — zero-cost, activo siempre
 *   · NewsDataIoSource        — NEWSDATA_API_KEY (free tier 200/día)
 *   · PredictHqEventsSource   — PREDICTHQ_TOKEN (trial 14d)
 *
 * Cache in-memory 6h per property. Para v1.0.5+ Redis.
 */
@Module({
  providers: [
    FeedAggregatorService,
    RssHospitalitySource,
    NewsDataIoSource,
    PredictHqEventsSource,
  ],
  controllers: [FeedController],
  exports: [FeedAggregatorService],
})
export class FeedModule {}
