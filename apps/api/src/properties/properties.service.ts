import { Injectable, NotFoundException } from '@nestjs/common'
import { StaffRole, JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { CreatePropertyDto } from './dto/create-property.dto'

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantContextService,
  ) {}

  async create(dto: CreatePropertyDto) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.property.count()
      const propCode = String(count + 1).padStart(3, '0')
      return tx.property.create({ data: { ...dto, organizationId: orgId, propCode } })
    })
  }

  findAll() {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.property.findMany({
      // §28 + §11 — filtra soft-deleted Properties para no romper queries
      // downstream (calendar, reports, channex sync, audit). Las filas siguen
      // existiendo para preservar evidence chargeback Visa CRR §5.9.2 +
      // append-only PaymentLog/AuditLog cascade integrity.
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { name: 'asc' },
    })
  }

  async findMine(actor: JwtPayload) {
    if (actor.role === StaffRole.SUPERVISOR) {
      return this.prisma.property.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      })
    }
    const property = await this.findOne(actor.propertyId)
    return [property]
  }

  async findOne(id: string) {
    const orgId = this.tenant.getOrganizationId()
    const property = await this.prisma.property.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    })
    if (!property) throw new NotFoundException('Property not found')
    return property
  }

  async update(id: string, dto: Partial<CreatePropertyDto>) {
    await this.findOne(id)
    return this.prisma.property.update({ where: { id }, data: dto })
  }

  /**
   * Soft-delete. NUNCA hard-delete una Property porque cascade-borraría
   * Rooms, GuestStays, PaymentLogs, AuditLogs, CFDIs — evidence chargeback
   * Visa CRR §5.9.2 + USALI 12 ed append-only fiscal.
   *
   * Pre-Day 9 audit: este método hacía `prisma.property.delete()` directo.
   * Si un SUPERVISOR clickeaba "borrar property" → catástrofe silenciosa.
   * Migration completa de cascade integrity en SCHEMA-INTEGRITY sprint.
   */
  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
