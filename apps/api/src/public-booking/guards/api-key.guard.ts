import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { BookingApiKeyService } from '../booking-api-key.service'

/**
 * ApiKeyGuard — BOOKING-ENGINE B2.
 *
 * Protege los endpoints WRITE de la API pública. Valida `X-API-Key`, adjunta la
 * llave verificada a `req.bookingApiKey`, y aplica CORS dinámico: si la llave
 * declara `allowedOrigins[]` y la request trae un `Origin` que no está en la
 * lista → 403. Sin Origin (server-to-server) se permite.
 *
 * Las rutas que lo usan también deben llevar `@Public()` para saltar el JWT
 * guard global (la auth real es la API key, no la sesión).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: BookingApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const presented = req.headers['x-api-key'] as string | undefined

    const verified = await this.apiKeys.verify(presented)
    if (!verified) {
      throw new UnauthorizedException('API key inválida o revocada')
    }

    const origin = req.headers['origin'] as string | undefined
    if (origin && verified.allowedOrigins.length > 0) {
      if (!verified.allowedOrigins.includes(origin)) {
        throw new ForbiddenException(`Origen no autorizado: ${origin}`)
      }
    }

    req.bookingApiKey = verified
    return true
  }
}
