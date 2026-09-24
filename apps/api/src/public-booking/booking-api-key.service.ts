import { Injectable, Logger } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

export interface VerifiedApiKey {
  id: string
  propertyId: string
  environment: string
  allowedOrigins: string[]
}

/**
 * BookingApiKeyService — BOOKING-ENGINE B2.
 *
 * Genera y verifica las API keys de "Zenix Booking". Formato:
 *   sk_{env}_{keyId(16 hex)}{secret(32 hex)}
 * Persistimos `keyId` plano (lookup O(1)) + bcrypt(secret). El plaintext SÓLO
 * existe en el retorno de `generate` — nunca se vuelve a poder leer.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔴 POR QUÉ DEJÓ DE LLAMARSE `pk_`
 *
 * Nacieron como `pk_`, «siguiendo el patrón de Stripe». Ahí está el error: en
 * el vocabulario de Stripe —que es el que conoce cualquier desarrollador que
 * toque pagos— **`pk_` significa *publishable*: seguro de poner en el
 * navegador**. `sk_` significa *secret*: sólo servidor.
 *
 * Ésta es una credencial portadora que **crea reservas**. Es un `sk_` con
 * nombre de `pk_`. El primer desarrollador de hotel que la vea en nuestra
 * documentación la va a pegar en su JavaScript, y hará bien según lo que el
 * nombre le promete — el error sería nuestro, no suyo.
 *
 * El nombre de una credencial no es cosmética: **es la instrucción de uso que
 * más gente va a leer**. Un nombre que miente es un fallo de seguridad con
 * forma de detalle de estilo.
 *
 * **Se cambia AHORA porque es un cambio incompatible y hoy afecta a un solo
 * hotel.** Con diez clientes es una migración coordinada con diez
 * desarrolladores ajenos.
 *
 * Compatibilidad: `verify` sigue aceptando las llaves `pk_` ya emitidas —el
 * prefijo no es material criptográfico, el `keyId` sí— y deja constancia en
 * el log cada vez que se usa una, para saber cuándo se pueden retirar sin
 * romperle el sitio a nadie.
 */
@Injectable()
export class BookingApiKeyService {
  private readonly logger = new Logger(BookingApiKeyService.name)
  private static readonly KEY_ID_LEN = 16 // hex chars
  private static readonly SECRET_LEN = 32 // hex chars

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera una llave nueva para una property. Devuelve el plaintext UNA sola
   * vez (el consultor la copia y se la entrega al developer del website).
   */
  async generate(args: {
    propertyId: string
    label: string
    environment?: 'live' | 'test'
    allowedOrigins?: string[]
  }): Promise<{ id: string; plaintextKey: string; keyPrefix: string }> {
    const env = args.environment ?? 'live'
    const keyId = randomBytes(8).toString('hex') // 16 hex chars
    const secret = randomBytes(16).toString('hex') // 32 hex chars
    const plaintextKey = `sk_${env}_${keyId}${secret}`
    const keyHash = await bcrypt.hash(secret, 10)
    const keyPrefix = `sk_${env}_${keyId.slice(0, 6)}…`

    const row = await this.prisma.bookingApiKey.create({
      data: {
        propertyId: args.propertyId,
        environment: env,
        keyId,
        keyHash,
        keyPrefix,
        label: args.label,
        allowedOrigins: args.allowedOrigins ?? [],
      },
      select: { id: true },
    })
    this.logger.log(`[BookingApiKey] generada ${keyPrefix} para property=${args.propertyId}`)
    return { id: row.id, plaintextKey, keyPrefix }
  }

  /** Revoca una llave (scoped a la property). Idempotente. */
  async revoke(propertyId: string, id: string): Promise<{ id: string; revoked: boolean }> {
    const row = await this.prisma.bookingApiKey.findFirst({ where: { id, propertyId }, select: { id: true } })
    if (!row) return { id, revoked: false }
    await this.prisma.bookingApiKey.update({
      where: { id },
      data: { active: false, revokedAt: new Date() },
    })
    return { id, revoked: true }
  }

  /**
   * Verifica una llave presentada en `X-API-Key`. Devuelve la llave verificada
   * o null si es inválida/revocada. Parse → lookup por keyId → bcrypt.compare.
   */
  async verify(presented: string | undefined): Promise<VerifiedApiKey | null> {
    if (!presented) return null
    // `pk_` se acepta por compatibilidad con las llaves ya emitidas: el
    // prefijo no es material criptográfico. Se registra su uso para saber
    // cuándo se pueden retirar sin romperle el sitio a ningún hotel.
    const m = /^(sk|pk)_(live|test)_([0-9a-f]{16})([0-9a-f]{32})$/.exec(presented.trim())
    if (!m) return null
    const [, prefijo, entorno, keyId, secret] = m

    const row = await this.prisma.bookingApiKey.findUnique({
      where: { keyId },
      select: {
        id: true,
        propertyId: true,
        environment: true,
        keyHash: true,
        allowedOrigins: true,
        active: true,
        revokedAt: true,
      },
    })
    if (!row || !row.active || row.revokedAt) return null

    // 🔑 El entorno que declara la llave presentada tiene que coincidir con el
    // de la fila. Sin esto, una llave `_test_` abría la puerta de una property
    // `live` —la búsqueda es por `keyId`, que es el mismo— y el prefijo de
    // entorno no significaba nada. Es exactamente la confusión que separa una
    // prueba de una reserva real.
    if (entorno !== row.environment) return null

    const ok = await bcrypt.compare(secret, row.keyHash)
    if (!ok) return null

    if (prefijo === 'pk') {
      this.logger.warn(
        `[BookingApiKey] llave heredada pk_ en uso (property=${row.propertyId}, id=${row.id}). ` +
          'Emitir una sk_ y revocarla: el prefijo pk_ promete «seguro en el navegador» y esta llave crea reservas.',
      )
    }

    // lastUsedAt best-effort (no bloquea la request).
    this.prisma.bookingApiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined)

    return {
      id: row.id,
      propertyId: row.propertyId,
      environment: row.environment,
      allowedOrigins: row.allowedOrigins,
    }
  }
}
