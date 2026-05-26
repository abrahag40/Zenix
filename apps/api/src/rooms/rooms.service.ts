import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { CreateRoomDto } from './dto/create-room.dto'

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantContextService,
  ) {}

  create(propertyId: string, dto: CreateRoomDto) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.room.create({
      data: { ...dto, propertyId, organizationId: orgId },
      include: { units: true },
    })
  }

  findByProperty(propertyId: string) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.room.findMany({
      where: { propertyId, organizationId: orgId },
      include: { units: { orderBy: { label: 'asc' } } },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    })
  }

  async findOne(id: string) {
    const orgId = this.tenant.getOrganizationId()
    const room = await this.prisma.room.findUnique({
      where: { id, organizationId: orgId },
      include: { units: { orderBy: { label: 'asc' } }, property: true },
    })
    if (!room) throw new NotFoundException('Room not found')
    return room
  }

  async update(id: string, dto: Partial<CreateRoomDto>) {
    await this.findOne(id)
    return this.prisma.room.update({
      where: { id },
      data: dto,
      include: { units: true },
    })
  }

  /**
   * Soft-delete con type-to-confirm.
   *
   * Requiere `confirmation` = `Room.number` exacto. Aunque Room es menos
   * catastrófico que Property (no cascade-borra Org), igual afecta:
   *   - GuestStays históricos del cuarto
   *   - PaymentLogs ligados a esos stays
   *   - HK history (TaskLog)
   *   - Channex mapping (deja huérfano el room_type)
   *
   * NUNCA hard-delete (cascade integrity, §28). Type-to-confirm previene
   * mis-click del SUPERVISOR.
   */
  async remove(id: string, confirmation?: string) {
    const room = await this.findOne(id)

    if (confirmation === undefined || confirmation === null) {
      throw new BadRequestException(
        `Eliminar room requiere "confirmation" con el número exacto del cuarto ("${room.number}").`,
      )
    }
    if (confirmation !== room.number) {
      throw new BadRequestException(
        `Confirmación no coincide. Esperado: "${room.number}". Recibido: "${confirmation}". (Case-sensitive.)`,
      )
    }

    return this.prisma.room.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
