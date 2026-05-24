import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
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
   * Soft-delete con doble verificación (GitHub-style type-to-confirm).
   *
   * NUNCA hard-delete una Property porque cascade-borraría Rooms,
   * GuestStays, PaymentLogs, AuditLogs, CFDIs — evidence chargeback
   * Visa CRR §5.9.2 + USALI 12 ed append-only fiscal.
   *
   * Requiere `confirmation` = nombre exacto de la Property. El frontend
   * pide al user teclear el nombre antes de habilitar el botón, pero ESTE
   * guard es la defensa real — un atacante con curl o un dev bypaseando
   * el modal NO puede ejecutar el delete sin conocer + escribir el nombre.
   *
   * Pre-Day 9 audit: este método hacía `prisma.property.delete()` directo
   * sin confirmation. Hard-delete + cascade catastrófico.
   */
  async remove(id: string, confirmation?: string) {
    const property = await this.findOne(id)

    if (confirmation === undefined || confirmation === null) {
      throw new BadRequestException(
        `Eliminar property requiere "confirmation" en el body con el nombre exacto de la property ("${property.name}").`,
      )
    }
    if (confirmation !== property.name) {
      throw new BadRequestException(
        `El texto de confirmación no coincide. Esperado: "${property.name}". Recibido: "${confirmation}". (Case-sensitive — escribir exacto.)`,
      )
    }

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
