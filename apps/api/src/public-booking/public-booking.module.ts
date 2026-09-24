import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PublicBookingController } from './public-booking.controller'
import { BookingEngineManagementController } from './booking-engine-management.controller'
import { PublicBookingService } from './public-booking.service'
import { PublicPricingService } from './public-pricing.service'
import { RateEnvelopeService } from './rate-envelope/rate-envelope.service'
import { RateEnvelopeListener } from './rate-envelope/rate-envelope.listener'
import { PoliticaDePublicacionService } from './politica-de-publicacion.service'
import { LiberadorDeRetencionesService } from './holds/liberador-de-retenciones.service'
import { PagoDeReservaService } from './pago/pago-de-reserva.service'
import { BillingModule } from '../billing/billing.module'
import { BookingEngineConfigService } from './booking-engine-config.service'
import { PublicReservationsService } from './public-reservations.service'
import { BookingApiKeyService } from './booking-api-key.service'
import { BookingSystemStaffService } from './booking-system-staff.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { WebhookDispatcherService } from './webhooks/webhook-dispatcher.service'
import { WebhookEventsListener } from './webhooks/webhook-events.listener'
import { WebhookRetryScheduler } from './webhooks/webhook-retry.scheduler'
import { WebhookSubscriptionService } from './webhooks/webhook-subscription.service'
import { ConserjeHerramientasService } from './conserje/conserje-herramientas.service'
import { ConversacionService } from './conserje/conversacion'

/**
 * BOOKING-ENGINE B1+B2+B3 — "Zenix Booking" API pública headless.
 *
 * PrismaModule, AvailabilityModule, EventEmitterModule y ScheduleModule son
 * @Global → se inyectan sin importar. NotificationsModule se importa para SSE.
 * B3: webhooks outbound (dispatcher + listener de eventos de dominio + retry cron).
 *
 * `conserje/` vive AQUI y no en un modulo propio por la decision 10 de
 * CLAUDE.md: los modulos son bounded contexts y no se importan servicios entre
 * ellos. Un modulo `concierge` aparte tendria que inyectar PublicBookingService
 * -- romperla en su primera linea--. Y mirandolo bien, el conserje no es otro
 * contexto: es otra superficie del mismo, vender la habitacion al huesped.
 */
@Module({
  imports: [NotificationsModule, BillingModule],
  controllers: [PublicBookingController, BookingEngineManagementController],
  providers: [
    PublicBookingService,
    PublicPricingService,
    RateEnvelopeService,
    RateEnvelopeListener,
    PoliticaDePublicacionService,
    LiberadorDeRetencionesService,
    PagoDeReservaService,
    BookingEngineConfigService,
    PublicReservationsService,
    BookingApiKeyService,
    BookingSystemStaffService,
    ApiKeyGuard,
    WebhookDispatcherService,
    WebhookEventsListener,
    WebhookRetryScheduler,
    WebhookSubscriptionService,
    ConserjeHerramientasService,
    ConversacionService,
  ],
  exports: [
    PublicBookingService,
    BookingApiKeyService,
    WebhookSubscriptionService,
    RateEnvelopeService,
    PoliticaDePublicacionService,
    LiberadorDeRetencionesService,
    PagoDeReservaService,
    ConserjeHerramientasService,
    ConversacionService,
  ],
})
export class PublicBookingModule {}
