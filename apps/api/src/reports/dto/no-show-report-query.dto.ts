import { IsDateString, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator'

/** Query del reporte tabular de No-shows (Estándar de Reportes). */
export class NoShowReportQueryDto {
  @IsDateString({ strict: false })
  from!: string

  @IsDateString({ strict: false })
  to!: string

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser ISO 4217' })
  currency?: string

  @IsOptional()
  @IsIn(['NOT_APPLICABLE', 'PENDING', 'CHARGED', 'FAILED', 'WAIVED'])
  status?: string

  @IsOptional()
  @IsIn(['noShowAt', 'guest', 'room', 'source', 'fee', 'chargeStatus'])
  sort?: string

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number
}

export class NoShowReportExportQueryDto extends NoShowReportQueryDto {
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv'
}
