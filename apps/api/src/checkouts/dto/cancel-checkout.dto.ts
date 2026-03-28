import { IsOptional, IsUUID } from 'class-validator'

export class CancelCheckoutDto {
  @IsOptional()
  @IsUUID()
  bedId?: string
}
