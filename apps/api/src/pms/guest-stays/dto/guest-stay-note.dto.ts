/**
 * GuestStayNote DTOs — Sprint EDIT-RESERVATION
 *
 * Bitácora humana per reserva (no audit automático). Append-only con ventana
 * de 5 minutos para editar typos (mismo autor).
 */
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export const NOTE_CHANNELS = ['GENERAL', 'GUEST_REQUEST', 'HOUSEKEEPING', 'INTERNAL'] as const
export type NoteChannel = (typeof NOTE_CHANNELS)[number]

// Sprint 2026-05-20 — kind discriminator. STICKY = postit always-visible,
// CHAT = bitácora team chat, SYSTEM = mensajes automáticos Zenix.
export const NOTE_KINDS = ['CHAT', 'STICKY', 'SYSTEM'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

export class CreateGuestStayNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  content!: string

  @IsOptional() @IsIn(NOTE_CHANNELS)
  channel?: NoteChannel

  @IsOptional() @IsIn(NOTE_KINDS)
  kind?: NoteKind
}

export class UpdateGuestStayNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  content!: string
}
