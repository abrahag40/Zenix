/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 5.
 *
 * ChannexRoomTypesService — pass-through Channex + write-through Zenix DB.
 *
 * Pattern por método:
 *   1. Resuelve organizationId via `tenant.getActingOrgIdOrThrow()` (Day 3)
 *   2. Resuelve propertyId del input — valida que pertenece al actingOrg
 *   3. Llama `gateway.createRoomType` / etc.
 *   4. On SUCCESS: ningún write-through directo a Zenix DB en este caso
 *      (Channex room types NO tienen mapping table per se — Day 2 sólo tenía
 *      ChannexRatePlanMapping. Room types se referencian via Room.channexRoomTypeId
 *      en el modelo Room existing.)
 *   5. AuditLog write con actorTier + status (SUCCESS/FAILURE)
 *
 * RBAC: TODOS los endpoints requieren tier PLATFORM_ADMIN/PARTNER_ADMIN/PARTNER_MEMBER.
 * Enforcement via @Roles + @RequireActingOrg + NovaActingOrgGuard.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { TenantContextService } from '../../../common/tenant-context.service'
import {
  ChannexGateway,
  ChannexHttpError,
  ChannexRoomType,
  ChannexRoomTypeCreateInput,
  ChannexRoomTypeUpdateInput,
} from '../../../integrations/channex/channex.gateway'
import { AuditLogService } from '../../audit/audit-log.service'

@Injectable()
export class ChannexRoomTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly gateway: ChannexGateway,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Lista room types de una property del acting org.
   * Pass-through directo a Channex (read no requiere write-through Zenix).
   */
  async list(propertyId: string): Promise<ChannexRoomType[]> {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    const property = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { channexPropertyId: true },
    })
    if (!property?.channexPropertyId) {
      throw new ForbiddenException(
        `Property ${propertyId} no tiene channexPropertyId configurado. ` +
          'Configura primero la integración Channex en el wizard.',
      )
    }

    return this.gateway.listRoomTypes(property.channexPropertyId)
  }

  /**
   * Crea room type en Channex.
   * NO write-through a Zenix Room table — el room type Channex se asocia a Rooms
   * locales via `Room.channexRoomTypeId` que el operador setea separadamente
   * (Mappings tab Day 7).
   */
  async create(
    propertyId: string,
    input: Omit<ChannexRoomTypeCreateInput, 'propertyId'>,
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER',
    onBehalfOfUserId?: string,
    reason?: string,
  ): Promise<ChannexRoomType> {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)

    let created: ChannexRoomType | null = null
    let status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
    let errorMessage: string | undefined
    let channexResponse: Record<string, unknown> | undefined

    try {
      created = await this.gateway.createRoomType({ ...input, propertyId: channexPropertyId })
      channexResponse = { id: created.id }
    } catch (err) {
      status = 'FAILURE'
      errorMessage = err instanceof ChannexHttpError ? err.message : String(err)
      // Re-throw después de auditar — el caller necesita el error
    }

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_ROOM_TYPE_CREATE',
      target: created?.id,
      payload: { propertyId, channexPropertyId, ...input },
      channexResponse,
      status,
      errorMessage,
      reason,
    })

    if (status === 'FAILURE') {
      throw new ChannexHttpError(errorMessage ?? 'Channex error', 500)
    }
    return created!
  }

  /**
   * Actualiza room type en Channex (partial update).
   */
  async update(
    channexRoomTypeId: string,
    propertyId: string,
    input: ChannexRoomTypeUpdateInput,
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER',
    onBehalfOfUserId?: string,
    reason?: string,
  ): Promise<ChannexRoomType> {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    let updated: ChannexRoomType | null = null
    let status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
    let errorMessage: string | undefined

    try {
      updated = await this.gateway.updateRoomType(channexRoomTypeId, input)
    } catch (err) {
      status = 'FAILURE'
      errorMessage = err instanceof ChannexHttpError ? err.message : String(err)
    }

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_ROOM_TYPE_UPDATE',
      target: channexRoomTypeId,
      payload: { propertyId, channexRoomTypeId, changes: input },
      status,
      errorMessage,
      reason,
    })

    if (status === 'FAILURE') {
      throw new ChannexHttpError(errorMessage ?? 'Channex error', 500)
    }
    return updated!
  }

  /**
   * Borra room type en Channex.
   * Side effect: si hay Rooms en Zenix DB con `channexRoomTypeId == id`, queda
   * orphan reference. Pre-validation: contar Rooms afectados. Si > 0, requiere
   * `force=true` explícito + warning audit.
   */
  async delete(
    channexRoomTypeId: string,
    propertyId: string,
    options: { force: boolean },
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER',
    onBehalfOfUserId?: string,
    reason?: string,
  ): Promise<{ deleted: boolean; orphanRoomsCount: number }> {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    const orphanRoomsCount = await this.prisma.room.count({
      where: { propertyId, channexRoomTypeId, deletedAt: null },
    })

    if (orphanRoomsCount > 0 && !options.force) {
      throw new ForbiddenException(
        `${orphanRoomsCount} rooms en Zenix DB referencian este channexRoomTypeId. ` +
          'Re-mapéalos primero o usa force=true (audita el side effect).',
      )
    }

    let status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
    let errorMessage: string | undefined

    try {
      await this.gateway.deleteRoomType(channexRoomTypeId)
      // Si force=true y había rooms huérfanos, NULL-ear el reference (mejor que dejar UUID inválido)
      if (orphanRoomsCount > 0) {
        await this.prisma.room.updateMany({
          where: { propertyId, channexRoomTypeId },
          data: { channexRoomTypeId: null },
        })
      }
    } catch (err) {
      status = 'FAILURE'
      errorMessage = err instanceof ChannexHttpError ? err.message : String(err)
    }

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_ROOM_TYPE_DELETE',
      target: channexRoomTypeId,
      payload: { propertyId, channexRoomTypeId, force: options.force, orphanRoomsCount },
      status,
      errorMessage,
      // Si force=true con orphans, retention PERMANENT (Visa CRR evidence)
      retentionPolicy: orphanRoomsCount > 0 ? 'PERMANENT' : 'STANDARD',
      reason,
    })

    if (status === 'FAILURE') {
      throw new ChannexHttpError(errorMessage ?? 'Channex error', 500)
    }
    return { deleted: true, orphanRoomsCount }
  }

  // ── Helpers privados ────────────────────────────────────────────────────

  private async assertPropertyInOrg(propertyId: string, orgId: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId: orgId },
      select: { id: true },
    })
    if (!property) {
      throw new NotFoundException(
        `Property ${propertyId} no existe o no pertenece al acting org ${orgId.slice(0, 8)}…`,
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
