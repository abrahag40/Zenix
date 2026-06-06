/**
 * UpdateGuestStayDto — Sprint EDIT-RESERVATION
 *
 * Patch parcial de campos editables de una reserva. El service aplica la
 * matriz de guards per-phase (PRE_CHECKIN / POST_CHECKIN / POST_CHECKOUT /
 * CANCELLED / NOSHOW) — no toda combinación campo×phase está permitida.
 *
 * Cambios de tarifa post-checkin (`ratePerNight`) requieren campos de
 * approval del manager (`managerApprovalCode` + `managerApprovalReason`).
 * Backend valida; sin approval responde 403 con `code:'RATE_CHANGE_REQUIRES_APPROVAL'`.
 *
 * NOTA: `checkinAt` y `scheduledCheckout` NO están aquí — usar endpoints
 * dedicados `extendStay` / `moveRoom` que tienen su lógica AvailabilityService.
 *
 * BUG #33 fix (Bloque II4) — MaxLength en todos los text fields para prevenir
 * DoS via storage overflow. Límites conservadores basados en formatos reales:
 *   - guestName: 200 chars (cubre nombres compuestos LATAM extensos)
 *   - email: 254 chars (RFC 5321)
 *   - phone: 20 chars (E.164 max)
 *   - documentNumber: 30 chars (CURP/RFC/DNI/Passport)
 *   - nationality: 50 chars (nombre país completo)
 *   - notes/arrivalNotes: 1000 chars (operativo, no testimonio)
 *   - documentPhotoUrl: 2MB base64 ≈ 2.8M chars (data URI cap)
 *   - reason/approvalReason/approvalCode: 500 chars
 *
 * BUG #26 fix (Bloque EE2.2) — MinLength para campos con semántica de valor
 * (guestName vacío rompe display, documentType vacío rompe identification).
 */
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { StrictString } from '../../../common/dto/strict-string.decorator'

export class UpdateGuestStayDto {
  // ── Soft fields — editables siempre (salvo cancelled/no-show) ──────────
  // BUG #25 fix — StrictString rechaza boolean/number/object coerced antes
  // de pasar al validator. Sin esto: {guestName: true} → coerced a "true".
  @StrictString({ minLength: 1, maxLength: 200 })
  guestName?: string

  @IsString() @MaxLength(254) @IsOptional()
  guestEmail?: string

  @IsString() @MaxLength(20) @IsOptional()
  guestPhone?: string

  @IsString() @MaxLength(30) @IsOptional()
  documentType?: string

  @IsString() @MaxLength(30) @IsOptional()
  documentNumber?: string

  /** Data URI base64; locked post-checkout (fiscal evidence). 2MB cap. */
  @IsString() @MaxLength(2_800_000) @IsOptional()
  documentPhotoUrl?: string

  @IsString() @MaxLength(50) @IsOptional()
  nationality?: string

  @IsString() @MaxLength(1000) @IsOptional()
  notes?: string

  @IsString() @MaxLength(1000) @IsOptional()
  arrivalNotes?: string

  // ── Numeric / fiscal — guards más estrictos ────────────────────────────
  @IsInt() @Min(1) @Max(20) @IsOptional()
  paxCount?: number

  /**
   * Cambio de tarifa por noche. Triggers:
   *  - Pre-checkin: libre (sólo audit).
   *  - Post-checkin: requiere managerApprovalCode + managerApprovalReason.
   *  - Post-checkout: 403 (CFDI lock).
   * Total se recalcula automáticamente en backend si esto cambia.
   */
  @IsNumber() @Min(0) @Max(999_999_999) @IsOptional()
  ratePerNight?: number

  // ── Approval para cambios significativos post-checkin ──────────────────
  @IsString() @MaxLength(50) @IsOptional()
  managerApprovalCode?: string

  @IsString() @MaxLength(500) @IsOptional()
  managerApprovalReason?: string

  /**
   * Razón general del cambio (opcional para soft fields, requerido para
   * rate/pax post-checkin junto con managerApprovalCode).
   */
  @IsString() @MaxLength(500) @IsOptional()
  reason?: string
}
