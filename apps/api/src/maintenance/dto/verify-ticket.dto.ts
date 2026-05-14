import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class VerifyTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string

  /** false = supervisor rechaza calidad → ticket regresa a IN_PROGRESS. */
  @IsOptional()
  @IsBoolean()
  approved?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string
}
