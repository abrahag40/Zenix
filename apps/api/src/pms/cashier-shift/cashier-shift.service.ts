import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  CashOpeningSource,
  CashierShiftStatus,
  JwtPayload,
  PaymentMethod,
  StaffRole,
} from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { ListShiftsQueryDto, OpenShiftDto } from './dto/cashier-shift.dto'

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
    return this.prisma.cashierShift.findFirst({
      where: { propertyId, staffId: actor.sub, status: CashierShiftStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    })
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
    return this.prisma.cashierShift.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take: 200,
    })
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
