import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { CreateBedDto } from './dto/create-bed.dto'
import { BedStatus } from '@zenix/shared'

@Injectable()
export class BedsService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantContextService,
  ) {}

  create(roomId: string, dto: CreateBedDto) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.bed.create({
      data: { ...dto, roomId, organizationId: orgId, status: dto.status ?? BedStatus.AVAILABLE },
    })
  }

  findByRoom(roomId: string) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.bed.findMany({
      where: { roomId, organizationId: orgId },
      orderBy: { label: 'asc' },
    })
  }

  async findOne(id: string) {
    const orgId = this.tenant.getOrganizationId()
    const bed = await this.prisma.bed.findUnique({
      where: { id, organizationId: orgId },
      include: { room: { include: { property: true } } },
    })
    if (!bed) throw new NotFoundException('Bed not found')
    return bed
  }

  async update(id: string, dto: Partial<CreateBedDto> & { status?: BedStatus }) {
    await this.findOne(id)
    return this.prisma.bed.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.bed.delete({ where: { id } })
  }
}
