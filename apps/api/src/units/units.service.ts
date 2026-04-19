import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { CreateUnitDto } from './dto/create-unit.dto'
import { UnitStatus } from '@zenix/shared'

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantContextService,
  ) {}

  create(roomId: string, dto: CreateUnitDto) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.unit.create({
      data: { ...dto, roomId, organizationId: orgId, status: dto.status ?? UnitStatus.AVAILABLE },
    })
  }

  findByRoom(roomId: string) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.unit.findMany({
      where: { roomId, organizationId: orgId },
      orderBy: { label: 'asc' },
    })
  }

  async findOne(id: string) {
    const orgId = this.tenant.getOrganizationId()
    const unit = await this.prisma.unit.findUnique({
      where: { id, organizationId: orgId },
      include: { room: { include: { property: true } } },
    })
    if (!unit) throw new NotFoundException('Unit not found')
    return unit
  }

  async update(id: string, dto: Partial<CreateUnitDto> & { status?: UnitStatus }) {
    await this.findOne(id)
    return this.prisma.unit.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.unit.delete({ where: { id } })
  }
}
