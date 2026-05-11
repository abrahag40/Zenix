/**
 * UploadsController — POST /v1/uploads + GET estático de imágenes.
 *
 * Auth model:
 *   · POST requiere JWT (global guard) — el TenantContextService deriva el
 *     organizationId del token; no se acepta como input del cliente.
 *   · GET /api/uploads/* es PÚBLICO (@Public) porque los path containen UUIDs
 *     criptográficos (random 128-bit) → URL no adivinable, equivalente al
 *     patrón "S3 unsigned URL with random key". Para piloto LATAM esto es
 *     suficiente; Mx-1C migra a signed URLs con TTL.
 *
 * Multer config:
 *   · memoryStorage — el buffer va directo a Sharp sin escritura intermedia
 *     (evita filename del cliente como vector de path traversal)
 *   · limits.fileSize = 5 MB — antes de procesar Multer rechaza
 *   · fileFilter primario por MIME del cliente; validación real ocurre en
 *     Sharp (magic bytes)
 */

import { promises as fs } from 'fs'
import { join, normalize, sep } from 'path'
import type { Response } from 'express'
import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  Body,
  Logger,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Public } from '../common/decorators/public.decorator'
import { UploadsService } from './uploads.service'
import { UploadExceptionFilter } from './upload-exception.filter'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
// Sprint Mx-1B-W2 audit — W2-08: HEIC añadido para iPhones con galería legacy
// donde expo-image-picker leakea HEIC en vez de convertir a JPEG. Sharp 0.33+
// decodifica HEIC vía libheif (compilado en el binary precompilado), nuestro
// pipeline lo recodifica a JPEG normalizado.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  // ── Subida (autenticada) ──────────────────────────────────────────────
  @Post('v1/uploads')
  @UseFilters(UploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(new BadRequestException('Formato no permitido. Usa JPEG, PNG o WebP.'), false)
        }
        cb(null, true)
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('scope') scope: string = 'maintenance',
  ) {
    if (!file) {
      throw new BadRequestException(
        'Falta el archivo. Envíalo en el campo "file" de multipart/form-data.',
      )
    }
    return this.uploads.processImage(file, scope)
  }

  /**
   * Upload via base64 JSON — alternativa robusta para clientes que tienen
   * problemas con multipart (React Native especialmente). Sprint Mx-1B-W2
   * audit T-25 iteración 4.
   *
   * Body shape: `{ scope?: string, data: string (base64) }`
   *
   * Trade-off: payload ~33% mayor que binario. Compensa para clientes RN
   * por eliminar toda la fragilidad del FormData bridge.
   */
  @Post('v1/uploads/base64')
  async uploadBase64(@Body() body: { scope?: string; data?: string }) {
    if (!body?.data || typeof body.data !== 'string') {
      throw new BadRequestException('Falta el campo "data" con la imagen en base64.')
    }
    if (body.data.length > 8 * 1024 * 1024) {
      // ~6 MB binario equivale a ~8 MB base64. Más que el límite multipart.
      throw new BadRequestException('La imagen supera 5 MB. Recorta o reduce calidad.')
    }
    return this.uploads.processBase64(body.data, body.scope ?? 'maintenance')
  }

  // ── Serve estático (público — protección por UUID-en-path) ─────────────
  //
  // Usamos un controlador (no ServeStaticModule) por dos razones:
  //  1. ServeStaticModule no respeta el global prefix `/api` con consistencia
  //     en todas las versiones; un controller @Public es predecible.
  //  2. Aquí podemos validar segments y prevenir path traversal explícitamente
  //     antes de leer del disco.
  @Public()
  @Get('uploads/:organizationId/:scope/:filename')
  async serve(
    @Param('organizationId') organizationId: string,
    @Param('scope') scope: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // Guard contra path traversal: los segments NO pueden contener `..`, `/`,
    // `\` ni null bytes. Una vez validados, los unimos con join() para obtener
    // un path absoluto seguro.
    for (const seg of [organizationId, scope, filename]) {
      if (
        !/^[a-zA-Z0-9._-]+$/.test(seg) ||
        seg.includes('..') ||
        seg.includes(sep) ||
        seg.includes('\0')
      ) {
        throw new BadRequestException('Path inválido')
      }
    }
    if (!filename.endsWith('.jpg')) {
      throw new NotFoundException('Recurso no encontrado')
    }

    const root = UploadsService.rootDir()
    const target = normalize(join(root, organizationId, scope, filename))
    // Defense in depth: asegurar que el target sigue dentro de root.
    if (!target.startsWith(root + sep) && target !== root) {
      throw new BadRequestException('Path fuera del root permitido')
    }

    try {
      await fs.access(target)
    } catch {
      throw new NotFoundException('Imagen no encontrada')
    }

    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.sendFile(target)
  }
}
