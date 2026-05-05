/**
 * Tests para AssignmentService — auto-asignación determinística (D10).
 *
 * Cobertura:
 *   - Reglas en orden: COVERAGE_PRIMARY → COVERAGE_BACKUP → ROUND_ROBIN
 *   - Filtros: solo HOUSEKEEPER, solo capability requerida, solo on-shift
 *   - Tiebreaker: menor carga + alfabético en empate
 *   - Toggle global autoAssignmentEnabled
 *   - Tarea ya asignada → no-op
 *   - reassignTasksForAbsence (D5)
 */
import { Test, TestingModule } from '@nestjs/testing'
import { AssignmentService } from './assignment.service'
import { PrismaService } from '../prisma/prisma.service'
import { AvailabilityQueryService } from '../scheduling/availability-query.service'
import { NotificationsService } from '../notifications/notifications.service'

describe('AssignmentService', () => {
  let service: AssignmentService

  const prismaMock = {
    cleaningTask: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    propertySettings: { findUnique: jest.fn() },
    staffCoverage: { findMany: jest.fn() },
    taskLog: { create: jest.fn() },
    $transaction: jest.fn((fn) => fn(prismaMock)),
  }

  const availabilityMock = {
    getOnShiftStaff: jest.fn(),
    getStaffOnShiftToday: jest.fn(),
  }

  const notificationsMock = { emit: jest.fn() }

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AvailabilityQueryService, useValue: availabilityMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile()
    service = moduleRef.get(AssignmentService)
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock))
    prismaMock.cleaningTask.groupBy.mockResolvedValue([])
    prismaMock.propertySettings.findUnique.mockResolvedValue({ autoAssignmentEnabled: true })
  })

  function makeTask(overrides: Record<string, unknown> = {}) {
    return {
      id: 'task-1',
      assignedToId: null,
      status: 'PENDING',
      requiredCapability: 'CLEANING',
      unit: { room: { id: 'room-1', propertyId: 'prop-1', number: '101' } },
      ...overrides,
    }
  }

  function makeOnShift(staffId: string, name = staffId, capabilities = ['CLEANING']) {
    return {
      staffId, name,
      role: 'HOUSEKEEPER' as const,
      capabilities,
      shiftStart: '07:00',
      shiftEnd: '15:00',
      source: 'RECURRING' as const,
    }
  }

  // ── Regla 1: COVERAGE_PRIMARY ──────────────────────────────────────────

  describe('Regla 1: COVERAGE_PRIMARY', () => {
    it('asigna a la primary cuando es la única elegible on-shift', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask())
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([
        makeOnShift('maria'),
        makeOnShift('pedro'),
      ])
      prismaMock.staffCoverage.findMany.mockResolvedValue([
        { staffId: 'maria', isPrimary: true, weight: 1 },
        { staffId: 'pedro', isPrimary: false, weight: 1 },
      ])

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(true)
      expect(result.staffId).toBe('maria')
      expect(result.rule).toBe('COVERAGE_PRIMARY')
    })

    it('aplica tiebreak por carga cuando hay 2+ primaries elegibles', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask())
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([
        makeOnShift('maria'),
        makeOnShift('luis'),
      ])
      prismaMock.staffCoverage.findMany.mockResolvedValue([
        { staffId: 'maria', isPrimary: true, weight: 1 },
        { staffId: 'luis', isPrimary: true, weight: 1 },
      ])
      // Maria tiene 5 tareas, Luis 1 → gana Luis
      prismaMock.cleaningTask.groupBy.mockResolvedValue([
        { assignedToId: 'maria', _count: { id: 5 } },
        { assignedToId: 'luis', _count: { id: 1 } },
      ])

      const result = await service.autoAssign('task-1')
      expect(result.staffId).toBe('luis')
      expect(result.rule).toBe('COVERAGE_PRIMARY')
    })
  })

  // ── Regla 2: COVERAGE_BACKUP ──────────────────────────────────────────

  describe('Regla 2: COVERAGE_BACKUP', () => {
    it('cae a backup si la primary no está on-shift', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask())
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([makeOnShift('pedro')])
      prismaMock.staffCoverage.findMany.mockResolvedValue([
        { staffId: 'pedro', isPrimary: false, weight: 1 },
        // María (primary) no está en la lista on-shift
      ])

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(true)
      expect(result.staffId).toBe('pedro')
      expect(result.rule).toBe('COVERAGE_BACKUP')
    })
  })

  // ── Regla 3: ROUND_ROBIN ──────────────────────────────────────────────

  describe('Regla 3: ROUND_ROBIN', () => {
    it('cae a round-robin si nadie cubre la habitación', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask())
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([
        makeOnShift('alfa'),
        makeOnShift('bravo'),
      ])
      prismaMock.staffCoverage.findMany.mockResolvedValue([])
      prismaMock.cleaningTask.groupBy.mockResolvedValue([])

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(true)
      expect(result.rule).toBe('ROUND_ROBIN')
      // Tiebreak alfabético en empate de carga → "alfa"
      expect(result.staffId).toBe('alfa')
    })
  })

  // ── Filtros ──────────────────────────────────────────────────────────────

  describe('Filtros', () => {
    it('rechaza si no hay staff con la capability requerida', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(
        makeTask({ requiredCapability: 'MAINTENANCE' }),
      )
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([
        makeOnShift('maria', 'María', ['CLEANING']),  // sin MAINTENANCE
      ])
      prismaMock.staffCoverage.findMany.mockResolvedValue([])

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(false)
      expect(result.reason).toBe('NO_ELIGIBLE_STAFF_ON_SHIFT')
    })

    it('rechaza si nadie está on-shift', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask())
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([])
      prismaMock.staffCoverage.findMany.mockResolvedValue([])

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(false)
    })

    it('excluye SUPERVISORES de auto-asignación', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask())
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([
        { staffId: 'sup', name: 'Super', role: 'SUPERVISOR', capabilities: ['CLEANING'], shiftStart: '00:00', shiftEnd: '23:59', source: 'RECURRING' },
      ])
      prismaMock.staffCoverage.findMany.mockResolvedValue([])

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(false)
    })
  })

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('no-op si la tarea ya tiene assignedToId', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(
        makeTask({ assignedToId: 'maria' }),
      )

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(false)
      expect(result.reason).toBe('ALREADY_ASSIGNED')
      expect(result.staffId).toBe('maria')
      expect(prismaMock.cleaningTask.update).not.toHaveBeenCalled()
    })

    it('respeta el toggle global autoAssignmentEnabled=false', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask())
      prismaMock.propertySettings.findUnique.mockResolvedValue({ autoAssignmentEnabled: false })

      const result = await service.autoAssign('task-1')
      expect(result.assigned).toBe(false)
      expect(result.reason).toBe('AUTO_ASSIGNMENT_DISABLED')
    })

    it('retorna TASK_NOT_FOUND si la tarea no existe', async () => {
      prismaMock.cleaningTask.findUnique.mockResolvedValue(null)
      const result = await service.autoAssign('not-real')
      expect(result.assigned).toBe(false)
      expect(result.reason).toBe('TASK_NOT_FOUND')
    })
  })

  // ── reassignTasksForAbsence (D5) ─────────────────────────────────────────

  describe('reassignTasksForAbsence', () => {
    it('limpia assignedToId de tareas elegibles y dispara auto-asignación', async () => {
      const eligible = [
        { id: 't1' },
        { id: 't2' },
      ]
      prismaMock.cleaningTask.findMany.mockResolvedValue(eligible)
      // Para cada autoAssign() interno, mock un finding de la tarea
      prismaMock.cleaningTask.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(makeTask({ id: where.id })),
      )
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([makeOnShift('pedro')])
      prismaMock.staffCoverage.findMany.mockResolvedValue([
        { staffId: 'pedro', isPrimary: false, weight: 1 },
      ])

      const result = await service.reassignTasksForAbsence('maria', 'prop-1')

      expect(result.reassigned).toBe(2)
      expect(result.failed).toBe(0)
      // Cada tarea recibe un REASSIGNED log
      expect(prismaMock.taskLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'REASSIGNED',
            note: 'staff_absence',
          }),
        }),
      )
      expect(notificationsMock.emit).toHaveBeenCalledWith(
        'prop-1',
        'shift:absence',
        expect.objectContaining({ absentStaffId: 'maria', tasksReassigned: 2 }),
      )
    })

    it('cuenta failed si autoAssign no encuentra reemplazo', async () => {
      prismaMock.cleaningTask.findMany.mockResolvedValue([{ id: 't1' }])
      prismaMock.cleaningTask.findUnique.mockResolvedValue(makeTask({ id: 't1' }))
      availabilityMock.getStaffOnShiftToday.mockResolvedValue([])  // nadie on-shift
      prismaMock.staffCoverage.findMany.mockResolvedValue([])

      const result = await service.reassignTasksForAbsence('maria', 'prop-1')
      expect(result.reassigned).toBe(0)
      expect(result.failed).toBe(1)
    })
  })
})
