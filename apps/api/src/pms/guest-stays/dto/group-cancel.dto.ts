import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator'

/**
 * GROUP-BILLING Fase C C4 (D-GRP-C6) — cancela N miembros de un grupo (parcial o
 * total). El frontend manda los stayIds seleccionados; el backend determina si es
 * total (no queda ningún miembro activo) y aplica la política de cada stay.
 */
export class GroupCancelDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  stayIds: string[]

  @IsIn(['GUEST', 'HOTEL', 'OTA', 'ADMIN_ERROR', 'SYSTEM'])
  initiator: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'

  @IsString()
  @IsOptional()
  reason?: string

  @IsString()
  @IsOptional()
  reasonCode?: string
}
