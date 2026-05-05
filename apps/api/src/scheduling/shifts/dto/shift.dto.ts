import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, Min } from 'class-validator'
import { ShiftExceptionType } from '@zenix/shared'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export class CreateShiftDto {
  @IsString()
  staffId!: string

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number

  @IsString()
  @Matches(HHMM, { message: 'startTime must be HH:mm' })
  startTime!: string

  @IsString()
  @Matches(HHMM, { message: 'endTime must be HH:mm' })
  endTime!: string

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string

  @IsOptional()
  @IsISO8601()
  effectiveUntil?: string
}

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @Matches(HHMM)
  startTime?: string

  @IsOptional()
  @IsString()
  @Matches(HHMM)
  endTime?: string

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsISO8601()
  effectiveUntil?: string
}

export class CreateShiftExceptionDto {
  @IsString()
  staffId!: string

  @IsISO8601()
  date!: string

  @IsString()
  type!: ShiftExceptionType

  @IsOptional()
  @IsString()
  @Matches(HHMM)
  startTime?: string

  @IsOptional()
  @IsString()
  @Matches(HHMM)
  endTime?: string

  @IsOptional()
  @IsString()
  reason?: string
}

/** Atajo del flujo "marcar ausencia" (D5) — siempre crea type=OFF */
export class CreateAbsenceDto {
  @IsString()
  staffId!: string

  @IsISO8601()
  date!: string

  @IsOptional()
  @IsString()
  reason?: string
}
