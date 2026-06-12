import { Test } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../../notifications/notifications.service'
import { BookingSameDayListener } from './booking-same-day.listener'

/**
 * Tests Etapa A §A1 — owner case 1: booking OTA same-day llega 10am
 * y el sistema escala HK task PENDING/READY a URGENT.
 *
 * 4 escenarios:
 *  1. Task PENDING existente → upgrade a URGENT + hasSameDayCheckIn=true + SSE
 *  2. Task READY existente → mismo upgrade
 *  3. Sin task pendiente → no-op (skip 'NO_TASK')
 *  4. CheckIn no es hoy en la timezone de la property → skip 'NOT_SAME_DAY'
 *  5. Ya estaba URGENT con flag → skip 'ALREADY_URGENT' sin doble update
 */
describe('BookingSameDayListener', () => {
  let listener: BookingSameDayListener

  const prismaMock = {
    propertySettings: { findUnique: jest.fn() },
    unit: { findMany: jest.fn() },
    cleaningTask: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    taskLog: { create: jest.fn() },
  }
  const notificationsMock = { emit: jest.fn() }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        BookingSameDayListener,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile()
    listener = module.get(BookingSameDayListener)

    // Defaults
    prismaMock.propertySettings.findUnique.mockResolvedValue({ timezone: 'America/Cancun' })
    prismaMock.unit.findMany.mockResolvedValue([{ id: 'unit-A1' }])
  })

  /** Crea un ISO date string que es HOY 14:00 en Cancún tz (UTC-5).
   *  Fix flake CI 2026-06-11: la fecha debe calcularse en la TZ de Cancún, NO en
   *  UTC. Con `new Date().toISOString()` (UTC), en la ventana 00:00–05:00 UTC la
   *  fecha UTC va un día por delante de la de Cancún → el listener (timezone-aware)
   *  veía el check-in en "mañana" y skippeaba → el test fallaba sólo en esa franja. */
  const todayCheckInCancun = (): string => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    return `${today}T19:00:00.000Z` // 19:00 UTC = 14:00 Cancún (CST UTC-5)
  }

  it('upgrade task PENDING → URGENT + hasSameDayCheckIn + SSE task:upgraded', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      { id: 'task-1', priority: 'MEDIUM', hasSameDayCheckIn: false, assignedToId: 'staff-1' },
    ])

    const result = await listener.onSameDayArrival({
      stayId: 'stay-1',
      roomId: 'room-A1',
      propertyId: 'prop-1',
      checkInIso: todayCheckInCancun(),
      otaName: 'BookingCom',
    })

    expect(result).toEqual({ upgraded: 1, skipped: null })
    expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { priority: 'URGENT', hasSameDayCheckIn: true },
    })
    expect(prismaMock.taskLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task-1',
        event: 'PRIORITY_OVERRIDDEN',
        note: expect.stringContaining('OTA BookingCom booking same-day arrival'),
      }),
    })
    expect(notificationsMock.emit).toHaveBeenCalledWith(
      'prop-1',
      'task:upgraded',
      expect.objectContaining({ roomId: 'room-A1', otaName: 'BookingCom' }),
    )
  })

  it('upgrade task READY existente al mismo URGENT', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      { id: 'task-ready', priority: 'HIGH', hasSameDayCheckIn: false, assignedToId: null },
    ])
    const result = await listener.onSameDayArrival({
      stayId: 'stay-2',
      roomId: 'room-A1',
      propertyId: 'prop-1',
      checkInIso: todayCheckInCancun(),
      otaName: null,
    })
    expect(result.upgraded).toBe(1)
    expect(prismaMock.cleaningTask.update).toHaveBeenCalled()
  })

  it('sin tasks pendientes hoy → no-op skip NO_TASK', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([])
    const result = await listener.onSameDayArrival({
      stayId: 'stay-3',
      roomId: 'room-A2',
      propertyId: 'prop-1',
      checkInIso: todayCheckInCancun(),
      otaName: 'ExpediaGroup',
    })
    expect(result).toEqual({ upgraded: 0, skipped: 'NO_TASK' })
    expect(prismaMock.cleaningTask.update).not.toHaveBeenCalled()
    expect(notificationsMock.emit).not.toHaveBeenCalled()
  })

  it('check-in NO es hoy en la timezone → skip NOT_SAME_DAY', async () => {
    // 30 días en futuro
    const future = new Date(Date.now() + 30 * 86400000).toISOString()
    const result = await listener.onSameDayArrival({
      stayId: 'stay-future',
      roomId: 'room-A1',
      propertyId: 'prop-1',
      checkInIso: future,
      otaName: 'BookingCom',
    })
    expect(result).toEqual({ upgraded: 0, skipped: 'NOT_SAME_DAY' })
    expect(prismaMock.cleaningTask.findMany).not.toHaveBeenCalled()
  })

  it('ya estaba URGENT con flag → skip ALREADY_URGENT sin doble update', async () => {
    prismaMock.cleaningTask.findMany.mockResolvedValue([
      { id: 'task-already', priority: 'URGENT', hasSameDayCheckIn: true, assignedToId: 'staff-2' },
    ])
    const result = await listener.onSameDayArrival({
      stayId: 'stay-4',
      roomId: 'room-A1',
      propertyId: 'prop-1',
      checkInIso: todayCheckInCancun(),
      otaName: 'BookingCom',
    })
    expect(result).toEqual({ upgraded: 0, skipped: 'ALREADY_URGENT' })
    expect(prismaMock.cleaningTask.update).not.toHaveBeenCalled()
    expect(notificationsMock.emit).not.toHaveBeenCalled()
  })

  it('fail-soft cuando prisma throws — no propaga error, retorna upgraded:0', async () => {
    prismaMock.cleaningTask.findMany.mockRejectedValueOnce(new Error('DB connection lost'))
    const result = await listener.onSameDayArrival({
      stayId: 'stay-5',
      roomId: 'room-A1',
      propertyId: 'prop-1',
      checkInIso: todayCheckInCancun(),
      otaName: 'BookingCom',
    })
    expect(result.upgraded).toBe(0)
    // No propaga — el handler arriba sigue funcionando.
  })
})
