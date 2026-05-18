/**
 * Tests para MorningRosterScheduler — cron 7am multi-timezone.
 *
 * Cobertura:
 *   - Idempotencia: morningRosterDate igual al día local actual → skip
 *   - Hora local antes de morningRosterHour → skip
 *   - Carryover: tareas incompletas de ayer se clonan con priority URGENT
 *   - Predicted checkouts: scheduledCheckout=hoy → CleaningTask(PENDING)
 *   - Idempotencia de carryover: si ya existe el clone, no duplica
 *   - force=true ignora guardas
 *   - Multi-timezone: hora local correcta por propiedad
 */
import { Test, TestingModule } from '@nestjs/testing'
import { MorningRosterScheduler } from './morning-roster.scheduler'
import { PrismaService } from '../prisma/prisma.service'
import { AssignmentService } from '../assignment/assignment.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'

describe('MorningRosterScheduler', () => {
  let scheduler: MorningRosterScheduler

  const prismaMock = {
    propertySettings: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    cleaningTask: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    guestStay: { findMany: jest.fn(), count: jest.fn() },
    // Sprint 2026-05-17 — añadido por refactor processPredictedCheckouts que
    // ahora también query segments (move-out vacated rooms + move-in urgency).
    staySegment: { findMany: jest.fn() },
    taskLog: { create: jest.fn() },
    $transaction: jest.fn((fn) => fn(prismaMock)),
  }

  const assignmentMock = {
    autoAssign: jest.fn().mockResolvedValue({ assigned: false, staffId: null, rule: null, reason: 'NO' }),
  }

  const notificationsMock = { emit: jest.fn() }

  const pushMock = { sendToStaff: jest.fn().mockResolvedValue(undefined) }

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MorningRosterScheduler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AssignmentService, useValue: assignmentMock },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: PushService, useValue: pushMock },
      ],
    }).compile()
    scheduler = moduleRef.get(MorningRosterScheduler)
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock))
    prismaMock.cleaningTask.findMany.mockResolvedValue([])
    prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
    prismaMock.guestStay.findMany.mockResolvedValue([])
    prismaMock.guestStay.count.mockResolvedValue(0)
    // Default: sin segment moves. Tests específicos de mid-stay moves overridean.
    prismaMock.staySegment.findMany.mockResolvedValue([])
  })

  // ── Idempotencia / hora ──────────────────────────────────────────────────

  describe('runForProperty - guards', () => {
    it('skip BEFORE_HOUR si la hora local aún no llegó al morningRosterHour', async () => {
      // 2026-04-29 06:00 UTC = 06:00 UTC = 06:00 cancun no, espera... UTC-5 entonces 01:00.
      // Mejor: usar UTC y morningRosterHour=12 con time before that
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 12,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T06:00:00Z'))
      const result = await scheduler.runForProperty('p1')
      expect(result.skipped).toBe('BEFORE_HOUR')
      jest.useRealTimers()
    })

    it('skip ALREADY_PROCESSED si morningRosterDate === local date', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: new Date('2026-04-29T00:00:00Z'),
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')
      expect(result.skipped).toBe('ALREADY_PROCESSED')
      jest.useRealTimers()
    })

    it('force=true ignora guardas', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 12,  // todavía no llegó la hora
        morningRosterDate: new Date('2026-04-29T00:00:00Z'),  // ya procesado
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T06:00:00Z'))
      const result = await scheduler.runForProperty('p1', { force: true })
      expect(result.skipped).toBeUndefined()
      jest.useRealTimers()
    })

    it('skip NO_PROPERTY si no existen settings', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue(null)
      const result = await scheduler.runForProperty('invalid')
      expect(result.skipped).toBe('NO_PROPERTY')
    })
  })

  // ── Carryover ────────────────────────────────────────────────────────────

  describe('processCarryover', () => {
    it('clona tareas incompletas de ayer con priority HIGH (sin same-day) y carryoverFromTaskId', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      const yesterday = new Date('2026-04-28T00:00:00Z')
      prismaMock.cleaningTask.findMany.mockResolvedValueOnce([
        {
          id: 'old-task',
          unitId: 'u1',
          checkoutId: null,
          taskType: 'CLEANING',
          requiredCapability: 'CLEANING',
          hasSameDayCheckIn: false,
          scheduledFor: yesterday,
          unit: { id: 'u1', roomId: 'r1' },
          checkout: null,
        },
      ])
      // Idempotencia check: no existe carryover previo
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
      prismaMock.cleaningTask.create.mockResolvedValue({ id: 'new-task' })
      prismaMock.cleaningTask.update.mockResolvedValue({})
      prismaMock.taskLog.create.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')

      expect(result.carryoverTasks).toBe(1)
      // Sprint 9 fix — carryover sin hasSameDayCheckIn = HIGH (no URGENT).
      // URGENT reservado para combinación carryover + same-day checkin
      // (ver test "marca priority URGENT cuando hay same-day check-in").
      expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'u1',
            priority: 'HIGH',
            carryoverFromTaskId: 'old-task',
            carryoverFromDate: yesterday,
            status: 'PENDING',
          }),
        }),
      )
      // Original task se cancela con DUPLICATE
      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-task' },
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancelledReason: 'DUPLICATE',
          }),
        }),
      )
      jest.useRealTimers()
    })

    it('re-evalúa hasSameDayCheckIn contra HOY: tarea de ayer (sin same-day) → URGENT si hoy hay check-in en el mismo room', async () => {
      // Bug fix: antes copiábamos original.hasSameDayCheckIn (computed ayer).
      // Ahora re-query para hoy. Escenario: ayer no había check-in nuevo, hoy sí.
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      prismaMock.cleaningTask.findMany.mockResolvedValueOnce([
        {
          id: 'old-task', unitId: 'u1', checkoutId: null,
          taskType: 'CLEANING', requiredCapability: 'CLEANING',
          hasSameDayCheckIn: false,                       // ayer: NO había same-day
          scheduledFor: new Date('2026-04-28T00:00:00Z'),
          unit: { id: 'u1', roomId: 'r1' }, checkout: null,
        },
      ])
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
      prismaMock.cleaningTask.create.mockResolvedValue({ id: 'new-task' })
      prismaMock.cleaningTask.update.mockResolvedValue({})
      prismaMock.taskLog.create.mockResolvedValue({})
      // Hoy SÍ hay check-in nuevo en el room → re-eval lo detecta
      prismaMock.guestStay.count.mockResolvedValue(1)

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      await scheduler.runForProperty('p1')

      expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 'URGENT',                            // re-evaluado: doble urgente
            hasSameDayCheckIn: true,
          }),
        }),
      )
      jest.useRealTimers()
    })

    it('idempotencia: no clona si ya existe carryover de la misma original', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      prismaMock.cleaningTask.findMany.mockResolvedValueOnce([
        {
          id: 'old-task', unitId: 'u1', checkoutId: null,
          taskType: 'CLEANING', requiredCapability: 'CLEANING',
          hasSameDayCheckIn: false, scheduledFor: new Date('2026-04-28T00:00:00Z'),
          unit: { id: 'u1', roomId: 'r1' }, checkout: null,
        },
      ])
      // Ya hay un carryover existente
      prismaMock.cleaningTask.findFirst.mockResolvedValue({ id: 'existing-clone' })

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')
      expect(result.carryoverTasks).toBe(0)  // no clonó
      jest.useRealTimers()
    })
  })

  // ── Predicción de checkouts ──────────────────────────────────────────────

  describe('processPredictedCheckouts', () => {
    it('crea CleaningTask(PENDING) por cada unit de un GuestStay con scheduledCheckout=hoy', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      prismaMock.cleaningTask.findMany.mockResolvedValue([])  // no carryover
      prismaMock.guestStay.findMany
        .mockResolvedValueOnce([
          {
            id: 'stay-1', roomId: 'r1',
            room: {
              id: 'r1', number: '101',
              units: [{ id: 'u1' }, { id: 'u2' }],
            },
          },
        ])
        .mockResolvedValueOnce([])  // sameDayCheckIns
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)  // no existing task
      prismaMock.cleaningTask.create.mockResolvedValue({ id: 'new' })
      prismaMock.taskLog.create.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')

      expect(result.newTasks).toBe(2)  // una por unit
      jest.useRealTimers()
    })

    it('marca priority URGENT cuando hay same-day check-in en la misma room', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany
        .mockResolvedValueOnce([
          {
            id: 's1', roomId: 'r1',
            room: { id: 'r1', number: '101', units: [{ id: 'u1' }] },
          },
        ])
        .mockResolvedValueOnce([{ roomId: 'r1' }])  // same-day check-in para r1
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
      prismaMock.cleaningTask.create.mockResolvedValue({ id: 'new' })
      prismaMock.taskLog.create.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      await scheduler.runForProperty('p1')

      expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 'URGENT',
            hasSameDayCheckIn: true,
          }),
        }),
      )
      jest.useRealTimers()
    })

    it('idempotencia: no duplica tareas que ya existen para el mismo día/unit', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })

      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany
        .mockResolvedValueOnce([
          { id: 's1', roomId: 'r1', room: { id: 'r1', number: '101', units: [{ id: 'u1' }] } },
        ])
        .mockResolvedValueOnce([])
      prismaMock.cleaningTask.findFirst.mockResolvedValue({ id: 'existing' })  // ya existe

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')
      expect(result.newTasks).toBe(0)
      expect(result.reusedTasks).toBe(1)
      jest.useRealTimers()
    })
  })

  // ── Sprint 2026-05-17: segment-level moves (mid-stay room changes) ─────────
  describe('processPredictedCheckouts — segment moves (Sprint 2026-05-17)', () => {
    const baseSettings = {
      propertyId: 'p1',
      timezone: 'UTC',
      morningRosterHour: 7,
      morningRosterDate: null,
      carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
      autoAssignmentEnabled: true,
      property: { isActive: true, organizationId: 'org-1' },
    }

    it('B2: crea CleaningTask para Room que un guest vacates hoy via mid-stay move (segment.checkOut=today, reason=EXTENSION_NEW_ROOM)', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue(baseSettings)
      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany
        .mockResolvedValueOnce([])  // no stay-level checkouts
        .mockResolvedValueOnce([])  // sameDayCheckIns: vacío
      prismaMock.staySegment.findMany
        .mockResolvedValueOnce([
          // move-out: guest deja Room A
          { id: 'seg-out', roomId: 'rA', room: { id: 'rA', number: '201', units: [{ id: 'uA' }] } },
        ])
        .mockResolvedValueOnce([])  // sameDayMoveIns: vacío
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
      prismaMock.cleaningTask.create.mockResolvedValue({ id: 'new-task' })
      prismaMock.taskLog.create.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')

      expect(result.newTasks).toBe(1)  // task creada para Room A
      expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'uA',
            priority: 'MEDIUM',  // sin same-day arrival → MEDIUM
            hasSameDayCheckIn: false,
          }),
        }),
      )
      jest.useRealTimers()
    })

    it('B3: priority URGENT cuando la room vacated tiene un guest llegando hoy via segment move-in', async () => {
      // Escenario exacto reportado: Guest B sale de Room C2 hoy (stay-level
      // checkout). Guest A se mueve A Room C2 hoy (segment move-in).
      // Resultado: Room C2 task debe ser URGENT (Guest A esperando).
      prismaMock.propertySettings.findUnique.mockResolvedValue(baseSettings)
      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany
        .mockResolvedValueOnce([
          // Guest B sale de Room C2 hoy
          { id: 'stay-B', roomId: 'rC2', room: { id: 'rC2', number: 'C2', units: [{ id: 'uC2' }] } },
        ])
        .mockResolvedValueOnce([])  // sameDayCheckIns (stay-level): vacío
      prismaMock.staySegment.findMany
        .mockResolvedValueOnce([])  // no move-outs
        .mockResolvedValueOnce([
          // Guest A se mueve A Room C2 hoy
          { roomId: 'rC2' },
        ])
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
      prismaMock.cleaningTask.create.mockResolvedValue({ id: 'new' })
      prismaMock.taskLog.create.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      await scheduler.runForProperty('p1')

      expect(prismaMock.cleaningTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unitId: 'uC2',
            priority: 'URGENT',
            hasSameDayCheckIn: true,
          }),
        }),
      )
      jest.useRealTimers()
    })

    it('upgrade-in-place: task existente sin URGENT se eleva si AHORA hay same-day move-in', async () => {
      // Caso: extendNewRoom creó eagerly una task para mañana con priority
      // MEDIUM (sin same-day arrival al momento de creación). Hoy llega el
      // día del move y se confirma una extension adicional que mueve a otro
      // guest a esa misma room → debe elevarse a URGENT.
      prismaMock.propertySettings.findUnique.mockResolvedValue(baseSettings)
      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany
        .mockResolvedValueOnce([
          { id: 's-out', roomId: 'rX', room: { id: 'rX', number: '305', units: [{ id: 'uX' }] } },
        ])
        .mockResolvedValueOnce([])
      prismaMock.staySegment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ roomId: 'rX' }])  // move-in a rX
      prismaMock.cleaningTask.findFirst.mockResolvedValue({
        id: 'preexisting-task',
        priority: 'MEDIUM',
        hasSameDayCheckIn: false,
      })
      prismaMock.cleaningTask.update.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')

      expect(result.reusedTasks).toBe(1)
      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith({
        where: { id: 'preexisting-task' },
        data: { priority: 'URGENT', hasSameDayCheckIn: true },
      })
      jest.useRealTimers()
    })

    it('dedup: si una room aparece via stay-checkout Y segment-moveout, solo una task se crea', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue(baseSettings)
      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany
        .mockResolvedValueOnce([
          { id: 's1', roomId: 'rZ', room: { id: 'rZ', number: '410', units: [{ id: 'uZ' }] } },
        ])
        .mockResolvedValueOnce([])
      prismaMock.staySegment.findMany
        .mockResolvedValueOnce([
          // misma room también aparece como segment move-out (edge case)
          { id: 'seg-x', roomId: 'rZ', room: { id: 'rZ', number: '410', units: [{ id: 'uZ' }] } },
        ])
        .mockResolvedValueOnce([])
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
      prismaMock.cleaningTask.create.mockResolvedValue({ id: 'new' })
      prismaMock.taskLog.create.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      const result = await scheduler.runForProperty('p1')

      expect(result.newTasks).toBe(1)  // SOLO 1, no 2
      jest.useRealTimers()
    })
  })

  // ── SSE + idempotency final ─────────────────────────────────────────────

  describe('post-run effects', () => {
    it('emite roster:published al final y actualiza morningRosterDate', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })
      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany.mockResolvedValue([])
      prismaMock.propertySettings.update.mockResolvedValue({})

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      await scheduler.runForProperty('p1')

      expect(notificationsMock.emit).toHaveBeenCalledWith(
        'p1',
        'roster:published',
        expect.objectContaining({ date: '2026-04-29' }),
      )
      expect(prismaMock.propertySettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { propertyId: 'p1' },
          data: expect.objectContaining({ morningRosterDate: expect.any(Date) }),
        }),
      )
      jest.useRealTimers()
    })

    it('NO actualiza morningRosterDate cuando force=true', async () => {
      prismaMock.propertySettings.findUnique.mockResolvedValue({
        propertyId: 'p1',
        timezone: 'UTC',
        morningRosterHour: 7,
        morningRosterDate: null,
        carryoverPolicy: 'REASSIGN_TO_TODAY_SHIFT',
        autoAssignmentEnabled: true,
        property: { isActive: true, organizationId: 'org-1' },
      })
      prismaMock.cleaningTask.findMany.mockResolvedValue([])
      prismaMock.guestStay.findMany.mockResolvedValue([])

      jest.useFakeTimers().setSystemTime(new Date('2026-04-29T08:00:00Z'))
      await scheduler.runForProperty('p1', { force: true })
      expect(prismaMock.propertySettings.update).not.toHaveBeenCalled()
      jest.useRealTimers()
    })
  })
})
