/**
 * FeatureFlagsService — gestión de toggles persistentes.
 *
 * Usado por:
 *   - Cualquier scheduler/service que necesita verificar si un flag está
 *     activo (TestAlarmScheduler, futuros).
 *   - El controller HTTP para listar/upsertear desde la UI.
 *
 * Diseño:
 *   - In-memory cache con TTL 30s para evitar query a BD en cada tick
 *     del cron. El upsert invalida el cache.
 *   - Audit log obligatorio en cada cambio (append-only).
 *   - `isEnabled()` aplica el kill-switch de env vars siempre que exista.
 *
 * Justificación del cache:
 *   - Cron cada 5 min = 12 lecturas/hora x N flags x N propiedades.
 *     Sin cache, cada cron tick golpea BD. Con TTL 30s la BD ve <1
 *     query/min por flag aunque haya 100 lecturas.
 *   - Patrón estándar Stripe + Vercel feature flags.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { UpsertFlagDto } from './dto/upsert-flag.dto'

interface CacheEntry {
  enabled: boolean
  config: Record<string, unknown> | null
  expiresAt: number
}

const CACHE_TTL_MS = 30_000

/** Mapeo flag → env kill-switch.
 *  Si la env var existe y es 'false', el flag se considera OFF
 *  pase lo que pase en BD. Defensa de ops sin acceso a BD. */
const ENV_KILL_SWITCH: Record<string, string> = {
  'test.alarm': 'TEST_ALARM_ENABLED',
}

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name)
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Lectura cacheada — fuente de verdad para los schedulers.
   * Aplica el env kill-switch automáticamente.
   */
  async isEnabled(key: string, propertyId?: string): Promise<boolean> {
    // Kill-switch: si env var existe y dice 'false', forzamos off.
    // Si dice 'true', NO lo forzamos on — el DB sigue mandando.
    // Esto permite a ops apagar pero no encender sin pasar por audit.
    const envKey = ENV_KILL_SWITCH[key]
    if (envKey) {
      const envVal = this.config.get<string>(envKey)
      if (envVal === 'false') return false
    }

    const cacheKey = `${key}::${propertyId ?? 'global'}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.enabled

    const flag = await this.prisma.featureFlag.findFirst({
      where: { key, OR: [{ propertyId: null }, { propertyId: propertyId ?? undefined }] },
      orderBy: { propertyId: 'desc' }, // property-specific gana sobre global
    })

    const enabled = flag?.enabled ?? false
    this.cache.set(cacheKey, {
      enabled,
      config: (flag?.config as Record<string, unknown>) ?? null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })
    return enabled
  }

  /** Lectura del config del flag (para que el caller use sus valores). */
  async getConfig(key: string, propertyId?: string): Promise<Record<string, unknown> | null> {
    await this.isEnabled(key, propertyId) // cachea
    const cacheKey = `${key}::${propertyId ?? 'global'}`
    return this.cache.get(cacheKey)?.config ?? null
  }

  /** Lista todos los flags. La UI los presenta agrupados por scope. */
  async list() {
    return this.prisma.featureFlag.findMany({
      orderBy: [{ key: 'asc' }],
      include: {
        updatedBy: { select: { id: true, name: true } },
        property: { select: { id: true, name: true } },
      },
    })
  }

  /** Audit log paginado. */
  async listAudit(key: string, limit = 50) {
    return this.prisma.featureFlagAuditLog.findMany({
      where: { flagKey: key },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: { actor: { select: { id: true, name: true } } },
    })
  }

  /**
   * Upsert (crear o modificar) — siempre escribe audit log.
   * Si el flag no existía → CREATED.
   * Si cambió enabled  → ENABLED / DISABLED.
   * Si solo cambió config → CONFIG_UPDATED.
   */
  async upsert(dto: UpsertFlagDto, actor: JwtPayload) {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key: dto.key } })

    let action: string
    let previousValue: any = null
    let newValue: any = { enabled: dto.enabled, config: dto.config ?? null }

    if (!existing) {
      action = 'CREATED'
    } else if (existing.enabled !== dto.enabled) {
      action = dto.enabled ? 'ENABLED' : 'DISABLED'
      previousValue = { enabled: existing.enabled, config: existing.config }
    } else {
      action = 'CONFIG_UPDATED'
      previousValue = { enabled: existing.enabled, config: existing.config }
    }

    const flag = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.featureFlag.upsert({
        where: { key: dto.key },
        create: {
          key: dto.key,
          enabled: dto.enabled,
          propertyId: dto.propertyId ?? null,
          config: (dto.config as any) ?? undefined,
          description: dto.description ?? null,
          updatedById: actor.sub,
        },
        update: {
          enabled: dto.enabled,
          propertyId: dto.propertyId ?? null,
          config: (dto.config as any) ?? undefined,
          description: dto.description ?? existing?.description ?? null,
          updatedById: actor.sub,
        },
      })

      await tx.featureFlagAuditLog.create({
        data: {
          flagId: upserted.id,
          flagKey: upserted.key,
          action,
          previousValue,
          newValue,
          actorId: actor.sub,
          actorRole: actor.role,
        },
      })

      return upserted
    })

    // Invalidar cache (todas las entradas con este key, incluido global).
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(`${dto.key}::`)) this.cache.delete(cacheKey)
    }

    this.logger.log(`Feature flag ${dto.key} → ${action} by ${actor.sub}`)
    return flag
  }

  async deleteFlag(key: string, actor: JwtPayload) {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } })
    if (!existing) throw new NotFoundException(`Flag "${key}" no existe`)

    await this.prisma.$transaction(async (tx) => {
      await tx.featureFlagAuditLog.create({
        data: {
          flagId: existing.id,
          flagKey: existing.key,
          action: 'DELETED',
          previousValue: { enabled: existing.enabled, config: existing.config as any },
          // newValue se omite — Prisma's nullable Json no acepta null literal
          actorId: actor.sub,
          actorRole: actor.role,
        },
      })
      // soft-delete: mantenemos audit log apuntando al flag eliminado
      await tx.featureFlag.delete({ where: { id: existing.id } })
    })

    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(`${key}::`)) this.cache.delete(cacheKey)
    }
  }
}
