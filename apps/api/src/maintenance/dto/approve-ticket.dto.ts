import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class ApproveTicketDto {
  /** Si se provee, el ticket se asigna al técnico atómicamente con la aprobación. */
  @IsOptional()
  @IsUUID()
  assignedToId?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string
}
