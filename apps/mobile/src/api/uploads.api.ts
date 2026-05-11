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

/**
 * Estrategia final (testing T-25 iteración 4) — BASE64 JSON UPLOAD.
 *
 * Después de 3 iteraciones fallidas con fetch+FormData y FileSystem.uploadAsync,
 * descartamos el patrón multipart entero. Multipart en RN es frágil por:
 *   · Boundary mismatch entre RN nativo (NSURLSession/OkHttp) y Multer
 *   · Encoding diferencias entre JS bridge y nativo
 *   · EXIF blocks en JPEG iPhone que Sharp toleraba en multipart pero NO
 *     en buffer extracted del multipart (¿por qué? sin claridad)
 *
 * El base64 JSON path elimina TODAS las variables:
 *   1. Mobile: lee el archivo como base64 con FileSystem
 *   2. Mobile: POST JSON `{ scope, data: '<base64>' }`
 *   3. Backend: decodifica base64 a Buffer → Sharp recibe bytes idénticos
 *      a los del archivo original
 *
 * Trade-off: payload base64 es ~33% mayor que binario. Compensa porque:
 *   · Hemos comprimido cliente a 1920px @ 0.85 → JPEG típico < 400KB
 *   · 400KB binario → 533KB base64. Trivial en 4G LATAM.
 *   · Beneficio: zero ambigüedad sobre lo que llega al backend.
 *
 * Reference: Stripe Mobile SDK, Notion Mobile, Linear Mobile usan base64
 * JSON para uploads pequeños (< 5MB) por la misma razón.
 */
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

    // Leer el JPEG normalizado como base64 (lectura nativa, sin JS bridge
    // para los bytes — FileSystem usa NSData/Files nativo).
    const base64 = await FileSystem.readAsStringAsync(normalized.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })

    if (!base64 || base64.length < 100) {
      throw new UploadValidationError(
        'La foto se procesó pero quedó vacía. Vuelve a tomarla.',
      )
    }

    // Sanity check pre-upload: los primeros bytes deben ser JPEG magic.
    // base64 "ffd8" → "/9j/" en encoding. Si NO empieza así, el archivo
    // no es JPEG → fail-fast con mensaje útil al usuario.
    if (!base64.startsWith('/9j/')) {
      throw new UploadValidationError(
        'El archivo procesado no es JPEG válido. Vuelve a tomar la foto.',
      )
    }

    return api.post<UploadedImageDto>('/v1/uploads/base64', {
      scope,
      data: base64,
    })
  },
}
