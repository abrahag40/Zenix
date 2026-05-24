/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5.
 *
 * ChannexRatePlansService — pass-through Channex + write-through Zenix DB
 * (ChannexRatePlanMapping table del Day 2).
 *
 * Pattern por método (analog Day 5 RoomTypes):
 *   1. Resuelve actingOrg + valida property
 *   2. Llama gateway → on SUCCESS:
 *      · CREATE: upsert ChannexRatePlanMapping con channexRatePlanId + roomTypeId + defaultRate
 *      · UPDATE: update mapping locally
 *      · DELETE: hard-delete mapping (cascade to RatePlanCap)
 *   3. AuditLog write con actorTier + status
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { TenantContextService } from '../../../common/tenant-context.service'
import {
  ChannexGateway,
  ChannexHttpError,
  ChannexRatePlan,
  ChannexRatePlanCreateInput,
  ChannexRatePlanUpdateInput,
} from '../../../integrations/channex/channex.gateway'
import { AuditLogService } from '../../audit/audit-log.service'

@Injectable()
export class ChannexRatePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly gateway: ChannexGateway,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(propertyId: string) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    // Source of truth en Zenix DB (write-through cache populado al crear).
    // Si está vacío, fallback a Channex API.
    const local = await this.prisma.channexRatePlanMapping.findMany({
      where: { propertyId, organizationId: orgId, isActive: true },
      include: { rateCap: true },
      orderBy: { title: 'asc' },
    })
    if (local.length > 0) return local

    // Fallback: query Channex direct (caso pre-Day 2 seed o full-sync recovery)
    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)
    return this.gateway.listRatePlans(channexPropertyId)
  }

  async create(
    propertyId: string,
    input: Omit<ChannexRatePlanCreateInput, 'propertyId'>,
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER',
    onBehalfOfUserId?: string,
    reason?: string,
  ) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)
    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)

    let created: ChannexRatePlan | null = null
    let mappingId: string | undefined
    let status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
    let errorMessage: string | undefined

    try {
      created = await this.gateway.createRatePlan({ ...input, propertyId: channexPropertyId })

      // Write-through: persistir en Zenix DB
      const mapping = await this.prisma.channexRatePlanMapping.create({
        data: {
          organizationId: orgId,
          propertyId,
          channexRatePlanId: created.id!,
          channexRoomTypeId: input.roomTypeId,
          title: input.title,
          currency: input.currency,
          sellMode: input.sellMode ?? 'per_room',
          rateMode: input.rateMode ?? 'manual',
          defaultRate: input.rateCents / 100, // cents → decimal
          defaultOccupancy: input.occupancy ?? 2,
          isActive: true,
          createdById: actorId,
        },
      })
      mappingId = mapping.id
    } catch (err) {
      status = 'FAILURE'
      errorMessage = err instanceof Error ? err.message : String(err)
    }

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_RATE_PLAN_CREATE',
      target: created?.id,
      payload: { propertyId, channexPropertyId, mappingId, ...input },
      status,
      errorMessage,
      reason,
    })

    if (status === 'FAILURE') {
      throw new ChannexHttpError(errorMessage ?? 'Channex error', 500)
    }
    return { ...created!, mappingId }
  }

  async update(
    channexRatePlanId: string,
    propertyId: string,
    input: ChannexRatePlanUpdateInput,
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER',
    onBehalfOfUserId?: string,
    reason?: string,
  ) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    let updated: ChannexRatePlan | null = null
    let status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
    let errorMessage: string | undefined

    try {
      updated = await this.gateway.updateRatePlan(channexRatePlanId, input)

      // Write-through partial update en mapping
      await this.prisma.channexRatePlanMapping.updateMany({
        where: { channexRatePlanId, organizationId: orgId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.sellMode !== undefined ? { sellMode: input.sellMode } : {}),
          ...(input.rateMode !== undefined ? { rateMode: input.rateMode } : {}),
          updatedById: actorId,
        },
      })
    } catch (err) {
      status = 'FAILURE'
      errorMessage = err instanceof Error ? err.message : String(err)
    }

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_RATE_PLAN_UPDATE',
      target: channexRatePlanId,
      payload: { propertyId, channexRatePlanId, changes: input },
      status,
      errorMessage,
      reason,
    })

    if (status === 'FAILURE') {
      throw new ChannexHttpError(errorMessage ?? 'Channex error', 500)
    }
    return updated!
  }

  async delete(
    channexRatePlanId: string,
    propertyId: string,
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER',
    onBehalfOfUserId?: string,
    reason?: string,
  ) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    let status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
    let errorMessage: string | undefined

    try {
      await this.gateway.deleteRatePlan(channexRatePlanId)
      // Hard-delete mapping (CASCADE borra RatePlanCap también)
      await this.prisma.channexRatePlanMapping.deleteMany({
        where: { channexRatePlanId, organizationId: orgId },
      })
    } catch (err) {
      status = 'FAILURE'
      errorMessage = err instanceof Error ? err.message : String(err)
    }

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_RATE_PLAN_DELETE',
      target: channexRatePlanId,
      payload: { propertyId, channexRatePlanId },
      status,
      errorMessage,
      retentionPolicy: 'PERMANENT', // delete de rate plan = evidencia Visa CRR
      reason,
    })

    if (status === 'FAILURE') {
      throw new ChannexHttpError(errorMessage ?? 'Channex error', 500)
    }
    return { deleted: true }
  }

  // ── Helpers privados ────────────────────────────────────────────────────

  private async assertPropertyInOrg(propertyId: string, orgId: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId: orgId },
      select: { id: true },
    })
    if (!property) {
      throw new NotFoundException(
        `Property ${propertyId} no existe o no pertenece al acting org`,
      )
    }
  }

  private async resolveChannexPropertyId(propertyId: string): Promise<string> {
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { channexPropertyId: true },
    })
    if (!settings?.channexPropertyId) {
      throw new ForbiddenException(
        `Property ${propertyId} no tiene channexPropertyId. Configurar primero via wizard.`,
      )
    }
    return settings.channexPropertyId
  }
}
