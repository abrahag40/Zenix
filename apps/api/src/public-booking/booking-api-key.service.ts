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
 * Genera y verifica las API keys públicas de "Zenix Booking" (patrón Stripe
 * restricted key). Formato de la llave completa:
 *   pk_{env}_{keyId(16 hex)}{secret(32 hex)}
 * Persistimos `keyId` plano (lookup O(1)) + bcrypt(secret). El plaintext SÓLO
 * existe en el retorno de `generate` — nunca se vuelve a poder leer.
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
    const plaintextKey = `pk_${env}_${keyId}${secret}`
    const keyHash = await bcrypt.hash(secret, 10)
    const keyPrefix = `pk_${env}_${keyId.slice(0, 6)}…`

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
    const m = /^pk_(live|test)_([0-9a-f]{16})([0-9a-f]{32})$/.exec(presented.trim())
    if (!m) return null
    const [, , keyId, secret] = m

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

    const ok = await bcrypt.compare(secret, row.keyHash)
    if (!ok) return null

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
