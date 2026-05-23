import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { PrismaService } from '../../../prisma/prisma.service'

/**
 * ChannexAuthGuard — verifica el bearer token custom que Channex envía en el
 * header configurado al registrar el webhook.
 *
 * **Channex no firma payloads con HMAC.** Su modelo de auth para webhooks
 * inbound es: el PMS configura un `headers` object al crear el webhook
 * (https://docs.channex.io/api-v.1-documentation/webhook-collection),
 * Channex incluye esos headers en cada POST. Usamos un bearer token
 * propio (PropertySettings.channexWebhookSecret) que rotamos cada 90d
 * via Zenix Activate (§77-§80).
 *
 * Diseño:
 *   - Header esperado: `Authorization: Bearer <token>`
 *   - Lookup del secret por `X-Channex-Property-Id` header
 *   - Comparación timing-safe usando `crypto.timingSafeEqual`
 *   - Si el property no tiene secret configurado, fail-open con WARN
 *     (sandbox + onboarding inicial — se cierra cuando se rota la key
 *     post-Activate)
 *   - Expone `req.channexAuth = { propertyId, secretConfigured }` al
 *     controller para el audit log
 *
 * Guard (no middleware) porque necesitamos Reflector para `@Public()` +
 * DI nativo de PrismaService + shape estándar UnauthorizedException.
 */
@Injectable()
export class ChannexAuthGuard implements CanActivate {
  private readonly logger = new Logger(ChannexAuthGuard.name)

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { channexAuth?: ChannexAuthContext }>()

    const propertyId = pickHeader(req, 'x-channex-property-id')
    if (!propertyId) {
      throw new UnauthorizedException('Missing X-Channex-Property-Id header')
    }

    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { propertyId: true, channexWebhookSecret: true },
    })

    if (!settings) {
      // Property unknown → reject. Channex must be re-pointed to a valid id.
      throw new UnauthorizedException(`Unknown property: ${propertyId}`)
    }

    const presentedToken = extractBearer(pickHeader(req, 'authorization'))

    // Fail-open onboarding: si la property aún no tiene secret configurado,
    // log warning y permitir (necesario para activar el webhook por primera
    // vez en sandbox). Una vez que Activate (§77-§80) escribe el secret,
    // el fail-open se cierra automáticamente.
    if (!settings.channexWebhookSecret) {
      this.logger.warn(
        `[ChannexAuthGuard] property=${propertyId} has NO webhook secret configured ` +
          `— accepting (sandbox/onboarding). Rotate via Activate to enable strict check.`,
      )
      req.channexAuth = { propertyId, secretConfigured: false, valid: true }
      return true
    }

    if (!presentedToken) {
      throw new UnauthorizedException('Missing Authorization bearer token')
    }

    if (!timingSafeEqualStr(presentedToken, settings.channexWebhookSecret)) {
      // Audit trail: caller debe loggear el fallo. Lanzamos para que
      // NestJS responda 401 — Channex marcará el endpoint como unhealthy
      // y eventualmente desactivará el webhook (operador podrá detectarlo).
      this.logger.error(
        `[ChannexAuthGuard] invalid bearer token for property=${propertyId}`,
      )
      throw new UnauthorizedException('Invalid bearer token')
    }

    req.channexAuth = { propertyId, secretConfigured: true, valid: true }
    return true
  }
}

export interface ChannexAuthContext {
  propertyId: string
  secretConfigured: boolean
  valid: boolean
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pickHeader(req: Request, name: string): string | undefined {
  const v = req.headers[name]
  if (Array.isArray(v)) return v[0]
  return v
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]
}

/**
 * Comparación timing-safe sobre strings (Node 18+ tiene crypto.timingSafeEqual
 * que requiere buffers de igual longitud). Esta versión también iguala
 * longitudes para evitar leak por length comparison.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { timingSafeEqual } = require('crypto') as typeof import('crypto')
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) {
    // Aún así realizar comparación dummy para constant time. La verdadera
    // mitigación de timing aquí es marginal — el length leak es trivial
    // comparado al riesgo de skip explícito.
    timingSafeEqual(aBuf, aBuf)
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}
