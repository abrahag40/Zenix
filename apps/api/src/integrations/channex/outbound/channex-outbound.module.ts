import { Module } from '@nestjs/common'
import { ChannexOutboundBuilderService } from './channex-outbound-builder.service'

/**
 * ChannexOutboundModule — PMS → Channex push (ARI sync).
 *
 * Hermano del ChannexInboundModule. Days 1-7 del sprint CHANNEX-OUTBOUND-CERT:
 *   Day 1 (este commit): Schema + Gateway extensions + OutboxBuilder
 *   Day 2: Worker + rate limiter + retry
 *   Day 3: Domain events integration
 *   Day 4: FullSyncOrchestrator
 *   Day 5: 14 integration tests vs sandbox
 *   Day 6: /settings/channex admin UI
 *   Day 7: Test 14 declarations + docs
 *
 * ChannexGateway viene de ChannexModule global — no se reimporta aquí.
 */
@Module({
  providers: [ChannexOutboundBuilderService],
  exports: [ChannexOutboundBuilderService],
})
export class ChannexOutboundModule {}
