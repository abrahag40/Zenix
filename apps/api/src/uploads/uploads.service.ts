/**
 * UploadsService — Sprint Mx-1B-W2 (image infrastructure layer 1).
 *
 * Procesa imágenes recibidas vía multipart/form-data:
 *   1. Valida MIME real con Sharp metadata (no solo Content-Type del cliente —
 *      este puede falsificarse fácilmente)
 *   2. Resize a max 1920px lado largo (display-grade, no thumbnail extra)
 *   3. Recodifica a JPEG quality 0.85 + strip EXIF/GPS (privacidad huésped)
 *   4. Guarda en disco bajo `{root}/{organizationId}/{scope}/{uuid}.jpg`
 *   5. Devuelve URL pública relativa al global prefix (`/api/uploads/...`)
 *
 * Por qué disco local (no S3 todavía):
 *   - Sprint Mx-1C migrará a S3/CloudFront. La interfaz de retorno
 *     (`{ id, url }`) ya es compatible para mantener consumidores estables.
 *   - Piloto LATAM corre en single-instance; disco local es suficiente.
 *
 * Seguridad:
 *   - UUID v4 criptográfico → URLs no adivinables (mismo principio que S3
 *     unsigned URLs con random key)
 *   - MIME whitelist: image/jpeg | image/png | image/webp
 *   - Max 5 MB enforced por Multer antes de llegar a Sharp (memoria)
 *   - Path traversal imposible: nombre derivado de UUID, no de input usuario
 *   - Strip metadata EXIF/GPS — un guest no debe poder ubicar su geolocation
 *     desde una foto pública (NIST SP 800-122 + GDPR considerations)
 */

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { TenantContextService } from '../common/tenant-context.service'

const UPLOAD_ROOT = join(process.cwd(), 'uploads')
const MAX_LONG_EDGE_PX = 1920
const JPEG_QUALITY = 85

export type UploadScope = 'maintenance' | 'readiness' | 'avatar'
const VALID_SCOPES: ReadonlySet<UploadScope> = new Set(['maintenance', 'readiness', 'avatar'])

export interface UploadedFileResult {
  /** UUID que sirve también como nombre de archivo en disco. */
  id: string
  /** Path público relativo al prefix `/api/uploads/...`. */
  url: string
  /** Bytes finales tras procesar (puede ser menor al original por resize). */
  sizeBytes: number
  width: number
  height: number
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name)

  constructor(private readonly tenant: TenantContextService) {}

  /**
   * Procesa un buffer en memoria proveniente de Multer y lo persiste como JPEG
   * optimizado. Lanza BadRequestException si el archivo no es imagen válida.
   */
  async processImage(file: Express.Multer.File, scopeRaw: string): Promise<UploadedFileResult> {
    if (!file) throw new BadRequestException('Archivo requerido')
    if (!file.buffer || file.size === 0) throw new BadRequestException('Archivo vacío')

    const scope = this.validateScope(scopeRaw)
    const organizationId = this.tenant.getOrganizationId()

    // Sharp valida internamente que el buffer sea imagen real (magic bytes).
    // Si el cliente envió un .exe renombrado a .jpg, esto falla aquí.
    let pipeline: sharp.Sharp
    let metadata: sharp.Metadata
    try {
      pipeline = sharp(file.buffer, { failOn: 'error' })
      metadata = await pipeline.metadata()
    } catch (err) {
      this.logger.warn(`upload rejected: not a valid image (mime=${file.mimetype}, size=${file.size})`)
      throw new BadRequestException(
        'El archivo no es una imagen válida (JPEG/PNG/WebP).',
      )
    }

    // W2-08: Sharp normaliza HEIC → JPEG transparente; aceptamos el input.
    if (!metadata.format || !['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)) {
      throw new BadRequestException(
        `Formato no soportado: ${metadata.format ?? 'desconocido'}. Usa JPEG, PNG, WebP o HEIC.`,
      )
    }

    const id = randomUUID()
    const filename = `${id}.jpg`
    const dir = join(UPLOAD_ROOT, organizationId, scope)
    const fullPath = join(dir, filename)

    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (err) {
      this.logger.error(`mkdir failed: ${(err as Error).message}`)
      throw new InternalServerErrorException('No se pudo preparar el almacenamiento')
    }

    // Resize si supera el lado largo; recodifica todo a JPEG; strip metadata.
    // .rotate() respeta la orientación EXIF antes de eliminarla.
    const longEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0)
    const buffer = await pipeline
      .rotate()
      .resize({
        width: longEdge > MAX_LONG_EDGE_PX ? MAX_LONG_EDGE_PX : undefined,
        height: longEdge > MAX_LONG_EDGE_PX ? MAX_LONG_EDGE_PX : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
      .toBuffer()

    await fs.writeFile(fullPath, buffer)

    const finalMeta = await sharp(buffer).metadata()

    return {
      id,
      url: `/api/uploads/${organizationId}/${scope}/${filename}`,
      sizeBytes: buffer.length,
      width: finalMeta.width ?? 0,
      height: finalMeta.height ?? 0,
    }
  }

  private validateScope(raw: string): UploadScope {
    if (!VALID_SCOPES.has(raw as UploadScope)) {
      throw new BadRequestException(
        `Scope inválido. Valores permitidos: ${[...VALID_SCOPES].join(', ')}`,
      )
    }
    return raw as UploadScope
  }

  /** Path root absoluto — usado por el ServeStaticModule. */
  static rootDir(): string {
    return UPLOAD_ROOT
  }
}
