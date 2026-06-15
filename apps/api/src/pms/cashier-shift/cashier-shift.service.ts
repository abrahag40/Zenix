import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  CashDailySummaryDto,
  CashMovementType,
  CashOpeningSource,
  CashierShiftReportDto,
  CashierShiftStatus,
  JwtPayload,
  PaymentMethod,
  StaffRole,
} from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import {
  AddCashMovementDto,
  CloseShiftDto,
  ListShiftsQueryDto,
  OpenShiftDto,
  ReconcileShiftDto,
  RecordSpotCountDto,
} from './dto/cashier-shift.dto'
import { computeShiftReconciliation } from './cash-reconciliation'

/**
 * CashierShiftService — Sprint CASH-DRAWER-REPORTS Sprint 1 (§85, D-CASH1..15).
 *
 * Ciclo del turno de caja por recepcionista (D-CASH2): abrir (recibir + aceptar
 * fondo) → [Sprint 2: cerrar/entregar + arqueo]. Aquí entregamos la apertura, el
 * handover encadenado (D-CASH14), la consulta del turno activo y el listado.
 * Multi-divisa per-divisa (D-CASH3): los saldos son objetos `{ MXN, USD }`.
 *
 * NO usa relaciones Prisma formales — IDs escalares + manual join en reportes (S3).
 */
