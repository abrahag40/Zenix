/**
 * guest-stays.group-payments.spec.ts — Sprint GROUP-BILLING Fase A
 *
 * Cubre el modelo "primary payer + per-stay" (D-GRP-A1/A4):
 *   1. "Cada quien paga lo suyo" → 1 PaymentLog sin paidByStayId.
 *   2. "Juan paga todo el grupo" → N PaymentLogs, cada stay saldada, todos
 *      con paidByStayId=Juan + mismo transactionGroupId.
 *   3. "Uno paga 2 de 3" → 2 PaymentLogs con paidByStayId, 1 stay intacta.
 *   4. COMP ya NO requiere aprobación de manager (fix Fase D / §C1.13).
 *   5. getGroupBalances → desglose por habitación (D-GRP-A3).
 */

import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { GuestStaysService } from './guest-stays.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { EmailService } from '../../common/email/email.service'
import { StayJourneyService } from '../stay-journeys/stay-journeys.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import { NotificationCenterService } from '../../notification-center/notification-center.service'
import { AssignmentService } from '../../assignment/assignment.service'
import { PushService } from '../../notifications/push.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { AvailabilityService } from '../availability/availability.service'
import { PaymentMethod } from '@zenix/shared'

const ORG_ID = 'org-1'
const GROUP_ID = 'group-1'
const TZ = { property: { settings: { timezone: 'America/Cancun' } } }

const JUAN = 'stay-juan'
const MARIA = 'stay-maria'
const PEDRO = 'stay-pedro'

function payerStay(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    propertyId: 'prop-1',
    currency: 'MXN',
    amountPaid: 0,
    totalAmount: 120,
    noShowAt: null,
    reservationGroupId: GROUP_ID,
    room: TZ,
    ...overrides,
  }
}

function memberStay(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    amountPaid: 0,
    totalAmount: 120,
    noShowAt: null,
    cancelledAt: null,
    reservationGroupId: GROUP_ID,
    ...overrides,
  }
}

