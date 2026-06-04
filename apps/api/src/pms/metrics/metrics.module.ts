import { Module } from '@nestjs/common'
import { TenantContextService } from '../../common/tenant-context.service'
import { MetricsService } from './metrics.service'
import { MetricsController } from './metrics.controller'
import { MetricsSnapshotScheduler } from './metrics-snapshot.scheduler'

/**
 * MetricsModule — Fase 2 RATES-METRICS. PrismaService es global. El scheduler
 * dedicado puebla el snapshot diario; MetricsService se exporta para backfill +
 * consumo futuro (dashboard).
 */
@Module({
  providers: [MetricsService, MetricsSnapshotScheduler, TenantContextService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}
