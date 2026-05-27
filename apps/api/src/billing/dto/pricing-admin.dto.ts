/**
 * PricingAdmin DTOs — input validation Day 5.
 *
 * Solo PLATFORM_ADMIN (ZaharDev) puede modificar pricing/caps que aplican
 * a TODOS los clientes Zenix.
 */
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator'

export class UpdatePricingConfigDto {
  @IsOptional()
  @IsInt() @Min(0) @Max(99999900) // máximo $999,999 MXN/mes
  monthlyAmountMxn?: number

  @IsOptional()
  @IsInt() @Min(0) @Max(99999900)
  monthlyAmountUsd?: number

  @IsOptional()
  @IsString() @Length(0, 64)
  stripePriceIdMxn?: string

  @IsOptional()
  @IsString() @Length(0, 64)
  stripePriceIdUsd?: string

  @IsOptional()
  @IsInt() @Min(0) @Max(50)
  annualDiscountPct?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class UpdatePartnerTierCapDto {
  @IsOptional()
  @IsInt() @Min(0) @Max(100)
  maxDiscountPct?: number

  // null = forever permitido (sin límite de meses).
  // Si se quiere forever-allowed, el cliente manda null explícito en JSON.
  @IsOptional()
  @IsInt() @Min(1) @Max(60)
  maxDurationMonths?: number | null

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean
}
