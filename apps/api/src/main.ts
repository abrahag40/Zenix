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
  app.use((req: any, res: any, next: any) => {
    if (req.originalUrl === '/api/v1/webhooks/stripe') {
      bodyParser.raw({ type: 'application/json', limit: '2mb' })(req, res, next)
    } else {
      next()
    }
  })

  // Sprint Mx-1B-W2 audit T-25 it.4: el endpoint /v1/uploads/base64 recibe
  // hasta ~8MB de payload base64. Default Express es 100KB → rechazaba con
  // 413. Subimos a 10MB para cubrir el upload + margen.
  app.use(bodyParser.json({ limit: '10mb' }))
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
