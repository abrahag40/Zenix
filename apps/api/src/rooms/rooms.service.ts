import { Injectable, NotFoundException } from '@nestjs/common'
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
      include: { beds: true },
    })
  }

  findByProperty(propertyId: string) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.room.findMany({
      where: { propertyId, organizationId: orgId },
      include: { beds: { orderBy: { label: 'asc' } } },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    })
  }

  async findOne(id: string) {
    const orgId = this.tenant.getOrganizationId()
    const room = await this.prisma.room.findUnique({
      where: { id, organizationId: orgId },
      include: { beds: { orderBy: { label: 'asc' } }, property: true },
    })
    if (!room) throw new NotFoundException('Room not found')
    return room
  }

  async findByCloudbedsId(cloudbedsRoomId: string, propertyId: string) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.room.findFirst({ where: { cloudbedsRoomId, propertyId, organizationId: orgId } })
  }

  async update(id: string, dto: Partial<CreateRoomDto>) {
    await this.findOne(id)
    return this.prisma.room.update({
      where: { id },
      data: dto,
      include: { beds: true },
    })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.room.delete({ where: { id } })
  }
}