@Injectable()
export class CashierShiftService {
  private readonly logger = new Logger(CashierShiftService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * POST /v1/cashier-shifts — abre un turno de caja para el cajero (actor).
   * Guard: máximo 1 turno OPEN por cajero/propiedad. Si es HANDOVER, el fondo
   * recibido debe igualar el cierre del turno saliente (el entrante cuenta + acepta).
   */
  async openShift(dto: OpenShiftDto, actor: JwtPayload) {
    const organizationId = this.tenant.getOrganizationId()
    const propertyId = this.tenant.getPropertyId()
    const staffId = actor.sub
    assertCashByCurrency(dto.openingFloat, 'openingFloat')

    const existing = await this.prisma.cashierShift.findFirst({
      where: { propertyId, staffId, status: CashierShiftStatus.OPEN },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictException('Ya tienes un turno de caja abierto. Ciérralo antes de abrir otro.')
    }

    const source = dto.openingSource ?? CashOpeningSource.FRESH_BANK
    let handoverFromShiftId: string | null = null
    let openingAcceptedById: string | null = null

    if (source === CashOpeningSource.HANDOVER) {
      if (!dto.handoverFromShiftId) {
        throw new BadRequestException('El traspaso (HANDOVER) requiere handoverFromShiftId.')
      }
      const prev = await this.prisma.cashierShift.findFirst({
        where: { id: dto.handoverFromShiftId, propertyId },
        select: { id: true, status: true, actualClose: true },
      })
      if (!prev) {
        throw new NotFoundException('Turno de origen no encontrado en esta propiedad.')
      }
      if (prev.status === CashierShiftStatus.OPEN) {
        throw new ConflictException('El turno de origen aún está abierto; ciérralo antes del traspaso.')
      }
      // El entrante cuenta y ACEPTA: el fondo recibido debe igualar el cierre del
      // saliente (D-CASH14 — transferencia de responsabilidad). Mismatch → recontar.
      if (!cashEquals(prev.actualClose as CashRecord | null, dto.openingFloat)) {
        throw new ConflictException(
          'El fondo recibido no coincide con el cierre del turno anterior. Recuenta antes de aceptar.',
        )
      }
      handoverFromShiftId = prev.id
      openingAcceptedById = staffId
    }

    const shift = await this.prisma.cashierShift.create({
      data: {
        organizationId,
        propertyId,
        staffId,
        openingFloat: dto.openingFloat,
        openingSource: source,
        handoverFromShiftId,
        openingAcceptedById,
      },
    })
    this.logger.log(
      `[CashierShift.open] property=${propertyId} staff=${staffId} source=${source} id=${shift.id}`,
    )
    return shift
  }

  /** GET /v1/cashier-shifts/current — turno OPEN del cajero, o null. */
  async getCurrentShift(actor: JwtPayload) {
    const propertyId = this.tenant.getPropertyId()
    const shift = await this.prisma.cashierShift.findFirst({
      where: { propertyId, staffId: actor.sub, status: CashierShiftStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    })
    return shift ? this.sanitizeForActor(shift, actor) : null
  }

  /**
   * GET /v1/cashier-shifts — listado de turnos de la propiedad.
   * D-CASH10: el cajero ve sólo SUS turnos; el SUPERVISOR ve todos.
   */
  async listShifts(query: ListShiftsQueryDto, actor: JwtPayload) {
    const propertyId = this.tenant.getPropertyId()
    const where: {
      propertyId: string
      staffId?: string
      status?: CashierShiftStatus
      openedAt?: { gte?: Date; lte?: Date }
    } = { propertyId }
    if (actor.role !== StaffRole.SUPERVISOR) where.staffId = actor.sub
    if (query.status) where.status = query.status
    if (query.from || query.to) {
      where.openedAt = {}
      if (query.from) where.openedAt.gte = new Date(query.from)
      if (query.to) where.openedAt.lte = new Date(query.to)
    }
    const shifts = await this.prisma.cashierShift.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take: 200,
    })
    return shifts.map((s) => this.sanitizeForActor(s, actor))
  }

  /**
   * POST /v1/cashier-shifts/:id/close — el cajero entrega/cierra su turno con el
   * conteo físico per-divisa (D-CASH5, a ciegas). Calcula el arqueo; dentro de
   * tolerancia → RECONCILED, fuera → CLOSED (pendiente de conciliación supervisor).
   * R3: al cajero NO se le revela el over/short — solo al supervisor / en el reporte.
   */
  async closeShift(shiftId: string, dto: CloseShiftDto, actor: JwtPayload) {
    const propertyId = this.tenant.getPropertyId()
    assertCashByCurrency(dto.actualClose, 'actualClose')
    const shift = await this.loadShiftOrThrow(shiftId, propertyId)
    if (shift.status !== CashierShiftStatus.OPEN) {
      throw new ConflictException('El turno ya está cerrado.')
    }
    if (shift.staffId !== actor.sub && actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo el cajero del turno o un supervisor pueden cerrarlo.')
    }
    const threshold = await this.varianceThresholdFor(propertyId)
    const result = await this.computeReconciliation(shift, dto.actualClose, threshold)
    const status = result.withinTolerance ? CashierShiftStatus.RECONCILED : CashierShiftStatus.CLOSED
    await this.prisma.cashierShift.update({
      where: { id: shiftId },
      data: {
        status,
        closedAt: new Date(),
        expectedClose: result.expected,
        actualClose: dto.actualClose,
        variance: result.variance,
        closingWitnessId: dto.witnessId ?? null,
      },
    })
    this.logger.log(
      `[CashierShift.close] id=${shiftId} status=${status} maxVar=${result.maxAbsVariance}`,
    )
    // R3 — conteo a ciegas: el over/short (expected/variance) sólo va al SUPERVISOR.
    const resp: { id: string; status: CashierShiftStatus; expected?: unknown; variance?: unknown } = {
      id: shiftId,
      status,
    }
    if (actor.role === StaffRole.SUPERVISOR) {
      resp.expected = result.expected
      resp.variance = result.variance
    }
    return resp
  }

  /**
   * POST /v1/cashier-shifts/:id/reconcile — el SUPERVISOR concilia un turno
   * CLOSED (fuera de tolerancia) con razón obligatoria (D-CASH6). RECONCILED | DISPUTED.
   */
  async reconcileShift(shiftId: string, dto: ReconcileShiftDto, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo un supervisor puede conciliar un turno.')
    }
    const propertyId = this.tenant.getPropertyId()
    const shift = await this.loadShiftOrThrow(shiftId, propertyId)
    if (shift.status !== CashierShiftStatus.CLOSED) {
      throw new ConflictException('Solo se concilia un turno CERRADO pendiente de revisión.')
    }
    const status = dto.decision === 'DISPUTED' ? CashierShiftStatus.DISPUTED : CashierShiftStatus.RECONCILED
    return this.prisma.cashierShift.update({
      where: { id: shiftId },
      data: {
        status,
        varianceReason: dto.varianceReason,
        reconciledById: actor.sub,
        reconciledAt: new Date(),
      },
    })
  }

