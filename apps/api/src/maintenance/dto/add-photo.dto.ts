import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'

export class AddPhotoDto {
  @IsUrl({ require_tld: false })
  url: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string

  @IsOptional()
  @IsBoolean()
  isAfterPhoto?: boolean
}
