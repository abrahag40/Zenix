import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator'
import { GamificationLevel } from '@zenix/shared'

export class UpdateStaffPreferencesDto {
  @IsOptional()
  @IsEnum(GamificationLevel)
  gamificationLevel?: GamificationLevel

  @IsOptional()
  @IsString()
  language?: string

  @IsOptional()
  @IsBoolean()
  hapticEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean

  @IsOptional()
  @IsString()
  reason?: string         // razón opcional para el audit log (D9)
}
