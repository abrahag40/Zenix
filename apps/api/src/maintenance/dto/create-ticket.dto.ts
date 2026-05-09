import {
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
}
