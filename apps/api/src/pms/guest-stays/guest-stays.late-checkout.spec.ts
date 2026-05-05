/**
 * Tests para GuestStaysService.lateCheckout (EC-3 / Sprint 9).
 *
 * Cobertura:
 *   - Guard: stay no existe → NotFoundException
 *   - Guard: actualCheckout != null → BadRequestException
 *   - Guard: noShowAt != null → BadRequestException
 *   - Guard: newCheckoutTime <= now → BadRequestException
 *   - Guard: delta > 24h → BadRequestException (debe usar extendStay)
 *   - Happy path: actualiza scheduledCheckout + lateCheckoutAt en tareas
 *   - Tarea READY revierte a PENDING (huésped reapareció)
 *   - SSE 'task.rescheduled' se emite con el actor + payload correcto
 *   - TaskLog con event=LATE_CHECKOUT_RESCHEDULED + metadata
 */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { CleaningStatus } from '@zenix/shared'
import { GuestStaysService } from './guest-stays.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'
import { EmailService } from '../../common/email/email.service'
import { StayJourneyService } from '../stay-journeys/stay-journeys.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'
import { NotificationCenterService } from '../../notification-center/notification-center.service'
import { AssignmentService } from '../../assignment/assignment.service'

const ORG_ID = 'org-1'
const STAY_ID = 'stay-1'
const ROOM_ID = 'room-1'
const ACTOR_ID = 'staff-1'

function makeStayActive(overrides: Record<string, unknown> = {}) {
  return {
    id: STAY_ID,
    organizationId: ORG_ID,
    roomId: ROOM_ID,
    actualCheckin: new Date('2026-05-03T16:00:00Z'),
    actualCheckout: null,
    noShowAt: null,
    scheduledCheckout: new Date('2026-05-04T11:00:00Z'),
    room: {
      id: ROOM_ID,
      number: '201',
      propertyId: 'property-1',
      units: [{ id: 'unit-1' }],
    },
    ...overrides,
  }
}

