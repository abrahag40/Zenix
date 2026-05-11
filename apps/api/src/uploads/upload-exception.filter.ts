/**
 * UploadExceptionFilter — traduce errores HTTP del upload a español.
 *
 * Contexto (Sprint Mx-1B-W2 audit — W2-02):
 *   `@nestjs/platform-express` traduce los errores de Multer así:
 *     LIMIT_FILE_SIZE  → PayloadTooLargeException("File too large")
 *     LIMIT_FILE_COUNT → BadRequestException("Too many files")
 *     ... etc.
 *   Esos mensajes son strings en inglés hardcoded en el paquete oficial. Para
 *   un piloto LATAM eso es un mal momento de UX ("Le sale en inglés y piensa
 *   que está roto" — Mews TrustRadius LATAM review).
 *
 * Diseño (mira hacia adelante — v1.2 i18n):
 *   En vez de un i18n module completo (que llega en v1.2 con `@nestjs/i18n` +
 *   archivos JSON), aplicamos un MAPA de claves a strings ES como fallback.
 *   Cuando v1.2 implemente el i18n module, este filtro:
 *     · Reemplaza el map por `await i18n.translate(key, lang)`
 *     · Detecta el idioma del header `Accept-Language` (ya hay middleware
 *       común en NestJS para esto)
 *     · Mantiene el mismo shape de respuesta (frontend no cambia)
 *
 * Por qué un filter solo para uploads (no global):
 *   Los otros endpoints ya devuelven texto ES porque construyo manualmente
 *   los mensajes en mis servicios (BadRequestException('Habitación no encontrada')).
 *   Multer es la excepción — no lo controlo, viene precompilado en inglés.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  PayloadTooLargeException,
  BadRequestException,
} from '@nestjs/common'
import type { Response } from 'express'

/**
 * Map de mensajes inglés (literales de Multer/Nest) → español.
 *
 * Source: node_modules/@nestjs/platform-express/multer/multer/multer.constants.js
 */
const MESSAGE_MAP_ES: Record<string, string> = {
  'File too large':
    'La imagen supera 5 MB. Recorta o reduce calidad antes de subir.',
  'Too many files':
    'Solo se puede subir una imagen a la vez.',
  'Too many parts':
    'Demasiados campos en el formulario.',
  'Field name too long':
    'Nombre de campo demasiado largo.',
  'Field value too long':
    'Valor de campo demasiado largo.',
  'Too many fields':
    'Demasiados campos en el formulario.',
  'Unexpected field':
    'Campo inesperado — usa "file" como nombre del archivo.',
  'Field name missing':
    'Falta el nombre del campo en el formulario.',
}

@Catch(PayloadTooLargeException, BadRequestException)
export class UploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UploadExceptionFilter.name)

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<{ url?: string }>()

    // Solo interceptamos errores que vienen del endpoint de uploads.
    // Otros 413/400 en la API NO deben pasar por aquí — los maneja el filtro
    // global con su propio formato.
    if (!req.url?.startsWith('/api/v1/uploads')) {
      throw exception
    }

    const status = exception.getStatus()
    const response = exception.getResponse()
    const originalMessage =
      typeof response === 'string'
        ? response
        : ((response as { message?: string }).message ?? exception.message)

    const translatedMessage = MESSAGE_MAP_ES[originalMessage] ?? originalMessage

    if (translatedMessage !== originalMessage) {
      this.logger.debug(
        `Translated Multer error '${originalMessage}' → '${translatedMessage}'`,
      )
    }

    res.status(status).json({
      statusCode: status,
      message: translatedMessage,
      error: status === 413 ? 'Payload Too Large' : 'Bad Request',
    })
  }
}
