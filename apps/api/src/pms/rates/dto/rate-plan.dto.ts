import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator'

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
