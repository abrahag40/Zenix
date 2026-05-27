/**
 * DiscountCode DTOs — input validation Day 4.
 *
 * Alineado con la matriz de cap per partner tier aprobada por owner
 * 2026-05-26: AUTHORIZED 15% / SILVER 25% / GOLD 35% / PLATINUM 50%.
 */
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export const DISCOUNT_DURATIONS = ['once', 'repeating', 'forever'] as const
export type DiscountDuration = (typeof DISCOUNT_DURATIONS)[number]

export class GenerateDiscountCodeDto {
  @IsString() @Length(8, 64)
  subscriptionId!: string

  @IsInt() @Min(5) @Max(50)
  percentOff!: number

  @IsIn(DISCOUNT_DURATIONS)
  duration!: DiscountDuration

  // Si duration='repeating', es REQUIRED (1-12)
  @IsOptional()
  @IsInt() @Min(1) @Max(60)
  durationInMonths?: number

  @IsString() @MinLength(20) @MaxLength(500)
  reason!: string

  // Code legible custom — si vacío, se genera ZAHAR-{slug}-{year}
  @IsOptional()
  @IsString() @Length(3, 40)
  promotionCode?: string

  // Si el descuento excede el cap del consultor, ¿debe crear approval
  // request automáticamente? Default true. Si false → throws.
  @IsOptional()
  @IsBoolean()
  autoRequestApprovalIfExceedsCap?: boolean
}

export class RejectApprovalDto {
  @IsString() @MinLength(10) @MaxLength(500)
  rejectionReason!: string
}

export class SaveConsultorTemplateDto {
  @IsString() @MinLength(2) @MaxLength(80)
  name!: string

  @IsInt() @Min(5) @Max(50)
  percentOff!: number

  @IsIn(DISCOUNT_DURATIONS)
  duration!: DiscountDuration

  @IsOptional()
  @IsInt() @Min(1) @Max(60)
  durationInMonths?: number

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean
}
