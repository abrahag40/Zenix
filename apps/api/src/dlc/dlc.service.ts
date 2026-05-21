import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { DLCBillingMode, DLCCode, DLCStatus } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'

export interface ActivateDLCDto {
  dlcCode: DLCCode
  billingMode: DLCBillingMode
  pricePerUnit?: number
  metadata?: Record<string, unknown>
  stripeSubscriptionId?: string
  stripeSubscriptionItemId?: string
  stripeCustomerId?: string
}

/**
 * DLCService — single source of truth para suscripciones DLC del tenant.
 *
 * Lifecycle: ACTIVE → SUSPENDED → GRACE_PERIOD → ARCHIVED → (PURGED tras 5 años).
 *
 * Decisiones (doc 14):
 *   §138 status determina autorización runtime (no Stripe directo — defensa
 *        in-depth contra webhooks fallidos o lag)
 *   §139 GRACE_PERIOD 30 días default; configurable per-DLC via metadata
 *   §140 ARCHIVED preserva data ≥5 años (LFT Art. 30 CFF — registros fiscales)
 *   §141 Reactivación post-ARCHIVED hace UPDATE del row existente (preserva
 *        FK del histórico log + data); status vuelve a ACTIVE, archivedAt=null,
 *        nuevo TenantDLCLog event=REACTIVATED
 *   §142 fail-soft: endpoints retornan 402 Payment Required con accionable
 *   §144 GIFT activation no requiere Stripe — solo TenantDLC con
 *        billingMode=ONE_TIME_GIFT
 *
 * Cache LRU TTL 60s (paridad AccessControlService) — los grants DLC son
 * estables durante sesión user; un upsert invalida el cache.
 */
@Injectable()
export class DLCService {
  private readonly logger = new Logger(DLCService.name)
  private readonly cache = new Map<string, { entry: any; expiresAt: number }>()
  private readonly CACHE_TTL_MS = 60_000
  private readonly DEFAULT_GRACE_DAYS = 30

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────── Read ───────────────────

