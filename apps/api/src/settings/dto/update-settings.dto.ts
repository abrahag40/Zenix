import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator'
import { CarryoverPolicy } from '@zenix/shared'

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'defaultCheckoutTime must be HH:mm' })
  defaultCheckoutTime?: string

  @IsOptional()
  @IsString()
  timezone?: string

  @IsOptional()
  @IsString()
  pmsMode?: string

  /**
   * Hora local (0-23) a partir de la cual el night audit marca no-shows automáticamente.
   * Default: 2 (02:00 AM). Permite configurar ventana de gracia para late arrivals.
   * IMPORTANTE: Siempre se evalúa en la timezone de la propiedad, nunca en UTC.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)  // Máximo 6 AM — cobrar después crea disputas
  noShowCutoffHour?: number

  // ── Sprint 8H — Housekeeping scheduling rules ──────────────────────────────

  /**
   * Hora local (0-23) a la que el MorningRosterScheduler genera el roster diario.
   * Default 7 AM. Configurable porque hostels vacacionales arrancan 6, boutique 8.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  morningRosterHour?: number

  /**
   * Política de carryover de tareas incompletas del día anterior.
   * REASSIGN_TO_TODAY_SHIFT (default) | KEEP_ORIGINAL_ASSIGNEE | ALWAYS_UNASSIGNED.
   */
  @IsOptional()
  @IsEnum(CarryoverPolicy)
  carryoverPolicy?: CarryoverPolicy

  /** Toggle global de auto-asignación. Si false, todas las tareas nacen UNASSIGNED. */
  @IsOptional()
  @IsBoolean()
  autoAssignmentEnabled?: boolean

  /** Si true, mobile exige clock-in al abrir y bloquea acciones hasta marcar entrada. */
  @IsOptional()
  @IsBoolean()
  shiftClockingRequired?: boolean
}
