/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 7.
 *
 * MappingsService — wizard de mapeo Zenix Room ↔ Channex Room Type.
 *
 * Responsabilidades:
 *
 *   1. **proposal(propertyId)** — sugiere mappings basados en similarity
 *      del title (Zenix Room.category/number vs Channex room_type.title).
 *      Output: array de proposals con score 0-1. Manager elige y confirma.
 *      Algoritmo: token overlap (Jaccard) + capacity match boost.
 *
 *   2. **bulkUpdate(propertyId, mappings[])** — persiste mappings confirmados
 *      en `Room.channexRoomTypeId`. Single transaction. Audit per row.
 *
 *   3. **healthCheck(propertyId)** — diagnóstico pre-activate del wizard:
 *      · Cada Room sin mapping → ERROR (bloquea activación)
 *      · Mapping apunta a un channex room_type que ya no existe → ERROR
 *      · Channex room_type sin Room mapeado (inverse) → WARNING (overstock OTA)
 *      · Capacity Zenix Room ≠ Channex occ_adults → WARNING
 *      Devuelve `HealthCheckResult` con findings categorizados.
 *
 * Por qué wizard separado (no inline en /rooms):
 *   · Bulk operation con preview: el manager NO quiere hacer 30 PATCHes
 *     individuales — quiere ver la propuesta, ajustar, confirmar.
 *   · Health check post-save: validamos el grafo entero, no row-by-row.
 *   · Es paso del Zenix Activate wizard (Step 5 Inventory) — requiere su
 *     propio flujo aislable del CRUD normal.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { TenantContextService } from '../../../common/tenant-context.service'
import { ChannexGateway, ChannexRoomType } from '../../../integrations/channex/channex.gateway'
import { AuditLogService } from '../../audit/audit-log.service'

// ── Public types ────────────────────────────────────────────────────────────

export interface MappingProposal {
  roomId: string
  roomNumber: string
  roomCategory: string
  roomCapacity: number
  suggestedChannexRoomTypeId: string | null
  suggestedChannexRoomTypeTitle: string | null
  similarityScore: number // 0-1, 1 = perfecto
  reason: string // explicación humano-readable
}

export interface MappingUpdate {
  roomId: string
  channexRoomTypeId: string | null // null = clear mapping
}

export interface HealthCheckFinding {
  severity: 'ERROR' | 'WARNING' | 'INFO'
  code:
    | 'UNMAPPED_ROOM'
    | 'STALE_MAPPING'
    | 'ORPHAN_CHANNEX_TYPE'
    | 'CAPACITY_MISMATCH'
    | 'NO_RATE_PLAN'
  message: string
  details: Record<string, unknown>
}

