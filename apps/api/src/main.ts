import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory, Reflector } from '@nestjs/core'
import * as bodyParser from 'body-parser'
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

  const configService = app.get(ConfigService)
  const port = configService.get<number>('port') ?? 3000

  await app.listen(port)
  console.log(`🚀 API running on http://localhost:${port}/api`)
}

bootstrap()
