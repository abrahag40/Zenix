import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { StaffRole } from '@zenix/shared'
import { ApiOperation } from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { PrecioDeTipoDto } from './precio-de-tipo.dto'
import { PrecioDeTipoService } from './precio-de-tipo.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

@Controller('v1/room-types')
export class RoomTypesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly precios: PrecioDeTipoService,
  ) {}

  /**
   * Cambiar el precio por noche de un tipo de habitación.
   *
   * 🔴 `SUPERVISOR`, el mismo rol que exige todo `rates.controller.ts`. El
   * precio es dinero: quien lo cambia es quien responde por él, y recepción no
   * tiene por qué poder hacerlo.
   *
   * La propiedad y la organización salen del CONTEXTO del que pide, nunca del
   * cuerpo ni de la URL. Si vinieran de fuera, cambiar un número en la
   * petición cambiaría el precio de otro hotel.
   */
  @ApiOperation({ summary: 'Cambiar la tarifa base de un tipo de habitación' })
  @Patch(':id/precio')
  @Roles(StaffRole.SUPERVISOR)
  async cambiarPrecio(@Param('id') id: string, @Body() dto: PrecioDeTipoDto) {
    return this.precios.cambiar({
      roomTypeId: id,
      tarifaCentavos: dto.tarifaCentavos,
      organizationId: this.tenant.getOrganizationId(),
      propertyId: this.tenant.getPropertyId(),
      actorId: this.tenant.getUserId(),
    })
  }

  @Get()
  async findAll(@Query('propertyId') propertyId: string) {
    const orgId = this.tenant.getOrganizationId()

    const [roomTypes, unassignedRooms] = await Promise.all([
      this.prisma.roomType.findMany({
        where: { organizationId: orgId, propertyId, isActive: true, deletedAt: null },
        include: {
          rooms: { where: { deletedAt: null }, orderBy: { number: 'asc' } },
        },
        orderBy: { name: 'asc' },
      }),
      // Rooms that exist but have no roomTypeId — shown as a fallback group
      this.prisma.room.findMany({
        where: { propertyId, deletedAt: null, roomTypeId: null },
        orderBy: { number: 'asc' },
      }),
    ])

    if (unassignedRooms.length === 0) return roomTypes

    // Create a virtual fallback group for rooms not yet linked to a room type
    const fallbackGroup = {
      id: `fallback-${propertyId}`,
      organizationId: orgId,
      propertyId,
      name: 'Habitaciones',
      code: 'DEFAULT',
      description: null,
      maxOccupancy: 0,
      baseRate: 0,
      currency: 'USD',
      amenities: [],
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      rooms: unassignedRooms,
    }

    return [...roomTypes, fallbackGroup]
  }
}
