/**
 * AccessControlService — v1.0.5 TENANT-CTX-3LEVEL.
 *
 * Single source of truth para responder "¿el user X tiene acceso a la
 * property Y?" considerando los 3 scopes posibles del modelo 4-level
 * (CLAUDE.md §67 + docs/vision/11-multi-tenant-architecture.md):
 *
 *   - UserPropertyRole       — scope directo a 1 property
 *   - LegalEntityUserRole    — scope a TODAS las properties de una entidad fiscal
 *   - BrandUserRole          — scope a TODAS las properties de TODO el brand
 *
 * El método `canUserAccessProperty(userId, propertyId)` ejecuta una sola
 * query SQL con UNION ALL de los 3 niveles. Postgres optimiza el plan
 * con short-circuit (si encuentra match en nivel 1, no escanea 2 y 3).
 *
 * Pattern Salesforce: "Profile + Permission Sets" — el user puede tener
 * múltiples grants distintos. Bastante con uno positivo para autorizar.
 *
 * NOTA — backwards-compat: el guard PropertyScopeGuard (§MT-5 SEC-α) sigue
 * siendo el primer filtro (rechaza ?propertyId= que no coincide con JWT).
 * AccessControlService.canUserAccessProperty se usa para endpoints
 * cross-property que el guard no puede analizar a nivel HTTP.
 */

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name)

  // Cache LRU simple en memoria — la respuesta de canUserAccessProperty
  // es estable durante la sesión del user (los grants no cambian en una
  // request). Cache hits saltan la query SQL. TTL bajo (60s) para soportar
  // invalidación tras grants nuevos en producción.
  private readonly cache = new Map<string, { result: boolean; expiresAt: number }>()
  private readonly CACHE_TTL_MS = 60_000

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ¿El user X tiene acceso a la property Y?
   *
   * Considera los 3 scopes:
   *   1. UserPropertyRole(userId, propertyId) — match directo
   *   2. LegalEntityUserRole(userId, legalEntityId) donde
   *      property.legalEntityId === legalEntityId — scope LegalEntity
   *   3. BrandUserRole(userId, brandId) donde
   *      property → legalEntity → organization → brand_id === brandId
   *      — scope Brand
   *
   * Si CUALQUIERA de los 3 niveles devuelve match, returns true.
   * Sin matches → false (403).
   */
  async canUserAccessProperty(userId: string, propertyId: string): Promise<boolean> {
    const cacheKey = `${userId}::${propertyId}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.result

    // Query Postgres con UNION ALL — Postgres planea esto como 3 lookups
    // de índice en serie con short-circuit (si el primer SELECT encuentra
    // row, los siguientes no se ejecutan).
    const result = await this.prisma.$queryRaw<Array<{ has_access: boolean }>>`
      SELECT EXISTS (
        -- Nivel 1: scope directo de property
        SELECT 1 FROM user_property_roles
        WHERE user_id = ${userId} AND property_id = ${propertyId}

        UNION ALL

        -- Nivel 2: scope de legal_entity que contiene la property
        SELECT 1 FROM legal_entity_user_roles ler
          JOIN properties p ON p.legal_entity_id = ler.legal_entity_id
          WHERE ler.user_id = ${userId} AND p.id = ${propertyId}

        UNION ALL

        -- Nivel 3: scope de brand que contiene la org que contiene la legal_entity
        SELECT 1 FROM brand_user_roles bur
          JOIN organizations o ON o.brand_id = bur.brand_id
          JOIN legal_entities le ON le.organization_id = o.id
          JOIN properties p ON p.legal_entity_id = le.id
          WHERE bur.user_id = ${userId} AND p.id = ${propertyId}
      ) AS has_access
    `

    const hasAccess = Boolean(result[0]?.has_access)
    this.cache.set(cacheKey, { result: hasAccess, expiresAt: Date.now() + this.CACHE_TTL_MS })
    return hasAccess
  }

  /**
   * ¿El user X tiene acceso a la legal_entity Y?
   *
   * Considera scope nivel 2 (directo) o nivel 3 (brand).
   */
  async canUserAccessLegalEntity(userId: string, legalEntityId: string): Promise<boolean> {
    const cacheKey = `le::${userId}::${legalEntityId}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.result

    const result = await this.prisma.$queryRaw<Array<{ has_access: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM legal_entity_user_roles
        WHERE user_id = ${userId} AND legal_entity_id = ${legalEntityId}

        UNION ALL

        SELECT 1 FROM brand_user_roles bur
          JOIN organizations o ON o.brand_id = bur.brand_id
          JOIN legal_entities le ON le.organization_id = o.id
          WHERE bur.user_id = ${userId} AND le.id = ${legalEntityId}
      ) AS has_access
    `

    const hasAccess = Boolean(result[0]?.has_access)
    this.cache.set(cacheKey, { result: hasAccess, expiresAt: Date.now() + this.CACHE_TTL_MS })
    return hasAccess
  }

  /**
   * ¿El user X tiene acceso al brand Y?
   *
   * Solo scope nivel 3.
   */
  async canUserAccessBrand(userId: string, brandId: string): Promise<boolean> {
    const cacheKey = `br::${userId}::${brandId}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.result

    const grant = await this.prisma.brandUserRole.findFirst({
      where: { userId, brandId },
      select: { id: true },
    })

    const hasAccess = !!grant
    this.cache.set(cacheKey, { result: hasAccess, expiresAt: Date.now() + this.CACHE_TTL_MS })
    return hasAccess
  }

  /**
   * Listar todas las propertyIds que el user puede ver. Útil para endpoints
   * cross-property (e.g. reports de cadena) donde queremos filtrar a las
   * properties autorizadas.
   *
   * Returns: Set de propertyId (orden no garantizado).
   */
  async listAccessiblePropertyIds(userId: string): Promise<Set<string>> {
    const result = await this.prisma.$queryRaw<Array<{ property_id: string }>>`
      SELECT DISTINCT property_id FROM (
        SELECT property_id FROM user_property_roles WHERE user_id = ${userId}

        UNION ALL

        SELECT p.id AS property_id FROM legal_entity_user_roles ler
          JOIN properties p ON p.legal_entity_id = ler.legal_entity_id
          WHERE ler.user_id = ${userId}

        UNION ALL

        SELECT p.id AS property_id FROM brand_user_roles bur
          JOIN organizations o ON o.brand_id = bur.brand_id
          JOIN legal_entities le ON le.organization_id = o.id
          JOIN properties p ON p.legal_entity_id = le.id
          WHERE bur.user_id = ${userId}
      ) accessible
    `

    return new Set(result.map((r) => r.property_id))
  }

  /** Invalidar cache — llamar tras cambios en grants de un user. */
  invalidateUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(`::${userId}::`) || key.startsWith(`${userId}::`)) {
        this.cache.delete(key)
      }
    }
  }

  /** Invalidar todo el cache — usado por tests. */
  clearCache(): void {
    this.cache.clear()
  }
}
