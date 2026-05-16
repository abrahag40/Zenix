import { Controller, Get, Query } from '@nestjs/common'
import { RatesService } from './rates.service'

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
   * GET /v1/rates/quote?propertyId=X&from=ISO&to=ISO
   * Returns { roomTypes, dates, grid, currency } for Rate Quote Sheet (Nivel 3).
   */
  @Get('quote')
  getRateQuoteGrid(
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getRateQuoteGrid(propertyId, new Date(from), new Date(to))
  }
}
