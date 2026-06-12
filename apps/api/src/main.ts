// Polyfill `globalThis.crypto` para Node 16 — @nestjs/schedule usa
// `crypto.randomUUID()` bare global y Node 16 no lo expone. Idéntico al
// polyfill aplicado a tests vía jest.setup.js (cierre CI-RESCUE).
// Debe correr ANTES de cualquier import que load @nestjs/schedule.
if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ;(globalThis as { crypto?: unknown }).crypto = require('node:crypto').webcrypto
}

import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory, Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { PublicBookingModule } from './public-booking/public-booking.module'
import * as bodyParser from 'body-parser'
import * as compression from 'compression'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { PropertyScopeInterceptor } from './common/interceptors/property-scope.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  // Sprint BILLING-CORE Day 2: el endpoint POST /api/v1/webhooks/stripe necesita
  // el raw body buffer para verificar HMAC del header Stripe-Signature. JSON
  // body parsing destruye el raw — debemos preservarlo SOLO para ese path.
  //
  // FIX 2026-05-29 (validation E2E sprint NETFLIX): el bodyParser.raw() pone
  // el buffer en req.body, NO en req.rawBody — y el StripeWebhookController lee
  // req.rawBody. Pattern Stripe oficial: usar bodyParser.json con `verify`
  // callback que captura el buffer ANTES del parsing JSON y lo expone en
  // req.rawBody. Sin este fix, TODOS los webhooks devuelven HTTP 500
  // "Webhook raw body parser no configurado en server" (verificado en vivo).
  app.use(
    bodyParser.json({
      verify: (req: any, _res, buf) => {
        if (req.originalUrl === '/api/v1/webhooks/stripe') {
          req.rawBody = buf
        }
      },
      limit: '10mb',
    }),
  )

  // Sprint Mx-1B-W2 audit T-25 it.4: el endpoint /v1/uploads/base64 recibe
  // hasta ~8MB de payload base64. Default Express es 100KB → rechazaba con
  // 413. Subimos a 10MB para cubrir el upload + margen.
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))

  // Sprint COMPRESSION-CORE (bug #23 follow-up) — gzip compression para
  // todas las respuestas > threshold. Resuelve el margen restante del
  // PAGINATION-CORE fix: a 30 VUs / 10k stays el calendar p95 quedó en
  // 3.01s (vs 33.19s pre-fix, 91% mejora) por throughput de TCP + JSON
  // serialization, NO por Postgres. Compression reduce 3.3MB → ~600KB
  // (-82%) → p95 esperado ~600ms < 800ms target estricto.
  //
  // threshold:1024 — respuestas <1KB pasan sin comprimir (overhead no
  // vale la pena para tickets pequeños como /availability check).
  //
  // filter — respeta header `Accept-Encoding` del cliente + permite
  // skip explícito vía `X-No-Compression` para debugging.
  //
  // Trade-off: +5-10ms CPU server por gzip (negligible). No requiere
  // cambio en frontend — todos los browsers desde 1999 saben hacer
  // gunzip automático cuando ven `Content-Encoding: gzip`.
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false
        // BUG E2E-17 fix (2026-06-08) — el middleware `compression` bufferea el
        // stream gzip y NO lo envía hasta llenar el buffer o `res.flush()`. Para
        // SSE (`text/event-stream`, que `compression.filter` considera
        // comprimible por el patrón `^text\/`) esto significa que cada evento
        // queda atrapado en el buffer → el navegador NUNCA recibe eventos en
        // tiempo real → Kanban/Hub/dashboard solo se actualizan al recargar.
        // El COMPRESSION-CORE sprint rompió TODO el realtime SSE sin querer.
        // EventSource no puede enviar headers custom (x-no-compression), así que
        // excluimos el endpoint SSE por path. X-Accel-Buffering:no del controller
        // solo afecta a nginx, no a este middleware.
        if (req.path === '/api/events') return false
        return compression.filter(req, res)
      },
    }),
  )

  app.enableCors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGINS?.split(',') ?? []
      : true,
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  const reflector = app.get(Reflector)
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector))
  app.useGlobalInterceptors(new PropertyScopeInterceptor())
  app.useGlobalFilters(new HttpExceptionFilter())

  app.setGlobalPrefix('api')

  // ── OpenAPI / Swagger — BOOKING-ENGINE B6 ──────────────────────────────────
  // Doc PÚBLICA del motor "Zenix Booking" para developers externos (Tier 3).
  // Scoped a PublicBookingModule (el controller Nova interno se excluye con
  // @ApiExcludeController). UI en /api/docs · spec JSON en /api/docs-json.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zenix Booking API')
    .setDescription(
      'API pública headless de reservas directas. Un website externo consume estos ' +
        'endpoints por HTTP para mostrar disponibilidad y crear reservas (source=DIRECT_WEB, ' +
        'cero comisión OTA). READ es abierto; WRITE requiere `X-API-Key` (pk_live_/pk_test_) ' +
        '+ `Idempotency-Key`. Guía: docs/booking-engine-integration.md.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'ApiKey')
    .build()
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig, {
    include: [PublicBookingModule],
  })
  SwaggerModule.setup('api/docs', app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  })

  const configService = app.get(ConfigService)
  const port = configService.get<number>('port') ?? 3000

  await app.listen(port)
  console.log(`🚀 API running on http://localhost:${port}/api`)
}

bootstrap()
