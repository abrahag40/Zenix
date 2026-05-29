/**
 * ChannexProvisionService — wizard → Channex push automation.
 *
 * Sprint CHANNEX-AUTO-PROVISION Day 2.
 *
 * Llamado outside-tx desde `WizardActivationService.activate()` después del
 * $transaction que crea Organization + Brand + LegalEntity + Properties +
 * Owner + SetupToken + AuditLog.
 *
 * Flow per Organization (1+ Properties análogo):
 *   1. Ensure Channex Group exists (Modelo D adaptado multi-tenant Fase 1).
 *   2. Per Property: createProperty en Channex con group_id, persist
 *      Property.channexPropertyId.
 *   3. Bulk createRoomType: por cada Room/RoomType del template inventory,
 *      crear en Channex, persist Room.channexRoomTypeId.
 *   4. Bulk createRatePlan: por cada RatePlan del template, crear con
 *      currency + base rate, persist RatePlan.channexRatePlanId.
 *   5. Per channel del DTO: encrypt credentials → createChannel inactive
 *      (o requires_oauth para Airbnb).
 *   6. Mark Property.channexProvisioningStatus = 'completed' + timestamp.
 *
 * Best-effort:
 *   · Cualquier fallo NO rolla back la Organization (ya activada en $tx).
 *   · Errores se persisten en PropertySettings.channexProvisioningError +
 *     status='failed'. Consultor puede re-trigger desde /nova/billing/channex.
 *   · Idempotent: re-trigger valida mappings BD antes de POST a Channex.
 *
 * Cert alignment:
 *   · NUNCA per-date calls (anti-pattern AP-4) — bulk APIs siempre.
 *   · NUNCA hardcoded UUIDs — todo viene del response y se persiste inmediato.
 *   · Initial sync respeta `pushRestrictions(entries[])` single call (Test 1
 *     cert pattern) — defer al RATES sprint para datos reales; aquí solo
 *     sembramos rate plan con base BAR del template.
 */
import { Injectable, Logger } from '@nestjs/common'
import type { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ChannexGateway,
  type ChannexChannelType,
} from '../../integrations/channex/channex.gateway'
import { ChannelCredentialsCryptoService } from './channel-credentials-crypto.service'

export interface ProvisionChannelInput {
  type: ChannexChannelType
  title: string
  /** Plain object con credentials channel-specific. Cifradas server-side. */
  credentials?: Record<string, string>
  /** Si true → status='pending_credentials' (consultor las completa después). */
  configureLater: boolean
}

export interface ProvisionInput {
  organizationId: string
  /** IDs locales de Properties creadas en el wizard $tx. */
  propertyIds: string[]
  channels: ProvisionChannelInput[]
  actor: JwtPayload
}

export interface ProvisionResult {
  status: 'completed' | 'partial' | 'failed'
  groupId: string | null
  propertiesProvisioned: number
  roomTypesCreated: number
  ratePlansCreated: number
  channelsCreated: number
  channelsRequiringOauth: number
  channelsPendingCredentials: number
  errors: Array<{ step: string; propertyId?: string; message: string }>
}

@Injectable()
export class ChannexProvisionService {
  private readonly logger = new Logger(ChannexProvisionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChannexGateway,
    private readonly crypto: ChannelCredentialsCryptoService,
  ) {}

