/**
 * DateRangeDto + variants — Sprint DTO-CORE (bug #22 sistémico).
 *
 * Detectado durante testing E2E:
 *   - Bloque PERF-1: /v1/metrics/range sin DTO → params from/to ausentes → 500
 *   - Bloque W (#24): /auth/switch-property sin DTO → silently keeps current
 *
 * Cuando el controller usa `@Query('from') from: string`, params ausentes/
 * malformed se pasan como `undefined` al service y producen comportamiento
 * silent + 500 genérico — pésima UX (NN/g H9 fail feedback).
 *
 * Estos DTOs son los building blocks reutilizables. Patrón:
 *   @Get('range')
 *   range(@Query() dto: DateRangeDto) {
 *     return this.service.getRange(new Date(dto.from), new Date(dto.to))
 *   }
 *
 * ValidationPipe global (main.ts):
 *   - whitelist: true → filtra fields no declarados
 *   - forbidNonWhitelisted: true → 400 si llega field extra
 *   - transform: true + enableImplicitConversion → coerce números
 */
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

/** Solo `from` y `to` ISO 8601 — para reports/metrics/rates. */
export class DateRangeDto {
  @IsDateString({ strict: false }, { message: 'from debe ser ISO 8601 (e.g. 2026-06-01)' })
  from!: string

  @IsDateString({ strict: false }, { message: 'to debe ser ISO 8601 (e.g. 2026-06-30)' })
  to!: string
}

/** `propertyId` requerido + `from/to` ISO 8601. Patrón calendar/reports. */
export class PropertyDateRangeDto extends DateRangeDto {
  @IsString({ message: 'propertyId debe ser string' })
  propertyId!: string
}

/** Solo una fecha (cash-summary, daily-grid, etc). */
export class SingleDateDto {
  @IsDateString({ strict: false }, { message: 'date debe ser ISO 8601 (e.g. 2026-06-15)' })
  date!: string
}

/** `propertyId` + 1 fecha. */
export class PropertyDateDto {
  @IsString({ message: 'propertyId debe ser string' })
  propertyId!: string

  @IsDateString({ strict: false }, { message: 'date debe ser ISO 8601' })
  date!: string
}

/** Solo `propertyId` required — listings simples. */
export class PropertyIdDto {
  @IsString({ message: 'propertyId debe ser string' })
  propertyId!: string
}

/**
 * Variantes con `dateFrom/dateTo` (audit-log convention).
 * NO extender DateRangeDto — los nombres difieren.
 */
export class DateFromToDto {
  @IsOptional()
  @IsDateString({ strict: false })
  dateFrom?: string

  @IsOptional()
  @IsDateString({ strict: false })
  dateTo?: string
}

/** Patrón pickup/pace: propertyId + daysAgo numérico + asOf opcional. */
export class PickupDto {
  @IsString()
  propertyId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  daysAgo!: number

  @IsOptional()
  @IsDateString({ strict: false })
  asOf?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  horizonDays?: number
}

/** Patrón forecast/forward: propertyId + asOf opcional + horizonDays opcional. */
export class ForecastDto {
  @IsString()
  propertyId!: string

  @IsOptional()
  @IsDateString({ strict: false })
  asOf?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  horizonDays?: number
}

/** Patrón startDate+endDate (blocks convention, single date required). */
export class StartEndDateDto {
  @IsDateString({ strict: false }, { message: 'startDate debe ser ISO 8601' })
  startDate!: string

  @IsOptional()
  @IsDateString({ strict: false })
  endDate?: string
}

/**
 * Ambos opcionales — para reports que tienen defaults sensatos cuando
 * el caller no pasa range (overview "hoy", staff-performance "última semana").
 */
export class OptionalDateRangeDto {
  @IsOptional()
  @IsDateString({ strict: false }, { message: 'from debe ser ISO 8601' })
  from?: string

  @IsOptional()
  @IsDateString({ strict: false }, { message: 'to debe ser ISO 8601' })
  to?: string
}
