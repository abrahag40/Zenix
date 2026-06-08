import { Test } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { RoomMovedHkListener } from './room-moved-hk.listener'

/**
 * Tests Etapa A §A2 — owner case 2: recepcionista cambia habitación, el
 * sistema migra las HK tasks PENDING/READY de fromRoom → toRoom para que
 * la recamarista no limpie la habitación equivocada.
 *
 * Escenarios:
 *  1. Task PENDING en fromRoom → cancelar antigua + crear nueva en toRoom
 *     con carryoverFromTaskId + emit task:moved
 *  2. Task READY en fromRoom → mismo flow, status nueva = READY (preserva)
 *  3. Task IN_PROGRESS → skip + log warning (conflict count)
 *  4. fromRoom sin tasks → no-op
 *  5. Múltiples tasks → migra todas en batch
 */
describe('RoomMovedHkListener', () => {
  let listener: RoomMovedHkListener

  const prismaMock = {
    propertySettings: { findUnique: jest.fn() },
    unit: { findMany: jest.fn() },
    cleaningTask: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    taskLog: { create: jest.fn() },
    $transaction: jest.fn((fn) => fn(prismaMock)),
  }
  const notificationsMock = { emit: jest.fn() }

  beforeEach(async () => {
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock))
    prismaMock.propertySettings.findUnique.mockResolvedValue({ timezone: 'America/Cancun' })

    const module = await Test.createTestingModule({
      providers: [
        RoomMovedHkListener,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile()
    listener = module.get(RoomMovedHkListener)

    // Default: ambas rooms tienen 1 unit cada una
    prismaMock.unit.findMany
      .mockResolvedValueOnce([{ id: 'unit-from' }])
      .mockResolvedValueOnce([{ id: 'unit-to' }])
  })

  it('PENDING → cancelar antigua + crear nueva con carryoverFromTaskId + SSE task:moved', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      {
        id: 'task-old',
        unitId: 'unit-from',
        status: 'PENDING',
        priority: 'MEDIUM',
        hasSameDayCheckIn: true,
        assignedToId: 'staff-1',
      },
    ])
    prismaMock.cleaningTask.create.mockResolvedValue({ id: 'task-new' })

    const result = await listener.onRoomMoved({
      stayId: 'stay-1',
      fromRoomId: 'room-A1',
      toRoomId: 'room-A2',
      propertyId: 'prop-1',
      actorId: 'recep-1',
    })

    expect(result).toEqual({ migrated: 1, conflicts: 0 })
    // Cancelada
    expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith({
      where: { id: 'task-old' },
      data: expect.objectContaining({
        status: 'CANCELLED',
        cancelledReason: 'RECEPTIONIST_MANUAL',
      }),
    })
    // Nueva creada en toRoom unit
    expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        unitId: 'unit-to',
        status: 'PENDING',
        priority: 'MEDIUM',
        hasSameDayCheckIn: true,
        assignedToId: 'staff-1',
        carryoverFromTaskId: 'task-old',
      }),
    })
    // SSE
    expect(notificationsMock.emit).toHaveBeenCalledWith(
      'prop-1',
      'task:moved',
      expect.objectContaining({
        fromTaskId: 'task-old',
        toTaskId: 'task-new',
        fromRoomId: 'room-A1',
        toRoomId: 'room-A2',
      }),
    )
  })

  it('READY → nueva preserva status READY', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      {
        id: 'task-ready',
        unitId: 'unit-from',
        status: 'READY',
        priority: 'URGENT',
        hasSameDayCheckIn: true,
        assignedToId: 'staff-2',
      },
    ])
    prismaMock.cleaningTask.create.mockResolvedValue({ id: 'task-ready-new' })

    const result = await listener.onRoomMoved({
      stayId: 'stay-2',
      fromRoomId: 'room-A1',
      toRoomId: 'room-A2',
      propertyId: 'prop-1',
    })
    expect(result.migrated).toBe(1)
    expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'READY', priority: 'URGENT' }),
    })
  })

  it('IN_PROGRESS → skip + conflict count (defensive — §54 D11 ya bloquea aguas arriba)', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      {
        id: 'task-running',
        unitId: 'unit-from',
        status: 'IN_PROGRESS',
        priority: 'URGENT',
        hasSameDayCheckIn: true,
        assignedToId: 'staff-1',
      },
    ])
    const result = await listener.onRoomMoved({
      stayId: 'stay-3',
      fromRoomId: 'room-A1',
      toRoomId: 'room-A2',
      propertyId: 'prop-1',
    })
    expect(result).toEqual({ migrated: 0, conflicts: 1 })
    expect(prismaMock.cleaningTask.update).not.toHaveBeenCalled()
    expect(prismaMock.cleaningTask.create).not.toHaveBeenCalled()
    expect(notificationsMock.emit).not.toHaveBeenCalled()
  })

  it('sin tasks en fromRoom → no-op', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([])
    const result = await listener.onRoomMoved({
      stayId: 'stay-4',
      fromRoomId: 'room-A1',
      toRoomId: 'room-A2',
      propertyId: 'prop-1',
    })
    expect(result).toEqual({ migrated: 0, conflicts: 0 })
    expect(prismaMock.cleaningTask.update).not.toHaveBeenCalled()
  })

  it('fail-soft — error de prisma no propaga, retorna 0/0', async () => {
    prismaMock.cleaningTask.findMany.mockRejectedValueOnce(new Error('DB lost'))
    const result = await listener.onRoomMoved({
      stayId: 'stay-5',
      fromRoomId: 'room-A1',
      toRoomId: 'room-A2',
      propertyId: 'prop-1',
    })
    expect(result).toEqual({ migrated: 0, conflicts: 0 })
  })

  it('sin units en fromRoom o toRoom → skip', async () => {
    // Reset el mock queue de unit.findMany (el beforeEach lo dejó con 2
    // valores queue-d que no aplican a este test).
    prismaMock.unit.findMany.mockReset()
    prismaMock.propertySettings.findUnique.mockResolvedValue({ timezone: 'America/Cancun' })
    prismaMock.unit.findMany
      .mockResolvedValueOnce([]) // fromRoom sin units
      .mockResolvedValueOnce([{ id: 'unit-to' }])

    const result = await listener.onRoomMoved({
      stayId: 'stay-6',
      fromRoomId: 'room-empty',
      toRoomId: 'room-A2',
      propertyId: 'prop-1',
    })
    expect(result).toEqual({ migrated: 0, conflicts: 0 })
    expect(prismaMock.cleaningTask.findMany).not.toHaveBeenCalled()
  })
})