  /**
   * POST /v1/cashier-shifts/:id/movements — movimiento de caja append-only (E3):
   * paid-out, cambio entregado, conversión de divisa, corrección. El signo se
   * deriva del tipo (PAID_OUT/CHANGE_GIVEN salen); CORRECTION/FX_CONVERSION usan
   * `direction`. OPENING_FLOAT y SPOT_COUNT no se registran por aquí.
   */
  async addCashMovement(shiftId: string, dto: AddCashMovementDto, actor: JwtPayload) {
    const propertyId = this.tenant.getPropertyId()
    const shift = await this.loadShiftOrThrow(shiftId, propertyId)
    if (shift.status !== CashierShiftStatus.OPEN) {
      throw new ConflictException('No se pueden registrar movimientos en un turno cerrado.')
    }
    if (shift.staffId !== actor.sub && actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('Solo el cajero del turno o un supervisor pueden registrar movimientos.')
    }
    const amount = signMovement(dto)
    return this.prisma.cashMovement.create({
      data: {
        organizationId: shift.organizationId,
        propertyId,
        shiftId,
        type: dto.type,
        currency: dto.currency,
        amount,
        paymentLogId: dto.paymentLogId ?? null,
        transactionGroupId: dto.transactionGroupId ?? null,
        notes: dto.notes ?? null,
        createdById: actor.sub,
      },
    })
  }

