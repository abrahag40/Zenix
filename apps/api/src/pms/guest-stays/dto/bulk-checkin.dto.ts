import { Type } from 'class-transformer'
import {
  ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested,
} from 'class-validator'

/**
 * GROUP-CHECKIN Fase B — check-in bulk de miembros de un grupo.
 *
 * Cada entrada es una habitación que LLEGÓ (las ausentes simplemente no se
 * incluyen → quedan pendientes para el night audit, §4.3 del plan). El rename
 * es opcional (D-GRP-B1/B2 — el sistema NO obliga a renombrar; el hotel decide
 * si captura el nombre real del huésped en cada cama/habitación).
 */
export class BulkCheckinMemberDto {
  @IsString()
  stayId: string

  /** Nombre real del huésped de esta habitación (opcional, no bloqueante). */
  @IsString()
  @IsOptional()
  guestName?: string
}

export class BulkCheckinDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkCheckinMemberDto)
  @ArrayMinSize(1)
  members: BulkCheckinMemberDto[]

  /** Atestación del operador (una por lote) — identidad no bloqueante (§C1.13). */
  @IsBoolean()
  documentVerified: boolean
}
