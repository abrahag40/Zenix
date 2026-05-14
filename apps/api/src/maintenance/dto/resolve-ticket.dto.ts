import { IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { PHOTO_URL_PATTERN } from './add-photo.dto'

export class ResolveTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionSummary?: string

  // Mismo pattern que AddPhotoDto — fix W2-01 (Sprint Mx-1B-W2 audit).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(PHOTO_URL_PATTERN, {
    message: 'URL inválida — debe provenir de /api/uploads o ser absoluta http(s).',
  })
  afterPhotoUrl?: string
}
