import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { UnitStatus } from '@zenix/shared'

export class CreateUnitDto {
  @IsString()
  @MinLength(1)
  label: string

  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus
}
