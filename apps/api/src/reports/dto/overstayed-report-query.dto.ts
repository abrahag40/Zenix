import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * Query del reporte tabular de Saldos vencidos / overstayed (Estándar de Reportes).
 * No tiene rango de fechas — es un snapshot "al día de hoy" de los stays zombie.
 */
export class OverstayedReportQueryDto {
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser ISO 4217' })
  currency?: string

  @IsOptional()
  @IsIn(['scheduledCheckout', 'guest', 'room', 'hoursOverdue', 'balance'])
  sort?: string

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number
}

export class OverstayedReportExportQueryDto extends OverstayedReportQueryDto {
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv'
}
