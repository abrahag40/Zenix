/**
 * guest-stays.bulk-checkin.spec.ts — Sprint GROUP-BILLING Fase B
 *
 * Cubre bulkCheckin (D-GRP-B1/B2/B3):
 *   1. Check-in de los miembros que llegaron; ausentes (no incluidos) intactos.
 *   2. Miembro con saldo pendiente → status 'balance_unpaid', NO checked-in.
 *   3. Rename opcional actualiza guestName + split first/last.
 *   4. Skips: ya checked-in / no-show / cancelada / fecha futura.
 *   5. OTA_COLLECT con saldo → se chequea igual (saldo cubierto por OTA).
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

const ORG_ID = 'org-1'
const TZ = { property: { settings: { timezone: 'America/Cancun' } } }

function member(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    roomId: `room-${id}`,
    guestName: 'Titular OTA',
    guestFirstName: 'Titular',
    guestLastName: 'OTA',
    actualCheckin: null,
    noShowAt: null,
    cancelledAt: null,
    checkinAt: new Date('2020-01-01T15:00:00.000Z'), // pasado → fecha llegó
    amountPaid: 240,
    totalAmount: 240, // saldo 0 (cubierto)
    paymentModel: 'HOTEL_COLLECT',
    stayJourney: { id: `j-${id}` },
    room: TZ,
    ...overrides,
  }
}

describe('GuestStaysService — bulk check-in (Fase B)', () => {
  let service: GuestStaysService

  const tx = {
    guestStay: { update: jest.fn() },
    room: { update: jest.fn() },
    stayJourneyEvent: { create: jest.fn() },
  }

  const prismaMock = {
    guestStay: { findMany: jest.fn() },
    $transaction: jest.fn(),
  }

  const tenantMock = { getOrganizationId: jest.fn().mockReturnValue(ORG_ID), getPropertyId: jest.fn().mockReturnValue('test-property-id') }

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
    prismaMock.$transaction.mockImplementation((fn: unknown) =>
      typeof fn === 'function' ? (fn as (t: unknown) => unknown)(tx) : Promise.resolve(fn),
    )
    tx.guestStay.update.mockResolvedValue({})
    tx.room.update.mockResolvedValue({})
    tx.stayJourneyEvent.create.mockResolvedValue({})
  })

  it('chequea los miembros presentes; el ausente (no incluido) no se toca', async () => {
    prismaMock.guestStay.findMany.mockResolvedValue([member('a'), member('b')])

    const res = await service.bulkCheckin(
      { members: [{ stayId: 'a' }, { stayId: 'b' }], documentVerified: true },
      'staff-1',
    )

    expect(res.checkedIn).toBe(2)
    expect(res.results.every((r) => r.status === 'checked_in')).toBe(true)
    expect(tx.guestStay.update).toHaveBeenCalledTimes(2)
    expect(tx.room.update).toHaveBeenCalledTimes(2)
    // 'c' nunca se consultó ni tocó (no estaba en members).
    expect(prismaMock.guestStay.findMany.mock.calls[0][0].where.id.in).toEqual(['a', 'b'])
  })

  it('miembro con saldo pendiente → balance_unpaid, NO se chequea', async () => {
    prismaMock.guestStay.findMany.mockResolvedValue([
      member('a'),
      member('b', { amountPaid: 0, totalAmount: 240 }), // saldo 240
    ])

    const res = await service.bulkCheckin(
      { members: [{ stayId: 'a' }, { stayId: 'b' }], documentVerified: true },
      'staff-1',
    )

    expect(res.checkedIn).toBe(1)
    expect(res.results.find((r) => r.stayId === 'b')?.status).toBe('balance_unpaid')
    expect(tx.guestStay.update).toHaveBeenCalledTimes(1)
  })

  it('rename opcional actualiza guestName + split first/last con title-case', async () => {
    prismaMock.guestStay.findMany.mockResolvedValue([member('a')])

    const res = await service.bulkCheckin(
      { members: [{ stayId: 'a', guestName: 'juan perez lopez' }], documentVerified: true },
      'staff-1',
    )

    expect(res.results[0].guestName).toBe('Juan Perez Lopez')
    const data = tx.guestStay.update.mock.calls[0][0].data
    expect(data.guestName).toBe('Juan Perez Lopez')
    expect(data.guestFirstName).toBe('Juan')
    expect(data.guestLastName).toBe('Perez Lopez')
  })

  it('skips: ya checked-in / no-show / cancelada / futura', async () => {
    prismaMock.guestStay.findMany.mockResolvedValue([
      member('a', { actualCheckin: new Date() }),
      member('b', { noShowAt: new Date() }),
      member('c', { cancelledAt: new Date() }),
      member('d', { checkinAt: new Date('2099-01-01T15:00:00.000Z') }),
    ])

    const res = await service.bulkCheckin(
      { members: [{ stayId: 'a' }, { stayId: 'b' }, { stayId: 'c' }, { stayId: 'd' }], documentVerified: true },
      'staff-1',
    )

    expect(res.checkedIn).toBe(0)
    const byId = Object.fromEntries(res.results.map((r) => [r.stayId, r.status]))
    expect(byId).toEqual({ a: 'already_checked_in', b: 'blocked', c: 'blocked', d: 'future' })
    expect(tx.guestStay.update).not.toHaveBeenCalled()
  })

  it('OTA_COLLECT con saldo → se chequea igual (cubierto por la OTA)', async () => {
    prismaMock.guestStay.findMany.mockResolvedValue([
      member('a', { amountPaid: 0, totalAmount: 240, paymentModel: 'OTA_COLLECT' }),
    ])

    const res = await service.bulkCheckin(
      { members: [{ stayId: 'a' }], documentVerified: true },
      'staff-1',
    )

    expect(res.checkedIn).toBe(1)
    expect(res.results[0].status).toBe('checked_in')
  })

  it('documentVerified=false → BadRequest (atestación requerida)', async () => {
    await expect(
      service.bulkCheckin({ members: [{ stayId: 'a' }], documentVerified: false }, 'staff-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
