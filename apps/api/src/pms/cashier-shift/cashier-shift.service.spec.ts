import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  CashMovementType,
  CashOpeningSource,
  CashierShiftStatus,
  JwtPayload,
  PaymentMethod,
  StaffRole,
} from '@zenix/shared'
import { CashierShiftService } from './cashier-shift.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

const PROP = 'prop-1'
const ORG = 'org-1'

const recept = (id = 'staff-A'): JwtPayload =>
  ({ sub: id, email: `${id}@z.co`, role: StaffRole.RECEPTIONIST, propertyId: PROP, organizationId: ORG }) as JwtPayload
const supervisor = (id = 'sup-1'): JwtPayload =>
  ({ sub: id, email: `${id}@z.co`, role: StaffRole.SUPERVISOR, propertyId: PROP, organizationId: ORG }) as JwtPayload

describe('CashierShiftService — Sprint 1 (apertura + handover + link)', () => {
  let service: CashierShiftService
  const prisma = {
    cashierShift: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    paymentLog: { findMany: jest.fn() },
    cashMovement: { findMany: jest.fn(), create: jest.fn() },
    propertySettings: { findUnique: jest.fn() },
    staff: { findMany: jest.fn() },
    $transaction: jest.fn(),
  }
  const tenant = {
    getOrganizationId: jest.fn(() => ORG),
    getPropertyId: jest.fn(() => PROP),
  }

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CashierShiftService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenant },
      ],
    }).compile()
    service = mod.get(CashierShiftService)
    jest.resetAllMocks() // resetea también la cola de mockResolvedValueOnce entre tests
    tenant.getOrganizationId.mockReturnValue(ORG)
    tenant.getPropertyId.mockReturnValue(PROP)
    prisma.cashierShift.create.mockImplementation((args: any) => Promise.resolve({ id: 'shift-new', ...args.data }))
    prisma.cashierShift.update.mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data }))
    prisma.cashMovement.create.mockImplementation((args: any) => Promise.resolve({ id: 'mov-new', ...args.data }))
    prisma.paymentLog.findMany.mockResolvedValue([])
    prisma.cashMovement.findMany.mockResolvedValue([])
    prisma.propertySettings.findUnique.mockResolvedValue({ cashVarianceThreshold: 50 })
    prisma.staff.findMany.mockResolvedValue([{ id: 'staff-A', name: 'Ana' }])
    prisma.$transaction.mockImplementation((ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(prisma),
    )
  })

  const openShiftRow = (over: any = {}) => ({
    id: 'shift-1',
    organizationId: ORG,
    propertyId: PROP,
    staffId: 'staff-A',
    status: CashierShiftStatus.OPEN,
    openingFloat: { MXN: 2000 },
    expectedClose: null,
    variance: null,
    varianceReason: null,
    ...over,
  })

  describe('openShift', () => {
    it('abre un turno FRESH_BANK cuando el cajero no tiene turno abierto', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null) // no open shift
      const res = await service.openShift({ openingFloat: { MXN: 2000, USD: 50 } }, recept())
      expect(prisma.cashierShift.create).toHaveBeenCalledTimes(1)
      const data = prisma.cashierShift.create.mock.calls[0][0].data
      expect(data.staffId).toBe('staff-A')
      expect(data.propertyId).toBe(PROP)
      expect(data.openingSource).toBe(CashOpeningSource.FRESH_BANK)
      expect(data.openingFloat).toEqual({ MXN: 2000, USD: 50 })
      expect(res.id).toBe('shift-new')
    })

    it('rechaza abrir un segundo turno si ya hay uno OPEN (1 por cajero)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce({ id: 'shift-open' })
      await expect(service.openShift({ openingFloat: { MXN: 1000 } }, recept())).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(prisma.cashierShift.create).not.toHaveBeenCalled()
    })

    it('valida openingFloat (objeto vacío → BadRequest)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      await expect(service.openShift({ openingFloat: {} }, recept())).rejects.toBeInstanceOf(BadRequestException)
    })

    it('valida openingFloat (divisa no ISO 4217 → BadRequest)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      await expect(service.openShift({ openingFloat: { pesos: 100 } as any }, recept())).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('HANDOVER: encadena cuando el fondo recibido iguala el cierre del turno saliente', async () => {
      prisma.cashierShift.findFirst
        .mockResolvedValueOnce(null) // no open shift propio
        .mockResolvedValueOnce({ id: 'prev', status: CashierShiftStatus.RECONCILED, actualClose: { MXN: 1500, USD: 0 } })
      const res = await service.openShift(
        { openingFloat: { MXN: 1500, USD: 0 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'prev' },
        recept('staff-B'),
      )
      const data = prisma.cashierShift.create.mock.calls[0][0].data
      expect(data.handoverFromShiftId).toBe('prev')
      expect(data.openingAcceptedById).toBe('staff-B') // el entrante acepta (transfiere responsabilidad)
      expect(res.id).toBe('shift-new')
    })

    it('HANDOVER: rechaza si el fondo recibido NO coincide con el cierre del saliente', async () => {
      prisma.cashierShift.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'prev', status: CashierShiftStatus.RECONCILED, actualClose: { MXN: 1500 } })
      await expect(
        service.openShift(
          { openingFloat: { MXN: 1400 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'prev' },
          recept('staff-B'),
        ),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('HANDOVER: exige handoverFromShiftId', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      await expect(
        service.openShift({ openingFloat: { MXN: 100 }, openingSource: CashOpeningSource.HANDOVER }, recept()),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('HANDOVER: turno de origen inexistente → NotFound', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      await expect(
        service.openShift(
          { openingFloat: { MXN: 100 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'ghost' },
          recept(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('HANDOVER: turno de origen aún abierto → Conflict', async () => {
      prisma.cashierShift.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'prev', status: CashierShiftStatus.OPEN, actualClose: null })
      await expect(
        service.openShift(
          { openingFloat: { MXN: 100 }, openingSource: CashOpeningSource.HANDOVER, handoverFromShiftId: 'prev' },
          recept(),
        ),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('listShifts — RBAC D-CASH10', () => {
    it('SUPERVISOR ve todos los turnos de la propiedad (sin filtro de staff)', async () => {
      prisma.cashierShift.findMany.mockResolvedValueOnce([])
      await service.listShifts({}, supervisor())
      expect(prisma.cashierShift.findMany.mock.calls[0][0].where).toEqual({ propertyId: PROP })
    })

    it('el cajero ve sólo SUS turnos', async () => {
      prisma.cashierShift.findMany.mockResolvedValueOnce([])
      await service.listShifts({}, recept('staff-A'))
      expect(prisma.cashierShift.findMany.mock.calls[0][0].where).toMatchObject({ propertyId: PROP, staffId: 'staff-A' })
    })
  })

  describe('resolveShiftForCashPayment — link D-CASH14 + enforcement D-CASH4', () => {
    it('no-CASH → null sin consultar turnos', async () => {
      const id = await service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CARD_TERMINAL)
      expect(id).toBeNull()
      expect(prisma.cashierShift.findFirst).not.toHaveBeenCalled()
    })

    it('CASH con turno abierto → devuelve el id del turno', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce({ id: 'shift-open' })
      const id = await service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CASH)
      expect(id).toBe('shift-open')
    })

    it('CASH sin turno y cashShiftRequired=false → null (cero regresión)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashShiftRequired: false })
      const id = await service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CASH)
      expect(id).toBeNull()
    })

    it('CASH sin turno y cashShiftRequired=true → ConflictException', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(null)
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashShiftRequired: true })
      await expect(service.resolveShiftForCashPayment(PROP, 'staff-A', PaymentMethod.CASH)).rejects.toBeInstanceOf(
        ConflictException,
      )
    })
  })

  describe('closeShift — arqueo + blind (D-CASH5/6, R3)', () => {
    it('dentro de tolerancia → RECONCILED; al cajero NO se le revela el over/short', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashVarianceThreshold: 50 })
      const res = await service.closeShift('shift-1', { actualClose: { MXN: 2000 } }, recept('staff-A'))
      const upd = prisma.cashierShift.update.mock.calls[0][0].data
      expect(upd.status).toBe(CashierShiftStatus.RECONCILED)
      expect(upd.expectedClose).toEqual({ MXN: 2000 })
      expect(upd.variance).toEqual({ MXN: 0 })
      // R3: respuesta al cajero sin expected/variance
      expect(res.status).toBe(CashierShiftStatus.RECONCILED)
      expect((res as any).variance).toBeUndefined()
      expect((res as any).expected).toBeUndefined()
    })

    it('fuera de tolerancia → CLOSED (pendiente de conciliación)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashVarianceThreshold: 50 })
      await service.closeShift('shift-1', { actualClose: { MXN: 1800 } }, recept('staff-A'))
      const upd = prisma.cashierShift.update.mock.calls[0][0].data
      expect(upd.status).toBe(CashierShiftStatus.CLOSED)
      expect(upd.variance).toEqual({ MXN: -200 })
    })

    it('al SUPERVISOR que cierra sí se le devuelve expected/variance', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashVarianceThreshold: 50 })
      const res = await service.closeShift('shift-1', { actualClose: { MXN: 1900 } }, supervisor())
      expect((res as any).variance).toEqual({ MXN: -100 })
    })

    it('esperado incluye pagos CASH + movimientos firmados', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      prisma.paymentLog.findMany.mockResolvedValueOnce([{ currency: 'MXN', amount: 1000 }])
      prisma.cashMovement.findMany.mockResolvedValueOnce([{ currency: 'MXN', amount: -300 }])
      prisma.propertySettings.findUnique.mockResolvedValueOnce({ cashVarianceThreshold: 50 })
      await service.closeShift('shift-1', { actualClose: { MXN: 2700 } }, recept('staff-A'))
      const upd = prisma.cashierShift.update.mock.calls[0][0].data
      expect(upd.expectedClose).toEqual({ MXN: 2700 }) // 2000 + 1000 − 300
      expect(upd.status).toBe(CashierShiftStatus.RECONCILED)
    })

    it('rechaza cerrar un turno que no es OPEN', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow({ status: CashierShiftStatus.RECONCILED }))
      await expect(service.closeShift('shift-1', { actualClose: { MXN: 1 } }, recept('staff-A'))).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('un cajero ajeno no puede cerrar el turno de otro', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow({ staffId: 'staff-A' }))
      await expect(service.closeShift('shift-1', { actualClose: { MXN: 1 } }, recept('staff-B'))).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })
  })

  describe('reconcileShift — supervisor (D-CASH6)', () => {
    it('no-supervisor → Forbidden', async () => {
      await expect(
        service.reconcileShift('shift-1', { decision: 'RECONCILED', varianceReason: 'faltó cambio' }, recept()),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('solo concilia un turno CLOSED', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow({ status: CashierShiftStatus.OPEN }))
      await expect(
        service.reconcileShift('shift-1', { decision: 'RECONCILED', varianceReason: 'razón' }, supervisor()),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    it('CLOSED → DISPUTED con razón + reconciledById', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow({ status: CashierShiftStatus.CLOSED }))
      await service.reconcileShift('shift-1', { decision: 'DISPUTED', varianceReason: 'faltante sin justificar' }, supervisor('sup-9'))
      const upd = prisma.cashierShift.update.mock.calls[0][0].data
      expect(upd.status).toBe(CashierShiftStatus.DISPUTED)
      expect(upd.reconciledById).toBe('sup-9')
      expect(upd.varianceReason).toBe('faltante sin justificar')
    })
  })

  describe('addCashMovement — E3', () => {
    it('PAID_OUT se guarda con monto NEGATIVO', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      await service.addCashMovement('shift-1', { type: CashMovementType.PAID_OUT, currency: 'MXN', amount: 300 }, recept('staff-A'))
      expect(prisma.cashMovement.create.mock.calls[0][0].data.amount).toBe(-300)
    })

    it('PAID_IN se guarda POSITIVO', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      await service.addCashMovement('shift-1', { type: CashMovementType.PAID_IN, currency: 'MXN', amount: 150 }, recept('staff-A'))
      expect(prisma.cashMovement.create.mock.calls[0][0].data.amount).toBe(150)
    })

    it('CORRECTION sin direction → BadRequest', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      await expect(
        service.addCashMovement('shift-1', { type: CashMovementType.CORRECTION, currency: 'MXN', amount: 10 }, recept('staff-A')),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('no se permiten movimientos en un turno cerrado', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow({ status: CashierShiftStatus.CLOSED }))
      await expect(
        service.addCashMovement('shift-1', { type: CashMovementType.PAID_OUT, currency: 'MXN', amount: 10 }, recept('staff-A')),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('spot count — supervisor (D-CASH13)', () => {
    it('getSpotCount no-supervisor → Forbidden', async () => {
      await expect(service.getSpotCount('shift-1', recept())).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('recordSpotCount persiste SPOT_COUNT por divisa y devuelve variance, sin cerrar el turno', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(openShiftRow())
      prisma.paymentLog.findMany.mockResolvedValueOnce([{ currency: 'MXN', amount: 500 }])
      const res = await service.recordSpotCount('shift-1', { counted: { MXN: 2480 } }, supervisor())
      expect(res.expected).toEqual({ MXN: 2500 }) // 2000 + 500
      expect(res.variance).toEqual({ MXN: -20 })
      // crea un SPOT_COUNT y NO actualiza (cierra) el turno
      expect(prisma.cashMovement.create).toHaveBeenCalledTimes(1)
      expect(prisma.cashMovement.create.mock.calls[0][0].data.type).toBe(CashMovementType.SPOT_COUNT)
      expect(prisma.cashierShift.update).not.toHaveBeenCalled()
    })
  })

  describe('sanitize blind — D-CASH10/R3', () => {
    it('listShifts oculta expected/variance/razón al no-supervisor', async () => {
      prisma.cashierShift.findMany.mockResolvedValueOnce([
        openShiftRow({ status: CashierShiftStatus.CLOSED, expectedClose: { MXN: 2000 }, variance: { MXN: -100 }, varianceReason: 'x' }),
      ])
      const res = await service.listShifts({}, recept('staff-A'))
      expect((res[0] as any).expectedClose).toBeUndefined()
      expect((res[0] as any).variance).toBeUndefined()
      expect((res[0] as any).varianceReason).toBeUndefined()
    })

    it('listShifts conserva los números para el supervisor', async () => {
      prisma.cashierShift.findMany.mockResolvedValueOnce([
        openShiftRow({ status: CashierShiftStatus.CLOSED, expectedClose: { MXN: 2000 }, variance: { MXN: -100 } }),
      ])
      const res = await service.listShifts({}, supervisor())
      expect((res[0] as any).variance).toEqual({ MXN: -100 })
    })
  })

  describe('reportes — Sprint 3 (D-CASH7/10, R3)', () => {
    const reportRow = (over: any = {}) =>
      openShiftRow({
        status: CashierShiftStatus.RECONCILED,
        openedAt: new Date('2026-06-14T08:00:00.000Z'),
        closedAt: new Date('2026-06-14T16:00:00.000Z'),
        openingSource: 'FRESH_BANK',
        handoverFromShiftId: null,
        openingAcceptedById: null,
        closingWitnessId: null,
        expectedClose: { MXN: 2700 },
        actualClose: { MXN: 2700 },
        variance: { MXN: 0 },
        reconciledById: null,
        reconciledAt: null,
        ...over,
      })

    it('getShiftReport (cajero dueño) agrupa pagos y OMITE la reconciliación (R3)', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(reportRow())
      prisma.paymentLog.findMany.mockResolvedValueOnce([
        { method: PaymentMethod.CASH, currency: 'MXN', amount: 700 },
        { method: PaymentMethod.CASH, currency: 'MXN', amount: 300 },
      ])
      prisma.cashMovement.findMany.mockResolvedValueOnce([
        { id: 'm1', type: CashMovementType.PAID_OUT, currency: 'MXN', amount: -300, notes: null, createdById: 'staff-A', createdAt: new Date('2026-06-14T10:00:00Z') },
        { id: 's1', type: CashMovementType.SPOT_COUNT, currency: 'MXN', amount: 2400, notes: 'spot', createdById: 'sup-1', createdAt: new Date('2026-06-14T12:00:00Z') },
      ])
      const rep = await service.getShiftReport('shift-1', recept('staff-A'))
      expect(rep.payments.byMethodCurrency).toEqual([
        { method: PaymentMethod.CASH, currency: 'MXN', total: 1000, count: 2 },
      ])
      expect(rep.payments.cashTotalByCurrency).toEqual({ MXN: 1000 })
      // el SPOT_COUNT no aparece como movimiento normal
      expect(rep.movements).toHaveLength(1)
      expect(rep.movements[0].type).toBe(CashMovementType.PAID_OUT)
      // R3 — cajero NO ve la reconciliación
      expect(rep.reconciliation).toBeNull()
      expect(rep.shift.cashier).toEqual({ id: 'staff-A', name: 'Ana' })
    })

    it('getShiftReport (supervisor) incluye reconciliación + spot counts', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(reportRow())
      prisma.paymentLog.findMany.mockResolvedValueOnce([])
      prisma.cashMovement.findMany.mockResolvedValueOnce([
        { id: 's1', type: CashMovementType.SPOT_COUNT, currency: 'MXN', amount: 2400, notes: 'spot', createdById: 'staff-A', createdAt: new Date('2026-06-14T12:00:00Z') },
      ])
      const rep = await service.getShiftReport('shift-1', supervisor())
      expect(rep.reconciliation).not.toBeNull()
      expect(rep.reconciliation!.variance).toEqual({ MXN: 0 })
      expect(rep.reconciliation!.spotCounts).toHaveLength(1)
      expect(rep.reconciliation!.spotCounts[0].counted).toBe(2400)
    })

    it('getShiftReport: un cajero ajeno no ve el turno de otro', async () => {
      prisma.cashierShift.findFirst.mockResolvedValueOnce(reportRow({ staffId: 'staff-A' }))
      await expect(service.getShiftReport('shift-1', recept('staff-B'))).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('getCashSummary agrupa por divisa/método + colector y filtra faltantes', async () => {
      prisma.paymentLog.findMany.mockResolvedValueOnce([
        { method: PaymentMethod.CASH, currency: 'MXN', amount: 1000, collectedById: 'staff-A' },
        { method: PaymentMethod.CARD_TERMINAL, currency: 'MXN', amount: 500, collectedById: 'staff-A' },
      ])
      prisma.cashierShift.findMany.mockResolvedValueOnce([
        { id: 'sh1', staffId: 'staff-A', status: CashierShiftStatus.RECONCILED, openedAt: new Date('2026-06-14T08:00:00Z'), closedAt: new Date('2026-06-14T16:00:00Z'), variance: { MXN: 0 } },
        { id: 'sh2', staffId: 'staff-A', status: CashierShiftStatus.CLOSED, openedAt: new Date('2026-06-14T16:00:00Z'), closedAt: new Date('2026-06-14T23:00:00Z'), variance: { MXN: -80 } },
      ])
      const sum = await service.getCashSummary('prop-1', '2026-06-14', 'shortages')
      expect(sum.byCurrencyMethod).toEqual(
        expect.arrayContaining([
          { currency: 'MXN', method: PaymentMethod.CASH, total: 1000, count: 1 },
          { currency: 'MXN', method: PaymentMethod.CARD_TERMINAL, total: 500, count: 1 },
        ]),
      )
      expect(sum.byCollector[0]).toMatchObject({ collectorName: 'Ana', total: 1500 })
      // filtro shortages → solo el turno con variance negativa
      expect(sum.shifts).toHaveLength(1)
      expect(sum.shifts[0].id).toBe('sh2')
    })
  })
})