  /**
   * GET /v1/cashier-shifts/:id/spot-count — SUPERVISOR: esperado per-divisa del
   * turno activo, SIN cerrarlo y SIN tocar la pantalla del cajero (D-CASH13).
   */
  async getSpotCount(shiftId: string, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('El arqueo spot es una herramienta del supervisor.')
    }
    const propertyId = this.tenant.getPropertyId()
    const shift = await this.loadShiftOrThrow(shiftId, propertyId)
    const threshold = await this.varianceThresholdFor(propertyId)
    const result = await this.computeReconciliation(shift, {}, threshold)
    return { shiftId, status: shift.status, expected: result.expected, currencies: result.currencies }
  }

  /**
   * POST /v1/cashier-shifts/:id/spot-count — SUPERVISOR registra su conteo físico
   * a mitad de turno (D-CASH13). Persiste un SPOT_COUNT por divisa (auditoría,
   * EXCLUIDO del esperado) y devuelve la variance. NO cierra el turno.
   */
  async recordSpotCount(shiftId: string, dto: RecordSpotCountDto, actor: JwtPayload) {
    if (actor.role !== StaffRole.SUPERVISOR) {
      throw new ForbiddenException('El arqueo spot es una herramienta del supervisor.')
    }
    const propertyId = this.tenant.getPropertyId()
    assertCashByCurrency(dto.counted, 'counted')
    const shift = await this.loadShiftOrThrow(shiftId, propertyId)
    if (shift.status !== CashierShiftStatus.OPEN) {
      throw new ConflictException('El arqueo spot aplica a un turno abierto.')
    }
    const threshold = await this.varianceThresholdFor(propertyId)
    const result = await this.computeReconciliation(shift, dto.counted, threshold)
    const note = `spot-count supervisor=${actor.sub}${dto.witnessId ? ` testigo=${dto.witnessId}` : ''}${dto.notes ? ` — ${dto.notes}` : ''}`
    await this.prisma.$transaction(
      Object.entries(dto.counted).map(([currency, amount]) =>
        this.prisma.cashMovement.create({
          data: {
            organizationId: shift.organizationId,
            propertyId,
            shiftId,
            type: CashMovementType.SPOT_COUNT,
            currency,
            amount,
            notes: note,
            createdById: actor.sub,
          },
        }),
      ),
    )
    this.logger.log(`[CashierShift.spotCount] id=${shiftId} by=${actor.sub} maxVar=${result.maxAbsVariance}`)
    return {
      shiftId,
      expected: result.expected,
      counted: dto.counted,
      variance: result.variance,
      withinTolerance: result.withinTolerance,
    }
  }

  // ── Reportes (Sprint 3) ─────────────────────────────────────────────────────

  /**
   * GET /v1/cash-reports/shift/:id — Cashier Shift Report individual (D-CASH7).
   * El cajero ve su propio turno SIN el bloque de reconciliación (over/short
   * oculto, R3); el SUPERVISOR ve todo (esperado/variance/spot-counts/conciliador).
   */
  async getShiftReport(shiftId: string, actor: JwtPayload): Promise<CashierShiftReportDto> {
    const propertyId = this.tenant.getPropertyId()
    const shift = await this.loadShiftOrThrow(shiftId, propertyId)
    const isSup = actor.role === StaffRole.SUPERVISOR
    if (!isSup && shift.staffId !== actor.sub) {
      throw new ForbiddenException('Solo puedes ver el reporte de tu propio turno.')
    }

    const [payments, allMovements] = await Promise.all([
      this.prisma.paymentLog.findMany({
        where: { cashierShiftId: shiftId, isVoid: false },
        select: { method: true, currency: true, amount: true },
      }),
      this.prisma.cashMovement.findMany({ where: { shiftId }, orderBy: { createdAt: 'asc' } }),
    ])
    const movements = allMovements.filter((m) => m.type !== CashMovementType.SPOT_COUNT)
    const spotCounts = allMovements.filter((m) => m.type === CashMovementType.SPOT_COUNT)

    const names = await this.resolveStaffNames([
      shift.staffId,
      shift.openingAcceptedById,
      shift.closingWitnessId,
      shift.reconciledById,
      ...allMovements.map((m) => m.createdById),
    ])
    const ref = (id: string | null) => (id ? { id, name: names.get(id) ?? id } : null)

    const pmc = new Map<string, { method: PaymentMethod; currency: string; total: number; count: number }>()
    const cashTotalByCurrency: Record<string, number> = {}
    for (const p of payments) {
      const key = `${p.method}|${p.currency}`
      const e = pmc.get(key) ?? { method: p.method as PaymentMethod, currency: p.currency, total: 0, count: 0 }
      e.total = round2(e.total + Number(p.amount))
      e.count += 1
      pmc.set(key, e)
      if (p.method === PaymentMethod.CASH) {
        cashTotalByCurrency[p.currency] = round2((cashTotalByCurrency[p.currency] ?? 0) + Number(p.amount))
      }
    }

    return {
      shift: {
        id: shift.id,
        status: shift.status as CashierShiftStatus,
        openedAt: shift.openedAt.toISOString(),
        closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
        openingSource: shift.openingSource as CashierShiftReportDto['shift']['openingSource'],
        openingFloat: (shift.openingFloat ?? {}) as Record<string, number>,
        cashier: ref(shift.staffId),
        openingAcceptedBy: ref(shift.openingAcceptedById),
        closingWitness: ref(shift.closingWitnessId),
        handoverFromShiftId: shift.handoverFromShiftId,
      },
      payments: { byMethodCurrency: [...pmc.values()], cashTotalByCurrency },
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type as CashMovementType,
        currency: m.currency,
        amount: Number(m.amount),
        notes: m.notes,
        createdBy: ref(m.createdById),
        createdAt: m.createdAt.toISOString(),
      })),
      reconciliation: isSup
        ? {
            expected: (shift.expectedClose ?? null) as Record<string, number> | null,
            actual: (shift.actualClose ?? null) as Record<string, number> | null,
            variance: (shift.variance ?? null) as Record<string, number> | null,
            varianceReason: shift.varianceReason,
            reconciledBy: ref(shift.reconciledById),
            reconciledAt: shift.reconciledAt ? shift.reconciledAt.toISOString() : null,
            spotCounts: spotCounts.map((s) => ({
              currency: s.currency,
              counted: Number(s.amount),
              notes: s.notes,
              createdBy: ref(s.createdById),
              createdAt: s.createdAt.toISOString(),
            })),
          }
        : null,
    }
  }

  /**
   * GET /v1/cash-reports/cash-summary — resumen diario de caja (SUPERVISOR).
   * Pagos del día (no-void) por divisa×método + por colector, y los turnos del día
   * con su variance. Filtros opcionales overages/shortages/overShort sobre los turnos.
   */
  async getCashSummary(
    propertyId: string,
    dateStr: string,
    filter?: 'overShort' | 'overages' | 'shortages',
  ): Promise<CashDailySummaryDto> {
    const organizationId = this.tenant.getOrganizationId()
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    const [payments, shiftsRaw] = await Promise.all([
      this.prisma.paymentLog.findMany({
        where: { organizationId, propertyId, shiftDate: dayStart, isVoid: false },
        select: { method: true, currency: true, amount: true, collectedById: true },
      }),
      this.prisma.cashierShift.findMany({
        where: { propertyId, openedAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { openedAt: 'asc' },
      }),
    ])

    const byCurrencyMethod = new Map<string, { currency: string; method: PaymentMethod; total: number; count: number }>()
    const byCollector = new Map<string, { collectedById: string; collectorName: string; currency: string; total: number; count: number }>()
    for (const p of payments) {
      const k1 = `${p.currency}|${p.method}`
      const e1 = byCurrencyMethod.get(k1) ?? { currency: p.currency, method: p.method as PaymentMethod, total: 0, count: 0 }
      e1.total = round2(e1.total + Number(p.amount))
      e1.count += 1
      byCurrencyMethod.set(k1, e1)
      const k2 = `${p.collectedById}|${p.currency}`
      const e2 = byCollector.get(k2) ?? { collectedById: p.collectedById, collectorName: '', currency: p.currency, total: 0, count: 0 }
      e2.total = round2(e2.total + Number(p.amount))
      e2.count += 1
      byCollector.set(k2, e2)
    }

    const names = await this.resolveStaffNames([
      ...payments.map((p) => p.collectedById),
      ...shiftsRaw.map((s) => s.staffId),
    ])
    const collectors = [...byCollector.values()].map((c) => ({ ...c, collectorName: names.get(c.collectedById) ?? c.collectedById }))

    let shifts = shiftsRaw.map((s) => ({
      id: s.id,
      cashier: { id: s.staffId, name: names.get(s.staffId) ?? s.staffId },
      status: s.status as CashierShiftStatus,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt ? s.closedAt.toISOString() : null,
      variance: (s.variance ?? null) as Record<string, number> | null,
    }))
    if (filter) {
      const matches = (v: Record<string, number> | null): boolean => {
        if (!v) return false
        const vals = Object.values(v)
        if (filter === 'overages') return vals.some((n) => n > 0)
        if (filter === 'shortages') return vals.some((n) => n < 0)
        return vals.some((n) => n !== 0) // overShort
      }
      shifts = shifts.filter((s) => matches(s.variance))
    }

    return { date: dateStr, propertyId, byCurrencyMethod: [...byCurrencyMethod.values()], byCollector: collectors, shifts }
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  /** Resuelve nombres de staff por id (manual join §204), ignora nulls/duplicados. */
  private async resolveStaffNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))]
    if (unique.length === 0) return new Map()
    const rows = await this.prisma.staff.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  private async loadShiftOrThrow(shiftId: string, propertyId: string) {
    const shift = await this.prisma.cashierShift.findFirst({ where: { id: shiftId, propertyId } })
    if (!shift) throw new NotFoundException('Turno de caja no encontrado en esta propiedad.')
    return shift
  }

  private async varianceThresholdFor(propertyId: string): Promise<number> {
    const s = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { cashVarianceThreshold: true },
    })
    return s ? Number(s.cashVarianceThreshold) : 50
  }

  /** Carga pagos CASH (no-void) + movimientos firmados (excl. SPOT_COUNT) y computa el arqueo. */
  private async computeReconciliation(
    shift: { id: string; openingFloat: unknown },
    actualClose: Record<string, number>,
    threshold: number,
  ) {
    const [payments, movements] = await Promise.all([
      this.prisma.paymentLog.findMany({
        where: { cashierShiftId: shift.id, method: PaymentMethod.CASH, isVoid: false },
        select: { currency: true, amount: true },
      }),
      this.prisma.cashMovement.findMany({
        where: { shiftId: shift.id, type: { not: CashMovementType.SPOT_COUNT } },
        select: { currency: true, amount: true },
      }),
    ])
    return computeShiftReconciliation({
      openingFloat: (shift.openingFloat ?? {}) as Record<string, number>,
      cashPayments: payments.map((p) => ({ currency: p.currency, amount: Number(p.amount) })),
      movements: movements.map((m) => ({ currency: m.currency, amount: Number(m.amount) })),
      actualClose,
      varianceThreshold: threshold,
    })
  }

  /** R3 — al no-supervisor se le ocultan esperado/variance/razón (conteo a ciegas). */
  private sanitizeForActor<T extends Record<string, unknown>>(shift: T, actor: JwtPayload): T {
    if (actor.role === StaffRole.SUPERVISOR) return shift
    const clone = { ...shift }
    delete (clone as Record<string, unknown>).expectedClose
    delete (clone as Record<string, unknown>).variance
    delete (clone as Record<string, unknown>).varianceReason
    return clone
  }

  /**
   * D-CASH14 — resuelve el turno de caja al que se liga un pago en efectivo.
   * Lo llama GuestStaysService.registerPayment. Best-effort cuando la bandera
   * `cashShiftRequired` está APAGADA (default): sin turno abierto → retorna null
   * (cero regresión en el cobro vivo). Con la bandera ENCENDIDA: sin turno
   * abierto → ConflictException (D-CASH4). No-CASH → null.
   */
  async resolveShiftForCashPayment(
    propertyId: string,
    staffId: string,
    method: string,
  ): Promise<string | null> {
    if (method !== PaymentMethod.CASH) return null
    const open = await this.prisma.cashierShift.findFirst({
      where: { propertyId, staffId, status: CashierShiftStatus.OPEN },
      select: { id: true },
    })
    if (open) return open.id
    const settings = await this.prisma.propertySettings.findUnique({
      where: { propertyId },
      select: { cashShiftRequired: true },
    })
    if (settings?.cashShiftRequired) {
      throw new ConflictException('Debes abrir un turno de caja antes de cobrar en efectivo.')
    }
    return null
  }
}

