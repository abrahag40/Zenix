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
 */
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class UpdateGuestStayDto {
  // ── Soft fields — editables siempre (salvo cancelled/no-show) ──────────
  @IsString() @IsOptional()
  guestName?: string

  @IsString() @IsOptional()
  guestEmail?: string

  @IsString() @IsOptional()
  guestPhone?: string

  @IsString() @IsOptional()
  documentType?: string

  @IsString() @IsOptional()
  documentNumber?: string

  /** Data URI base64; locked post-checkout (fiscal evidence). */
  @IsString() @IsOptional()
  documentPhotoUrl?: string

  @IsString() @IsOptional()
  nationality?: string

  @IsString() @IsOptional()
  notes?: string

  @IsString() @IsOptional()
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
  @IsNumber() @Min(0) @IsOptional()
  ratePerNight?: number

  // ── Approval para cambios significativos post-checkin ──────────────────
  @IsString() @IsOptional()
  managerApprovalCode?: string

  @IsString() @IsOptional()
  managerApprovalReason?: string

  /**
   * Razón general del cambio (opcional para soft fields, requerido para
   * rate/pax post-checkin junto con managerApprovalCode).
   */
  @IsString() @IsOptional()
  reason?: string
}
