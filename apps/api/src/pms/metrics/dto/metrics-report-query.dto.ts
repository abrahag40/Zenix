import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * Query del reporte tabular de Métricas diarias (Estándar de Reportes).
 * Una fila por día (MetricsDailySnapshot): ocupación / ADR / RevPAR / ingreso /
 * llegadas / salidas / cancelaciones / no-shows. Sin filtro de divisa — las
 * métricas usan la divisa base del snapshot.
 */
const SORTABLE = [
  'date', 'occupancy', 'roomsSold', 'adr', 'revpar',
  'revenue', 'arrivals', 'departures', 'cancellations', 'noShows',
] as const

export class MetricsReportQueryDto {
  @IsString()
  propertyId!: string

  @IsDateString({ strict: false }, { message: 'from debe ser ISO 8601 (e.g. 2026-01-01)' })
  from!: string

  @IsDateString({ strict: false }, { message: 'to debe ser ISO 8601 (e.g. 2026-12-31)' })
  to!: string

  @IsOptional()
  @IsIn(SORTABLE as readonly string[])
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

export class MetricsReportExportQueryDto extends MetricsReportQueryDto {
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv'
}