  /**
   * Estado del DLC para una org. Returns null si nunca ha sido activado.
   * Cacheado 60s.
   */
  async getStatus(organizationId: string, dlcCode: DLCCode) {
    const cacheKey = `${organizationId}::${dlcCode}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.entry

    const dlc = await this.prisma.tenantDLC.findUnique({
      where: { organizationId_dlcCode: { organizationId, dlcCode } },
    })
    this.cache.set(cacheKey, { entry: dlc, expiresAt: Date.now() + this.CACHE_TTL_MS })
    return dlc
  }

  /**
   * ¿La org tiene este DLC en estado ACTIVE?
   * Single fast check usado por DLCGuard antes de cada request.
   */
  async isActive(organizationId: string, dlcCode: DLCCode): Promise<boolean> {
    const dlc = await this.getStatus(organizationId, dlcCode)
    return dlc?.status === DLCStatus.ACTIVE
  }

  /**
   * Lista todos los DLCs de una org (todos los status, incluido ARCHIVED).
   * Útil para Settings page "Mis Add-Ons".
   */
  async listForOrganization(organizationId: string) {
    return this.prisma.tenantDLC.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { dlcCode: 'asc' }],
    })
  }

  // ─────────────────── Write ───────────────────

  /**
   * Activación: upsert. Si ya existe en SUSPENDED/GRACE_PERIOD/ARCHIVED →
   * reactiva preservando histórico. Si está ACTIVE → no-op.
   *
   * Caso uso típico:
   *   - Zenix Activate wizard etapa 6: regalo de curso → activate({
   *       dlcCode: 'LEARNING_GIFT', billingMode: 'ONE_TIME_GIFT' })
   *   - Stripe webhook checkout.session.completed → activate({...})
   *   - Settings "Activar DLC" manual → activate({...})
   */
  async activate(
    organizationId: string,
    dto: ActivateDLCDto,
    actor: JwtPayload | null = null,
  ) {
    const existing = await this.prisma.tenantDLC.findUnique({
      where: { organizationId_dlcCode: { organizationId, dlcCode: dto.dlcCode } },
    })

    const result = await this.prisma.$transaction(async (tx) => {
      let dlc
      if (!existing) {
        // Primera activación
        dlc = await tx.tenantDLC.create({
          data: {
            organizationId,
            dlcCode: dto.dlcCode,
            billingMode: dto.billingMode,
            pricePerUnit: dto.pricePerUnit ?? null,
            metadata: (dto.metadata as any) ?? null,
            stripeSubscriptionId: dto.stripeSubscriptionId ?? null,
            stripeSubscriptionItemId: dto.stripeSubscriptionItemId ?? null,
            stripeCustomerId: dto.stripeCustomerId ?? null,
            activatedById: actor?.sub ?? null,
            status: DLCStatus.ACTIVE,
          },
        })
        await tx.tenantDLCLog.create({
          data: {
            tenantDlcId: dlc.id,
            event: 'ACTIVATED',
            metadata: {
              firstActivation: true,
              billingMode: dto.billingMode,
              dlcCode: dto.dlcCode,
            },
            actorId: actor?.sub ?? null,
          },
        })
        return dlc
      }

      if (existing.status === DLCStatus.ACTIVE) return existing // idempotent

      // §141 Reactivación — UPDATE preservando histórico log
      dlc = await tx.tenantDLC.update({
        where: { id: existing.id },
        data: {
          status: DLCStatus.ACTIVE,
          suspendedAt: null,
          gracePeriodEndsAt: null,
          archivedAt: null,
          reactivatedAt: new Date(),
          // Refresh billing fields si vienen
          billingMode: dto.billingMode ?? existing.billingMode,
          pricePerUnit: dto.pricePerUnit ?? existing.pricePerUnit,
          stripeSubscriptionId: dto.stripeSubscriptionId ?? existing.stripeSubscriptionId,
          stripeSubscriptionItemId:
            dto.stripeSubscriptionItemId ?? existing.stripeSubscriptionItemId,
          stripeCustomerId: dto.stripeCustomerId ?? existing.stripeCustomerId,
          activatedById: actor?.sub ?? existing.activatedById,
          // Preservamos cancellationReason histórico — no se borra
          // metadata: merge si viene
          metadata: dto.metadata
            ? { ...(existing.metadata as object), ...dto.metadata }
            : existing.metadata,
        },
      })
      await tx.tenantDLCLog.create({
        data: {
          tenantDlcId: dlc.id,
          event: 'REACTIVATED',
          metadata: {
            previousStatus: existing.status,
            previousSuspensionReason: existing.suspensionReason,
            dataPreservedFromOriginalActivation: existing.activatedAt,
          },
          actorId: actor?.sub ?? null,
        },
      })
      return dlc
    })

    this.invalidateCache(organizationId, dto.dlcCode)
    this.logger.log(
      `DLC ACTIVATED: org=${organizationId} code=${dto.dlcCode} (existing=${!!existing})`,
    )
    return result
  }

  /**
   * Suspensión: ACTIVE → SUSPENDED. Comienza grace period.
   * Razones típicas: 'PAYMENT_FAILED' | 'ADMIN_SUSPENDED' | 'CUSTOMER_REQUESTED'
   *
   * §139 — GRACE_PERIOD 30 días default. Configurable via DLC.metadata.gracePeriodDays.
   */
  async suspend(
    organizationId: string,
    dlcCode: DLCCode,
    suspensionReason: string,
    cancellationReason?: string,
    actor: JwtPayload | null = null,
  ) {
    const dlc = await this.prisma.tenantDLC.findUnique({
      where: { organizationId_dlcCode: { organizationId, dlcCode } },
    })
    if (!dlc) throw new NotFoundException(`DLC ${dlcCode} not found for org ${organizationId}`)
    if (dlc.status !== DLCStatus.ACTIVE) {
      throw new ConflictException(
        `Cannot suspend DLC in status=${dlc.status} (must be ACTIVE)`,
      )
    }

    const now = new Date()
    const graceDays =
      (dlc.metadata as Record<string, unknown> | null)?.['gracePeriodDays'] ??
      this.DEFAULT_GRACE_DAYS
    const gracePeriodEndsAt = new Date(now.getTime() + Number(graceDays) * 24 * 60 * 60 * 1000)

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantDLC.update({
        where: { id: dlc.id },
        data: {
          status: DLCStatus.SUSPENDED,
          suspendedAt: now,
          gracePeriodEndsAt,
          suspensionReason,
          cancellationReason: cancellationReason ?? dlc.cancellationReason,
        },
      })
      await tx.tenantDLCLog.create({
        data: {
          tenantDlcId: dlc.id,
          event: 'SUSPENDED',
          metadata: {
            suspensionReason,
            cancellationReason,
            gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
            graceDays,
          },
          actorId: actor?.sub ?? null,
        },
      })
      return updated
    })

    this.invalidateCache(organizationId, dlcCode)
    this.logger.log(
      `DLC SUSPENDED: org=${organizationId} code=${dlcCode} reason=${suspensionReason} ` +
        `gracePeriodEndsAt=${gracePeriodEndsAt.toISOString()}`,
    )
    return result
  }

  /**
   * Archivación automática — scheduler cron diario.
   * SUSPENDED + gracePeriodEndsAt < now → ARCHIVED.
   * Data preservada (§140 — LFT 30 CFF 5 años).
   */
  async archiveExpiredGracePeriods(): Promise<number> {
    const toArchive = await this.prisma.tenantDLC.findMany({
      where: {
        status: DLCStatus.SUSPENDED,
        gracePeriodEndsAt: { lt: new Date() },
      },
      select: { id: true, organizationId: true, dlcCode: true },
    })

    if (toArchive.length === 0) return 0

    await this.prisma.$transaction(async (tx) => {
      for (const dlc of toArchive) {
        await tx.tenantDLC.update({
          where: { id: dlc.id },
          data: { status: DLCStatus.ARCHIVED, archivedAt: new Date() },
        })
        await tx.tenantDLCLog.create({
          data: {
            tenantDlcId: dlc.id,
            event: 'ARCHIVED',
            metadata: { reason: 'GRACE_PERIOD_EXPIRED', autoArchived: true },
          },
        })
        this.invalidateCache(dlc.organizationId, dlc.dlcCode)
      }
    })

    this.logger.log(`Auto-archived ${toArchive.length} DLCs after grace period expiry`)
    return toArchive.length
  }

  /**
   * Cancelación voluntaria por cliente.
   * ACTIVE → SUSPENDED con cancellationReason de usuario.
   */
  async cancelByCustomer(
    organizationId: string,
    dlcCode: DLCCode,
    reason: string,
    actor: JwtPayload,
  ) {
    return this.suspend(organizationId, dlcCode, 'CUSTOMER_REQUESTED', reason, actor)
  }

  // ─────────────────── Util ───────────────────

  private invalidateCache(organizationId: string, dlcCode: DLCCode) {
    this.cache.delete(`${organizationId}::${dlcCode}`)
  }
}
