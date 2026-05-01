import { IsOptional, IsString } from 'class-validator'
import { ClockSource } from '@zenix/shared'

export class ClockInDto {
  @IsOptional()
  @IsString()
  source?: ClockSource

  @IsOptional()
  @IsString()
  notes?: string
}

export class ClockOutDto {
  @IsOptional()
  @IsString()
  notes?: string
}
