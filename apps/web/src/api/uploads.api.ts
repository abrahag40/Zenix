/**
 * uploads.api.ts — cliente HTTP del endpoint `POST /v1/uploads`.
 *
 * Aplica compresión client-side antes de enviar (browser-image-compression):
 *   · Capa 1: reduce el tráfico de red (móvil LATAM con 4G inestable)
 *   · Capa 2: strip EXIF temprano (defensa en profundidad — el backend también
 *     lo hace con Sharp .rotate())
 *
 * El consumidor llama `uploadsApi.uploadImage(file, scope)` y recibe
 * `UploadedImageDto`. El siguiente paso típico es persistir la `url` en el
 * modelo de dominio (ej. `MaintenanceTicketPhoto`).
 */
import imageCompression from 'browser-image-compression'
import type { UploadedImageDto, UploadScope } from '@zenix/shared'
import { api } from './client'

const COMPRESSION_OPTIONS: import('browser-image-compression').Options = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.85,
  // No reescribir tipo MIME: si era PNG con transparencia (raro en fotos pero
  // posible), preservamos el formato. El backend recodifica todo a JPEG.
  fileType: undefined,
}

// Sprint Mx-1B-W2 audit — W2-09 fix: pre-check cliente antes de gastar red.
// El servidor rechaza con 413 si pasa, pero fallar local es mejor UX
// (Stripe Engineering Blog — "Fail fast in the client", 2020).
const MAX_RAW_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

export class UploadValidationError extends Error {
  readonly kind = 'UPLOAD_VALIDATION'
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export const uploadsApi = {
  /**
   * Comprime localmente y sube la imagen al servidor.
   * @throws `UploadValidationError` si el archivo falla pre-checks locales.
   * @throws `ApiError` si el backend rechaza (MIME real, magic bytes, etc).
   */
  async uploadImage(file: File, scope: UploadScope = 'maintenance'): Promise<UploadedImageDto> {
    if (!ALLOWED_MIMES.has(file.type)) {
      throw new UploadValidationError(
        'Formato no soportado. Usa JPEG, PNG, WebP o HEIC.',
      )
    }
    if (file.size > MAX_RAW_BYTES) {
      throw new UploadValidationError(
        `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.`,
      )
    }

    const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
    const form = new FormData()
    form.append('file', compressed, compressed.name || file.name)
    form.append('scope', scope)
    return api.postForm<UploadedImageDto>('/v1/uploads', form)
  },
}
