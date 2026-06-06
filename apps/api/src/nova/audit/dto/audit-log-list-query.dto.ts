/**
 * AuditLogListQueryDto — Sprint DTO-CORE.
 * Patrón dateFrom/dateTo + cursor pagination del Nova audit log.
 */
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class AuditLogListQueryDto {
  @IsOptional()
  @IsString()
  action?: string

  @IsOptional()
  @IsString()
  actorRealId?: string

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE', 'PARTIAL'])
  status?: 'SUCCESS' | 'FAILURE' | 'PARTIAL'

  @IsOptional()
  @IsDateString({ strict: false }, { message: 'dateFrom debe ser ISO 8601' })
  dateFrom?: string

  @IsOptional()
  @IsDateString({ strict: false }, { message: 'dateTo debe ser ISO 8601' })
  dateTo?: string

  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number
}