describe('GuestStaysService — group payments (Fase A)', () => {
  let service: GuestStaysService

  const txMock = {
    paymentLog: { create: jest.fn() },
    guestStay: { update: jest.fn().mockResolvedValue({}) },
  }

  const prismaMock = {
    guestStay: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    paymentLog: { create: jest.fn() },
    $transaction: jest.fn(),
  }

  const tenantMock = { getOrganizationId: jest.fn().mockReturnValue(ORG_ID) }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestStaysService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TenantContextService, useValue: tenantMock },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: EmailService, useValue: { send: jest.fn() } },
        { provide: StayJourneyService, useValue: { recordEvent: jest.fn() } },
        { provide: ChannexGateway, useValue: { pushInventory: jest.fn() } },
        { provide: NotificationCenterService, useValue: { send: jest.fn() } },
        { provide: AssignmentService, useValue: { autoAssign: jest.fn() } },
        { provide: PushService, useValue: { sendToStaff: jest.fn() } },
        { provide: NotificationsService, useValue: { emit: jest.fn() } },
        { provide: AvailabilityService, useValue: { check: jest.fn() } },
      ],
    }).compile()

    service = module.get<GuestStaysService>(GuestStaysService)
    jest.clearAllMocks()

    // $transaction soporta forma callback (group path) y forma array (single path).
    prismaMock.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(txMock)
      return Promise.resolve(Array.isArray(arg) ? arg : [])
    })
    txMock.paymentLog.create.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: `log-${a.data.stayId}`, ...a.data }),
    )
    txMock.guestStay.update.mockResolvedValue({})
    prismaMock.paymentLog.create.mockImplementation((a: { data: Record<string, unknown> }) => ({
      id: `log-${a.data.stayId}`, ...a.data,
    }))
  })

  it('cada quien paga lo suyo — 1 PaymentLog sin paidByStayId', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(payerStay(JUAN))

    await service.registerPayment(JUAN, { method: PaymentMethod.CASH, amount: 120 } as any, 'staff-1')

    expect(prismaMock.paymentLog.create).toHaveBeenCalledTimes(1)
    const data = prismaMock.paymentLog.create.mock.calls[0][0].data
    expect(data.stayId).toBe(JUAN)
    expect(data.paidByStayId).toBeNull()
    expect(txMock.paymentLog.create).not.toHaveBeenCalled()
  })

  it('Juan paga todo el grupo — 3 PaymentLogs, cada stay saldada, paidByStayId=Juan', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(payerStay(JUAN))
    prismaMock.guestStay.findMany.mockResolvedValue([
      memberStay(JUAN), memberStay(MARIA), memberStay(PEDRO),
    ])

    await service.registerPayment(
      JUAN,
      { method: PaymentMethod.CASH, amount: 360, appliesToStayIds: [JUAN, MARIA, PEDRO] } as any,
      'staff-1',
    )

    expect(txMock.paymentLog.create).toHaveBeenCalledTimes(3)
    const calls = txMock.paymentLog.create.mock.calls.map((c) => c[0].data)
    // Todos atribuidos al pagador + mismo transactionGroupId.
    expect(calls.every((d) => d.paidByStayId === JUAN)).toBe(true)
    const txnIds = new Set(calls.map((d) => d.transactionGroupId))
    expect(txnIds.size).toBe(1)
    // La suma de los montos = 360.
    const sum = calls.reduce((s, d) => s + Number(d.amount), 0)
    expect(sum).toBeCloseTo(360, 2)
    // Cada stay se actualiza a PAID.
    expect(txMock.guestStay.update).toHaveBeenCalledTimes(3)
    expect(txMock.guestStay.update.mock.calls.every((c) => c[0].data.paymentStatus === 'PAID')).toBe(true)
  })

  it('uno paga 2 de 3 — 2 PaymentLogs con paidByStayId, la 3ra intacta', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(payerStay(JUAN))
    prismaMock.guestStay.findMany.mockResolvedValue([
      memberStay(JUAN), memberStay(MARIA),
    ])

    await service.registerPayment(
      JUAN,
      { method: PaymentMethod.CASH, amount: 240, appliesToStayIds: [JUAN, MARIA] } as any,
      'staff-1',
    )

    expect(txMock.paymentLog.create).toHaveBeenCalledTimes(2)
    const stayIds = txMock.paymentLog.create.mock.calls.map((c) => c[0].data.stayId)
    expect(stayIds.sort()).toEqual([JUAN, MARIA].sort())
    expect(stayIds).not.toContain(PEDRO)
  })

  it('COMP ya NO requiere aprobación de manager (fix Fase D)', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(payerStay(JUAN))

    await expect(
      service.registerPayment(JUAN, { method: PaymentMethod.COMP, amount: 120 } as any, 'staff-1'),
    ).resolves.toBeDefined()

    expect(prismaMock.paymentLog.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.paymentLog.create.mock.calls[0][0].data.method).toBe(PaymentMethod.COMP)
  })

  it('rechaza cobro de grupo si las stays no comparten grupo', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(payerStay(JUAN))
    prismaMock.guestStay.findMany.mockResolvedValue([
      memberStay(JUAN), memberStay(MARIA, { reservationGroupId: 'otro-grupo' }),
    ])

    await expect(
      service.registerPayment(
        JUAN,
        { method: PaymentMethod.CASH, amount: 240, appliesToStayIds: [JUAN, MARIA] } as any,
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('getGroupBalances — desglose por habitación con balance + isContext', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue({ reservationGroupId: GROUP_ID })
    prismaMock.guestStay.findMany.mockResolvedValue([
      { id: JUAN, guestName: 'Juan', currency: 'MXN', amountPaid: 120, totalAmount: 120, paymentStatus: 'PAID', actualCheckin: new Date(), noShowAt: null, cancelledAt: null, groupRoomIndex: 1, room: { number: '101' } },
      { id: MARIA, guestName: 'María', currency: 'MXN', amountPaid: 0, totalAmount: 120, paymentStatus: 'PENDING', actualCheckin: null, noShowAt: null, cancelledAt: null, groupRoomIndex: 2, room: { number: '102' } },
    ])

    const res = await service.getGroupBalances(JUAN)

    expect(res.groupId).toBe(GROUP_ID)
    expect(res.stays).toHaveLength(2)
    expect(res.stays[0]).toMatchObject({ stayId: JUAN, balance: 0, paymentStatus: 'PAID', isContext: true })
    expect(res.stays[1]).toMatchObject({ stayId: MARIA, balance: 120, paymentStatus: 'PENDING', isContext: false })
  })

  it('getGroupBalances — stay sin grupo retorna lista vacía', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue({ reservationGroupId: null })

    const res = await service.getGroupBalances(JUAN)

    expect(res.groupId).toBeNull()
    expect(res.stays).toEqual([])
  })
})
