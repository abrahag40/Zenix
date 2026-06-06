/**
 * CheckBlockAvailabilityQueryDto — Sprint DTO-CORE.
 * Patrón startDate/endDate específico del módulo blocks.
 */
import { IsDateString, IsOptional, IsString } from 'class-validator'

export class CheckBlockAvailabilityQueryDto {
  @IsString({ message: 'roomId requerido' })
  roomId!: string

  @IsDateString({ strict: false }, { message: 'startDate debe ser ISO 8601' })
  startDate!: string

  @IsOptional()
  @IsDateString({ strict: false }, { message: 'endDate debe ser ISO 8601' })
  endDate?: string
}
