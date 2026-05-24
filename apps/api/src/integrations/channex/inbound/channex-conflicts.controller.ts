import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common'
import { JwtPayload, StaffRole } from '@zenix/shared'
import { Roles } from '../../../common/decorators/roles.decorator'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { ChannexConflictsService, ConflictResolutionAction } from './channex-conflicts.service'
import { ChannexRoomSuggesterService } from './channex-room-suggester.service'
import { ResolveConflictDto } from './dto/resolve-conflict.dto'

/**
 * Channex conflict resolution endpoints — SUPERVISOR only.
 *
 * Authenticated via global JwtAuthGuard + TenantGuard. RolesGuard restricts
 * to SUPERVISOR because resolution decisions affect inventory, OTA
 * relationships and chargeback evidence.
 *
 * Endpoints:
 *   GET  /v1/channex/conflicts
 *   POST /v1/channex/conflicts/:stayId/resolve
 */
@Controller('v1/channex/conflicts')
@Roles(StaffRole.SUPERVISOR)
export class ChannexConflictsController {
  constructor(
    private readonly service: ChannexConflictsService,
    private readonly suggester: ChannexRoomSuggesterService,
  ) {}

  @Get()
  list() {
    return this.service.listConflicts()
  }

  /**
   * GET /v1/channex/conflicts/:stayId/suggestions
   * Top 3 recommended rooms ranked by similarity to the conflicted room.
   * Reduces cognitive load of resolving — vs a flat dropdown of every room
   * in the hotel.
   */
  @Get(':stayId/suggestions')
  suggestions(@Param('stayId') stayId: string) {
    return this.suggester.suggest(stayId)
  }

  @Post(':stayId/resolve')
  resolve(
    @Param('stayId') stayId: string,
    @Body() dto: ResolveConflictDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    if (dto.kind === 'MOVE_ROOM' && !dto.newRoomId) {
      throw new BadRequestException('newRoomId required for MOVE_ROOM')
    }
    const action: ConflictResolutionAction =
      dto.kind === 'MOVE_ROOM'
        ? { kind: 'MOVE_ROOM', newRoomId: dto.newRoomId!, reason: dto.reason }
        : dto.kind === 'CANCEL_LOCAL'
        ? { kind: 'CANCEL_LOCAL', reason: dto.reason }
        : dto.kind === 'CANCEL_AT_OTA'
        ? { kind: 'CANCEL_AT_OTA', reason: dto.reason }
        : { kind: 'MARK_REVIEWED', reason: dto.reason }
    return this.service.resolve(stayId, actor.sub, action)
  }
}
