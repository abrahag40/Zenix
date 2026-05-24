import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'

export class ResolveConflictDto {
  @IsString()
  @IsIn(['MOVE_ROOM', 'CANCEL_LOCAL', 'CANCEL_AT_OTA', 'MARK_REVIEWED'])
  kind!: 'MOVE_ROOM' | 'CANCEL_LOCAL' | 'CANCEL_AT_OTA' | 'MARK_REVIEWED'

  /** Required when kind=MOVE_ROOM */
  @ValidateIf((o: ResolveConflictDto) => o.kind === 'MOVE_ROOM')
  @IsString()
  newRoomId?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}