export interface HealthCheckResult {
  propertyId: string
  passedErrors: boolean // true si NO hay findings ERROR (wizard puede continuar)
  errorCount: number
  warningCount: number
  infoCount: number
  findings: HealthCheckFinding[]
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly gateway: ChannexGateway,
    private readonly auditLog: AuditLogService,
  ) {}

  async proposal(propertyId: string): Promise<MappingProposal[]> {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)
    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)

    const [rooms, channexRoomTypes] = await Promise.all([
      this.prisma.room.findMany({
        where: { propertyId, deletedAt: null },
        select: {
          id: true,
          number: true,
          category: true,
          capacity: true,
          channexRoomTypeId: true,
        },
        orderBy: { number: 'asc' },
      }),
      this.gateway.listRoomTypes(channexPropertyId),
    ])

    return rooms.map((room) => this.scoreRoom(room, channexRoomTypes))
  }

  async bulkUpdate(
    propertyId: string,
    updates: MappingUpdate[],
    actorId: string,
    actorRole: 'PLATFORM_ADMIN' | 'PARTNER_ADMIN' | 'PARTNER_MEMBER' | 'ORG_OWNER',
    onBehalfOfUserId?: string,
    reason?: string,
  ) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new BadRequestException('Body requiere { mappings: MappingUpdate[] } con al menos 1 entry')
    }
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)

    // Validar que todos los room IDs pertenecen al property
    const roomIds = updates.map((u) => u.roomId)
    const rooms = await this.prisma.room.findMany({
      where: { id: { in: roomIds }, propertyId, deletedAt: null },
      select: { id: true, number: true, channexRoomTypeId: true },
    })
    if (rooms.length !== updates.length) {
      const foundIds = new Set(rooms.map((r) => r.id))
      const missing = roomIds.filter((id) => !foundIds.has(id))
      throw new BadRequestException(
        `Rooms no pertenecen a property ${propertyId} o están borrados: ${missing.join(', ')}`,
      )
    }

    // Atomic transaction: update todos + audit en bulk
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedRooms = await Promise.all(
        updates.map((u) =>
          tx.room.update({
            where: { id: u.roomId },
            data: { channexRoomTypeId: u.channexRoomTypeId },
          }),
        ),
      )
      return updatedRooms
    })

    await this.auditLog.write({
      organizationId: orgId,
      actorRealId: actorId,
      actorRealRole: actorRole,
      onBehalfOfId: onBehalfOfUserId,
      onBehalfOfRole: onBehalfOfUserId ? 'ORG_OWNER' : undefined,
      action: 'CHANNEX_MAPPING_BULK_UPDATE',
      target: propertyId,
      payload: {
        propertyId,
        updateCount: updates.length,
        mappingsBefore: rooms.map((r) => ({ roomId: r.id, channexRoomTypeId: r.channexRoomTypeId })),
        mappingsAfter: updates,
      },
      status: 'SUCCESS',
      retentionPolicy: 'PERMANENT', // mapping changes son configuración crítica
      reason,
    })

    return { updated: result.length, rooms: result }
  }

  async healthCheck(propertyId: string): Promise<HealthCheckResult> {
    const orgId = this.tenant.getActingOrgIdOrThrow()
    await this.assertPropertyInOrg(propertyId, orgId)
    const channexPropertyId = await this.resolveChannexPropertyId(propertyId)

    const [rooms, channexRoomTypes, ratePlanMappings] = await Promise.all([
      this.prisma.room.findMany({
        where: { propertyId, deletedAt: null },
        select: { id: true, number: true, capacity: true, channexRoomTypeId: true },
      }),
      this.gateway.listRoomTypes(channexPropertyId),
      this.prisma.channexRatePlanMapping.findMany({
        where: { propertyId, organizationId: orgId, isActive: true },
        select: { channexRoomTypeId: true },
      }),
    ])

    const findings: HealthCheckFinding[] = []
    const channexById = new Map(channexRoomTypes.map((rt) => [rt.id!, rt]))
    const mappedTypeIds = new Set(rooms.map((r) => r.channexRoomTypeId).filter(Boolean))
    const rateplanTypeIds = new Set(ratePlanMappings.map((m) => m.channexRoomTypeId))

    // 1. UNMAPPED_ROOM — rooms sin channexRoomTypeId
    for (const room of rooms) {
      if (!room.channexRoomTypeId) {
        findings.push({
          severity: 'ERROR',
          code: 'UNMAPPED_ROOM',
          message: `Room ${room.number} no tiene mapping a Channex. OTAs no pueden vender esta habitación.`,
          details: { roomId: room.id, roomNumber: room.number },
        })
      } else if (!channexById.has(room.channexRoomTypeId)) {
        // 2. STALE_MAPPING — channex room type que ya no existe
        findings.push({
          severity: 'ERROR',
          code: 'STALE_MAPPING',
          message: `Room ${room.number} mapea a Channex room type ${room.channexRoomTypeId} que ya no existe en Channex (¿borrado manualmente?). Re-mapear.`,
          details: {
            roomId: room.id,
            roomNumber: room.number,
            staleChannexRoomTypeId: room.channexRoomTypeId,
          },
        })
      } else {
        // 4. CAPACITY_MISMATCH
        const channexType = channexById.get(room.channexRoomTypeId)!
        if (room.capacity !== channexType.occ_adults) {
          findings.push({
            severity: 'WARNING',
            code: 'CAPACITY_MISMATCH',
            message: `Room ${room.number} capacidad Zenix=${room.capacity}, Channex occ_adults=${channexType.occ_adults}. Pueden recibirse reservas con occupancy incorrecta.`,
            details: {
              roomId: room.id,
              roomNumber: room.number,
              zenixCapacity: room.capacity,
              channexOccAdults: channexType.occ_adults,
              channexRoomTypeId: room.channexRoomTypeId,
            },
          })
        }
      }
    }

    // 3. ORPHAN_CHANNEX_TYPE — Channex room type sin Zenix Room mapeado
    for (const rt of channexRoomTypes) {
      if (!mappedTypeIds.has(rt.id!)) {
        findings.push({
          severity: 'WARNING',
          code: 'ORPHAN_CHANNEX_TYPE',
          message: `Channex room type "${rt.title}" no tiene Zenix Room mapeado. OTAs pueden recibir reservas que el PMS no sabe colocar (conflict).`,
          details: {
            channexRoomTypeId: rt.id,
            channexRoomTypeTitle: rt.title,
            channexCountOfRooms: rt.count_of_rooms,
          },
        })
      }
    }

    // 5. NO_RATE_PLAN — Channex room type sin RatePlan asociado
    for (const rt of channexRoomTypes) {
      if (!rateplanTypeIds.has(rt.id!)) {
        findings.push({
          severity: 'WARNING',
          code: 'NO_RATE_PLAN',
          message: `Channex room type "${rt.title}" no tiene Rate Plan asociado. OTAs no pueden vender (sin precio).`,
          details: {
            channexRoomTypeId: rt.id,
            channexRoomTypeTitle: rt.title,
          },
        })
      }
    }

    const errorCount = findings.filter((f) => f.severity === 'ERROR').length
    const warningCount = findings.filter((f) => f.severity === 'WARNING').length
    const infoCount = findings.filter((f) => f.severity === 'INFO').length

    return {
      propertyId,
      passedErrors: errorCount === 0,
      errorCount,
      warningCount,
      infoCount,
      findings,
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private scoreRoom(
    room: {
      id: string
      number: string
      category: string
      capacity: number
      channexRoomTypeId: string | null
    },
    channexTypes: ChannexRoomType[],
  ): MappingProposal {
    if (channexTypes.length === 0) {
      return {
        roomId: room.id,
        roomNumber: room.number,
        roomCategory: room.category,
        roomCapacity: room.capacity,
        suggestedChannexRoomTypeId: null,
        suggestedChannexRoomTypeTitle: null,
        similarityScore: 0,
        reason: 'No hay room types en Channex para mapear. Crear room types primero.',
      }
    }

    let best: { type: ChannexRoomType; score: number; reason: string } | null = null
    const roomTokens = tokenize(`${room.category} ${room.number}`)

    for (const ct of channexTypes) {
      const ctTokens = tokenize(ct.title)
      // Jaccard similarity: intersection / union
      const intersection = roomTokens.filter((t) => ctTokens.includes(t)).length
      const union = new Set([...roomTokens, ...ctTokens]).size
      const jaccard = union === 0 ? 0 : intersection / union

      // Capacity boost: si Channex.occ_adults matches Zenix.capacity, boost +0.3
      const capacityBoost = ct.occ_adults === room.capacity ? 0.3 : 0

      const score = Math.min(1, jaccard + capacityBoost)
      const reason = jaccard > 0
        ? `Tokens compartidos: ${intersection}/${union}; capacity ${capacityBoost > 0 ? 'match (+0.30)' : 'no match'}`
        : `Sin tokens compartidos; ${capacityBoost > 0 ? 'capacity match (+0.30)' : 'sin matches'}`

      if (!best || score > best.score) {
        best = { type: ct, score, reason }
      }
    }

    return {
      roomId: room.id,
      roomNumber: room.number,
      roomCategory: room.category,
      roomCapacity: room.capacity,
      suggestedChannexRoomTypeId: best!.score >= 0.2 ? best!.type.id ?? null : null,
      suggestedChannexRoomTypeTitle: best!.score >= 0.2 ? best!.type.title : null,
      similarityScore: best!.score,
      reason: best!.reason,
    }
  }

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
      throw new BadRequestException(
        `Property ${propertyId} no tiene channexPropertyId. Configurar primero via wizard.`,
      )
    }
    return settings.channexPropertyId
  }
}

// ── Pure helper ────────────────────────────────────────────────────────────

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}
