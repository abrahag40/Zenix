import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PublicBookingController } from './public-booking.controller'
import { BookingEngineManagementController } from './booking-engine-management.controller'
import { PublicBookingService } from './public-booking.service'
import { BookingEngineConfigService } from './booking-engine-config.service'
import { PublicReservationsService } from './public-reservations.service'
import { BookingApiKeyService } from './booking-api-key.service'
import { BookingSystemStaffService } from './booking-system-staff.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { WebhookDispatcherService } from './webhooks/webhook-dispatcher.service'
import { WebhookEventsListener } from './webhooks/webhook-events.listener'
import { WebhookRetryScheduler } from './webhooks/webhook-retry.scheduler'
import { WebhookSubscriptionService } from './webhooks/webhook-subscription.service'

/**
 * BOOKING-ENGINE B1+B2+B3 — "Zenix Booking" API pública headless.
 *
 * PrismaModule, AvailabilityModule, EventEmitterModule y ScheduleModule son
 * @Global → se inyectan sin importar. NotificationsModule se importa para SSE.
 * B3: webhooks outbound (dispatcher + listener de eventos de dominio + retry cron).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [PublicBookingController, BookingEngineManagementController],
  providers: [
    PublicBookingService,
    BookingEngineConfigService,
    PublicReservationsService,
    BookingApiKeyService,
    BookingSystemStaffService,
    ApiKeyGuard,
    WebhookDispatcherService,
    WebhookEventsListener,
    WebhookRetryScheduler,
    WebhookSubscriptionService,
  ],
  exports: [PublicBookingService, BookingApiKeyService, WebhookSubscriptionService],
})
export class PublicBookingModule {}
