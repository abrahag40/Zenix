/**
 * uploads.api.ts (mobile) — Sprint Mx-1B-W2 + audit fix T-photo-1.
 *
 * Sube una imagen capturada por expo-image-picker al endpoint
 * `POST /v1/uploads` del backend.
 *
 * ## Por qué normalizamos a JPEG en el cliente (decisión clave del fix)
 *
 * El stack de Sharp NPM prebuilt (versión 0.33.x) ships con libvips compilado
 * SIN libheif (HEIC requiere codecs propietarios de Apple/Nokia que libheif
 * no incluye por default — solo AVIF está disponible). Verificación local:
 *
 *   $ node -e "const s = require('sharp'); console.log(s.format.heif.fileSuffix)"
 *   [ '.avif' ]   ← NO incluye '.heic' aunque la doc diga "HEIF"
 *
 * iPhones con iOS 11+ capturan en HEIC por default. Aunque expo-image-picker
 * con `quality < 1` re-encoda a JPEG en la mayoría de los casos, hay versiones
 * de Expo + iOS donde el asset retornado SIGUE siendo HEIC. Cuando el backend
 * recibe HEIC, Sharp throws "Input file contains unsupported image format" →
 * el usuario ve "El archivo no es una imagen válida".
 *
 * Fix definitivo: `expo-image-manipulator` recodifica TODO a JPEG antes del
 * upload. Esto garantiza que el binario subido sea siempre JPEG real. Sharp
 * en el backend recibe JPEG → siempre decodifica → flujo robusto.
 *
 * Referencias:
 *   · Sharp issue #2876 — "HEIC support requires custom libheif"
 *   · expo-image-picker issue #4753 — "Quality option does not always
 *     convert HEIC to JPEG on iOS"
 */
import * as ImageManipulator from 'expo-image-manipulator'
import type { UploadedImageDto, UploadScope } from '@zenix/shared'
import { api, resolveApiBaseUrl } from './client'

/**
 * El backend devuelve URLs relativas (`/api/uploads/...`). Los `<Image>` de
 * RN exigen URI absoluto. Esta función resuelve la URL contra la base del
 * cliente actual (auto-detectada por Expo Go). Acepta también URLs absolutas.
 */
export function resolveImageUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  const base = resolveApiBaseUrl().replace(/\/$/, '')
  return `${base}${url}`
}

// Pre-check de tamaño cliente — 5MB.
const MAX_RAW_BYTES = 5 * 1024 * 1024

export class UploadValidationError extends Error {
  readonly kind = 'UPLOAD_VALIDATION'
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

/**
 * Re-encoda a JPEG forzando compatibilidad con cualquier backend. También
 * aplica un resize de seguridad (max 1920px) — el backend lo haría de todas
 * formas, pero ahorrar bytes en upload mejora UX en redes lentas.
 */
async function normalizeToJpeg(uri: string): Promise<{ uri: string }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }], // height escala proporcional con AspectRatio
    {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  )
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
        `La imagen pesa ${(sizeBytes / 1024 / 1024).toFixed(1)} MB. Máximo 5 MB — vuelve a tomar la foto.`,
      )
    }

    // Fix T-photo-1: garantiza JPEG real, no importa si vino HEIC del picker.
    const normalized = await normalizeToJpeg(uri)

    const form = new FormData()
    const filename = `photo-${Date.now()}.jpg`
    form.append(
      'file',
      // React Native FormData formato { uri, name, type } — documentado en
      // RN + Expo (no compatible con DOM FormData estricto; aserción a any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uri: normalized.uri, name: filename, type: 'image/jpeg' } as any,
    )
    form.append('scope', scope)
    return api.postForm<UploadedImageDto>('/v1/uploads', form, { timeoutMs: 30_000 })
  },
}
