import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator'

/** Query del reporte tabular de Estadías extendidas (Estándar de Reportes). */
export class StayReportQueryDto {
  @IsDateString({ strict: false })
  from!: string

  @IsDateString({ strict: false })
  to!: string

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser ISO 4217' })
  currency?: string

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsIn(['guest', 'room', 'checkIn', 'nights', 'revenue', 'source'])
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

export class StayReportExportQueryDto extends StayReportQueryDto {
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv'
}
