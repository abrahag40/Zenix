import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { StaffRole, type JwtPayload } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RatesService } from './rates.service'
import {
  CreateRatePlanDto, UpdateRatePlanDto, CreateSeasonDto, UpdateSeasonDto,
  CreateRestrictionDto, UpsertOverrideDto, BulkOverrideDto, SetDayOfWeekDto,
} from './dto/rate-plan.dto'
import { RateQuoteDto, ResolvePriceDto, PropertyIdQueryDto } from './dto/rate-query.dto'
import { PropertyDateRangeDto } from '../../common/dto/date-range.dto'

@Controller('v1/rates')
export class RatesController {
  constructor(private readonly service: RatesService) {}

  /**
   * GET /v1/rates/daily-bar?propertyId=X&from=ISO&to=ISO
   * Returns array of { date, bar, currency } for the BAR strip header (Nivel 1).
   */
  @Get('daily-bar')
  getDailyBar(@Query() dto: PropertyDateRangeDto) {
    return this.service.getDailyBar(dto.propertyId, new Date(dto.from), new Date(dto.to))
  }

  /**
   * GET /v1/rates/quote?propertyId=X&from=ISO&to=ISO[&ratePlanId=Y]
   * Grid roomType × date. Con ratePlanId resuelve con seasons/day-of-week/overrides
   * (RATES-CORE D-RATES2); sin él usa la baseRate flat (v1.0.0).
   */
  @Get('quote')
  getRateQuoteGrid(@Query() dto: RateQuoteDto) {
    return this.service.getRateQuoteGrid(
      dto.propertyId,
      new Date(dto.from),
      new Date(dto.to),
      dto.ratePlanId || undefined,
    )
  }

  /**
   * GET /v1/rates/resolve-price?propertyId&roomTypeId&date&ratePlanId
   * Resolución de UNA tarifa con la capa que ganó (debug/audit).
   */
  @Get('resolve-price')
  resolvePrice(@Query() dto: ResolvePriceDto) {
    return this.service.resolvePrice(dto.propertyId, dto.roomTypeId, new Date(dto.date), dto.ratePlanId)
  }

  // ── RatePlan CRUD ───────────────────────────────────────────────────────────

  @Get('plans')
  listRatePlans(@Query() dto: PropertyIdQueryDto) {
    return this.service.listRatePlans(dto.propertyId)
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
    @Query() propertyIdDto: PropertyIdQueryDto,
    @Body() dto: UpdateRatePlanDto,
  ) {
    return this.service.updateRatePlan(propertyIdDto.propertyId, planId, dto)
  }

  @Delete('plans/:planId')
  @Roles(StaffRole.SUPERVISOR)
  deactivateRatePlan(
    @Param('planId') planId: string,
    @Query() propertyIdDto: PropertyIdQueryDto,
  ) {
    return this.service.deactivateRatePlan(propertyIdDto.propertyId, planId)
  }

  @Put('plans/:planId/day-of-week')
  @Roles(StaffRole.SUPERVISOR)
  setDayOfWeek(@Param('planId') planId: string, @Body() dto: SetDayOfWeekDto) {
    return this.service.setDayOfWeekRules(dto.propertyId, planId, dto.rules)
  }

  // ── Seasons ──────────────────────────────────────────────────────────────
  @Post('seasons')
  @Roles(StaffRole.SUPERVISOR)
  createSeason(@Body() dto: CreateSeasonDto) {
    const { propertyId, startDate, endDate, ...rest } = dto
    return this.service.createSeason(propertyId, { ...rest, startDate: new Date(startDate), endDate: new Date(endDate) })
  }

  @Patch('seasons/:seasonId')
  @Roles(StaffRole.SUPERVISOR)
  updateSeason(@Param('seasonId') seasonId: string, @Query() propertyIdDto: PropertyIdQueryDto, @Body() dto: UpdateSeasonDto) {
    return this.service.updateSeason(propertyIdDto.propertyId, seasonId, {
      name: dto.name, roomTypeId: dto.roomTypeId, overrideRate: dto.overrideRate, multiplier: dto.multiplier,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    })
  }

  @Delete('seasons/:seasonId')
  @Roles(StaffRole.SUPERVISOR)
  deleteSeason(@Param('seasonId') seasonId: string, @Query() propertyIdDto: PropertyIdQueryDto) {
    return this.service.deleteSeason(propertyIdDto.propertyId, seasonId)
  }

  // ── Restrictions ─────────────────────────────────────────────────────────
  @Post('restrictions')
  @Roles(StaffRole.SUPERVISOR)
  createRestriction(@Body() dto: CreateRestrictionDto) {
    const { propertyId, validFrom, validTo, ...rest } = dto
    return this.service.createRestriction(propertyId, { ...rest, validFrom: new Date(validFrom), validTo: new Date(validTo) })
  }

  @Delete('restrictions/:restId')
  @Roles(StaffRole.SUPERVISOR)
  deleteRestriction(@Param('restId') restId: string, @Query() propertyIdDto: PropertyIdQueryDto) {
    return this.service.deleteRestriction(propertyIdDto.propertyId, restId)
  }

  // ── Overrides (single + bulk con preview) ──────────────────────────────────
  @Post('overrides')
  @Roles(StaffRole.SUPERVISOR)
  upsertOverride(@Body() dto: UpsertOverrideDto, @CurrentUser() actor: JwtPayload) {
    const { propertyId, date, ...rest } = dto
    return this.service.upsertOverride(propertyId, { ...rest, date: new Date(date), createdById: actor.sub })
  }

  @Post('overrides/bulk')
  @Roles(StaffRole.SUPERVISOR)
  bulkOverride(@Body() dto: BulkOverrideDto, @CurrentUser() actor: JwtPayload) {
    const { propertyId, from, to, ...rest } = dto
    return this.service.bulkUpdateOverrides(propertyId, { ...rest, from: new Date(from), to: new Date(to), createdById: actor.sub })
  }
}
