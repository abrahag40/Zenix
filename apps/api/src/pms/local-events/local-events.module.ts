import { Module } from '@nestjs/common'
import { LocalEventsService } from './local-events.service'
import { LocalEventsController } from './local-events.controller'
import { AdminEventsController } from './admin-events.controller'

/**
 * LocalEventsModule — Fase 3 RATES-METRICS-COMPSET.
 * Chunk 1: service + LocalEventsController (per-property).
 * Chunk 2: AdminEventsController (Events Curator endpoints D-COMPSET9).
 */
@Module({
  providers: [LocalEventsService],
  controllers: [LocalEventsController, AdminEventsController],
  exports: [LocalEventsService],
})
export class LocalEventsModule {}
