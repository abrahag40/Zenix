import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { TicketCategory, TicketPriority } from '@zenix/shared'

export class CreateTicketDto {
  @IsOptional()
  @IsUUID()
  roomId?: string

  @IsOptional()
  @IsUUID()
  unitId?: string

  /** Identificador libre para tickets no-de-habitación (assets, áreas comunes). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assetTag?: string

  @IsEnum(TicketCategory)
  category: TicketCategory

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  guestImpact?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60 * 24)
  estimatedMinutes?: number

  /**
   * Días estimados hasta la finalización. Backend computa
   * `estimatedEndAt = now + days` y lo propaga a `RoomBlock.endDate` cuando
   * hay habitación bloqueada por CRITICAL — Channex cierra disponibilidad
   * SOLO ese período, no infinito (research 2026-05-10).
   *
   * Defaults sugeridos por categoría (cliente decide):
   *   PLUMBING: 3 · ELECTRICAL: 3 · HVAC: 2 · APPLIANCE: 2 · FURNITURE: 2
   *   STRUCTURAL: 7 · COSMETIC: 2 · SAFETY: 1 · PEST: 2 · DEEP_CLEANING: 1
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  estimatedEndDays?: number

  @IsOptional()
  @IsUUID()
  sourceTaskId?: string

  /** Flujo B — true cuando el reportador necesita aprobación del supervisor. */
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean

  /** Flujo A — supervisor asigna directamente al crear. */
  @IsOptional()
  @IsUUID()
  assignedToId?: string

  /**
   * URLs de fotos ya subidas vía POST /v1/uploads. Si vienen presentes, el
   * servicio crea N `MaintenanceTicketPhoto` en la misma transacción del
   * ticket. Limitado a 5 fotos en el create inicial (más se añaden después
   * vía `/tickets/:id/photos`).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  initialPhotoUrls?: string[]
}
