import { IsEnum, IsOptional, IsUUID } from 'class-validator'
import { CleaningCancelReason } from '@zenix/shared'

export class CancelCheckoutDto {
  @IsOptional()
  @IsUUID()
  unitId?: string

  /** Razón categorizada de la cancelación (D12). Default: RECEPTIONIST_MANUAL. */
  @IsOptional()
  @IsEnum(CleaningCancelReason)
  reason?: CleaningCancelReason
}
