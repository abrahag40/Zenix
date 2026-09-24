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
import { StripePasarela } from './pago/pasarelas/stripe.pasarela'
import { BanortePasarela } from './pago/pasarelas/banorte.pasarela'
import { RegistroDePasarelas } from './pago/pasarelas/registro-de-pasarelas.service'
import { ExpedienteDeContracargoService } from './contracargos/expediente-de-contracargo.service'
import { ContracargoListener } from './contracargos/contracargo.listener'
import { CartaDeRegistroService } from './contracargos/carta-de-registro.service'
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

/**
 * BOOKING-ENGINE B1+B2+B3 — "Zenix Booking" API pública headless.
 *
 * PrismaModule, AvailabilityModule, EventEmitterModule y ScheduleModule son
 * @Global → se inyectan sin importar. NotificationsModule se importa para SSE.
 * B3: webhooks outbound (dispatcher + listener de eventos de dominio + retry cron).
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
    StripePasarela,
    BanortePasarela,
    RegistroDePasarelas,
    ExpedienteDeContracargoService,
    ContracargoListener,
    CartaDeRegistroService,
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
  exports: [
    PublicBookingService, BookingApiKeyService, WebhookSubscriptionService, RateEnvelopeService,
    PoliticaDePublicacionService, LiberadorDeRetencionesService, PagoDeReservaService,
    StripePasarela, BanortePasarela, RegistroDePasarelas,
    ExpedienteDeContracargoService, CartaDeRegistroService,
  ],
})
export class PublicBookingModule {}
