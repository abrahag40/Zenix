import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { StaffRole } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { RatesService } from './rates.service'
import { CreateRatePlanDto, UpdateRatePlanDto } from './dto/rate-plan.dto'

@Controller('v1/rates')
export class RatesController {
  constructor(private readonly service: RatesService) {}

  /**
   * GET /v1/rates/daily-bar?propertyId=X&from=ISO&to=ISO
   * Returns array of { date, bar, currency } for the BAR strip header (Nivel 1).
   */
  @Get('daily-bar')
  getDailyBar(
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getDailyBar(propertyId, new Date(from), new Date(to))
  }

  /**
   * GET /v1/rates/quote?propertyId=X&from=ISO&to=ISO[&ratePlanId=Y]
   * Grid roomType × date. Con ratePlanId resuelve con seasons/day-of-week/overrides
   * (RATES-CORE D-RATES2); sin él usa la baseRate flat (v1.0.0).
   */
  @Get('quote')
  getRateQuoteGrid(
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('ratePlanId') ratePlanId?: string,
  ) {
    return this.service.getRateQuoteGrid(propertyId, new Date(from), new Date(to), ratePlanId || undefined)
  }

  /**
   * GET /v1/rates/resolve-price?propertyId&roomTypeId&date&ratePlanId
   * Resolución de UNA tarifa con la capa que ganó (debug/audit).
   */
  @Get('resolve-price')
  resolvePrice(
    @Query('propertyId') propertyId: string,
    @Query('roomTypeId') roomTypeId: string,
    @Query('date') date: string,
    @Query('ratePlanId') ratePlanId: string,
  ) {
    return this.service.resolvePrice(propertyId, roomTypeId, new Date(date), ratePlanId)
  }

  // ── RatePlan CRUD ───────────────────────────────────────────────────────────

  @Get('plans')
  listRatePlans(@Query('propertyId') propertyId: string) {
    return this.service.listRatePlans(propertyId)
  }

  @Post('plans')
  @Roles(StaffRole.SUPERVISOR)
  createRatePlan(@Body() dto: CreateRatePlanDto) {
    const { propertyId, ...rest } = dto
    return this.service.createRatePlan(propertyId, rest)
  }

  @Patch('plans/:planId')
  @Roles(StaffRole.SUPERVISOR)
  updateRatePlan(
    @Param('planId') planId: string,
    @Query('propertyId') propertyId: string,
    @Body() dto: UpdateRatePlanDto,
  ) {
    return this.service.updateRatePlan(propertyId, planId, dto)
  }

  @Delete('plans/:planId')
  @Roles(StaffRole.SUPERVISOR)
  deactivateRatePlan(
    @Param('planId') planId: string,
    @Query('propertyId') propertyId: string,
  ) {
    return this.service.deactivateRatePlan(propertyId, planId)
  }
}
