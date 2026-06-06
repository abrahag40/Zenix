/**
 * guest-stays.swap-rooms.spec.ts — Sprint CHECK-IN C3.1 v3 (2026-05-30)
 *
 * Cubre swapStayRooms() — intercambio atómico de habitaciones entre 2 stays.
 * Use case primario: ReservationGroup OTA con asignación cruzada.
 *
 * Cobertura:
 *  - Happy path: swap roomId + segments + audit logs en single tx
 *  - Guard: stay self-swap rechazado
 *  - Guard: cancelled / no-show / checked-out rechazado
 *  - Guard: misma habitación → no-op rechazado
 *  - Guard: cross-property rechazado
 */

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
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
import { AuditOutboxService } from '../../common/audit/audit-outbox.service'
import { AvailabilityService } from '../availability/availability.service'

const ORG_ID = 'org-test-1'
const PROPERTY_ID = 'prop-test-1'
const ACTOR_ID = 'staff-actor-1'

function makeStay(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stay-A',
    organizationId: ORG_ID,
    propertyId: PROPERTY_ID,
    roomId: 'room-A',
    guestName: 'Juan García',
    actualCheckin: null,
    actualCheckout: null,
    cancelledAt: null,
    noShowAt: null,
    ratePerNight: new Prisma.Decimal(120),
    ...overrides,
  }
}

