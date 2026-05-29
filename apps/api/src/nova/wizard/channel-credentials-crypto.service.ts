/**
 * ChannelCredentialsCryptoService — AES-256-GCM encryption para credentials OTA.
 *
 * Sprint CHANNEX-AUTO-PROVISION Day 2.
 *
 * Las credentials del cliente para Booking/Expedia/Airbnb (hotel_id + username +
 * password / listing_id / partner_id) NUNCA se persisten en plain text. Se cifran
 * AES-256-GCM con KEK (Key Encryption Key) en .env, persisten en
 * `Channel.settingsEncrypted` como blob base64 que incluye: IV + auth tag + ciphertext.
 *
 * Seguridad:
 *   · KEK 32 bytes (256 bits) — `openssl rand -base64 32` al setup ops
 *   · IV único por encrypt (12 bytes — GCM standard)
 *   · Auth tag 16 bytes (GCM standard) — verifica integridad
 *   · Si KEK rota, re-encrypt all rows via migration tool
 *
 * NUNCA logear plain text del settings — solo `Object.keys(settings)` para audit.
 *
 * Format del blob almacenado (base64):
 *   [12 bytes IV][16 bytes auth tag][N bytes ciphertext]
 */
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12 // GCM standard
const AUTH_TAG_LEN = 16 // GCM standard
const KEY_LEN = 32 // AES-256

@Injectable()
export class ChannelCredentialsCryptoService {
  private readonly logger = new Logger(ChannelCredentialsCryptoService.name)
  private readonly kek: Buffer | null

  constructor(config: ConfigService) {
    const raw = config.get<string>('CHANNEX_CREDENTIALS_KEK')
    if (!raw) {
      this.logger.warn(
        '[ChannelCredentialsCryptoService] CHANNEX_CREDENTIALS_KEK no set. ' +
          'Channel credentials encryption disabled — provisioning de channels con ' +
          'credentials va a fallar. Run `openssl rand -base64 32 > kek.txt` y ' +
          'set CHANNEX_CREDENTIALS_KEK en .env antes de provisionar OTAs.',
      )
      this.kek = null
      return
    }
    try {
      const decoded = Buffer.from(raw, 'base64')
      if (decoded.length !== KEY_LEN) {
        throw new Error(`KEK length=${decoded.length} bytes, expected ${KEY_LEN} (AES-256)`)
      }
      this.kek = decoded
    } catch (err) {
      this.logger.error(
        `[ChannelCredentialsCryptoService] CHANNEX_CREDENTIALS_KEK inválida: ${(err as Error).message}`,
      )
      this.kek = null
    }
  }

  /** Devuelve true si la KEK está bien configurada y los encrypts funcionarán. */
  isReady(): boolean {
    return this.kek !== null
  }

  /**
   * Cifra un objeto JSON con AES-256-GCM. Output: base64 blob.
   * NUNCA logea el plain text.
   */
  encrypt(plain: Record<string, unknown>): string {
    if (!this.kek) {
      throw new InternalServerErrorException(
        'Channel credentials encryption no configurada — set CHANNEX_CREDENTIALS_KEK en .env',
      )
    }
    const iv = crypto.randomBytes(IV_LEN)
    const cipher = crypto.createCipheriv(ALGO, this.kek, iv)
    const json = Buffer.from(JSON.stringify(plain), 'utf8')
    const ct = Buffer.concat([cipher.update(json), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, ct]).toString('base64')
  }

  /**
   * Descifra un blob base64 → objeto JSON original.
   * Throws si la KEK no es la usada para cifrar (auth tag mismatch).
   */
  decrypt(blob: string): Record<string, unknown> {
    if (!this.kek) {
      throw new InternalServerErrorException(
        'Channel credentials decryption no configurada — set CHANNEX_CREDENTIALS_KEK en .env',
      )
    }
    const buf = Buffer.from(blob, 'base64')
    if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
      throw new InternalServerErrorException('Credential blob inválido (length too short)')
    }
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN)
    const ct = buf.subarray(IV_LEN + AUTH_TAG_LEN)
    const decipher = crypto.createDecipheriv(ALGO, this.kek, iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return JSON.parse(pt.toString('utf8'))
  }

  /** Helper safe-to-log: returns key names sin values (audit trail). */
  describeCredentials(settings: Record<string, unknown>): string {
    return `keys=[${Object.keys(settings).join(',')}]`
  }
}
