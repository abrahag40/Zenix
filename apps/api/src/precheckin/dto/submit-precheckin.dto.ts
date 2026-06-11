import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Sprint AUTO-CHECKIN — datos que el huésped confirma/corrige en la mini web-app
 * pre-arrival. TODOS opcionales (la carga es best-effort, §plan D-AC); el único
 * obligatorio es el consentimiento de privacidad (LFPDPPP, D-AC7).
 *
 * `photoBase64` = foto de ID tomada/cargada desde el navegador móvil (procesada
 * por UploadsService: Sharp + EXIF strip + resize + JPEG). NUNCA llega el ID
 * interno de la reserva por el body — el token (en la URL) lo resuelve server-side.
 */
export class SubmitPrecheckinDto {
  @IsOptional() @IsString() @MaxLength(120)
  guestFirstName?: string

  @IsOptional() @IsString() @MaxLength(120)
  guestLastName?: string

  @IsOptional() @IsEmail() @MaxLength(200)
  guestEmail?: string

  @IsOptional() @IsString() @MaxLength(40)
  guestPhone?: string

  @IsOptional() @IsString() @MaxLength(2)
  nationality?: string // ISO 3166-1 alpha-2

  @IsOptional() @IsIn(['F', 'M', 'O', 'N'])
  guestSex?: string

  @IsOptional() @IsString() @MaxLength(40)
  documentType?: string

  @IsOptional() @IsString() @MaxLength(60)
  documentNumber?: string

  /** Foto del documento en base64 (data URI o crudo). Procesada por UploadsService. */
  @IsOptional() @IsString()
  photoBase64?: string

  /** Aviso de privacidad aceptado (LFPDPPP) — obligatorio para enviar. */
  @IsBoolean()
  consentAccepted!: boolean
}