describe('GuestStaysService.lateCheckout (EC-3)', () => {
  let service: GuestStaysService

  const prismaMock = {
    guestStay: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    cleaningTask: { findMany: jest.fn(), update: jest.fn() },
    taskLog: { create: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(prismaMock)),
  }
  const eventsMock = { emit: jest.fn() }
  const tenantMock = { getOrganizationId: jest.fn().mockReturnValue(ORG_ID) }
  const emailMock = { send: jest.fn() }
  const journeyMock = { recordEvent: jest.fn() }
  const channexMock = { pushInventory: jest.fn(), notifyRelease: jest.fn() }
  const notifCenterMock = { send: jest.fn() }
  const assignmentMock = { autoAssign: jest.fn() }

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GuestStaysService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TenantContextService, useValue: tenantMock },
        { provide: EventEmitter2, useValue: eventsMock },
        { provide: EmailService, useValue: emailMock },
        { provide: StayJourneyService, useValue: journeyMock },
        { provide: ChannexGateway, useValue: channexMock },
        { provide: NotificationCenterService, useValue: notifCenterMock },
        { provide: AssignmentService, useValue: assignmentMock },
      ],
    }).compile()
    service = moduleRef.get(GuestStaysService)
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock))
    prismaMock.cleaningTask.findMany.mockResolvedValue([])
    prismaMock.cleaningTask.update.mockResolvedValue({})
    prismaMock.taskLog.create.mockResolvedValue({})
    prismaMock.guestStay.update.mockResolvedValue({})
  })

  afterEach(() => jest.useRealTimers())

  // ─── Guards ──────────────────────────────────────────────────────────────
  it('NotFoundException si la estadía no existe', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(null)
    await expect(
      service.lateCheckout(STAY_ID, new Date(Date.now() + 60 * 60 * 1000), ACTOR_ID),
    ).rejects.toThrow(NotFoundException)
  })

  it('BadRequestException si la estadía ya fue cerrada', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(
      makeStayActive({ actualCheckout: new Date() }),
    )
    await expect(
      service.lateCheckout(STAY_ID, new Date(Date.now() + 60 * 60 * 1000), ACTOR_ID),
    ).rejects.toThrow(/ya fue cerrada/i)
  })

  it('BadRequestException si fue marcada como no-show', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(
      makeStayActive({ noShowAt: new Date() }),
    )
    await expect(
      service.lateCheckout(STAY_ID, new Date(Date.now() + 60 * 60 * 1000), ACTOR_ID),
    ).rejects.toThrow(/no-show/i)
  })

  it('BadRequestException si la nueva hora es pasada', async () => {
    prismaMock.guestStay.findUnique.mockResolvedValue(makeStayActive())
    await expect(
      service.lateCheckout(STAY_ID, new Date(Date.now() - 60 * 60 * 1000), ACTOR_ID),
    ).rejects.toThrow(/futura/i)
  })

  it('BadRequestException si el delta supera 24h (debe usar extendStay)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T08:00:00Z'))
    prismaMock.guestStay.findUnique.mockResolvedValue(
      makeStayActive({ scheduledCheckout: new Date('2026-05-04T11:00:00Z') }),
    )
    // 30 horas después del scheduledCheckout actual
    const tooFar = new Date('2026-05-05T17:00:00Z')
    await expect(service.lateCheckout(STAY_ID, tooFar, ACTOR_ID)).rejects.toThrow(/24h/i)
  })

  // ─── Happy path ──────────────────────────────────────────────────────────
  it('actualiza scheduledCheckout + lateCheckoutAt en tareas', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T08:00:00Z'))
    prismaMock.guestStay.findUnique.mockResolvedValue(makeStayActive())
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      { id: 'task-1', status: CleaningStatus.PENDING },
    ])

    const newTime = new Date('2026-05-04T16:00:00Z') // mismo día, 5h después
    const result = await service.lateCheckout(STAY_ID, newTime, ACTOR_ID)

    expect(result.success).toBe(true)
    expect(result.affectedTaskIds).toEqual(['task-1'])
    expect(prismaMock.guestStay.update).toHaveBeenCalledWith({
      where: { id: STAY_ID },
      data: { scheduledCheckout: newTime },
    })
    expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        lateCheckoutAt: newTime,
        status: CleaningStatus.PENDING, // no cambia (ya era PENDING)
      }),
    })
  })

  it('una tarea READY se revierte a PENDING (huésped reapareció)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T08:00:00Z'))
    prismaMock.guestStay.findUnique.mockResolvedValue(makeStayActive())
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      { id: 'task-2', status: CleaningStatus.READY },
    ])

    const newTime = new Date('2026-05-04T16:00:00Z')
    await service.lateCheckout(STAY_ID, newTime, ACTOR_ID)

    expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith({
      where: { id: 'task-2' },
      data: expect.objectContaining({
        status: CleaningStatus.PENDING,
        lateCheckoutAt: newTime,
      }),
    })
  })

  it('emite evento "task.rescheduled" con propertyId y affectedTaskIds', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T08:00:00Z'))
    prismaMock.guestStay.findUnique.mockResolvedValue(makeStayActive())
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      { id: 'task-1', status: CleaningStatus.PENDING },
    ])

    const newTime = new Date('2026-05-04T16:00:00Z')
    await service.lateCheckout(STAY_ID, newTime, ACTOR_ID)

    expect(eventsMock.emit).toHaveBeenCalledWith(
      'task.rescheduled',
      expect.objectContaining({
        propertyId: 'property-1',
        stayId: STAY_ID,
        roomNumber: '201',
        newCheckoutTime: newTime.toISOString(),
        affectedTaskIds: ['task-1'],
      }),
    )
  })

  // ─── findByProperty + cleaningStatus (Sprint 9 part 2) ──────────────────
  describe('findByProperty — cleaningStatus aggregation', () => {
    it('pega cleaningStatus a cada stay según el room', async () => {
      prismaMock.guestStay.findMany.mockResolvedValue([
        { id: 'stay-1', roomId: 'room-A' },
        { id: 'stay-2', roomId: 'room-B' },
        { id: 'stay-3', roomId: 'room-A' }, // mismo room que stay-1 (dorm con 2 huéspedes)
      ])
      prismaMock.cleaningTask.findMany.mockResolvedValue([
        { status: 'IN_PROGRESS', unit: { roomId: 'room-A' } },
        { status: 'READY',       unit: { roomId: 'room-B' } },
      ])

      const result = await service.findByProperty('property-1')

      expect(result).toHaveLength(3)
      expect(result.find((s) => s.id === 'stay-1')?.cleaningStatus).toBe('IN_PROGRESS')
      expect(result.find((s) => s.id === 'stay-2')?.cleaningStatus).toBe('READY')
      // stay-3 está en mismo room que stay-1 → mismo status (dorm)
      expect(result.find((s) => s.id === 'stay-3')?.cleaningStatus).toBe('IN_PROGRESS')
    })

    it('cleaningStatus = null cuando no hay tareas activas para el room', async () => {
      prismaMock.guestStay.findMany.mockResolvedValue([
        { id: 'stay-X', roomId: 'room-empty' },
      ])
      prismaMock.cleaningTask.findMany.mockResolvedValue([])

      const result = await service.findByProperty('property-1')
      expect(result[0]?.cleaningStatus).toBeNull()
    })

    it('NO ejecuta query de tasks si no hay stays (optimización)', async () => {
      prismaMock.guestStay.findMany.mockResolvedValue([])

      await service.findByProperty('property-1')
      expect(prismaMock.cleaningTask.findMany).not.toHaveBeenCalled()
    })

    it('SHARED dorm — todas las stays del mismo room comparten estado agregado', async () => {
      // Dormitorio con 4 camas, 4 huéspedes, 4 tareas en distintos estados
      prismaMock.guestStay.findMany.mockResolvedValue([
        { id: 'stay-1', roomId: 'dorm' },
        { id: 'stay-2', roomId: 'dorm' },
        { id: 'stay-3', roomId: 'dorm' },
        { id: 'stay-4', roomId: 'dorm' },
      ])
      prismaMock.cleaningTask.findMany.mockResolvedValue([
        { status: 'PENDING',     unit: { roomId: 'dorm' } },
        { status: 'READY',       unit: { roomId: 'dorm' } },
        { status: 'IN_PROGRESS', unit: { roomId: 'dorm' } }, // ganador
        { status: 'PAUSED',      unit: { roomId: 'dorm' } },
      ])

      const result = await service.findByProperty('property-1')
      const statuses = result.map((s) => s.cleaningStatus)
      expect(statuses).toEqual(['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS'])
    })
  })

  it('crea TaskLog con event=LATE_CHECKOUT_RESCHEDULED', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T08:00:00Z'))
    prismaMock.guestStay.findUnique.mockResolvedValue(makeStayActive())
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      { id: 'task-1', status: CleaningStatus.PENDING },
    ])

    const newTime = new Date('2026-05-04T16:00:00Z')
    await service.lateCheckout(STAY_ID, newTime, ACTOR_ID)

    expect(prismaMock.taskLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task-1',
        staffId: ACTOR_ID,
        event: 'LATE_CHECKOUT_RESCHEDULED',
        metadata: expect.objectContaining({
          previousStatus: CleaningStatus.PENDING,
          newCheckoutTime: newTime.toISOString(),
        }),
      }),
    })
  })
})
