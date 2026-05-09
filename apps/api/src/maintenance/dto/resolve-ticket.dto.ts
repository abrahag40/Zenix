import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'

export class ResolveTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionSummary?: string

  @IsOptional()
  @IsUrl({ require_tld: false })
  afterPhotoUrl?: string
}
