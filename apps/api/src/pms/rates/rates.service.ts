import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import {
  resolveNightlyRate,
  type BaseStrategy,
  type ResolverSeason,
  type ResolverDayRule,
} from './rate-resolver'

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
  async getRateQuoteGrid(propertyId: string, from: Date, to: Date, ratePlanId?: string) {
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

    // Contexto de resolución del plan (RATES-CORE Fase 1). Si no se pasa ratePlanId,
    // el grid usa la baseRate flat del room type (comportamiento v1.0.0 preservado).
    const ctx = ratePlanId ? await this.loadPlanContext(propertyId, orgId, ratePlanId, from, to) : null

    const grid: Record<string, Record<string, number>> = {}
    for (const rt of roomTypes) {
      grid[rt.id] = {}
      for (const date of dates) {
        if (ctx) {
          const ov = ctx.overrides.get(`${rt.id}|${date}`)
          grid[rt.id][date] = resolveNightlyRate({
            date: new Date(`${date}T12:00:00.000Z`),
            bar: Number(rt.baseRate),
            roomTypeId: rt.id,
            plan: ctx.plan,
            seasons: ctx.seasons,
            dayOfWeekRules: ctx.dayOfWeekRules,
            overrideRate: ov ?? null,
          }).rate
        } else {
          grid[rt.id][date] = Number(rt.baseRate)
        }
      }
    }

    return {
      ratePlanId: ratePlanId ?? null,
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

  // ── RATES-METRICS Fase 1 — resolución por RatePlan (D-RATES2) ───────────────

  /** Carga plan + seasons + day-of-week rules + overrides del rango, una vez. */
  private async loadPlanContext(
    propertyId: string,
    orgId: string,
    ratePlanId: string,
    from: Date,
    to: Date,
  ): Promise<{
    plan: { baseStrategy: BaseStrategy; baseRate: number | null; baseMultiplier: number | null }
    seasons: ResolverSeason[]
    dayOfWeekRules: ResolverDayRule[]
    overrides: Map<string, number>
  }> {
    const plan = await this.prisma.ratePlan.findFirst({
      where: { id: ratePlanId, propertyId },
      include: { seasons: true, dayOfWeekRules: true },
    })
    if (!plan) throw new NotFoundException('Plan de tarifa no encontrado')

    const overrideRows = await this.prisma.rateOverride.findMany({
      where: { propertyId, ratePlanId, date: { gte: startOfUtcDay(from), lte: startOfUtcDay(to) } },
      select: { roomTypeId: true, date: true, overrideRate: true },
    })
    const overrides = new Map<string, number>()
    for (const o of overrideRows) {
      overrides.set(`${o.roomTypeId}|${o.date.toISOString().slice(0, 10)}`, Number(o.overrideRate))
    }

    return {
      plan: {
        baseStrategy: plan.baseStrategy as BaseStrategy,
        baseRate: plan.baseRate != null ? Number(plan.baseRate) : null,
        baseMultiplier: plan.baseMultiplier != null ? Number(plan.baseMultiplier) : null,
      },
      seasons: plan.seasons.map((s) => ({
        startDate: s.startDate,
        endDate: s.endDate,
        roomTypeId: s.roomTypeId,
        overrideRate: s.overrideRate != null ? Number(s.overrideRate) : null,
        multiplier: s.multiplier != null ? Number(s.multiplier) : null,
      })),
      dayOfWeekRules: plan.dayOfWeekRules.map((r) => ({ dayOfWeek: r.dayOfWeek, multiplier: Number(r.multiplier) })),
      overrides,
    }
  }

  /**
   * GET /v1/rates/resolve-price — resolución de UNA tarifa con la capa que ganó
   * (debug/audit). Requiere el BAR del room type (su baseRate).
   */
  async resolvePrice(propertyId: string, roomTypeId: string, date: Date, ratePlanId: string) {
    const orgId = this.tenant.getOrganizationId()
    const rt = await this.prisma.roomType.findFirst({
      where: { id: roomTypeId, propertyId, organizationId: orgId },
      select: { baseRate: true, currency: true },
    })
    if (!rt) throw new NotFoundException('Tipo de habitación no encontrado')
    const ctx = await this.loadPlanContext(propertyId, orgId, ratePlanId, date, date)
    const ov = ctx.overrides.get(`${roomTypeId}|${date.toISOString().slice(0, 10)}`)
    const resolved = resolveNightlyRate({
      date,
      bar: Number(rt.baseRate),
      roomTypeId,
      plan: ctx.plan,
      seasons: ctx.seasons,
      dayOfWeekRules: ctx.dayOfWeekRules,
      overrideRate: ov ?? null,
    })
    return { ...resolved, currency: rt.currency, bar: Number(rt.baseRate) }
  }

  // ── RatePlan CRUD ───────────────────────────────────────────────────────────

  async listRatePlans(propertyId: string) {
    const orgId = this.tenant.getOrganizationId()
    // Defensa: la property pertenece a la org del actor.
    await this.assertPropertyInOrg(propertyId, orgId)
    return this.prisma.ratePlan.findMany({
      where: { propertyId },
      include: { seasons: true, dayOfWeekRules: true, restrictions: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    })
  }

  async createRatePlan(propertyId: string, dto: {
    code: string
    name: string
    baseStrategy?: BaseStrategy
    baseRate?: number | null
    baseMultiplier?: number | null
    cancellationPolicy?: string
    visibleToChannels?: string[]
  }) {
    const orgId = this.tenant.getOrganizationId()
    await this.assertPropertyInOrg(propertyId, orgId)
    this.validatePlanStrategy(dto.baseStrategy ?? 'BAR', dto.baseRate, dto.baseMultiplier)
    const exists = await this.prisma.ratePlan.findFirst({ where: { propertyId, code: dto.code } })
    if (exists) throw new ConflictException(`Ya existe un plan con código "${dto.code}"`)
    return this.prisma.ratePlan.create({
      data: {
        propertyId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        baseStrategy: dto.baseStrategy ?? 'BAR',
        baseRate: dto.baseRate ?? null,
        baseMultiplier: dto.baseMultiplier ?? null,
        cancellationPolicy: dto.cancellationPolicy ?? 'FLEXIBLE',
        visibleToChannels: dto.visibleToChannels ?? ['ALL'],
      },
    })
  }

  async updateRatePlan(propertyId: string, planId: string, dto: Partial<{
    name: string
    baseStrategy: BaseStrategy
    baseRate: number | null
    baseMultiplier: number | null
    cancellationPolicy: string
    visibleToChannels: string[]
    isActive: boolean
  }>) {
    const orgId = this.tenant.getOrganizationId()
    await this.assertPropertyInOrg(propertyId, orgId)
    const plan = await this.prisma.ratePlan.findFirst({ where: { id: planId, propertyId } })
    if (!plan) throw new NotFoundException('Plan de tarifa no encontrado')
    const strategy = dto.baseStrategy ?? (plan.baseStrategy as BaseStrategy)
    const baseRate = dto.baseRate !== undefined ? dto.baseRate : plan.baseRate != null ? Number(plan.baseRate) : null
    const baseMult = dto.baseMultiplier !== undefined ? dto.baseMultiplier : plan.baseMultiplier != null ? Number(plan.baseMultiplier) : null
    this.validatePlanStrategy(strategy, baseRate, baseMult)
    return this.prisma.ratePlan.update({
      where: { id: planId },
      data: {
        name: dto.name,
        baseStrategy: dto.baseStrategy,
        baseRate: dto.baseRate,
        baseMultiplier: dto.baseMultiplier,
        cancellationPolicy: dto.cancellationPolicy,
        visibleToChannels: dto.visibleToChannels,
        isActive: dto.isActive,
      },
    })
  }

  /** Soft-delete (isActive=false) — nunca hard-delete (mantiene histórico de stays). */
  async deactivateRatePlan(propertyId: string, planId: string) {
    const orgId = this.tenant.getOrganizationId()
    await this.assertPropertyInOrg(propertyId, orgId)
    const plan = await this.prisma.ratePlan.findFirst({ where: { id: planId, propertyId } })
    if (!plan) throw new NotFoundException('Plan de tarifa no encontrado')
    return this.prisma.ratePlan.update({ where: { id: planId }, data: { isActive: false } })
  }

  private validatePlanStrategy(strategy: BaseStrategy, baseRate?: number | null, baseMultiplier?: number | null) {
    if (strategy === 'FIXED' && (baseRate == null || baseRate < 0)) {
      throw new BadRequestException('baseStrategy=FIXED requiere baseRate ≥ 0')
    }
    if (strategy === 'MULTIPLIER' && (baseMultiplier == null || baseMultiplier <= 0)) {
      throw new BadRequestException('baseStrategy=MULTIPLIER requiere baseMultiplier > 0')
    }
  }

  private async assertPropertyInOrg(propertyId: string, orgId: string) {
    const prop = await this.prisma.property.findFirst({ where: { id: propertyId, organizationId: orgId }, select: { id: true } })
    if (!prop) throw new NotFoundException('Propiedad no encontrada')
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}
