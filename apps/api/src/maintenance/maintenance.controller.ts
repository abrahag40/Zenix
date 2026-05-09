import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { StaffRole, JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { MaintenanceService, CreateIssueDto } from './maintenance.service'

import { CreateTicketDto } from './dto/create-ticket.dto'
import { ApproveTicketDto } from './dto/approve-ticket.dto'
import { RejectTicketDto } from './dto/reject-ticket.dto'
import { AssignTicketDto } from './dto/assign-ticket.dto'
import { ResolveTicketDto } from './dto/resolve-ticket.dto'
import { VerifyTicketDto } from './dto/verify-ticket.dto'
import { ReopenTicketDto } from './dto/reopen-ticket.dto'
import { AddCommentDto } from './dto/add-comment.dto'
import { AddPhotoDto } from './dto/add-photo.dto'
import { TicketListQueryDto } from './dto/ticket-list-query.dto'

/**
 * Sprint Mx-1 — Maintenance Tickets Controller (sistema work-orders).
 *
 * Mounted at `/v1/maintenance/*`. Endpoints legacy `/tasks/:taskId/issues` y
 * `/maintenance` (resuelve/lista MaintenanceIssue legacy) se preservan al final.
 */
@Controller()
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  // ────────────────────────── New: Ticket lifecycle ──────────────────────────

  @Post('v1/maintenance/tickets')
  createTicket(@Body() dto: CreateTicketDto, @CurrentUser() actor: JwtPayload) {
    return this.service.createTicket(dto, actor)
  }

  @Get('v1/maintenance/tickets')
  listTickets(@Query() query: TicketListQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.service.findByProperty(query, actor)
  }

  @Get('v1/maintenance/queue')
  @Roles(StaffRole.SUPERVISOR, StaffRole.HOUSEKEEPER)
  // HOUSEKEEPER role here also includes MAINTENANCE staff — department gating
  // is enforced inside service.claimTicket().
  getQueue(@CurrentUser() actor: JwtPayload) {
    return this.service.getQueue(actor)
  }

  @Get('v1/maintenance/recurrence-templates')
  listTemplates(@CurrentUser() actor: JwtPayload) {
    return this.service.listRecurrenceTemplates(actor)
  }

  @Get('v1/maintenance/rooms/:roomId/history')
  @Roles(StaffRole.SUPERVISOR)
  roomHistory(@Param('roomId') roomId: string, @CurrentUser() actor: JwtPayload) {
    return this.service.getRoomHistory(roomId, actor)
  }

  @Get('v1/maintenance/assets/:assetTag/history')
  @Roles(StaffRole.SUPERVISOR)
  assetHistory(@Param('assetTag') assetTag: string, @CurrentUser() actor: JwtPayload) {
    return this.service.getAssetHistory(assetTag, actor)
  }

  @Get('v1/maintenance/tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch('v1/maintenance/tickets/:id/approve')
  @Roles(StaffRole.SUPERVISOR)
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.approveTicket(id, dto, actor)
  }

  @Patch('v1/maintenance/tickets/:id/reject')
  @Roles(StaffRole.SUPERVISOR)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.rejectTicket(id, dto, actor)
  }

  @Patch('v1/maintenance/tickets/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.claimTicket(id, actor)
  }

  @Patch('v1/maintenance/tickets/:id/assign')
  @Roles(StaffRole.SUPERVISOR)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.assignTicket(id, dto, actor)
  }

  @Patch('v1/maintenance/tickets/:id/start')
  start(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.startTicket(id, actor)
  }

  @Patch('v1/maintenance/tickets/:id/request-parts')
  requestParts(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.requestParts(id, body?.note, actor)
  }

  @Patch('v1/maintenance/tickets/:id/resume')
  resume(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.resumeTicket(id, actor)
  }

  @Patch('v1/maintenance/tickets/:id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.resolveTicket(id, dto, actor)
  }

  @Patch('v1/maintenance/tickets/:id/verify')
  @Roles(StaffRole.SUPERVISOR)
  verify(
    @Param('id') id: string,
    @Body() dto: VerifyTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.verifyTicket(id, dto, actor)
  }

  @Patch('v1/maintenance/tickets/:id/close')
  @Roles(StaffRole.SUPERVISOR)
  close(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.closeTicket(id, actor)
  }

  @Patch('v1/maintenance/tickets/:id/reopen')
  @Roles(StaffRole.SUPERVISOR)
  reopen(
    @Param('id') id: string,
    @Body() dto: ReopenTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.reopenTicket(id, dto, actor)
  }

  @Post('v1/maintenance/tickets/:id/comments')
  comment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.addComment(id, dto, actor)
  }

  @Post('v1/maintenance/tickets/:id/photos')
  photo(
    @Param('id') id: string,
    @Body() dto: AddPhotoDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.addPhoto(id, dto, actor)
  }

  // ────────────────────────── Legacy MaintenanceIssue ───────────────────────
  // @deprecated Sprint Mx-1 — preservados por compatibilidad. NO extender.

  /** @deprecated usar POST /v1/maintenance/tickets con sourceTaskId */
  @Post('tasks/:taskId/issues')
  createIssue(
    @Param('taskId') taskId: string,
    @Body() dto: CreateIssueDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.createIssue(taskId, dto, actor)
  }

  /** @deprecated */
  @Get('tasks/:taskId/issues')
  findIssuesByTask(@Param('taskId') taskId: string) {
    return this.service.findIssuesByTask(taskId)
  }

  /** @deprecated */
  @Get('maintenance')
  @Roles(StaffRole.SUPERVISOR)
  findIssues(
    @CurrentUser() actor: JwtPayload,
    @Query('resolved') resolved?: string,
  ) {
    const resolvedFilter = resolved === 'true' ? true : resolved === 'false' ? false : undefined
    return this.service.findIssuesByProperty(actor.propertyId, resolvedFilter)
  }

  /** @deprecated */
  @Patch('maintenance/:id/resolve')
  @Roles(StaffRole.SUPERVISOR)
  resolveIssue(@Param('id') id: string) {
    return this.service.resolveIssue(id)
  }
}
