import { IsUUID, IsDateString, IsOptional, ValidateNested, ArrayMinSize } from 'class-validator'
import { Type } from 'class-transformer'

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

export class SplitPartBodyDto {
  @IsUUID()
  roomId: string

  @IsDateString()
  checkIn: string

  @IsDateString()
  checkOut: string
}

export class SplitReservationBodyDto {
  @ValidateNested({ each: true })
  @Type(() => SplitPartBodyDto)
  @ArrayMinSize(2)
  parts: SplitPartBodyDto[]
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

export interface SplitReservationPart {
  roomId: string
  checkIn: Date
  checkOut: Date
}

export interface SplitReservationServiceDto {
  journeyId: string
  parts: SplitReservationPart[]
  actorId: string
}
