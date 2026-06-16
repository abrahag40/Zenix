import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * RESERVATION-EDIT-PRECHECKIN (D-REP-1..4) — editar el RANGO de fechas de una
 * reserva que aún NO ha hecho check-in (adelantar / retrasar / alargar /
 * acortar), sin cancelar + recrear. Estándar de industria (6/6 PMS: Cloudbeds
 * "Edit Reservation", Mews "Change reservation details", OPERA "Edit Stay
 * Details", Little Hotelier, RoomRaccoon, Sirvoy).
 *
 * Reglas (confirmadas con owner 2026-06-15):
 *   - D-REP-2: el rango se mueve libremente en cualquier dirección. Invariante
 *     dura `checkOut > checkIn`; la nueva llegada NUNCA puede caer en un día
 *     anterior a hoy (timezone de la propiedad, §12). El recepcionista es
 *     autónomo (sin gate de supervisor); toda edición queda en GuestStayLog
 *     (`DATES_EDITED`, §11) para auditoría.
 *   - D-REP-3: el cambio de habitación NO es parte primaria de esta acción; sólo
 *     se ofrece `newRoomId` cuando el nuevo rango no cabe en la habitación
 *     actual (resolución de conflicto). Cambiar de habitación con el mismo rango
 *     se hace con los flujos existentes (drag&drop / mover habitación).
 *   - D-REP-4: la tarifa pactada se CONSERVA por defecto (Sprint 1). El toggle
 *     "recotizar al precio vigente" llega en Sprint 2 con preview del diff.
 */
export class EditReservationDatesDto {
  /** Nueva fecha/hora de llegada (ISO-8601). */
  @IsISO8601()
  checkInAt: string

  /** Nueva fecha/hora de salida planeada (ISO-8601). `checkOut > checkIn`. */
  @IsISO8601()
  scheduledCheckout: string

  /**
   * Habitación alternativa — SÓLO para resolver un conflicto del nuevo rango en
   * la habitación actual (D-REP-3). Si se omite, se conserva la habitación de
   * la reserva.
   */
  @IsString()
  @IsOptional()
  newRoomId?: string

  /** Motivo del cambio (auditoría §11). Recomendado, no obligatorio. */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string

  /**
   * D-REP-4 — recotizar al precio vigente del nuevo rango (toggle). Default
   * `false` = conservar la tarifa pactada. Si `true` pero no hay tarifas
   * configurables, cae a conservar (graceful).
   */
  @IsBoolean()
  @IsOptional()
  reprice?: boolean
}
