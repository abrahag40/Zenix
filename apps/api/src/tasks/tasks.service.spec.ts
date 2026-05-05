/**
 * Tests unitarios para TasksService
 *
 * No tocamos la base de datos real. Usamos "mocks" — objetos falsos que
 * simulan PrismaService, NotificationsService y PushService.
 *
 * Cada test sigue el patrón:
 *   Arrange → preparar mocks y datos
 *   Act     → llamar el método
 *   Assert  → verificar resultado con expect()
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { CleaningStatus, HousekeepingRole, TaskLogEvent } from '@zenix/shared'
import { TasksService } from './tasks.service'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'
import { StaffGamificationService } from '../staff-gamification/staff-gamification.service'

// ─── Helpers para construir datos de prueba ───────────────────────────────────

function makeActor(overrides: Partial<{ sub: string; role: HousekeepingRole; propertyId: string; organizationId: string }> = {}) {
  return {
    sub: 'staff-1',
    email: 'hk@test.com',
    role: HousekeepingRole.HOUSEKEEPER,
    propertyId: 'property-1',
    organizationId: 'org-1',
    ...overrides,
  }
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    unitId: 'bed-1',
    checkoutId: null,
    assignedToId: 'staff-1',
    status: CleaningStatus.READY,
    priority: 'MEDIUM',
    taskType: 'CLEANING',
    requiredCapability: 'CLEANING',
    startedAt: null,
    finishedAt: null,
    verifiedAt: null,
    verifiedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    unit: {
      id: 'bed-1',
      roomId: 'room-1',
      label: 'Cama 1',
      status: 'DIRTY',
      room: {
        id: 'room-1',
        number: '201',
        category: 'PRIVATE',
        floor: 2,
        property: { id: 'property-1', name: 'Hotel Demo' },
      },
    },
    notes: [],
    ...overrides,
  }
}

// ─── Setup del módulo de testing ─────────────────────────────────────────────

describe('TasksService', () => {
  let service: TasksService

  // Mocks — objetos que reemplazan las dependencias reales
  const prismaMock = {
    cleaningTask: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unit: { update: jest.fn() },
    housekeepingStaff: { findUnique: jest.fn() },
    taskLog: { create: jest.fn() },
    // $transaction ejecuta la función callback inmediatamente (sin transacción real)
    $transaction: jest.fn((fn) => fn(prismaMock)),
  }

  const notificationsMock = { emit: jest.fn() }
  const pushMock = { sendToStaff: jest.fn() }
  const gamificationMock = {
    onTaskVerified: jest.fn().mockResolvedValue(undefined),
    onTaskStarted: jest.fn().mockResolvedValue(undefined),
    onTaskCompleted: jest.fn().mockResolvedValue(undefined),
  }
  const tenantMock = {
    getOrganizationId: jest.fn().mockReturnValue('org-1'),
    getPropertyId: jest.fn().mockReturnValue('property-1'),
  }

  beforeEach(async () => {
    // Construir el módulo con las dependencias reemplazadas por mocks
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TenantContextService, useValue: tenantMock },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: PushService, useValue: pushMock },
        { provide: StaffGamificationService, useValue: gamificationMock },
      ],
    }).compile()

    service = module.get<TasksService>(TasksService)

    // Limpiar llamadas anteriores entre tests
    jest.clearAllMocks()
  })

  // ─── startTask ─────────────────────────────────────────────────────────────

  describe('startTask', () => {
    it('cambia el estado a IN_PROGRESS cuando la tarea está READY', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.READY })
      const updatedTask = { ...task, status: CleaningStatus.IN_PROGRESS, startedAt: new Date() }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null) // sin tarea activa
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})
      prismaMock.unit.update.mockResolvedValue({})

      // Act
      const result = await service.startTask('task-1', makeActor())

      // Assert
      expect(result.status).toBe(CleaningStatus.IN_PROGRESS)
      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({ status: CleaningStatus.IN_PROGRESS }),
        }),
      )
    })

    it('lanza NotFoundException si la tarea no existe', async () => {
      // Arrange
      prismaMock.cleaningTask.findUnique.mockResolvedValue(null)

      // Act & Assert
      await expect(service.startTask('no-existe', makeActor())).rejects.toThrow(NotFoundException)
    })

    it('lanza ConflictException si la tarea no está en estado READY o PENDING', async () => {
      // Arrange — tarea ya está en progreso
      const task = makeTask({ status: CleaningStatus.IN_PROGRESS })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)

      // Act & Assert
      await expect(service.startTask('task-1', makeActor())).rejects.toThrow(ConflictException)
    })

    it('lanza ForbiddenException si el housekeeper intenta iniciar una tarea ajena', async () => {
      // Arrange — la tarea está asignada a otro housekeeper
      const task = makeTask({ assignedToId: 'otro-housekeeper' })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)

      // Act & Assert — actor es housekeeper distinto al asignado
      await expect(service.startTask('task-1', makeActor({ sub: 'staff-mio' }))).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('lanza ConflictException si el housekeeper ya tiene una tarea IN_PROGRESS', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.READY })
      const otraTaskActiva = makeTask({ id: 'task-otra', status: CleaningStatus.IN_PROGRESS })

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.findFirst.mockResolvedValue(otraTaskActiva) // ya tiene una activa

      // Act & Assert
      await expect(service.startTask('task-1', makeActor())).rejects.toThrow(ConflictException)
    })

    it('un SUPERVISOR puede iniciar cualquier tarea sin verificar asignación', async () => {
      // Arrange — tarea asignada a otro, pero el actor es supervisor
      const task = makeTask({ assignedToId: 'otro-staff', status: CleaningStatus.READY })
      const updatedTask = { ...task, status: CleaningStatus.IN_PROGRESS }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})
      prismaMock.unit.update.mockResolvedValue({})

      // Act
      const result = await service.startTask('task-1', makeActor({ role: HousekeepingRole.SUPERVISOR }))

      // Assert — llegó hasta aquí sin lanzar error
      expect(result.status).toBe(CleaningStatus.IN_PROGRESS)
    })

    it('registra un TaskLog con evento STARTED', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.READY })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.findFirst.mockResolvedValue(null)
      prismaMock.cleaningTask.update.mockResolvedValue({ ...task, status: CleaningStatus.IN_PROGRESS })
      prismaMock.taskLog.create.mockResolvedValue({})
      prismaMock.unit.update.mockResolvedValue({})

      // Act
      await service.startTask('task-1', makeActor())

      // Assert — el log fue creado con el evento correcto
      expect(prismaMock.taskLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: TaskLogEvent.STARTED }),
        }),
      )
    })
  })

  // ─── endTask ───────────────────────────────────────────────────────────────

  describe('endTask', () => {
    it('cambia el estado a DONE cuando la tarea está IN_PROGRESS', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.IN_PROGRESS })
      const updatedTask = { ...task, status: CleaningStatus.DONE, finishedAt: new Date() }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})
      prismaMock.unit.update.mockResolvedValue({})

      // Act
      const result = await service.endTask('task-1', makeActor())

      // Assert
      expect(result.status).toBe(CleaningStatus.DONE)
      expect(prismaMock.unit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'AVAILABLE' },
        }),
      )
    })

    it('también puede finalizar una tarea PAUSED', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.PAUSED })
      const updatedTask = { ...task, status: CleaningStatus.DONE }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})
      prismaMock.unit.update.mockResolvedValue({})

      // Act
      const result = await service.endTask('task-1', makeActor())

      // Assert
      expect(result.status).toBe(CleaningStatus.DONE)
    })

    it('lanza ConflictException si la tarea no está IN_PROGRESS ni PAUSED', async () => {
      // Arrange — la tarea ya fue marcada como DONE
      const task = makeTask({ status: CleaningStatus.DONE })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)

      // Act & Assert
      await expect(service.endTask('task-1', makeActor())).rejects.toThrow(ConflictException)
    })

    it('emite evento SSE task:done al finalizar', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.IN_PROGRESS })
      const updatedTask = { ...task, status: CleaningStatus.DONE }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})
      prismaMock.unit.update.mockResolvedValue({})

      // Act
      await service.endTask('task-1', makeActor())

      // Assert — se emitió el evento SSE para el dashboard web
      expect(notificationsMock.emit).toHaveBeenCalledWith(
        'property-1',
        'task:done',
        expect.objectContaining({ taskId: 'task-1' }),
      )
    })
  })

  // ─── verifyTask ────────────────────────────────────────────────────────────

  describe('verifyTask', () => {
    it('cambia el estado a VERIFIED cuando la tarea está DONE', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.DONE })
      const updatedTask = { ...task, status: CleaningStatus.VERIFIED }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})

      // Act
      const result = await service.verifyTask('task-1', makeActor({ role: HousekeepingRole.SUPERVISOR }))

      // Assert
      expect(result.status).toBe(CleaningStatus.VERIFIED)
    })

    it('lanza ConflictException si se intenta verificar antes de que esté DONE', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.IN_PROGRESS })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)

      // Act & Assert
      await expect(
        service.verifyTask('task-1', makeActor({ role: HousekeepingRole.SUPERVISOR })),
      ).rejects.toThrow(ConflictException)
    })
  })

  // ─── assignTask ────────────────────────────────────────────────────────────

  describe('assignTask', () => {
    it('cambia el estado de UNASSIGNED a READY al asignar un housekeeper', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.UNASSIGNED, assignedToId: null })
      const staff = { id: 'staff-2', name: 'Ana', active: true, capabilities: ['CLEANING'] }
      const updatedTask = { ...task, status: CleaningStatus.READY, assignedToId: 'staff-2' }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.housekeepingStaff.findUnique.mockResolvedValue(staff)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})
      pushMock.sendToStaff.mockResolvedValue(undefined)

      // Act
      const result = await service.assignTask(
        'task-1',
        { assignedToId: 'staff-2' },
        makeActor({ role: HousekeepingRole.SUPERVISOR }),
      )

      // Assert
      expect(result.status).toBe(CleaningStatus.READY)
      expect(pushMock.sendToStaff).toHaveBeenCalledWith(
        'staff-2',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ type: 'task:ready' }),
      )
    })

    it('lanza NotFoundException si el staff asignado no existe', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.UNASSIGNED })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.housekeepingStaff.findUnique.mockResolvedValue(null) // no existe

      // Act & Assert
      await expect(
        service.assignTask('task-1', { assignedToId: 'fantasma' }, makeActor({ role: HousekeepingRole.SUPERVISOR })),
      ).rejects.toThrow(NotFoundException)
    })

    it('lanza ConflictException al intentar asignar una tarea ya DONE', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.DONE })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)

      // Act & Assert
      await expect(
        service.assignTask('task-1', { assignedToId: 'staff-2' }, makeActor({ role: HousekeepingRole.SUPERVISOR })),
      ).rejects.toThrow(ConflictException)
    })
  })

  // ─── pauseTask / resumeTask ────────────────────────────────────────────────

  describe('pauseTask', () => {
    it('cambia el estado a PAUSED desde IN_PROGRESS', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.IN_PROGRESS })
      const updatedTask = { ...task, status: CleaningStatus.PAUSED }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})

      // Act
      const result = await service.pauseTask('task-1', makeActor())

      // Assert
      expect(result.status).toBe(CleaningStatus.PAUSED)
    })

    it('lanza ConflictException si la tarea no está IN_PROGRESS', async () => {
      const task = makeTask({ status: CleaningStatus.READY })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)

      await expect(service.pauseTask('task-1', makeActor())).rejects.toThrow(ConflictException)
    })
  })

  describe('resumeTask', () => {
    it('cambia el estado a IN_PROGRESS desde PAUSED', async () => {
      // Arrange
      const task = makeTask({ status: CleaningStatus.PAUSED })
      const updatedTask = { ...task, status: CleaningStatus.IN_PROGRESS }

      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockResolvedValue(updatedTask)
      prismaMock.taskLog.create.mockResolvedValue({})

      // Act
      const result = await service.resumeTask('task-1', makeActor())

      // Assert
      expect(result.status).toBe(CleaningStatus.IN_PROGRESS)
    })
  })

  // ─── deferTask (Sprint 9 / EC-6) ─────────────────────────────────────────
  describe('deferTask', () => {
    beforeEach(() => {
      // housekeepingStaff.findMany usado para notificar supervisores cuando BLOCKED
      ;(prismaMock.housekeepingStaff as any).findMany = jest.fn().mockResolvedValue([])
    })

    it('marca DEFERRED + retryAt 30min después en primer defer (count=1)', async () => {
      const task = makeTask({ status: CleaningStatus.READY, deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )

      const before = Date.now()
      const result = await service.deferTask('task-1', 'NO_ANSWER' as any, makeActor())
      const after = Date.now()

      expect(result.status).toBe(CleaningStatus.DEFERRED)
      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CleaningStatus.DEFERRED,
            deferredReason: 'NO_ANSWER',
            deferredCount: 1,
            retryAt: expect.any(Date),
          }),
        }),
      )
      // El retryAt debe estar ~30 min en el futuro
      const updateCall = prismaMock.cleaningTask.update.mock.calls[0][0] as any
      const retryAt = updateCall.data.retryAt as Date
      const expectedMin = before + 30 * 60 * 1000
      const expectedMax = after + 30 * 60 * 1000
      expect(retryAt.getTime()).toBeGreaterThanOrEqual(expectedMin)
      expect(retryAt.getTime()).toBeLessThanOrEqual(expectedMax)

      expect(notificationsMock.emit).toHaveBeenCalledWith(
        'property-1',
        'task:deferred',
        expect.objectContaining({ taskId: 'task-1', reason: 'NO_ANSWER' }),
      )
    })

    it('al tercer defer (count=3) → BLOCKED + notifica supervisores', async () => {
      const task = makeTask({ status: CleaningStatus.READY, deferredCount: 2 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )
      ;(prismaMock.housekeepingStaff as any).findMany.mockResolvedValue([
        { id: 'supervisor-1' },
        { id: 'supervisor-2' },
      ])

      const result = await service.deferTask('task-1', 'DND_PHYSICAL' as any, makeActor())

      expect(result.status).toBe(CleaningStatus.BLOCKED)
      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CleaningStatus.BLOCKED,
            deferredCount: 3,
            retryAt: null,
          }),
        }),
      )
      expect(notificationsMock.emit).toHaveBeenCalledWith(
        'property-1',
        'task:blocked',
        expect.any(Object),
      )
      expect(pushMock.sendToStaff).toHaveBeenCalledTimes(2)
      expect(pushMock.sendToStaff).toHaveBeenCalledWith(
        'supervisor-1',
        expect.stringContaining('bloqueada'),
        expect.any(String),
        expect.objectContaining({ type: 'task:blocked' }),
      )
    })

    it('rechaza defer si el actor no es asignado ni SUPERVISOR', async () => {
      const task = makeTask({ status: CleaningStatus.READY, assignedToId: 'other-staff' })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)

      await expect(
        service.deferTask('task-1', 'NO_ANSWER' as any, makeActor({ sub: 'random-staff' })),
      ).rejects.toThrow(ForbiddenException)
    })

    it('SUPERVISOR puede diferir aunque no sea el asignado', async () => {
      const task = makeTask({ status: CleaningStatus.READY, assignedToId: 'maria', deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )

      const result = await service.deferTask(
        'task-1',
        'GUEST_REQUEST' as any,
        makeActor({ sub: 'sup-1', role: HousekeepingRole.SUPERVISOR }),
      )
      expect(result.status).toBe(CleaningStatus.DEFERRED)
    })

    it('rechaza defer desde estado DONE/VERIFIED/CANCELLED', async () => {
      const task = makeTask({ status: CleaningStatus.DONE })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      await expect(
        service.deferTask('task-1', 'NO_ANSWER' as any, makeActor()),
      ).rejects.toThrow(ConflictException)
    })

    it('crea TaskLog con event=DEFERRED y metadata', async () => {
      const task = makeTask({ status: CleaningStatus.READY, deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )

      await service.deferTask('task-1', 'DND_PHYSICAL' as any, makeActor())

      expect(prismaMock.taskLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskId: 'task-1',
            event: TaskLogEvent.DEFERRED,
            metadata: expect.objectContaining({ reason: 'DND_PHYSICAL', deferredCount: 1 }),
          }),
        }),
      )
    })
  })

  // ─── D15 — Operational overrides (Sprint 9 / Ajustes del día) ────────────
  describe('forceUrgent', () => {
    it('cambia priority a URGENT y emite SSE', async () => {
      const task = makeTask({ status: CleaningStatus.READY, priority: 'MEDIUM', deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )

      await service.forceUrgent('task-1', makeActor({ role: HousekeepingRole.RECEPTIONIST }))

      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { priority: 'URGENT' } }),
      )
      expect(notificationsMock.emit).toHaveBeenCalledWith(
        'property-1',
        'task:priority-overridden',
        expect.objectContaining({ newPriority: 'URGENT', previousPriority: 'MEDIUM' }),
      )
    })

    it('idempotente — si ya es URGENT, retorna sin update', async () => {
      const task = makeTask({ priority: 'URGENT', deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      const result = await service.forceUrgent('task-1', makeActor())
      expect(result).toBe(task)
      expect(prismaMock.cleaningTask.update).not.toHaveBeenCalled()
    })

    it('rechaza si la tarea está VERIFIED o CANCELLED', async () => {
      const task = makeTask({ status: CleaningStatus.VERIFIED })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      await expect(service.forceUrgent('task-1', makeActor())).rejects.toThrow(ConflictException)
    })
  })

  describe('toggleDeepClean', () => {
    it('toggles deep clean flag (off → on)', async () => {
      const task = makeTask({ status: CleaningStatus.READY, deepClean: false, deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )

      await service.toggleDeepClean('task-1', makeActor())

      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deepClean: true } }),
      )
    })

    it('rechaza si la tarea está IN_PROGRESS (housekeeper ya limpiando)', async () => {
      const task = makeTask({ status: CleaningStatus.IN_PROGRESS })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      await expect(service.toggleDeepClean('task-1', makeActor())).rejects.toThrow(/progreso/i)
    })
  })

  describe('holdCleaning', () => {
    it('pone hold con reason y revierte READY → PENDING', async () => {
      const task = makeTask({ status: CleaningStatus.READY, deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )

      await service.holdCleaning('task-1', 'Huésped pidió extender', makeActor())

      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CleaningStatus.PENDING,
            holdReason: 'Huésped pidió extender',
            heldById: 'staff-1',
          }),
        }),
      )
    })

    it('rechaza si la tarea está IN_PROGRESS', async () => {
      const task = makeTask({ status: CleaningStatus.IN_PROGRESS })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      await expect(
        service.holdCleaning('task-1', 'razón', makeActor()),
      ).rejects.toThrow(/coordina con el housekeeper/i)
    })

    it('preserva PENDING si la tarea ya estaba PENDING', async () => {
      const task = makeTask({ status: CleaningStatus.PENDING, deferredCount: 0 })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )
      await service.holdCleaning('task-1', 'razón', makeActor())
      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CleaningStatus.PENDING }),
        }),
      )
    })
  })

  describe('releaseHold', () => {
    it('limpia holdReason + heldAt + heldById', async () => {
      const task = makeTask({
        status: CleaningStatus.PENDING,
        holdReason: 'razón previa',
        heldAt: new Date(),
        heldById: 'staff-1',
      })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      prismaMock.cleaningTask.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...task, ...data }),
      )

      await service.releaseHold('task-1', makeActor())

      expect(prismaMock.cleaningTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { holdReason: null, heldAt: null, heldById: null },
        }),
      )
    })

    it('rechaza si la tarea no estaba en hold', async () => {
      const task = makeTask({ holdReason: null })
      prismaMock.cleaningTask.findUnique.mockResolvedValue(task)
      await expect(service.releaseHold('task-1', makeActor())).rejects.toThrow(/no está en hold/i)
    })
  })

  describe('createWalkIn', () => {
    function setupRoom(units: { id: string }[] = [{ id: 'unit-1' }]) {
      ;(prismaMock as any).room = { findUnique: jest.fn().mockResolvedValue({
        id: 'room-1', number: '201', propertyId: 'property-1',
        property: { id: 'property-1' },
        units,
      }) }
      ;(prismaMock as any).guestStay = {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'stay-1', ...data })),
      }
    }

    it('crea GuestStay (PAID/WALK_IN) + CleaningTask (PENDING) atómicamente', async () => {
      setupRoom([{ id: 'unit-1' }])
      prismaMock.cleaningTask.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'task-1', ...data, unit: { roomId: 'room-1', room: { number: '201' } } }),
      )

      const checkout = new Date(Date.now() + 6 * 60 * 60 * 1000) // +6h
      const result = await service.createWalkIn(
        {
          roomId: 'room-1',
          guestName: 'Carlos Walk-in',
          ratePerNight: 80,
          currency: 'USD',
          scheduledCheckout: checkout,
        },
        makeActor({ role: HousekeepingRole.RECEPTIONIST }),
      )

      expect(result.stay).toBeDefined()
      expect(result.task).toBeDefined()
      const stayCreateCall = (prismaMock as any).guestStay.create.mock.calls[0][0]
      expect(stayCreateCall.data.source).toBe('WALK_IN')
      expect(stayCreateCall.data.paymentStatus).toBe('PAID')
      expect(stayCreateCall.data.actualCheckin).toBeInstanceOf(Date)
    })

    it('rechaza walk-in con scheduledCheckout en el pasado', async () => {
      setupRoom()
      await expect(
        service.createWalkIn(
          {
            roomId: 'room-1',
            guestName: 'X',
            ratePerNight: 50,
            currency: 'USD',
            scheduledCheckout: new Date(Date.now() - 60 * 60 * 1000),
          },
          makeActor(),
        ),
      ).rejects.toThrow(/futura/i)
    })

    it('rechaza walk-in con > 24h de duración', async () => {
      setupRoom()
      await expect(
        service.createWalkIn(
          {
            roomId: 'room-1',
            guestName: 'X',
            ratePerNight: 50,
            currency: 'USD',
            scheduledCheckout: new Date(Date.now() + 30 * 60 * 60 * 1000),
          },
          makeActor(),
        ),
      ).rejects.toThrow(/24h/i)
    })

    it('habitación shared sin unitId → ConflictException', async () => {
      setupRoom([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])
      await expect(
        service.createWalkIn(
          {
            roomId: 'room-1',
            guestName: 'X',
            ratePerNight: 50,
            currency: 'USD',
            scheduledCheckout: new Date(Date.now() + 6 * 60 * 60 * 1000),
          },
          makeActor(),
        ),
      ).rejects.toThrow(/cama/i)
    })

    it('habitación privada (1 unit) sin unitId → auto-pick', async () => {
      setupRoom([{ id: 'unit-only' }])
      prismaMock.cleaningTask.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'task-1', ...data, unit: { roomId: 'room-1', room: { number: '201' } } }),
      )

      await service.createWalkIn(
        {
          roomId: 'room-1',
          guestName: 'X',
          ratePerNight: 50,
          currency: 'USD',
          scheduledCheckout: new Date(Date.now() + 6 * 60 * 60 * 1000),
        },
        makeActor(),
      )

      const taskCreateCall = prismaMock.cleaningTask.create.mock.calls[0][0]
      expect(taskCreateCall.data.unitId).toBe('unit-only')
    })
  })
})
