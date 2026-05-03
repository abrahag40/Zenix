/**
 * StaffGamificationController — endpoints for Hub Recamarista.
 *
 * Privacy: every endpoint scopes to actor.sub (the staff's own id).
 * No peer-to-peer access. Supervisor access (for coaching) lives in a
 * separate /v1/staff/:id/* surface (Sprint 9).
 *
 * Routes:
 *   GET  /v1/me/streak
 *   GET  /v1/me/personal-records
 *   GET  /v1/me/daily-rings?date=YYYY-MM-DD
 *   POST /v1/me/streak/freeze
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import type { JwtPayload } from '@zenix/shared'
import { StaffGamificationService } from './staff-gamification.service'

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10)
}

@UseGuards(JwtAuthGuard)
@Controller('v1/me')
export class StaffGamificationController {
  constructor(private readonly svc: StaffGamificationService) {}

  @Get('streak')
  getStreak(@CurrentUser() user: JwtPayload) {
    return this.svc.getStreak(user.sub, user.sub)
  }

  @Get('personal-records')
  getRecords(@CurrentUser() user: JwtPayload) {
    return this.svc.getPersonalRecords(user.sub, user.sub)
  }

  @Get('daily-rings')
  getRings(
    @CurrentUser() user: JwtPayload,
    @Query('date') date?: string,
  ) {
    return this.svc.getDailyRings(user.sub, user.sub, date ?? todayYMD())
  }

  @Post('streak/freeze')
  useFreeze(@CurrentUser() user: JwtPayload) {
    return this.svc.useFreeze(user.sub, user.sub)
  }
}