type CashRecord = Record<string, number>

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Valida un saldo per-divisa `{ MXN: 2000, USD: 0 }` (ISO 4217, montos ≥ 0). */
function assertCashByCurrency(v: unknown, field: string): void {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new BadRequestException(`${field} debe ser un objeto { divisa: monto }.`)
  }
  const entries = Object.entries(v as Record<string, unknown>)
  if (entries.length === 0) {
    throw new BadRequestException(`${field} debe incluir al menos una divisa.`)
  }
  for (const [cur, amt] of entries) {
    if (!/^[A-Z]{3}$/.test(cur)) {
      throw new BadRequestException(`Divisa inválida en ${field}: "${cur}" (usa ISO 4217, ej. MXN).`)
    }
    if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 0) {
      throw new BadRequestException(`Monto inválido en ${field} para ${cur}.`)
    }
  }
}

/** Compara dos saldos per-divisa tratando divisas ausentes como 0. */
function cashEquals(a: CashRecord | null | undefined, b: CashRecord): boolean {
  const aa = a ?? {}
  const keys = new Set([...Object.keys(aa), ...Object.keys(b)])
  for (const k of keys) {
    if (Number(aa[k] ?? 0) !== Number(b[k] ?? 0)) return false
  }
  return true
}

/** Deriva el monto FIRMADO de un movimiento desde su tipo. PAID_OUT/CHANGE_GIVEN
 *  salen (negativo); PAID_IN entra (positivo); CORRECTION/FX_CONVERSION usan
 *  `direction`. OPENING_FLOAT y SPOT_COUNT no se registran por este endpoint. */
function signMovement(dto: AddCashMovementDto): number {
  const mag = Math.abs(dto.amount)
  switch (dto.type) {
    case CashMovementType.PAID_IN:
      return mag
    case CashMovementType.PAID_OUT:
    case CashMovementType.CHANGE_GIVEN:
      return -mag
    case CashMovementType.CORRECTION:
    case CashMovementType.FX_CONVERSION:
      if (dto.direction !== 'IN' && dto.direction !== 'OUT') {
        throw new BadRequestException(`El movimiento ${dto.type} requiere direction 'IN' u 'OUT'.`)
      }
      return dto.direction === 'IN' ? mag : -mag
    default:
      throw new BadRequestException(`Tipo de movimiento no permitido por este endpoint: ${dto.type}.`)
  }
}