describe('GuestStaysService — swapStayRooms (CHECK-IN C3.1 v3)', () => {
  let service: GuestStaysService

  const prismaMock = {
    guestStay: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    staySegment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestStayLog: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    $transaction: jest.fn(async (cb: any) => cb(prismaMock as any)),
  }

  const tenantMock = { getOrganizationId: jest.fn().mockReturnValue(ORG_ID), getPropertyId: jest.fn().mockReturnValue('test-property-id') }
  const notificationsMock = { emit: jest.fn().mockResolvedValue(undefined) }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestStaysService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TenantContextService, useValue: tenantMock },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: EmailService, useValue: { send: jest.fn() } },
        { provide: StayJourneyService, useValue: { recordEvent: jest.fn() } },
        { provide: ChannexGateway, useValue: { pushInventory: jest.fn(), notifyRelease: jest.fn() } },
        { provide: NotificationCenterService, useValue: { send: jest.fn().mockResolvedValue(undefined) } },
        { provide: AssignmentService, useValue: { autoAssign: jest.fn().mockResolvedValue(undefined) } },
        { provide: PushService, useValue: { sendToStaff: jest.fn().mockResolvedValue(undefined), sendBatch: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: AuditOutboxService, useValue: { emit: jest.fn(), recordStayCheckinConfirmed: jest.fn(), recordCheckout: jest.fn(), recordLateCheckout: jest.fn(), recordStayUpdated: jest.fn(), recordStayExtended: jest.fn(), recordRoomMoved: jest.fn(), recordRoomsSwapped: jest.fn(), recordStayRestored: jest.fn(), recordNoShowMarked: jest.fn(), recordNoShowReverted: jest.fn(), recordNoShowChargeRegistered: jest.fn(), recordPaymentRegistered: jest.fn(), recordPaymentVoided: jest.fn(), recordCancelRefundRegistered: jest.fn() } }, { provide: AvailabilityService, useValue: { check: jest.fn().mockResolvedValue({ available: true, conflicts: [] }) } },
      ],
    }).compile()

    service = module.get<GuestStaysService>(GuestStaysService)
    jest.clearAllMocks()
  })

  it('happy path — swap atómico: actualiza roomId en ambas stays + segments + audit logs', async () => {
    const stayA = makeStay({ id: 'stay-A', roomId: 'room-A', guestName: 'Juan García' })
    const stayB = makeStay({ id: 'stay-B', roomId: 'room-B', guestName: 'María García' })

    prismaMock.guestStay.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === 'stay-A') return Promise.resolve(stayA)
      if (where.id === 'stay-B') return Promise.resolve(stayB)
      return Promise.resolve(null)
    })

    const result = await service.swapStayRooms('stay-A', 'stay-B', ACTOR_ID, 'huésped pidió cambio')

    expect(result.success).toBe(true)
    expect(result.stayA.newRoomId).toBe('room-B')
    expect(result.stayB.newRoomId).toBe('room-A')

    // tx ejecutada — verificamos los updates dentro
    expect(prismaMock.guestStay.update).toHaveBeenCalledWith({
      where: { id: 'stay-A' },
      data: { roomId: 'room-B' },
    })
    expect(prismaMock.guestStay.update).toHaveBeenCalledWith({
      where: { id: 'stay-B' },
      data: { roomId: 'room-A' },
    })

    // StaySegment swap también
    expect(prismaMock.staySegment.updateMany).toHaveBeenCalledTimes(2)

    // Audit logs cross-referenciados — un createMany con 2 entries
    expect(prismaMock.guestStayLog.createMany).toHaveBeenCalledTimes(1)
    const auditCall = prismaMock.guestStayLog.createMany.mock.calls[0][0]
    expect(auditCall.data).toHaveLength(2)
    expect(auditCall.data[0]).toMatchObject({
      stayId: 'stay-A',
      event: 'ROOM_SWAPPED',
      actorId: ACTOR_ID,
    })
    expect((auditCall.data[0].metadata as any).swappedWithStayId).toBe('stay-B')
    expect((auditCall.data[0].metadata as any).swappedWithGuestName).toBe('María García')
    expect((auditCall.data[0].metadata as any).reason).toBe('huésped pidió cambio')
    expect(auditCall.data[1]).toMatchObject({
      stayId: 'stay-B',
      event: 'ROOM_SWAPPED',
    })

    // SSE emit para ambas stays
    expect(notificationsMock.emit).toHaveBeenCalledTimes(2)
  })

  it('rechaza self-swap (mismo stayId en A y B)', async () => {
    await expect(
      service.swapStayRooms('stay-X', 'stay-X', ACTOR_ID),
    ).rejects.toThrow(BadRequestException)
    expect(prismaMock.guestStay.update).not.toHaveBeenCalled()
  })

  it('rechaza si una de las stays no existe', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-A' }))
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(null)

    await expect(
      service.swapStayRooms('stay-A', 'stay-missing', ACTOR_ID),
    ).rejects.toThrow(NotFoundException)
  })

  it('rechaza si alguna stay está cancelada', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-A' }))
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(
      makeStay({ id: 'stay-B', roomId: 'room-B', cancelledAt: new Date() }),
    )

    await expect(
      service.swapStayRooms('stay-A', 'stay-B', ACTOR_ID),
    ).rejects.toThrow(/canceladas/i)
  })

  it('rechaza si alguna stay tiene no-show', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-A' }))
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(
      makeStay({ id: 'stay-B', roomId: 'room-B', noShowAt: new Date() }),
    )

    await expect(
      service.swapStayRooms('stay-A', 'stay-B', ACTOR_ID),
    ).rejects.toThrow(/no-show/i)
  })

  it('rechaza si alguna stay ya hizo checkout', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-A' }))
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(
      makeStay({ id: 'stay-B', roomId: 'room-B', actualCheckout: new Date() }),
    )

    await expect(
      service.swapStayRooms('stay-A', 'stay-B', ACTOR_ID),
    ).rejects.toThrow(/checkout/i)
  })

  it('rechaza si ambas stays están en la misma habitación', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-A', roomId: 'same-room' }))
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-B', roomId: 'same-room' }))

    await expect(
      service.swapStayRooms('stay-A', 'stay-B', ACTOR_ID),
    ).rejects.toThrow(/misma habitación/i)
  })

  it('rechaza si las stays son de propiedades distintas', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-A', propertyId: 'prop-1' }))
    prismaMock.guestStay.findUnique.mockResolvedValueOnce(makeStay({ id: 'stay-B', roomId: 'room-B', propertyId: 'prop-2' }))

    await expect(
      service.swapStayRooms('stay-A', 'stay-B', ACTOR_ID),
    ).rejects.toThrow(/propiedades distintas/i)
  })
})
