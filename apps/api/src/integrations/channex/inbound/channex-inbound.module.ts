import { Module } from '@nestjs/common'
import { AvailabilityModule } from '../../../pms/availability/availability.module'
import { NotificationsModule } from '../../../notifications/notifications.module'
import { TenantContextService } from '../../../common/tenant-context.service'
import { ChannexAuthGuard } from './channex-auth.guard'
import { ChannexConflictsController } from './channex-conflicts.controller'
import { ChannexConflictsService } from './channex-conflicts.service'
import { ChannexFeedScheduler } from './channex-feed.scheduler'
import { ChannexNotifService } from './channex-notif.service'
import { ChannexRoomSuggesterService } from './channex-room-suggester.service'
import { ChannexInboundService } from './channex-inbound.service'
import { ChannexOutboxScheduler } from './channex-outbox.scheduler'
import { ChannexRevisionPullerService } from './channex-revision-puller.service'
import { ChannexSystemStaffService } from './channex-system-staff.service'
import { ChannexWebhookController } from './channex-webhook.controller'
import { BookingCancelHandler } from './handlers/booking-cancel.handler'
import { BookingModifyHandler } from './handlers/booking-modify.handler'
import { BookingNewHandler } from './handlers/booking-new.handler'

/**
 * ChannexInboundModule — receives webhooks from Channex.io (OTA → PMS).
 *
 * Companion to the outbound ChannexModule (apps/api/src/integrations/channex)
 * which handles PMS → OTA push.
 *
 * Day 3 wiring adds:
 *   - BookingNewHandler (orchestrates revision → GuestStay)
 *   - ChannexSystemStaffService (sentinel "Channex System" Staff per property)
 *   - AvailabilityModule + NotificationsModule imports for handler DI
 *
 * ChannexGateway viene del ChannexModule global (@Global) — no requiere import.
 */
@Module({
  imports: [AvailabilityModule, NotificationsModule],
  controllers: [ChannexWebhookController, ChannexConflictsController],
  providers: [
    ChannexAuthGuard,
    ChannexInboundService,
    ChannexRevisionPullerService,
    ChannexOutboxScheduler,
    ChannexFeedScheduler,
    ChannexSystemStaffService,
    ChannexConflictsService,
    ChannexRoomSuggesterService,
    ChannexNotifService,
    BookingNewHandler,
    BookingModifyHandler,
    BookingCancelHandler,
    TenantContextService,
  ],
  exports: [
    ChannexInboundService,
    ChannexRevisionPullerService,
    ChannexFeedScheduler,
    ChannexConflictsService,
    ChannexRoomSuggesterService,
    ChannexNotifService,
    BookingNewHandler,
    BookingModifyHandler,
    BookingCancelHandler,
  ],
})
export class ChannexInboundModule {}
