/**
 * GuestStayNote DTOs — Sprint EDIT-RESERVATION
 *
 * Bitácora humana per reserva (no audit automático). Append-only con ventana
 * de 5 minutos para editar typos (mismo autor).
 */
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export const NOTE_CHANNELS = ['GENERAL', 'GUEST_REQUEST', 'HOUSEKEEPING', 'INTERNAL'] as const
export type NoteChannel = (typeof NOTE_CHANNELS)[number]

export class CreateGuestStayNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  content!: string

  @IsOptional() @IsIn(NOTE_CHANNELS)
  channel?: NoteChannel
}

export class UpdateGuestStayNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  content!: string
}
