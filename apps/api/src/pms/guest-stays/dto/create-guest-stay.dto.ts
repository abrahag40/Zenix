import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsInt,
  IsDateString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { StrictStringRequired } from '../../../common/dto/strict-string.decorator'

/**
 * BUG #33 fix (Bloque II4) — MaxLength en text fields para prevenir DoS
 * via storage overflow. Mismos límites que UpdateGuestStayDto.
 */
export class CreateGuestStayDto {
  @IsString()
  propertyId: string

  @IsString()
  roomId: string

  // BUG #25 fix — StrictStringRequired rechaza boolean/number/object coerced.
  @StrictStringRequired({ minLength: 1, maxLength: 100 })
  firstName: string

  @StrictStringRequired({ minLength: 1, maxLength: 100 })
  lastName: string

  @IsEmail() @MaxLength(254) @IsOptional()
  guestEmail?: string

  @IsString() @MaxLength(20) @IsOptional()
  guestPhone?: string

  @IsString() @MaxLength(50) @IsOptional()
  nationality?: string

  /**
   * Sex/gender del huésped principal. Opcional al crear; campo BI-friendly.
   * Valores aceptados: M | F | O | N. Persistido como string libre.
   */
  @IsString() @MaxLength(5) @IsOptional()
  guestSex?: string

  @IsString() @MaxLength(30) @IsOptional()
  documentType?: string

  @IsString() @MaxLength(30) @IsOptional()
  documentNumber?: string

  @Transform(({ value }) => parseInt(value))
  @IsInt() @Min(1) @Max(20)
  adults: number

  @Transform(({ value }) => parseInt(value))
  @IsInt() @Min(0) @Max(20)
  children: number

  @IsDateString()
  checkIn: string

  @IsDateString()
  checkOut: string

  @Transform(({ value }) => parseFloat(value))
  @IsNumber() @Min(0) @Max(999_999_999)
  ratePerNight: number

  @IsString() @MaxLength(10)
  currency: string

  @IsString() @MaxLength(50)
  source: string

  @IsString() @MaxLength(50) @IsOptional()
  otaName?: string

  @Transform(({ value }) => parseFloat(value))
  @IsNumber() @Min(0) @Max(999_999_999)
  amountPaid: number

  @IsString() @MaxLength(30) @IsOptional()
  paymentMethod?: string

  /** PAYMENT-MODAL-UNIFY (Fase D) — referencia del anticipo. */
  @IsString() @MaxLength(100) @IsOptional()
  paymentReference?: string

  @IsString() @MaxLength(1000) @IsOptional()
  notes?: string
}
