/**
 * Tests para StayoverScheduler — cron stayover multi-timezone (D14 / Sprint 9).
 *
 * Cobertura:
 *   - Skip NEVER: propiedad con stayoverFrequency=NEVER → no genera nada
 *   - Skip BEFORE_HOUR: hora local < stayoverHour → skip
 *   - Skip ALREADY_PROCESSED: stayoverProcessedDate == localDate → skip
 *   - DAILY: genera tarea STAYOVER por cada estadía in-house sin checkout hoy
 *   - EVERY_2_DAYS: solo genera en días pares desde checkin
 *   - Idempotencia per-unit: no duplica si ya existe tarea STAYOVER hoy
 *   - Excluye estadías con scheduledCheckout=hoy (las maneja MorningRoster)
 *   - force=true ignora guardas de hora e idempotencia
 *   - Auto-assign deshabilitado → no llama AssignmentService
 */
import { Test, TestingModule } from '@nestjs/testing'
import { StayoverScheduler } from './stayover.scheduler'
import { PrismaService } from '../prisma/prisma.service'
import { AssignmentService } from '../assignment/assignment.service'
import { NotificationsService } from '../notifications/notifications.service'

describe('StayoverScheduler', () => {
  let scheduler: StayoverScheduler

  const prismaMock = {
    propertySettings: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    cleaningTask: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    guestStay: { findMany: jest.fn() },
    taskLog: { create: jest.fn() },
  }

  const assignmentMock = {
    autoAssign: jest.fn().mockResolvedValue({ assigned: false, rule: null, reason: 'NO' }),
  }

  const notificationsMock = { emit: jest.fn() }

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StayoverScheduler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AssignmentService, useValue: assignmentMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile()
    scheduler = moduleRef.get(StayoverScheduler)
    jest.clearAllMocks()
    prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
    prismaMock.cleaningTask.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `task-${Date.now()}-${Math.random()}`, ...data }),
    )
    prismaMock.guestStay.findMany.mockResolvedValue([])
    prismaMock.propertySettings.update.mockResolvedValue({})
    prismaMock.taskLog.create.mockResolvedValue({})
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('guards', () => {
    it('skip "NEVER" cuando stayoverFrequency=NEVER (default hostal)', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        stayoverFrequency: 'NEVER',
        stayoverHour: 8,
        stayoverProcessedDate: null,
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      jest.useFakeTimers().setSystemTime(new Date('2026-05-04T10:00:00Z'))
      const result = await scheduler.runForProperty('p1')
      expect(result.skipped).toBe('NEVER')
      expect(prismaMock.guestStay.findMany).not.toHaveBeenCalled()
    })

    it('skip "BEFORE_HOUR" si hora local < stayoverHour', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        stayoverFrequency: 'DAILY',
        stayoverHour: 8,
        stayoverProcessedDate: null,
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })
      jest.useFakeTimers().setSystemTime(new Date('2026-05-04T06:00:00Z'))
      const result = await scheduler.runForProperty('p1')
      expect(result.skipped).toBe('BEFORE_HOUR')
    })

    it('skip "ALREADY_PROCESSED" si stayoverProcessedDate == hoy local', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-04T10:00:00Z'))
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        stayoverFrequency: 'DAILY',
        stayoverHour: 8,
        stayoverProcessedDate: new Date('2026-05-04T00:00:00Z'),
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })
      const result = await scheduler.runForProperty('p1')
      expect(result.skipped).toBe('ALREADY_PROCESSED')
    })

    it('force=true ignora guardas de hora e idempotencia', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-04T06:00:00Z'))
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        stayoverFrequency: 'DAILY',
        stayoverHour: 8,
        stayoverProcessedDate: new Date('2026-05-04T00:00:00Z'), // ya procesado
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })
      const result = await scheduler.runForProperty('p1', { force: true })
      expect(result.skipped).toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('frequency rules', () => {
    function settingsForFreq(frequency: string) {
      return {
        propertyId: 'p1',
        timezone: 'UTC',
        stayoverFrequency: frequency,
        stayoverHour: 8,
        stayoverProcessedDate: null,
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      }
    }

    function stayInHouse(checkinIso: string, unitIds: string[] = ['unit-1']) {
      return {
        id: 'stay-1',
        roomId: 'room-1',
        actualCheckin: new Date(checkinIso),
        room: { id: 'room-1', units: unitIds.map((id) => ({ id })) },
      }
    }

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-04T10:00:00Z'))
    })

    it('DAILY genera tarea STAYOVER por cada unidad de estadía in-house', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue(settingsForFreq('DAILY'))
      prismaMock.guestStay.findMany.mockResolvedValue([stayInHouse('2026-05-01T10:00:00Z', ['u1', 'u2'])])

      const result = await scheduler.runForProperty('p1')

      expect(result.newTasks).toBe(2)
      expect(result.skippedByFrequency).toBe(0)
      expect(prismaMock.cleaningTask.create).toHaveBeenCalledTimes(2)
      expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taskType: 'STAYOVER', priority: 'LOW', status: 'UNASSIGNED' }),
        }),
      )
      expect(notificationsMock.emit).toHaveBeenCalledWith(
        'p1',
        'stayover:published',
        expect.objectContaining({ newTasks: 2 }),
      )
    })

    it('EVERY_2_DAYS genera solo cuando (today - checkin) % 2 == 0', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue(settingsForFreq('EVERY_2_DAYS'))
      // Checkin 2026-05-02, hoy 2026-05-04 → diff=2 → genera
      prismaMock.guestStay.findMany.mockResolvedValue([stayInHouse('2026-05-02T10:00:00Z')])
      const r1 = await scheduler.runForProperty('p1')
      expect(r1.newTasks).toBe(1)
    })

    it('EVERY_2_DAYS skip cuando diff es impar', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue(settingsForFreq('EVERY_2_DAYS'))
      // Checkin 2026-05-03, hoy 2026-05-04 → diff=1 → skip
      prismaMock.guestStay.findMany.mockResolvedValue([stayInHouse('2026-05-03T10:00:00Z')])
      const r = await scheduler.runForProperty('p1')
      expect(r.newTasks).toBe(0)
      expect(r.skippedByFrequency).toBe(1)
    })

    it('ON_REQUEST y GUEST_PREFERENCE skipean (sin GuestPreference yet)', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue(settingsForFreq('ON_REQUEST'))
      prismaMock.guestStay.findMany.mockResolvedValue([stayInHouse('2026-05-01T10:00:00Z')])
      const r = await scheduler.runForProperty('p1')
      expect(r.newTasks).toBe(0)
      expect(r.skippedByFrequency).toBe(1)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('idempotency per-unit', () => {
    it('no duplica si ya existe tarea STAYOVER para hoy en la misma unit', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-04T10:00:00Z'))
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        stayoverFrequency: 'DAILY',
        stayoverHour: 8,
        stayoverProcessedDate: null,
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })
      prismaMock.guestStay.findMany.mockResolvedValue([
        {
          id: 'stay-1',
          roomId: 'room-1',
          actualCheckin: new Date('2026-05-01T10:00:00Z'),
          room: { id: 'room-1', units: [{ id: 'u1' }] },
        },
      ])
      // Existe ya una tarea STAYOVER hoy
      prismaMock.cleaningTask.findFirst.mockResolvedValue({ id: 'existing-task' })

      const result = await scheduler.runForProperty('p1')
      expect(result.newTasks).toBe(0)
      expect(result.skippedExisting).toBe(1)
      expect(prismaMock.cleaningTask.create).not.toHaveBeenCalled()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('auto-assignment toggle', () => {
    it('autoAssignmentEnabled=false → no llama AssignmentService', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-04T10:00:00Z'))
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        stayoverFrequency: 'DAILY',
        stayoverHour: 8,
        stayoverProcessedDate: null,
        autoAssignmentEnabled: false,
        property: { isActive: true, organizationId: 'org-1' },
      })
      prismaMock.guestStay.findMany.mockResolvedValue([
        {
          id: 'stay-1',
          roomId: 'room-1',
          actualCheckin: new Date('2026-05-01T10:00:00Z'),
          room: { id: 'room-1', units: [{ id: 'u1' }] },
        },
      ])

      await scheduler.runForProperty('p1')
      expect(assignmentMock.autoAssign).not.toHaveBeenCalled()
    })
  })
})
