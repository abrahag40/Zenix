import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator'

const STRATEGIES = ['BAR', 'FIXED', 'MULTIPLIER'] as const

export class CreateRatePlanDto {
  @IsString() @MinLength(1)
  propertyId: string

  @IsString() @MinLength(1)
  code: string

  @IsString() @MinLength(2)
  name: string

  @IsIn(STRATEGIES) @IsOptional()
  baseStrategy?: (typeof STRATEGIES)[number]

  @IsNumber() @Min(0) @IsOptional()
  baseRate?: number

  @IsNumber() @Min(0) @IsOptional()
  baseMultiplier?: number

  @IsString() @IsOptional()
  cancellationPolicy?: string

  @IsArray() @IsString({ each: true }) @IsOptional()
  visibleToChannels?: string[]
}

export class UpdateRatePlanDto {
  @IsString() @MinLength(2) @IsOptional()
  name?: string

  @IsIn(STRATEGIES) @IsOptional()
  baseStrategy?: (typeof STRATEGIES)[number]

  @IsNumber() @Min(0) @IsOptional()
  baseRate?: number | null

  @IsNumber() @Min(0) @IsOptional()
  baseMultiplier?: number | null

  @IsString() @IsOptional()
  cancellationPolicy?: string

  @IsArray() @IsString({ each: true }) @IsOptional()
  visibleToChannels?: string[]

  @IsBoolean() @IsOptional()
  isActive?: boolean
}

// ── Seasons / Restrictions / Overrides (RATES Fase 1 — CRUD) ─────────────────

export class CreateSeasonDto {
  @IsString() @MinLength(1) propertyId: string
  @IsString() @MinLength(1) ratePlanId: string
  @IsString() @IsOptional() roomTypeId?: string
  @IsString() @MinLength(1) name: string
  @IsDateString() startDate: string
  @IsDateString() endDate: string
  @IsNumber() @Min(0) @IsOptional() overrideRate?: number
  @IsNumber() @Min(0) @IsOptional() multiplier?: number
}

export class UpdateSeasonDto {
  @IsString() @IsOptional() propertyId?: string
  @IsString() @MinLength(1) @IsOptional() name?: string
  @IsString() @IsOptional() roomTypeId?: string | null
  @IsDateString() @IsOptional() startDate?: string
  @IsDateString() @IsOptional() endDate?: string
  @IsNumber() @Min(0) @IsOptional() overrideRate?: number | null
  @IsNumber() @Min(0) @IsOptional() multiplier?: number | null
}

export class CreateRestrictionDto {
  @IsString() @MinLength(1) propertyId: string
  @IsString() @IsOptional() ratePlanId?: string
  @IsString() @IsOptional() roomTypeId?: string
  @IsDateString() validFrom: string
  @IsDateString() validTo: string
  @IsNumber() @Min(0) @IsOptional() mlos?: number
  @IsNumber() @Min(0) @IsOptional() maxLos?: number
  @IsBoolean() @IsOptional() cta?: boolean
  @IsBoolean() @IsOptional() ctd?: boolean
}

export class UpsertOverrideDto {
  @IsString() @MinLength(1) propertyId: string
  @IsString() @MinLength(1) roomTypeId: string
  @IsString() @IsOptional() ratePlanId?: string
  @IsDateString() date: string
  @IsNumber() @Min(0) overrideRate: number
  @IsString() @IsOptional() reason?: string
}

export class BulkOverrideDto {
  @IsString() @MinLength(1) propertyId: string
  @IsArray() @IsString({ each: true }) roomTypeIds: string[]
  @IsString() @IsOptional() ratePlanId?: string
  @IsDateString() from: string
  @IsDateString() to: string
  @IsNumber() @Min(0) newRate: number
  @IsString() @IsOptional() reason?: string
  @IsBoolean() @IsOptional() dryRun?: boolean
}
