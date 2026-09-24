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
 * llave verificada a `req.bookingApiKey` y decide si el origen puede usarla.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 EL AGUJERO QUE ESTO CIERRA
 *
 * La regla anterior era: «si la llave declara orígenes y la request trae uno
 * que no está en la lista → 403». Suena bien, y tiene un hueco que se lee al
 * revés: **lista vacía = cualquier origen**. Y la lista vacía es el valor por
 * omisión.
 *
 * O sea: una llave recién creada, filtrada en el JavaScript de una página
 * —que es justo lo que su antiguo prefijo `pk_` invitaba a hacer—, funcionaba
 * desde **cualquier sitio de internet**. Quien la copiara podía crear reservas
 * a nombre del hotel desde su propio dominio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA REGLA NUEVA, Y POR QUÉ DISTINGUE POR `Origin`
 *
 * · **Con cabecera `Origin`** → la petición viene de un navegador. Exige lista
 *   declarada Y que el origen esté en ella. Lista vacía → 403.
 * · **Sin `Origin`** → servidor a servidor (curl, un backend, un cron). Se
 *   permite, como hasta ahora.
 *
 * El navegador **siempre** manda `Origin` en una petición de escritura entre
 * orígenes, y no deja que el JavaScript de la página lo falsifique: es una
 * cabecera prohibida. Por eso sirve para distinguir, aunque no sea una
 * autenticación — quien tenga la llave y un `curl` sigue pudiendo usarla, y
 * eso es correcto, porque la llave es un secreto de servidor.
 *
 * **Lo que esto NO es:** protección contra el robo de la llave. Es reducción
 * del daño. Lo que impide el robo es que la llave no esté en el navegador, y
 * de eso se ocupa el nombre — ver `booking-api-key.service.ts`.
 *
 * **Antipatrón evitado:** confiar en la lista de orígenes como si fuera
 * autenticación y relajar por eso el secreto de la llave. Es defensa en
 * profundidad, no una defensa.
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
    if (origin) {
      if (verified.allowedOrigins.length === 0) {
        throw new ForbiddenException(
          'Esta llave no declara dominios autorizados, así que no puede usarse desde un navegador. ' +
            'Una llave de reservas es un secreto de servidor: si de verdad la necesitas en el ' +
            'navegador, declara los dominios del sitio del hotel al crearla.',
        )
      }
      if (!verified.allowedOrigins.includes(origin)) {
        throw new ForbiddenException(`Origen no autorizado: ${origin}`)
      }
    }

    req.bookingApiKey = verified
    return true
  }
}
