import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator'

const REPORT_KEYS = ['metrics', 'no-shows', 'stays', 'overstayed'] as const
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const

export class CreateScheduledReportDto {
  @IsIn(REPORT_KEYS as readonly string[])
  reportKey!: string

  @IsIn(FREQUENCIES as readonly string[])
  frequency!: string

  @IsInt()
  @Min(0)
  @Max(23)
  sendHour!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  monthday?: number

  @IsInt()
  @Min(1)
  @Max(366)
  rangeDays!: number

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  recipients!: string[]

  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv'

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>
}

export class UpdateScheduledReportDto {
  @IsOptional()
  @IsIn(FREQUENCIES as readonly string[])
  frequency?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  sendHour?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  monthday?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  rangeDays?: number

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  recipients?: string[]

  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv'

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>
}
