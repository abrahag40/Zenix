import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

/**
 * RatesService — endpoint derivado para BAR (Best Available Rate) por día.
 *
 * v1.0.0 deriva BAR del campo `RoomType.baseRate` (mínimo across types activos).
 * No requiere modelo RatePlan formal — ese llega en v1.0.1 PAY-CORE.
 *
 * Cuando v1.0.1 entre, esta clase substituye la fuente por la tabla RatePlan
 * sin tocar la API pública. Schema "espiral" — el endpoint queda estable.
 */
@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * Daily BAR strip — un número por día across all room types activos.
   * Para Nivel 1 del calendar header (column BAR badge).
   *
   * Returns: [{ date, bar, currency }] uno por día del rango.
   * Si no hay roomTypes activos: bar = null (UI muestra "—").
   */
  async getDailyBar(propertyId: string, from: Date, to: Date) {
    const orgId = this.tenant.getOrganizationId()
    const roomTypes = await this.prisma.roomType.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, baseRate: true, currency: true },
    })

    if (roomTypes.length === 0) return []

    // Currency común — asumimos todos los room types comparten currency.
    // Si difieren (multi-currency property), futuro v1.0.1 PAY-CORE
    // normaliza vía PropertyFxRate antes de calcular el min.
    const currency = roomTypes[0].currency

    // BAR mínimo across types (Apple HIG: 1 número por día).
    const minRate = Number(
      roomTypes.reduce(
        (acc, rt) => (Number(rt.baseRate) < Number(acc) ? rt.baseRate : acc),
        roomTypes[0].baseRate,
      ),
    )

    // Generar la serie día por día. v1.0.0 retorna el mismo BAR para cada día
    // (RoomType.baseRate no varía por fecha). v1.1.x con yield management
    // poblará dinámicamente.
    const result: Array<{ date: string; bar: number; currency: string }> = []
    const dayMs = 86400000
    const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
    const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
    for (let t = fromUtc; t <= toUtc; t += dayMs) {
      const d = new Date(t)
      result.push({
        date: d.toISOString().slice(0, 10),
        bar: minRate,
        currency,
      })
    }
    return result
  }

  /**
   * Rate Quote Sheet — grid completo de room types × días.
   * Para Nivel 3 (side sheet con detalle multi-type / multi-night).
   *
   * Returns: { roomTypes: [...], dates: [...], grid: { [rtId]: { [date]: rate } } }
   */
  async getRateQuoteGrid(propertyId: string, from: Date, to: Date) {
    const orgId = this.tenant.getOrganizationId()
    const roomTypes = await this.prisma.roomType.findMany({
      where: {
        organizationId: orgId,
        propertyId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        baseRate: true,
        currency: true,
        maxOccupancy: true,
      },
      orderBy: { baseRate: 'asc' },
    })

    const dayMs = 86400000
    const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
    const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
    const dates: string[] = []
    for (let t = fromUtc; t <= toUtc; t += dayMs) {
      const d = new Date(t)
      dates.push(d.toISOString().slice(0, 10))
    }

    const grid: Record<string, Record<string, number>> = {}
    for (const rt of roomTypes) {
      grid[rt.id] = {}
      for (const date of dates) {
        grid[rt.id][date] = Number(rt.baseRate)
      }
    }

    return {
      roomTypes: roomTypes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        code: rt.code,
        baseRate: Number(rt.baseRate),
        currency: rt.currency,
        maxOccupancy: rt.maxOccupancy,
      })),
      dates,
      grid,
      currency: roomTypes[0]?.currency ?? 'USD',
    }
  }
}
