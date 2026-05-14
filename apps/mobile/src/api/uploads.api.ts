/**
 * uploads.api.ts (mobile) — Sprint Mx-1B-W2 + T-25 debug masivo.
 *
 * Logs `console.log('[upload]', ...)` en cada paso para que el usuario
 * pueda compartir el output de Metro Bundler y diagnostiquemos el bug
 * exacto. NO eliminar estos logs hasta que el flujo esté estable en piloto.
 */
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import type { UploadedImageDto, UploadScope } from '@zenix/shared'
import { api, resolveApiBaseUrl } from './client'

export function resolveImageUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  const base = resolveApiBaseUrl().replace(/\/$/, '')
  return `${base}${url}`
}

const MAX_RAW_BYTES = 5 * 1024 * 1024

export class UploadValidationError extends Error {
  readonly kind = 'UPLOAD_VALIDATION'
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

const log = (...args: unknown[]) => {
  // Siempre log (no solo __DEV__) para piloto — usuarios pueden compartir
  // el log con dev. Quitar antes de v1.1 release.
  console.log('[upload]', ...args)
}

async function normalizeToJpeg(uri: string): Promise<{ uri: string }> {
  log('normalize: input uri =', uri)

  const info = await FileSystem.getInfoAsync(uri)
  log('normalize: input info =', JSON.stringify(info))

  if (!info.exists) {
    throw new UploadValidationError(
      'El archivo de la foto se perdió. Vuelve a tomar la foto.',
    )
  }
  if ('size' in info && info.size === 0) {
    throw new UploadValidationError(
      'La foto está vacía. Vuelve a tomar la foto.',
    )
  }

  log('normalize: calling manipulateAsync...')
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],
    {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  )
  log(
    'normalize: manipulator output =',
    JSON.stringify({ uri: result.uri, width: result.width, height: result.height }),
  )

  const outInfo = await FileSystem.getInfoAsync(result.uri)
  log('normalize: output info =', JSON.stringify(outInfo))

  if (!outInfo.exists || ('size' in outInfo && outInfo.size === 0)) {
    throw new UploadValidationError(
      'No pudimos procesar la foto. Vuelve a tomarla o usa otra imagen.',
    )
  }

  return { uri: result.uri }
}

export const uploadsApi = {
  async uploadImage(
    uri: string,
    scope: UploadScope = 'maintenance',
    sizeBytes?: number | null,
  ): Promise<UploadedImageDto> {
    log('=== uploadImage START ===')
    log('args:', { uri, scope, sizeBytes })

    if (typeof sizeBytes === 'number' && sizeBytes > MAX_RAW_BYTES) {
      log('REJECTED: size pre-check failed (>5MB)')
      throw new UploadValidationError(
        `La imagen pesa ${(sizeBytes / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.`,
      )
    }

    let normalized: { uri: string }
    try {
      normalized = await normalizeToJpeg(uri)
    } catch (err) {
      log('REJECTED: normalize threw:', err instanceof Error ? err.message : String(err))
      throw err
    }
    log('normalize OK:', normalized.uri)

    let base64: string
    try {
      base64 = await FileSystem.readAsStringAsync(normalized.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log('REJECTED: readAsStringAsync threw:', msg)
      throw new UploadValidationError(
        `No pudimos leer el archivo procesado: ${msg}`,
      )
    }

    log('base64: length =', base64.length, 'first16chars =', base64.slice(0, 16))

    if (!base64 || base64.length < 100) {
      log('REJECTED: base64 demasiado corto')
      throw new UploadValidationError(
        'La foto se procesó pero quedó vacía. Vuelve a tomarla.',
      )
    }

    // Magic bytes check — JPEG en base64 empieza con /9j/ (ffd8 hex).
    // Otros formatos comunes:
    //   PNG  → iVBORw0KGgo
    //   WebP → UklGRg
    //   GIF  → R0lGOD
    //   HEIC → AAAAGGZ0eXBoZWlj (00000018 ftyp heic)
    if (!base64.startsWith('/9j/')) {
      log('REJECTED: base64 NO empieza con /9j/. Primeros 32 chars:', base64.slice(0, 32))
      throw new UploadValidationError(
        `El archivo procesado no es JPEG (firstBytes="${base64.slice(0, 12)}"). ` +
          `Vuelve a tomar la foto.`,
      )
    }

    log('base64 OK (JPEG magic match)')
    log('POST /v1/uploads/base64 ...')

    try {
      const result = await api.post<UploadedImageDto>('/v1/uploads/base64', {
        scope,
        data: base64,
      })
      log('=== uploadImage SUCCESS ===', JSON.stringify(result))
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log('REJECTED: api.post threw:', msg)
      // Re-throw — la jerarquía ya tiene los datos para diagnosticar
      throw err
    }
  },
}
