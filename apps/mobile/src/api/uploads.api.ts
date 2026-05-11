/**
 * uploads.api.ts (mobile) — Sprint Mx-1B-W2 + audit fixes T-photo-1..T-photo-3.
 *
 * Sube una imagen al endpoint `POST /v1/uploads` del backend.
 *
 * ## Por qué FileSystem.uploadAsync (no fetch + FormData)
 *
 * Testing T-photo-3 (2026-05-11): el usuario sigue viendo "El archivo no es
 * una imagen válida" después del fix expo-image-manipulator alignment.
 *
 * Investigación encontró que React Native FormData con `{ uri, name, type }`
 * tiene varios problemas reproducibles documentados:
 *  · iOS: a veces el archivo se serializa con BOM o headers extra que Sharp
 *    rechaza al decodificar (RN issue #28551).
 *  · Android: el content-type header puede no fijarse correctamente cuando
 *    hay nested objects (RN issue #29953).
 *  · Algunos backends (NestJS + Multer) interpretan el boundary distinto que
 *    el que RN genera, especialmente con tipos no comunes.
 *
 * `FileSystem.uploadAsync` resuelve esto: usa la implementación nativa
 * (NSURLSession en iOS, OkHttp en Android) que construye el multipart
 * correctamente desde el archivo en disco. NO pasa por el JS bridge para
 * los bytes, evitando corrupción.
 *
 * ## Por qué normalizamos a JPEG en el cliente (sigue válido)
 *
 * Sharp 0.33.x NPM prebuilt NO tiene libheif para HEIC. iPhones capturan
 * en HEIC por default. Aunque expo-image-picker convierte la mayoría de
 * las veces, hay edge cases. `expo-image-manipulator.manipulateAsync()`
 * garantiza JPEG real.
 *
 * Flujo:
 *   1. Picker devuelve URI (puede ser HEIC, JPG, etc.)
 *   2. ImageManipulator normaliza a JPEG (escribe nuevo archivo tmp)
 *   3. FileSystem.uploadAsync sube el archivo nativo como multipart
 */
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import type { UploadedImageDto, UploadScope } from '@zenix/shared'
import { ApiError, resolveApiBaseUrl } from './client'

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

async function normalizeToJpeg(uri: string): Promise<{ uri: string }> {
  // Pre-check: file existe y tiene contenido
  const info = await FileSystem.getInfoAsync(uri)
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

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }],
    {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  )

  // Post-check: el output existe y tiene bytes reales
  const outInfo = await FileSystem.getInfoAsync(result.uri)
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
    if (typeof sizeBytes === 'number' && sizeBytes > MAX_RAW_BYTES) {
      throw new UploadValidationError(
        `La imagen pesa ${(sizeBytes / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB.`,
      )
    }

    const normalized = await normalizeToJpeg(uri)

    // FileSystem.uploadAsync usa el stack nativo (NSURLSession / OkHttp).
    // Construye el multipart correctamente desde disco, sin pasar bytes por
    // el JS bridge → robusto contra los bugs de RN FormData.
    const base = resolveApiBaseUrl()
    const url = `${base}/api/v1/uploads`
    const token = await SecureStore.getItemAsync('hk_token').catch(() => null)

    const filename = `photo-${Date.now()}.jpg`

    const response = await FileSystem.uploadAsync(url, normalized.uri, {
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      httpMethod: 'POST',
      mimeType: 'image/jpeg',
      parameters: { scope },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      // El SDK no acepta filename custom; el archivo se sube con el nombre
      // del path tmp. El backend ignora el filename (usa UUID interno).
    })

    if (response.status >= 200 && response.status < 300) {
      try {
        return JSON.parse(response.body) as UploadedImageDto
      } catch {
        throw new ApiError(response.status, 'Respuesta del servidor no es JSON válido')
      }
    }

    // Extraer mensaje de error del cuerpo si es JSON
    let message = `Upload falló (HTTP ${response.status})`
    try {
      const body = JSON.parse(response.body)
      if (typeof body?.message === 'string') message = body.message
      else if (Array.isArray(body?.message) && typeof body.message[0] === 'string')
        message = body.message[0]
    } catch {
      // body no es JSON; usar default
    }
    throw new ApiError(response.status, message)
  },
}
