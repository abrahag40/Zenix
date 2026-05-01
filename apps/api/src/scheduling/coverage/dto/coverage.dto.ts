import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator'

export class CreateCoverageDto {
  @IsString()
  staffId!: string

  @IsString()
  roomId!: string

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number
}

export class UpdateCoverageDto {
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number
}
