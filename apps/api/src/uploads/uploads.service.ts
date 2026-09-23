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
 * 🔴 EL DISCO ES CACHÉ, LA BASE ES EL ALMACÉN (M9, 2026-09-23).
 *
 * Esta cabecera decía que «disco local es suficiente» para el piloto. No lo
 * era: en un despliegue con contenedor ese disco se va con el contenedor, y la
 * foto del documento de un huésped desaparece SIN ERROR y sin registro.
 * Pérdida de datos personales, silenciosa y garantizada — y de datos que la
 * LFPDPPP obliga a poder acreditar.
 *
 * Ahora cada archivo se escribe en los dos sitios. Se sirve del disco, que es
 * rápido; cuando el disco no lo tiene —justo después de un despliegue— se
 * repone desde la base. Que la caché desaparezca deja de tener consecuencias,
 * que es exactamente la diferencia entre una caché y un almacén.
 *
 * S3/R2 sigue siendo el destino a medio plazo y la interfaz (`{ id, url }`) no
 * cambia para llegar ahí.
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
import { PrismaService } from '../prisma/prisma.service'
import { join } from 'path'
import { randomUUID } from 'crypto'
// ROOT CAUSE testing T-25 final: Sharp exporta vía `module.exports = Sharp`
// (CommonJS function-only, sin .default). El tsconfig de este proyecto NO
// tiene `esModuleInterop: true` (lo agregaría regresión a otros imports),
// así que `import sharp from 'sharp'` compila a `sharp_1.default` que es
// undefined → "is not a function".
//
// Fix canónico: `import sharp = require('sharp')` — sintaxis TS específica
// para módulos con `export = sharp` (lo que Sharp d.ts declara explícitamente).
// Equivale a `const sharp = require('sharp')` runtime, sin perder los tipos.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp')
import { TenantContextService } from '../common/tenant-context.service'

const UPLOAD_ROOT = join(process.cwd(), 'uploads')
const MAX_LONG_EDGE_PX = 1920
const JPEG_QUALITY = 85

