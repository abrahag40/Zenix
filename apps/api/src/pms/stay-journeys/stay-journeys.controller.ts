import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common'
import { StayJourneyService } from './stay-journeys.service'
import {
  ExtendSameRoomBodyDto,
  ExtendNewRoomBodyDto,
  RoomMoveBodyDto,
  MoveExtensionRoomDto,
  SplitReservationBodyDto,
} from './dto/stay-journey.dto'
import { TenantResource } from '../../common/guards/tenant.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '@zenix/shared'

@Controller('v1/stay-journeys')
export class StayJourneyController {
  constructor(private readonly service: StayJourneyService) {}

  @Get('timeline')
  findActiveForTimeline(
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.findActiveForTimeline(propertyId, new Date(from), new Date(to))
  }

  @Get(':id')
  @TenantResource({ model: 'stayJourney', paramName: 'id' })
  findById(@Param('id') id: string) {
    return this.service.findById(id)
  }

  @Post(':id/extend-same-room')
  @TenantResource({ model: 'stayJourney', paramName: 'id' })
  extendSameRoom(
    @Param('id') journeyId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() body: ExtendSameRoomBodyDto,
  ) {
    return this.service.extendSameRoom({ journeyId, newCheckOut: body.newCheckOut, actorId: actor.sub })
  }

  @Post(':id/extend-new-room')
  @TenantResource({ model: 'stayJourney', paramName: 'id' })
  extendNewRoom(
    @Param('id') journeyId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() body: ExtendNewRoomBodyDto,
  ) {
    return this.service.extendNewRoom({
      journeyId,
      newRoomId: body.newRoomId,
      newCheckOut: body.newCheckOut,
      actorId: actor.sub,
    })
  }

  @Post(':id/room-move')
  @TenantResource({ model: 'stayJourney', paramName: 'id' })
  roomMove(
    @Param('id') journeyId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() body: RoomMoveBodyDto,
  ) {
    return this.service.executeMidStayRoomMove({
      journeyId,
      newRoomId: body.newRoomId,
      effectiveDate: body.effectiveDate,
      actorId: actor.sub,
    })
  }

  @Post(':id/split')
  @TenantResource({ model: 'stayJourney', paramName: 'id' })
  split(
    @Param('id') journeyId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() body: SplitReservationBodyDto,
  ) {
    return this.service.splitReservation({
      journeyId,
      parts: body.parts.map((p) => ({
        roomId: p.roomId,
        checkIn: new Date(p.checkIn),
        checkOut: new Date(p.checkOut),
      })),
      actorId: actor.sub,
    })
  }

  @Patch('segments/:segmentId/move-room')
  moveExtensionRoom(
    @Param('segmentId') segmentId: string,
    @Body() dto: MoveExtensionRoomDto,
  ) {
    return this.service.moveExtensionRoom(segmentId, dto.newRoomId)
  }
}
