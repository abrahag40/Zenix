import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { IsDateString, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator'
import { StaffRole, type JwtPayload } from '@zenix/shared'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

class CreateEventDto {
  @IsString() @MaxLength(160) name!: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsIn(['FESTIVAL', 'CONFERENCE', 'HOLIDAY', 'SPORTS', 'CONCERT', 'RELIGIOUS', 'NATIONAL_HOLIDAY']) category!: string
  @IsDateString() startDate!: string
  @IsDateString() endDate!: string
  @IsString() @MaxLength(2) countryCode!: string
  @IsOptional() @IsString() @MaxLength(6) regionCode?: string
  @IsOptional() @IsString() @MaxLength(120) city?: string
  @IsOptional() @IsLatitude() latitude?: number
  @IsOptional() @IsLongitude() longitude?: number
  @IsOptional() @IsNumber() radiusKm?: number
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']) demandImpact!: string
  @IsOptional() @IsInt() expectedAttendance?: number
  @IsOptional() @IsString() sourceUrl?: string
}
class UpdateEventDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsOptional() @IsDateString() startDate?: string
  @IsOptional() @IsDateString() endDate?: string
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']) demandImpact?: string
  @IsOptional() @IsInt() expectedAttendance?: number
}

/**
 * AdminEventsController — Events Curator endpoints (D-COMPSET9, analog Tax Curator §91).
 *
 * Cliente NUNCA edita el catálogo base — sólo crea `LocalEventOverride` con reason +
 * approvedById. Acceso restringido a SUPERVISOR por ahora (chunk 2 piloto); cuando
 * Nova foundation esté ON-PROD se restringe a PLATFORM_ADMIN exclusivamente.
 *
 * `verifiedAt` marca eventos con fuente verificada (vs scraped/auto-detected futuros).
 */
@Controller('v1/admin/local-events')
@Roles(StaffRole.SUPERVISOR)
export class AdminEventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(
    @Query('countryCode') countryCode?: string,
    @Query('regionCode') regionCode?: string,
    @Query('city') city?: string,
  ) {
    return this.prisma.localEvent.findMany({
      where: {
        ...(countryCode && { countryCode }),
        ...(regionCode && { regionCode }),
        ...(city && { city }),
      },
      orderBy: { startDate: 'asc' },
      take: 200,
    })
  }

  @Post()
  create(@Body() dto: CreateEventDto, @CurrentUser() actor: JwtPayload) {
    return this.prisma.localEvent.create({
      data: {
        curatedById: actor.sub,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        countryCode: dto.countryCode,
        regionCode: dto.regionCode ?? null,
        city: dto.city ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        radiusKm: dto.radiusKm ?? null,
        demandImpact: dto.demandImpact,
        expectedAttendance: dto.expectedAttendance ?? null,
        source: 'MANUAL',
        sourceUrl: dto.sourceUrl ?? null,
      },
    })
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.prisma.localEvent.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.demandImpact && { demandImpact: dto.demandImpact }),
        ...(dto.expectedAttendance !== undefined && { expectedAttendance: dto.expectedAttendance }),
      },
    })
  }

  @Post(':id/verify')
  verify(@Param('id') id: string) {
    return this.prisma.localEvent.update({ where: { id }, data: { verifiedAt: new Date() } })
  }
}
