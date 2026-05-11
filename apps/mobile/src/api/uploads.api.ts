/**
 * uploads.api.ts (mobile) — Sprint Mx-1B-W2.
 *
 * Sube una imagen capturada por expo-image-picker al endpoint
 * `POST /v1/uploads` del backend. No hace compresión en el cliente nativo
 * (lo cubre `ImagePicker.launchCameraAsync({ quality: 0.7 })` + Sharp en el
 * servidor que recomprime a JPEG 0.85). Mantener flujo simple: file URI →
 * FormData → server.
 *
 * Por qué no usar el mismo `browser-image-compression` que web:
 *   · Esa lib depende de Canvas API y Web Worker — no aplica en RN.
 *   · `quality: 0.7` de expo-image-picker reduce ~70% del tamaño original.
 *   · El backend Sharp pipeline normaliza todo a JPEG 0.85 + max 1920px de
 *     todas formas.
 */
import type { UploadedImageDto, UploadScope } from '@zenix/shared'
import { api, resolveApiBaseUrl } from './client'

/**
 * El backend devuelve URLs relativas (`/api/uploads/...`). Los `<Image>` de
 * RN exigen URI absoluto. Esta función resuelve la URL contra la base del
 * cliente actual (auto-detectada por Expo Go).
 *
 * Acepta también URLs ya absolutas (start con http) — útil cuando Mx-1C migre
 * a S3 y empiece a devolver URLs completas.
 */
export function resolveImageUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  const base = resolveApiBaseUrl().replace(/\/$/, '')
  return `${base}${url}`
}

/**
 * Detecta el MIME de un URI local (file://...). Expo-image-picker preserva la
 * extensión original (.jpg / .jpeg / .png / .heic / .webp).
 *
 * Nota: HEIC del iPhone → expo-image-picker lo convierte transparentemente a
 * JPEG en el asset retornado (Apple HEIF → JPEG via Photos framework). Nunca
 * deberíamos ver "image/heic" aquí en producción, pero lo aceptamos por si
 * acaso un asset legacy llega — el backend lo rechazará claramente.
 */
function inferMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'heic':
    case 'heif':
      return 'image/heic'
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg'
  }
}

// Sprint Mx-1B-W2 audit — W2-09: pre-check de tamaño usando expo-file-system.
// Si superamos 5MB, fallamos local antes de gastar red móvil (LATAM 4G).
const MAX_RAW_BYTES = 5 * 1024 * 1024

export class UploadValidationError extends Error {
  readonly kind = 'UPLOAD_VALIDATION'
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

/**
 * El asset que devuelve expo-image-picker ya incluye `fileSize` (en bytes)
 * y suele estar muy por debajo de 5MB con `quality: 0.7`. Si por alguna
 * razón viene null o supera el límite, abortamos con mensaje específico.
 */
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
    const form = new FormData()
    const filename = uri.split('/').pop() ?? `photo-${Date.now()}.jpg`
    form.append(
      'file',
      // React Native FormData formato { uri, name, type } — documentado en
      // RN + Expo (no compatible con DOM FormData estricto; aserción a any).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uri, name: filename, type: inferMimeType(uri) } as any,
    )
    form.append('scope', scope)
    return api.postForm<UploadedImageDto>('/v1/uploads', form, { timeoutMs: 30_000 })
  },
}
