import { IsUUID, IsDateString, IsOptional } from 'class-validator'

// ── HTTP request body DTOs ────────────────────────────────────────────────────
// journeyId comes from the URL param (:id), actorId from @CurrentUser().
// These DTOs only carry what the client sends in the request body.

export class ExtendSameRoomBodyDto {
  @IsDateString()
  newCheckOut: string
}

export class ExtendNewRoomBodyDto {
  @IsUUID()
  newRoomId: string

  @IsDateString()
  newCheckOut: string
}

export class RoomMoveBodyDto {
  @IsUUID()
  newRoomId: string

  @IsDateString()
  effectiveDate: string
}

export class MoveExtensionRoomDto {
  @IsUUID()
  newRoomId: string

  @IsOptional()
  @IsUUID()
  actorId?: string
}

// ── Service-layer param types (assembled by controller from body + param + auth) ──

export interface ExtendSameRoomDto {
  journeyId: string
  newCheckOut: string
  actorId: string
}

export interface ExtendNewRoomDto {
  journeyId: string
  newRoomId: string
  newCheckOut: string
  actorId: string
}

export interface RoomMoveDto {
  journeyId: string
  newRoomId: string
  effectiveDate: string
  actorId: string
}
