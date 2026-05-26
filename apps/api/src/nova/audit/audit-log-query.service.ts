/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 13.
 *
 * AuditLogQueryService — endpoint LIST/FILTER del audit_log.
 *
 * Diferente del AuditLogService:
 *   · AuditLogService — escribe entries (Day 5)
 *   · AuditLogQueryService — lee entries con filtros (Day 13)
 *
 * Filtros soportados:
 *   - organizationId (siempre — del acting org)
 *   - action LIKE (e.g. 'CHANNEX_%' para todo Channex)
 *   - actorRealId (filtrar por actor específico)
 *   - status (SUCCESS | FAILURE | PARTIAL)
 *   - dateFrom / dateTo (ventana)
 *
 * Paginación cursor-based — append-only tables crecen rápido; offset
 * paginación degrada O(n). Cursor en createdAt + id (compound) garantiza
 * resultados deterministas.
 *
 * Cap de seguridad: max 100 rows per request, max 365 días range.
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

export interface AuditLogQueryParams {
  /** Action filter — soporta wildcards LIKE (e.g. 'CHANNEX_%'). */
  action?: string
  actorRealId?: string
  status?: 'SUCCESS' | 'FAILURE' | 'PARTIAL'
  dateFrom?: string // ISO date
  dateTo?: string
  /** Paginación cursor — id de la última row del page anterior. */
  cursor?: string
  /** Tamaño de página — default 50, max 100. */
  limit?: number
}

export interface AuditLogRow {
  id: string
  createdAt: Date
  actorRealId: string
  actorRealRole: string
  onBehalfOfId: string | null
  onBehalfOfRole: string | null
  action: string
  target: string | null
  status: string
  reason: string | null
  errorMessage: string | null
  /** Solo summary visible en list — payload completo via GET /:id. */
  payloadPreview: string
}

@Injectable()
export class AuditLogQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async list(params: AuditLogQueryParams): Promise<{
    rows: AuditLogRow[]
    nextCursor: string | null
    totalThisPage: number
  }> {
    const orgId = this.tenant.getActingOrgIdOrThrow()

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100)

    // Range validation — cap 365 días para evitar query sobre tabla 1M+ rows
    if (params.dateFrom && params.dateTo) {
      const diffMs =
        new Date(params.dateTo).getTime() - new Date(params.dateFrom).getTime()
      const days = diffMs / (1000 * 60 * 60 * 24)
      if (days > 365) {
        throw new BadRequestException('Rango máximo 365 días. Particiona la consulta.')
      }
      if (days < 0) {
        throw new BadRequestException('dateFrom debe ser ≤ dateTo')
      }
    }

    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId,
      ...(params.action ? { action: { contains: params.action.replace('%', '') } } : {}),
      ...(params.actorRealId ? { actorRealId: params.actorRealId } : {}),
      ...(params.status ? { status: params.status as any } : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            createdAt: {
              ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
              ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
            },
          }
        : {}),
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // +1 para saber si hay nextPage
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    })

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows

    return {
      rows: pageRows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        actorRealId: r.actorRealId,
        actorRealRole: r.actorRealRole as string,
        onBehalfOfId: r.onBehalfOfId,
        onBehalfOfRole: (r.onBehalfOfRole as string) ?? null,
        action: r.action,
        target: r.target,
        status: r.status as string,
        reason: r.reason,
        errorMessage: r.errorMessage,
        payloadPreview: previewPayload(r.payload),
      })),
      nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
      totalThisPage: pageRows.length,
    }
  }

  /** Detail de una entry específica (incluye payload + channexResponse). */
  async findById(id: string) {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    const entry = await this.prisma.auditLog.findFirst({
      where: { id, organizationId: orgId },
    })
    if (!entry) return null
    return entry
  }

  /** Distinct list de actions disponibles para el filtro dropdown. */
  async listAvailableActions(): Promise<string[]> {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId: orgId },
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
      take: 100,
    })
    return rows.map((r) => r.action)
  }
}

function previewPayload(payload: unknown): string {
  if (payload == null) return ''
  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return str.slice(0, 120) + (str.length > 120 ? '…' : '')
  } catch {
    return '[unserializable]'
  }
}
