import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { Public } from '../common/decorators/public.decorator'
import { PublicBookingService } from './public-booking.service'
import { PublicReservationsService } from './public-reservations.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { AvailabilityQueryDto } from './dto/availability-query.dto'
import { CreateReservationDto } from './dto/create-reservation.dto'
import { VerifiedApiKey } from './booking-api-key.service'

/**
 * PublicBookingController — BOOKING-ENGINE B1 (READ).
 *
 * API PÚBLICA headless de "Zenix Booking". Rutas pre-auth (sin JWT) — un website
 * externo e independiente las consume vía HTTP según la documentación. El gate
 * de las rutas READ es ninguno (info pública, cacheable); las rutas WRITE (B2)
 * exigirán `X-API-Key` + `Idempotency-Key`.
 *
 * Path real con prefix global: /api/v1/public/...
 *
 * NOTA CORS (B1 follow-up): en producción `enableCors` restringe a
 * ALLOWED_ORIGINS. Para que cualquier sitio de hotel consuma estos GET, el path
 * `/api/v1/public/*` debe quedar exento de esa restricción (middleware CORS
 * dedicado o `origin: '*'` para este prefijo). En dev CORS=true ya lo permite.
 *
 * NOTA RATE-LIMIT (B1 follow-up): falta `@nestjs/throttler` (no instalado).
 * La protección per-IP (R1 DDoS/scraping) se agrega al wirearlo — requiere
 * aprobar la dependencia.
 */
@Controller('v1/public')
@Public()
@UseGuards(ThrottlerGuard) // rate-limit per-IP 60/min (R1) — la API pública es internet-facing
export class PublicBookingController {
  constructor(
    private readonly publicBooking: PublicBookingService,
    private readonly reservations: PublicReservationsService,
  ) {}

  /** Info pública del hotel (branding, currency, languages, payment policy). */
  @Get('properties/:slug')
  @Header('Cache-Control', 'public, max-age=30')
  getProperty(@Param('slug') slug: string) {
    return this.publicBooking.getPublicProperty(slug)
  }

  /** Catálogo de tipos de habitación. */
  @Get('properties/:slug/room-types')
  @Header('Cache-Control', 'public, max-age=30')
  getRoomTypes(@Param('slug') slug: string) {
    return this.publicBooking.getRoomTypes(slug)
  }

  /** Disponibilidad por tipo de habitación en un rango (delega a §35). */
  @Get('properties/:slug/availability')
  @Header('Cache-Control', 'public, max-age=30')
  getAvailability(@Param('slug') slug: string, @Query() q: AvailabilityQueryDto) {
    return this.publicBooking.checkAvailability(slug, q)
  }

  /**
   * Calendario de disponibilidad por noche (feed advisory B3) — el date-picker
   * del website pinta en gris las fechas sin cupo. La garantía dura es el §35 en
   * POST. `from`/`to` ISO-8601, opcional `roomTypeId`. Máx 62 noches.
   */
  @Get('properties/:slug/availability-calendar')
  @Header('Cache-Control', 'public, max-age=60')
  getAvailabilityCalendar(
    @Param('slug') slug: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('roomTypeId') roomTypeId?: string,
  ) {
    return this.publicBooking.getAvailabilityCalendar(slug, from, to, roomTypeId)
  }

  /** Cotización de tarifas (precios "desde", sin verificar inventario). */
  @Get('properties/:slug/rates')
  @Header('Cache-Control', 'public, max-age=30')
  getRates(@Param('slug') slug: string, @Query() q: AvailabilityQueryDto) {
    return this.publicBooking.getRates(slug, q)
  }

  /**
   * Crea una reserva desde la HOSTED PAGE (first-party `book.zenix.com/{slug}`).
   * Sin API key — la sirve Zenix; se resuelve por slug + Idempotency-Key, con
   * rate-limit per-IP (ThrottlerGuard a nivel de clase). Patrón Cloudbeds/Mews.
   */
  @Post('properties/:slug/reservations')
  @HttpCode(201)
  createHostedReservation(
    @Param('slug') slug: string,
    @Body() dto: CreateReservationDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.reservations.createReservationBySlug(slug, dto, idempotencyKey)
  }

  // ── WRITE (require X-API-Key + Idempotency-Key) — BOOKING-ENGINE B2 ─────────

  /**
   * Crea una reserva directa. La property se deriva de la API key. El body lleva
   * `rooms[]` — cada línea con su roomTypeId + fechas + huéspedes (multi-tipo /
   * multi-fecha / grupo). Anti-overbook §35; idempotente por Idempotency-Key.
   */
  @Post('reservations')
  @UseGuards(ApiKeyGuard)
  @HttpCode(201)
  createReservation(
    @Req() req: { bookingApiKey: VerifiedApiKey },
    @Body() dto: CreateReservationDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.reservations.createReservation(req.bookingApiKey, dto, idempotencyKey)
  }

  /** Estado público de una reserva por su bookingRef (scoped a la API key). */
  @Get('reservations/:ref')
  @UseGuards(ApiKeyGuard)
  getReservation(
    @Req() req: { bookingApiKey: VerifiedApiKey },
    @Param('ref') ref: string,
  ) {
    return this.reservations.getReservation(req.bookingApiKey, ref)
  }
}
