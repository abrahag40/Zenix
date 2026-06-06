/**
 * rate-query DTOs — Sprint DTO-CORE.
 *
 * Específicos del controller de rates. Los 3 endpoints GET reciben query
 * params sueltos que producían 500 si malformed. Ahora 400 con mensaje.
 */
import { IsDateString, IsOptional, IsString } from 'class-validator'
import { PropertyDateRangeDto } from '../../../common/dto/date-range.dto'

/** `quote` extiende DateRange con `ratePlanId` opcional. */
export class RateQuoteDto extends PropertyDateRangeDto {
  @IsOptional()
  @IsString()
  ratePlanId?: string
}

/** `resolve-price` necesita 4 strings + 1 date. */
export class ResolvePriceDto {
  @IsString({ message: 'propertyId requerido' })
  propertyId!: string

  @IsString({ message: 'roomTypeId requerido' })
  roomTypeId!: string

  @IsDateString({ strict: false }, { message: 'date debe ser ISO 8601' })
  date!: string

  @IsString({ message: 'ratePlanId requerido' })
  ratePlanId!: string
}

/** Mutaciones rate-plan/season/restriction/override usan `propertyId` query. */
export class PropertyIdQueryDto {
  @IsString({ message: 'propertyId requerido' })
  propertyId!: string
}
