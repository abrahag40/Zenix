import { Module } from '@nestjs/common'
import { NotificationsModule } from '../../../notifications/notifications.module'
import { ChannexFullSyncController } from './channex-full-sync.controller'
import { ChannexFullSyncOrchestrator } from './channex-full-sync.orchestrator'
import { ChannexOutboundBuilderService } from './channex-outbound-builder.service'
import { ChannexOutboundNotifService } from './channex-outbound-notif.service'
import { ChannexOutboundWorker } from './channex-outbound-worker.service'
import { ChannexTokenBucketService } from './channex-token-bucket.service'

/**
 * ChannexOutboundModule — PMS → Channex push (ARI sync).
 *
 * Hermano del ChannexInboundModule. Days 1-7 del sprint CHANNEX-OUTBOUND-CERT:
 *   Day 1: Schema + Gateway extensions + OutboxBuilder ✅
 *   Day 2: Worker + rate limiter + retry + DEAD_LETTER notif ✅
 *   Day 3: Domain events integration (AvailabilityService) ✅
 *   Day 4: FullSyncOrchestrator + manual trigger endpoint ✅
 *   Day 5: 14 integration tests vs sandbox
 *   Day 6: /settings/channex admin UI
 *   Day 7: Test 14 declarations + docs
 *
 * ChannexGateway viene de ChannexModule global — no se reimporta aquí.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [ChannexFullSyncController],
  providers: [
    ChannexOutboundBuilderService,
    ChannexTokenBucketService,
    ChannexOutboundNotifService,
    ChannexOutboundWorker,
    ChannexFullSyncOrchestrator,
  ],
  exports: [
    ChannexOutboundBuilderService,
    ChannexTokenBucketService,
    ChannexOutboundWorker,
    ChannexFullSyncOrchestrator,
  ],
})
export class ChannexOutboundModule {}