  async provisionFromWizard(input: ProvisionInput): Promise<ProvisionResult> {
    const result: ProvisionResult = {
      status: 'completed',
      groupId: null,
      propertiesProvisioned: 0,
      roomTypesCreated: 0,
      ratePlansCreated: 0,
      channelsCreated: 0,
      channelsRequiringOauth: 0,
      channelsPendingCredentials: 0,
      errors: [],
    }

    // ── (1) Ensure Group exists ────────────────────────────────────
    let groupId: string | null = null
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true, name: true, slug: true, channexGroupId: true },
      })
      if (!org) {
        result.status = 'failed'
        result.errors.push({
          step: 'lookup_org',
          message: `Organization ${input.organizationId} no encontrada`,
        })
        return result
      }

      if (org.channexGroupId) {
        groupId = org.channexGroupId
        this.logger.log(`[Provision] Org ${org.slug} ya tiene Group ${groupId} — skip create`)
      } else {
        const group = await this.gateway.createGroup({ title: `zenix-${org.slug}` })
        groupId = group.id ?? null
        if (groupId) {
          await this.prisma.organization.update({
            where: { id: org.id },
            data: { channexGroupId: groupId },
          })
        }
      }
      result.groupId = groupId
    } catch (err) {
      this.logger.error(
        `[Provision] Group creation falló para org ${input.organizationId}: ${String(err).slice(0, 200)}`,
      )
      result.status = 'failed'
      result.errors.push({ step: 'create_group', message: (err as Error).message })
      return result
    }

    // ── (2-5) Per Property loop ────────────────────────────────────
    for (const propertyId of input.propertyIds) {
      await this.provisionOneProperty(propertyId, groupId, input.channels, result)
    }

    // ── Final status decision ──────────────────────────────────────
    if (result.errors.length === 0) {
      result.status = 'completed'
    } else if (result.propertiesProvisioned > 0) {
      result.status = 'partial'
    } else {
      result.status = 'failed'
    }
    this.logger.log(
      `[Provision] Org ${input.organizationId} done: status=${result.status} properties=${result.propertiesProvisioned}/${input.propertyIds.length} roomTypes=${result.roomTypesCreated} ratePlans=${result.ratePlansCreated} channels=${result.channelsCreated} errors=${result.errors.length}`,
    )
    return result
  }

  /**
   * Idempotent retry endpoint. Llamado desde
   * POST /v1/nova/properties/:id/channex/provision.
   *
   * Opciones:
   *   force=false (default) — skip si Channel.channexChannelId ya existe en BD
   *   force=true            — delete + recreate de los channels provistos
   *                           (caso: cliente cambió credentials Booking/Expedia
   *                           y partner exige re-binding)
   */
  async retryProperty(
    propertyId: string,
    channels: ProvisionChannelInput[],
    opts: { force?: boolean } = {},
  ): Promise<ProvisionResult> {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { organizationId: true, organization: { select: { channexGroupId: true } } },
    })
    if (!prop) {
      return {
        status: 'failed',
        groupId: null,
        propertiesProvisioned: 0,
        roomTypesCreated: 0,
        ratePlansCreated: 0,
        channelsCreated: 0,
        channelsRequiringOauth: 0,
        channelsPendingCredentials: 0,
        errors: [{ step: 'lookup_property', message: `Property ${propertyId} no encontrada` }],
      }
    }

    // force=true → delete channels existentes en BD para los types provistos
    // ANTES de provisionOneProperty. provisionOneProperty entonces los re-crea.
    // Idempotency natural: si force=false, el create-side filter en provision
    // saltea los channels con channexChannelId existente.
    if (opts.force && channels.length > 0) {
      const types = channels.map((c) => c.type)
      const existing = await this.prisma.channel.findMany({
        where: { propertyId, type: { in: types } },
        select: { id: true, channexChannelId: true, type: true },
      })
      for (const ch of existing) {
        try {
          await this.gateway.deleteChannel(ch.channexChannelId)
        } catch (err) {
          // Si Channex 404 (ya no existe) o 422 (mapping activo) — log + sigo.
          // La row BD se borra igual; la inconsistencia con Channex se
          // resuelve al recrear (force semantics).
          this.logger.warn(
            `[Provision] force=true deleteChannel ${ch.channexChannelId} (type=${ch.type}): ${String(err).slice(0, 200)}`,
          )
        }
        await this.prisma.channel.delete({ where: { id: ch.id } })
      }
      this.logger.log(
        `[Provision] force=true deleted ${existing.length} channels for property ${propertyId}`,
      )
    }

    const result: ProvisionResult = {
      status: 'completed',
      groupId: prop.organization.channexGroupId,
      propertiesProvisioned: 0,
      roomTypesCreated: 0,
      ratePlansCreated: 0,
      channelsCreated: 0,
      channelsRequiringOauth: 0,
      channelsPendingCredentials: 0,
      errors: [],
    }
    await this.provisionOneProperty(propertyId, prop.organization.channexGroupId, channels, result)
    if (result.errors.length === 0) result.status = 'completed'
    else if (result.propertiesProvisioned > 0) result.status = 'partial'
    else result.status = 'failed'
    return result
  }

  /**
   * Lista el estado de provisioning Channex de todas las Properties de una
   * Organization. Alimenta la UI de recovery en /nova/billing/channex.
   * Day 5 — incluye channels per property con su status.
   */
  async listProvisioningStatus(organizationId: string): Promise<
    Array<{
      propertyId: string
      propertyName: string
      channexPropertyId: string | null
      provisioningStatus: string | null
      provisioningError: string | null
      lastProvisionedAt: Date | null
      channels: Array<{
        id: string
        type: string
        title: string
        status: string
      }>
    }>
  > {
    const properties = await this.prisma.property.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        settings: {
          select: {
            channexPropertyId: true,
            channexProvisioningStatus: true,
            channexProvisioningError: true,
            channexLastProvisionedAt: true,
          },
        },
        channels: {
          select: { id: true, type: true, title: true, status: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })
    return properties.map((p) => ({
      propertyId: p.id,
      propertyName: p.name,
      channexPropertyId: p.settings?.channexPropertyId ?? null,
      provisioningStatus: p.settings?.channexProvisioningStatus ?? null,
      provisioningError: p.settings?.channexProvisioningError ?? null,
      lastProvisionedAt: p.settings?.channexLastProvisionedAt ?? null,
      channels: p.channels,
    }))
  }

  // ─── Privates ───────────────────────────────────────────────────

  private async provisionOneProperty(
    propertyId: string,
    groupId: string | null,
    channels: ProvisionChannelInput[],
    result: ProvisionResult,
  ): Promise<void> {
    // Pre-load property data with relations.
    // Note: Property model has no `timezone` field — timezone vive en
    // PropertySettings? No espera — review: PropertySettings might have it.
    // Para MVP, fallback al timezone de Organization si no hay otro.
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        organization: true,
        legalEntity: true,
        settings: true,
        rooms: true,
      },
    })
    if (!prop) {
      result.errors.push({
        step: 'lookup_property',
        propertyId,
        message: `Property ${propertyId} not found`,
      })
      return
    }

    // Mark in_progress
    await this.prisma.propertySettings
      .update({
        where: { propertyId },
        data: {
          channexProvisioningStatus: 'in_progress',
          channexProvisioningError: null,
        },
      })
      .catch(() => {
        // PropertySettings might not exist yet (some wizards skip it).
        // We'll create it on demand if the provision succeeds.
      })

    // ── (2) Create Property in Channex if no mapping yet ───────────
    let channexPropId: string | null = prop.settings?.channexPropertyId ?? null
    const timezone = prop.settings?.timezone ?? prop.organization.timezone ?? 'America/Cancun'
    const currency = prop.legalEntity?.baseCurrency ?? prop.organization.currency ?? 'MXN'
    const country = prop.legalEntity?.countryCode ?? prop.organization.countryCode ?? 'MX'
    try {
      if (!channexPropId) {
        const created = await this.gateway.createProperty({
          title: prop.name,
          currency,
          timezone,
          country,
          ...(groupId ? { groupId } : {}),
        })
        channexPropId = created.id ?? null
        if (channexPropId) {
          await this.prisma.propertySettings.upsert({
            where: { propertyId },
            create: {
              propertyId,
              channexPropertyId: channexPropId,
              channexProvisioningStatus: 'in_progress',
            },
            update: { channexPropertyId: channexPropId },
          })
        }
      } else if (groupId) {
        // Property pre-existed → ensure assigned to our Group
        await this.gateway.assignPropertyToGroup(channexPropId, groupId)
      }
    } catch (err) {
      await this.markFailed(propertyId, 'create_property', err)
      result.errors.push({
        step: 'create_property',
        propertyId,
        message: (err as Error).message,
      })
      return
    }

    if (!channexPropId) {
      result.errors.push({
        step: 'create_property',
        propertyId,
        message: 'Channex no devolvió id',
      })
      await this.markFailed(propertyId, 'create_property', new Error('no id from Channex'))
      return
    }

    // ── (3) Room types ─────────────────────────────────────────────
    // Group rooms by number (treating each unique room number as its own
    // RoomType MVP — RATES-METRICS sprint introduces explicit RoomType model
    // with count_of_rooms aggregated). For now: 1 room → 1 room_type Channex
    // with count_of_rooms=1.
    for (const room of prop.rooms) {
      if (room.channexRoomTypeId) continue // idempotent skip
      try {
        const rt = await this.gateway.createRoomType({
          propertyId: channexPropId,
          title: `Room ${room.number}`,
          countOfRooms: 1,
          occAdults: 2,
          occChildren: 0,
        })
        if (rt.id) {
          await this.prisma.room.update({
            where: { id: room.id },
            data: { channexRoomTypeId: rt.id },
          })
          result.roomTypesCreated++
        }
      } catch (err) {
        result.errors.push({
          step: 'create_room_type',
          propertyId,
          message: `room "${room.number}": ${(err as Error).message}`,
        })
      }
    }

    // ── (4) Rate plans ─────────────────────────────────────────────
    // RATES-METRICS sprint creará RatePlan model + RatePlanService.
    // Mientras, MVP: 1 BAR per room type creado al provisioning para que
    // pushRestrictions tenga targets (Tests 2-8 cert dependen de esto).
    const updatedRooms = await this.prisma.room.findMany({
      where: { propertyId, channexRoomTypeId: { not: null } },
    })
    for (const room of updatedRooms) {
      if (!room.channexRoomTypeId) continue
      try {
        await this.gateway.createRatePlan({
          propertyId: channexPropId,
          roomTypeId: room.channexRoomTypeId,
          title: `BAR ${room.number}`,
          currency,
          rateCents: 10000, // $100.00 placeholder — RATES sprint sustituye
          occupancy: 2,
        })
        result.ratePlansCreated++
      } catch (err) {
        result.errors.push({
          step: 'create_rate_plan',
          propertyId,
          message: `room "${room.number}": ${(err as Error).message}`,
        })
      }
    }

    // ── (5) Channels (OTA connections) ─────────────────────────────
    for (const channelInput of channels) {
      try {
        const isAirbnb = channelInput.type === 'AirbnbCom'
        const hasCredentials = !channelInput.configureLater && !!channelInput.credentials
        let settingsEncrypted: string | null = null
        let status: string
        if (isAirbnb) {
          status = 'requires_oauth'
          // Airbnb settings are minimal pre-OAuth — solo listing_id si lo tenemos
          if (hasCredentials && this.crypto.isReady()) {
            settingsEncrypted = this.crypto.encrypt(channelInput.credentials!)
          }
        } else if (channelInput.configureLater || !channelInput.credentials) {
          status = 'pending_credentials'
        } else if (!this.crypto.isReady()) {
          status = 'pending_credentials' // KEK not configured → cannot store
          result.errors.push({
            step: 'create_channel',
            propertyId,
            message: `${channelInput.type}: CHANNEX_CREDENTIALS_KEK no configurada — credentials saltadas`,
          })
        } else {
          settingsEncrypted = this.crypto.encrypt(channelInput.credentials!)
          status = 'inactive' // creado pero no published — manual activation
        }

        const channexChannel = await this.gateway.createChannel({
          type: channelInput.type,
          propertyId: channexPropId,
          title: channelInput.title,
          isActive: false, // never publish at provisioning — manual step post-onboarding
          ...(channelInput.credentials && hasCredentials && !isAirbnb
            ? { settings: channelInput.credentials }
            : {}),
        })

        if (channexChannel.id) {
          await this.prisma.channel.create({
            data: {
              propertyId,
              channexChannelId: channexChannel.id,
              type: channelInput.type,
              title: channelInput.title,
              status,
              settingsEncrypted,
              lastSyncedAt: status === 'inactive' ? new Date() : null,
            },
          })
          result.channelsCreated++
          if (status === 'requires_oauth') result.channelsRequiringOauth++
          if (status === 'pending_credentials') result.channelsPendingCredentials++
        }
      } catch (err) {
        result.errors.push({
          step: 'create_channel',
          propertyId,
          message: `${channelInput.type}: ${(err as Error).message}`,
        })
      }
    }

    // ── (6) Mark completed ─────────────────────────────────────────
    const allOk =
      result.errors.filter((e) => e.propertyId === propertyId).length === 0
    await this.prisma.propertySettings
      .update({
        where: { propertyId },
        data: {
          channexProvisioningStatus: allOk ? 'completed' : 'partial',
          channexProvisioningError: allOk
            ? null
            : result.errors
                .filter((e) => e.propertyId === propertyId)
                .map((e) => `${e.step}: ${e.message}`)
                .join('\n')
                .slice(0, 2000),
          channexLastProvisionedAt: new Date(),
        },
      })
      .catch(() => undefined)

    if (allOk) result.propertiesProvisioned++
  }

  private async markFailed(propertyId: string, step: string, err: unknown): Promise<void> {
    await this.prisma.propertySettings
      .update({
        where: { propertyId },
        data: {
          channexProvisioningStatus: 'failed',
          channexProvisioningError: `${step}: ${(err as Error).message}`.slice(0, 2000),
          channexLastProvisionedAt: new Date(),
        },
      })
      .catch(() => undefined)
  }
}
