import { Module } from '@nestjs/common'
import { LocalEventsService } from './local-events.service'
import { LocalEventsController } from './local-events.controller'

/**
 * LocalEventsModule — Fase 3 RATES-METRICS-COMPSET (chunk 1).
 * Admin Events Curator endpoints viven en módulo separado /v1/admin/local-events
 * (no incluido en chunk 1).
 */
@Module({
  providers: [LocalEventsService],
  controllers: [LocalEventsController],
  exports: [LocalEventsService],
})
export class LocalEventsModule {}
