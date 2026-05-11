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

export const uploadsApi = {
  /**
   * Comprime localmente y sube la imagen al servidor.
   * @throws si el archivo no es una imagen válida o el backend rechaza el MIME.
   */
  async uploadImage(file: File, scope: UploadScope = 'maintenance'): Promise<UploadedImageDto> {
    const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
    const form = new FormData()
    form.append('file', compressed, compressed.name || file.name)
    form.append('scope', scope)
    return api.postForm<UploadedImageDto>('/v1/uploads', form)
  },
}
