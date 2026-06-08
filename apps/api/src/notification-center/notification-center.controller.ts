import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common'
import { NotificationCenterService } from './notification-center.service'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import type { JwtPayload } from '@zenix/shared'
import { PropertyDateRangeDto } from '../common/dto/date-range.dto'

@Controller('v1/notification-center')
export class NotificationCenterController {
  constructor(private readonly service: NotificationCenterService) {}

  /** GET /v1/notification-center?propertyId=X&limit=50 */
  @Get()
  list(
    @CurrentUser() actor: JwtPayload,
    @Query('propertyId') propertyId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.listForUser(actor.sub, propertyId, limit)
  }

  /** GET /v1/notification-center/unread-count?propertyId=X */
  @Get('unread-count')
  unreadCount(
    @CurrentUser() actor: JwtPayload,
    @Query('propertyId') propertyId: string,
  ) {
    return this.service.unreadCount(actor.sub, propertyId).then((count) => ({ count }))
  }

  /** GET /v1/notification-center/audit?propertyId=X&from=ISO&to=ISO */
  @Get('audit')
  auditLog(@Query() dto: PropertyDateRangeDto) {
    return this.service.getAuditLog(dto.propertyId, new Date(dto.from), new Date(dto.to))
  }

  /** POST /v1/notification-center/acknowledge — FB+LinkedIn hybrid (NN/g 2023).
   *  Llamar cuando el usuario abre el NotificationPanel. Marca el ts del ack
   *  para que el bell counter baje a 0 sin tocar los reads individuales. */
  @Post('acknowledge')
  acknowledge(@CurrentUser() actor: JwtPayload) {
    return this.service.acknowledgePanelOpen(actor.sub).then(() => ({ ok: true }))
  }

  /** PATCH /v1/notification-center/read-all?propertyId=X */
  @Patch('read-all')
  markAllRead(
    @CurrentUser() actor: JwtPayload,
    @Query('propertyId') propertyId: string,
  ) {
    return this.service.markAllRead(actor.sub, propertyId)
  }

  /** PATCH /v1/notification-center/:id/read */
  @Patch(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.markRead(id, actor.sub)
  }

  /** POST /v1/notification-center/:id/approve */
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
    @Body('reason') reason?: string,
  ) {
    return this.service.approve(id, actor.sub, reason)
  }

  /** POST /v1/notification-center/:id/reject */
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
    @Body('reason') reason?: string,
  ) {
    return this.service.reject(id, actor.sub, reason)
  }
}
