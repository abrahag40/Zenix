import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { IsArray, IsLatitude, IsLongitude, IsNumber, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { StaffRole, type JwtPayload } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CompsetService } from './compset.service'

class ManualSnapshotEntryDto {
  @IsString() competitorId!: string
  @IsObject() ratesByDate!: Record<string, { lowestRate: number; currency: string; availability: boolean }>
}
class SubmitManualSnapshotDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ManualSnapshotEntryDto)
  entries!: ManualSnapshotEntryDto[]
}

class AddCompetitorDto {
  @IsString() @MaxLength(120) name!: string
  @IsOptional() @IsString() externalId?: string
  @IsOptional() @IsString() externalSource?: string
  @IsOptional() @IsString() externalUrl?: string
  @IsLatitude() latitude!: number
  @IsLongitude() longitude!: number
  @IsOptional() @IsString() @MaxLength(255) address?: string
  @IsOptional() @IsNumber() starRating?: number
  @IsOptional() @IsNumber() guestRating?: number
  @IsOptional() @IsNumber() reviewCount?: number
  @IsOptional() @IsNumber() roomCount?: number
}

/**
 * Compset endpoints — SUPERVISOR-only (D-COMPSET6). Caller pasa propertyId
 * en path; el TenantContextGuard ya valida que la property está en el scope.
 */
@Controller('v1/properties/:propertyId/compset')
@Roles(StaffRole.SUPERVISOR)
export class CompsetController {
  constructor(private readonly service: CompsetService) {}

  @Get('competitors')
  list(@Param('propertyId') propertyId: string) {
    return this.service.listCompetitors(propertyId)
  }

  @Post('competitors')
  add(
    @Param('propertyId') propertyId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: AddCompetitorDto,
  ) {
    return this.service.addCompetitor(propertyId, actor.sub, dto)
  }

  @Delete('competitors/:competitorId')
  deactivate(
    @Param('propertyId') propertyId: string,
    @Param('competitorId') competitorId: string,
  ) {
    return this.service.deactivateCompetitor(propertyId, competitorId)
  }

  /** Search hotel via adapter (Google Places / Booking Affiliate / Stub). */
  @Get('competitors/search')
  search(
    @Param('propertyId') propertyId: string,
    @Query('q') q: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const near = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined
    return this.service.searchHotel(propertyId, q ?? '', near)
  }

  /** Manual refresh — útil para piloto + dev (cron lo dispara automático en prod). */
  @Post('refresh')
  refresh(@Param('propertyId') propertyId: string, @Query('horizonDays') horizonDays?: string) {
    return this.service.refreshSnapshots(propertyId, horizonDays ? parseInt(horizonDays, 10) : 30)
  }

  /** Dashboard card data (heatmap + disclaimer + warnings). */
  @Get('dashboard')
  dashboard(@Param('propertyId') propertyId: string, @Query('horizonDays') horizonDays?: string) {
    return this.service.getDashboardCard(propertyId, horizonDays ? parseInt(horizonDays, 10) : 14)
  }

  /**
   * Captura MANUAL del compset — supervisor ingresa rates observados (no scraping).
   * Crea 1 CompsetSnapshot por competidor con source='MANUAL'. Pattern alineado
   * con la práctica real del revenue manager boutique (STAR Report + Booking.com
   * check semanal) y evita los riesgos legales del scraping OTA (D-COMPSET5).
   */
  @Post('manual-snapshot')
  manualSnapshot(@Param('propertyId') propertyId: string, @Body() dto: SubmitManualSnapshotDto) {
    return this.service.submitManualSnapshot(propertyId, dto.entries)
  }
}
