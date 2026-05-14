import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/**
 * Patrón de URL aceptado para fotos del módulo de mantenimiento.
 * Acepta:
 *   · Path interno del servicio de uploads (Sprint Mx-1B-W2):
 *       /api/uploads/{orgId}/{scope}/{uuid}.jpg
 *   · URLs absolutas http(s) (forward compat con Mx-1C → S3/CloudFront)
 *
 * Justificación (Sprint Mx-1B-W2 audit — W2-01):
 *   `@IsUrl()` de class-validator rechaza paths sin host (la convención que
 *   usa `UploadsService.processImage`). Como el URL siempre proviene de
 *   nuestro propio endpoint autenticado /v1/uploads, no necesitamos validación
 *   de protocolo — un `@Matches` específico es más preciso y evita el
 *   false-positive que rompía la pestaña "Fotos" en web y los botones
 *   "Antes/Después" en mobile.
 */
export const PHOTO_URL_PATTERN = /^(\/api\/uploads\/[A-Za-z0-9._\-\/]+\.jpg|https?:\/\/[^\s]+)$/

export class AddPhotoDto {
  @IsString()
  @MaxLength(500)
  @Matches(PHOTO_URL_PATTERN, {
    message: 'URL inválida — debe provenir de /api/uploads o ser absoluta http(s).',
  })
  url: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string

  @IsOptional()
  @IsBoolean()
  isAfterPhoto?: boolean
}