// 'precheckin' (AUTO-CHECKIN 2026-06-11) — foto de ID que el huésped sube en la
// mini web-app pre-arrival. ⚠️ PII sensible (pasaporte): su retrieval es
// AUTH-GATED (staff-only), NUNCA se sirve por el GET público de uploads.
export type UploadScope = 'maintenance' | 'readiness' | 'avatar' | 'precheckin'
const VALID_SCOPES: ReadonlySet<UploadScope> = new Set(['maintenance', 'readiness', 'avatar', 'precheckin'])

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

  constructor(
    private readonly tenant: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Procesa un buffer entrante (binario o base64). Path principal compartido
   * entre el endpoint multipart y el base64 — la única diferencia es de dónde
   * sale el `Buffer`.
   *
   * Sprint Mx-1B-W2 audit T-25 it.4: el path base64 es la ruta confiable para
   * clientes RN; multipart se queda como fallback compatible con curl/web.
   */
  async processBase64(base64Data: string, scopeRaw: string, orgIdOverride?: string): Promise<UploadedFileResult> {
    this.logger.log(
      `[upload] processBase64: scope=${scopeRaw} base64Length=${base64Data.length} ` +
        `first16=${base64Data.slice(0, 16)}`,
    )
    let buffer: Buffer
    try {
      // Remueve prefijo data URI si vino "data:image/jpeg;base64,XXXX".
      const stripped = base64Data.replace(/^data:image\/[a-z]+;base64,/, '')
      buffer = Buffer.from(stripped, 'base64')
    } catch (err) {
      this.logger.warn(`[upload] base64 decode failed: ${(err as Error).message}`)
      throw new BadRequestException('El campo "data" no es base64 válido.')
    }
    this.logger.log(
      `[upload] decoded: size=${buffer.length}B firstBytes=${buffer
        .slice(0, 8)
        .toString('hex')}`,
    )
    if (buffer.length === 0) {
      throw new BadRequestException('La imagen está vacía.')
    }
    const synthetic: Express.Multer.File = {
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
      originalname: 'photo.jpg',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    return this.processImage(synthetic, scopeRaw, orgIdOverride)
  }

  /**
   * Procesa un buffer en memoria proveniente de Multer y lo persiste como JPEG
   * optimizado. Lanza BadRequestException si el archivo no es imagen válida.
   */
  async processImage(file: Express.Multer.File, scopeRaw: string, orgIdOverride?: string): Promise<UploadedFileResult> {
    if (!file) throw new BadRequestException('Archivo requerido')
    if (!file.buffer || file.size === 0) throw new BadRequestException('Archivo vacío')
    this.logger.log(
      `[upload] processImage: mime=${file.mimetype} size=${file.size}B ` +
        `firstBytes=${file.buffer.slice(0, 12).toString('hex')}`,
    )

    const scope = this.validateScope(scopeRaw)
    // AUTO-CHECKIN: el upload público del huésped (pre-checkin) NO tiene
    // TenantContext (request token-gated, sin JWT). El caller resuelve el orgId
    // desde el token de la reserva y lo pasa explícito. Sin override → tenant.
    const organizationId = orgIdOverride ?? this.tenant.getOrganizationId()

    // Sharp valida internamente que el buffer sea imagen real (magic bytes).
    // `failOn: 'truncated'` (no 'error') tolera imágenes con metadata warnings
    // pero rechaza buffers truncados/corruptos. Testing T-photo-3 reveló que
    // 'error' rechazaba JPEGs válidos con EXIF blocks raros del iPhone.
    let pipeline: sharp.Sharp
    let metadata: sharp.Metadata
    try {
      pipeline = sharp(file.buffer, { failOn: 'truncated' })
      metadata = await pipeline.metadata()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errStack = err instanceof Error ? err.stack : undefined
      // Log de diagnóstico definitivo — captura TODO el contexto para
      // poder reproducir el bug fuera del request.
      this.logger.error(
        `[upload] SHARP REJECTED: mime=${file.mimetype} size=${file.size}B ` +
          `firstBytes=${file.buffer
            .slice(0, 16)
            .toString('hex')} err=${errMsg}`,
      )
      if (errStack) this.logger.error(`[upload] sharp stack: ${errStack}`)
      // El mensaje al cliente ahora incluye los primeros bytes — el
      // usuario puede compartirlos sin acceso a logs server-side.
      throw new BadRequestException(
        `Sharp no pudo procesar la imagen. ` +
          `(mime=${file.mimetype} firstBytes=${file.buffer
            .slice(0, 4)
            .toString('hex')}) ${errMsg}`,
      )
    }
    this.logger.log(
      `[upload] sharp metadata OK: format=${metadata.format} ` +
        `${metadata.width}x${metadata.height} hasAlpha=${metadata.hasAlpha}`,
    )

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

    const finalMeta = await sharp(buffer).metadata()

    // 🔴 LA BASE PRIMERO. Si el disco falla, el archivo ya está a salvo y la
    // caché se repone sola en la primera lectura. Al revés —disco primero— un
    // fallo de la base dejaría un archivo servible que no sobrevive al próximo
    // despliegue, que es justo el defecto que esto cierra.
    await this.prisma.uploadedFile.upsert({
      where: { organizationId_scope_filename: { organizationId, scope, filename } },
      create: {
        id, organizationId, scope, filename,
        mimeType: 'image/jpeg', sizeBytes: buffer.length,
        width: finalMeta.width ?? null, height: finalMeta.height ?? null,
        bytes: new Uint8Array(buffer),
      },
      update: { bytes: new Uint8Array(buffer), sizeBytes: buffer.length },
    })

    // El disco es mejor-esfuerzo: si no se puede escribir, se registra y se
    // sigue. Cada lectura posterior lo repondrá.
    try {
      await fs.writeFile(fullPath, buffer)
    } catch (err) {
      this.logger.warn(`No se pudo escribir la caché en disco: ${(err as Error).message}`)
    }

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

  /**
   * Parsea un public URL `/api/uploads/{org}/{scope}/{file}` → path absoluto
   * seguro en disco, o null si no es un upload válido. Mismas guardas de
   * path-traversal que el serve público.
   */
  private resolveStoredPath(publicUrl: string): string | null {
    const m = /^\/api\/uploads\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(publicUrl || '')
    if (!m) return null
    const [, org, scope, file] = m
    for (const seg of [org, scope, file]) {
      if (!/^[a-zA-Z0-9._-]+$/.test(seg) || seg.includes('..') || seg.includes('\0')) return null
    }
    if (!file.endsWith('.jpg')) return null
    const target = join(UPLOAD_ROOT, org, scope, file)
    if (!target.startsWith(UPLOAD_ROOT)) return null
    return target
  }

  /**
   * AUTO-CHECKIN §D-AC4 — lee una foto almacenada y la devuelve como data-URI.
   * Lo usa `getCheckinContext` (auth-gated) para mostrar la foto del huésped a
   * recepción SIN exponer el archivo por el GET público. Si el `documentPhotoUrl`
   * ya es un data-URI (foto capturada en recepción), el caller la usa tal cual.
   * Devuelve null si el archivo no existe o el URL no es un upload.
   */
  async readAsDataUri(publicUrl: string): Promise<string | null> {
    const buf = await this.leerBytes(publicUrl)
    return buf ? `data:image/jpeg;base64,${buf.toString('base64')}` : null
  }

  /**
   * 🔑 Lee el archivo, de donde esté, y repone la caché si hacía falta.
   *
   * Éste es el método que hace que M9 esté realmente cerrado: sin él la base
   * guardaría los bytes y nadie los leería nunca, porque todo lo demás sigue
   * mirando al disco. La primera lectura después de un despliegue encuentra el
   * disco vacío, baja de la base y lo repone — y a partir de ahí el disco
   * vuelve a servir, que es para lo que está.
   */
  async leerBytes(publicUrl: string): Promise<Buffer | null> {
    const partes = this.partesDeUrl(publicUrl)
    if (!partes) return null

    const target = this.resolveStoredPath(publicUrl)
    if (target) {
      try {
        return await fs.readFile(target)
      } catch {
        // No está en disco. No es un error: es una caché fría.
      }
    }

    const fila = await this.prisma.uploadedFile.findUnique({
      where: {
        organizationId_scope_filename: {
          organizationId: partes.org, scope: partes.scope, filename: partes.file,
        },
      },
      select: { bytes: true },
    })
    if (!fila) return null

    const buf = Buffer.from(fila.bytes)
    // Reponer la caché en segundo plano. Que falle no cambia la respuesta.
    if (target) {
      void fs
        .mkdir(join(UPLOAD_ROOT, partes.org, partes.scope), { recursive: true })
        .then(() => fs.writeFile(target, buf))
        .catch((err) => this.logger.warn(`No se pudo reponer la caché: ${(err as Error).message}`))
    }
    return buf
  }

  /** Borra un archivo almacenado por su public URL (retención §D-AC4). */
  async deleteByUrl(publicUrl: string): Promise<boolean> {
    const partes = this.partesDeUrl(publicUrl)
    if (!partes) return false

    // 🔴 La base primero, y el resultado depende de ELLA. Borrar sólo el disco
    // dejaría el archivo vivo en el almacén: una retención que cree haber
    // borrado y no borró es peor que no tener retención, porque nadie vuelve a
    // mirar.
    let borrado = false
    try {
      await this.prisma.uploadedFile.delete({
        where: {
          organizationId_scope_filename: {
            organizationId: partes.org, scope: partes.scope, filename: partes.file,
          },
        },
      })
      borrado = true
    } catch {
      // No estaba en la base: pudo subirse antes de M9. Se sigue al disco.
    }

    const target = this.resolveStoredPath(publicUrl)
    if (target) {
      try {
        await fs.unlink(target)
        borrado = true
      } catch {
        // Ya no estaba en disco.
      }
    }
    return borrado
  }

  /** Descompone `/api/uploads/{org}/{scope}/{file}` validando cada segmento. */
  private partesDeUrl(publicUrl: string): { org: string; scope: string; file: string } | null {
    const m = /^\/api\/uploads\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(publicUrl || '')
    if (!m) return null
    const [, org, scope, file] = m
    for (const seg of [org, scope, file]) {
      if (!/^[a-zA-Z0-9._-]+$/.test(seg) || seg.includes('..') || seg.includes('\0')) return null
    }
    if (!file.endsWith('.jpg')) return null
    return { org, scope, file }
  }
}
