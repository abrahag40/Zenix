import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

/**
 * CancellationPolicyService — Sprint GROUP-BILLING Fase C (D-GRP-C1..C4, 2026-06-01).
 *
 * Núcleo: `computeOutcome()` es una función PURA (sin BD) que, dada una policy +
 * el estado de una stay + "ahora", calcula cuánto retiene el hotel y cuánto se
 * reembolsa al huésped. El reembolso se REGISTRA después (no se procesa por
 * Stripe — §195/§C5). El operador puede override con razón (no bloqueante).
 *
 * CRUD per-property (per-rate-plan en v1.0.1 con RATES-METRICS). Una sola policy
 * `isDefault` por property — se asigna a reservas nuevas.
 */

export type ChargeType = 'NIGHTS' | 'PERCENT' | 'FIXED'

export interface PolicyTier {
  /** Límite superior del tramo (horas ANTES del check-in). */
  fromHours: number
  /** Límite inferior del tramo (horas antes del check-in). 0 = hasta el check-in / no-show. */
  toHours: number
  chargeType: ChargeType
  /** NIGHTS → nº de noches; PERCENT → % (0-100) del total; FIXED → monto absoluto. */
  value: number
}

export interface PolicyShape {
  freeWindowHours: number
  tiers: PolicyTier[]
}

export interface StayChargeInput {
  checkinAt: Date
  totalAmount: number
  amountPaid: number
  ratePerNight: number
  currency: string
}

export interface CancellationOutcome {
  /** true si cae dentro de la ventana gratuita → sin retención. */
  free: boolean
  /** Horas hasta el check-in al momento del cálculo (negativo = check-in pasado). */
  hoursUntilCheckin: number
  appliedTier: PolicyTier | null
  /** Monto que el hotel retiene (penalización). */
  retention: number
  /** Monto a reembolsar al huésped (de lo ya pagado). */
  refund: number
  currency: string
}

/** Default conservador per-property: gratis ≥48h; 48-24h = 1ª noche; <24h = 100%. */
export const DEFAULT_POLICY_TIERS: PolicyTier[] = [
  { fromHours: 48, toHours: 24, chargeType: 'NIGHTS', value: 1 },
  { fromHours: 24, toHours: 0, chargeType: 'PERCENT', value: 100 },
]
export const DEFAULT_FREE_WINDOW_HOURS = 48

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Cálculo PURO de retención/reembolso. Reutilizable para cancelación y no-show
 * (no-show = check-in pasado → hoursUntilCheckin ≤ 0 → cae en el último tramo).
 */
export function computeCancellationOutcome(
  policy: PolicyShape,
  stay: StayChargeInput,
  now: Date,
): CancellationOutcome {
  const hoursUntilCheckin = (stay.checkinAt.getTime() - now.getTime()) / 3_600_000
  const base = {
    hoursUntilCheckin: round2(hoursUntilCheckin),
    currency: stay.currency,
  }

  // Ventana gratuita — reembolso total de lo pagado.
  if (hoursUntilCheckin >= policy.freeWindowHours) {
    return { ...base, free: true, appliedTier: null, retention: 0, refund: round2(stay.amountPaid) }
  }

  // Tramo aplicable. Check-in pasado (no-show) → clamp a 0 para caer en el
  // último tramo (toHours = 0).
  const h = Math.max(0, hoursUntilCheckin)
  const tier = policy.tiers.find((t) => h < t.fromHours && h >= t.toHours) ?? null

  let charge = 0
  if (tier) {
    if (tier.chargeType === 'NIGHTS') charge = tier.value * stay.ratePerNight
    else if (tier.chargeType === 'PERCENT') charge = (tier.value / 100) * stay.totalAmount
    else charge = tier.value // FIXED
  }
  const retention = round2(Math.min(Math.max(0, charge), stay.totalAmount))
  const refund = round2(Math.max(0, stay.amountPaid - retention))

  return { ...base, free: false, appliedTier: tier, retention, refund }
}

@Injectable()
export class CancellationPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  // ── Cálculo ────────────────────────────────────────────────────────────────
  computeOutcome(policy: PolicyShape, stay: StayChargeInput, now = new Date()): CancellationOutcome {
    return computeCancellationOutcome(policy, stay, now)
  }

  /** Policy default de una property (o null si no hay ninguna sembrada). */
  async getDefaultForProperty(propertyId: string) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.cancellationPolicy.findFirst({
      where: { propertyId, organizationId: orgId, isDefault: true },
    })
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  async listForProperty(propertyId: string) {
    const orgId = this.tenant.getOrganizationId()
    return this.prisma.cancellationPolicy.findMany({
      where: { propertyId, organizationId: orgId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })
  }

  private validateTiers(tiers: PolicyTier[]) {
    if (!Array.isArray(tiers) || tiers.length === 0) {
      throw new BadRequestException('La política requiere al menos un tramo de penalización')
    }
    for (const t of tiers) {
      if (typeof t.fromHours !== 'number' || typeof t.toHours !== 'number' || t.fromHours <= t.toHours) {
        throw new BadRequestException('Cada tramo requiere fromHours > toHours')
      }
      if (!['NIGHTS', 'PERCENT', 'FIXED'].includes(t.chargeType) || typeof t.value !== 'number' || t.value < 0) {
        throw new BadRequestException('chargeType inválido o value negativo en un tramo')
      }
    }
  }

  async create(dto: {
    propertyId: string
    name: string
    freeWindowHours: number
    tiers: PolicyTier[]
    refundMode?: string
    groupOverride?: { freeWindowHours: number; tiers: PolicyTier[] } | null
    isDefault?: boolean
  }) {
    const orgId = this.tenant.getOrganizationId()
    this.validateTiers(dto.tiers)
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.cancellationPolicy.updateMany({
          where: { propertyId: dto.propertyId, organizationId: orgId, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.cancellationPolicy.create({
        data: {
          organizationId: orgId,
          propertyId: dto.propertyId,
          name: dto.name,
          freeWindowHours: dto.freeWindowHours,
          tiers: dto.tiers as unknown as object,
          refundMode: dto.refundMode ?? 'PARTIAL',
          groupOverride: (dto.groupOverride as unknown as object) ?? undefined,
          isDefault: dto.isDefault ?? false,
        },
      })
    })
  }

  async update(id: string, dto: Partial<{
    name: string
    freeWindowHours: number
    tiers: PolicyTier[]
    refundMode: string
    groupOverride: { freeWindowHours: number; tiers: PolicyTier[] } | null
    isDefault: boolean
  }>) {
    const orgId = this.tenant.getOrganizationId()
    const existing = await this.prisma.cancellationPolicy.findFirst({ where: { id, organizationId: orgId } })
    if (!existing) throw new NotFoundException('Política de cancelación no encontrada')
    if (dto.tiers) this.validateTiers(dto.tiers)
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.cancellationPolicy.updateMany({
          where: { propertyId: existing.propertyId, organizationId: orgId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
      }
      return tx.cancellationPolicy.update({
        where: { id },
        data: {
          name: dto.name,
          freeWindowHours: dto.freeWindowHours,
          tiers: dto.tiers ? (dto.tiers as unknown as object) : undefined,
          refundMode: dto.refundMode,
          groupOverride: dto.groupOverride === null ? Prisma.DbNull : (dto.groupOverride as unknown as object | undefined),
          isDefault: dto.isDefault,
        },
      })
    })
  }
}
