/**
 * Metrics query DTOs — sprint testing BUG #22 fix.
 *
 * El controller original recibía params sueltos vía @Query() string y los
 * pasaba a `new Date(value)` sin validar. Si faltaba el param o era
 * malformed, el Date constructor producía `Invalid Date` → la query Prisma
 * subsiguiente lanzaba 500 genérico.
 *
 * Estos DTOs dan feedback informativo §39 NN/g H9 (qué pasó + por qué)
 * vía class-validator + ValidationPipe global de main.ts (whitelist:true,
 * transform:true, enableImplicitConversion).
 */
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class MetricsRangeDto {
  @IsString()
  propertyId!: string

  @IsDateString({ strict: false }, { message: 'from debe ser ISO 8601 (e.g. 2026-01-01)' })
  from!: string

  @IsDateString({ strict: false }, { message: 'to debe ser ISO 8601 (e.g. 2026-12-31)' })
  to!: string
}

export class MetricsBackfillDto {
  @IsString()
  propertyId!: string

  @IsDateString({ strict: false }, { message: 'from debe ser ISO 8601' })
  from!: string
}

export class MetricsForwardCaptureDto {
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

export class MetricsPickupDto {
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
