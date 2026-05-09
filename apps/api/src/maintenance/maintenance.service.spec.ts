/**
 * maintenance.service.spec.ts — Sprint Mx-1
 *
 * Tests del núcleo del módulo de mantenimiento. Cubre los 3 flujos críticos:
 *  A) Top-down (supervisor asigna)
 *  B) Bottom-up con aprobación
 *  C) Cola con voluntary pickup + auto-assign
 *
 * Y la métrica crítica del sprint: D-Mx2 auto-bloqueo + D-Mx3 auto-liberación.
 *
 * Patrón: AAA (Arrange / Act / Assert) consistente con checkouts.service.spec.
 * Todos los tests usan mocks de Prisma + servicios externos para ser
 * deterministas (sin BD real).
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import {
  TicketCategory,
  TicketLogEvent,
  TicketPriority,
  TicketStatus,
  BlockSemantic,
  BlockStatus,
} from '@prisma/client'
import { JwtPayload, StaffRole, Department, Capability, StaffLevel } from '@zenix/shared'

import { MaintenanceService } from './maintenance.service'
import { PrismaService } from '../prisma/prisma.service'
import { TenantContextService } from '../common/tenant-context.service'
import { NotificationsService } from '../notifications/notifications.service'
import { NotificationCenterService } from '../notification-center/notification-center.service'
import { PushService } from '../notifications/push.service'
import { AvailabilityService } from '../pms/availability/availability.service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const supervisor: JwtPayload = {
  sub: 'staff-sup',
  email: 's@x.co',
  role: StaffRole.SUPERVISOR,
  department: Department.HOUSEKEEPING,
  level: StaffLevel.LEAD,
  propertyId: 'prop-1',
  organizationId: 'org-1',
}

const housekeeper: JwtPayload = {
  ...supervisor,
  sub: 'staff-hk',
  role: StaffRole.HOUSEKEEPER,
  department: Department.HOUSEKEEPING,
  level: StaffLevel.COLLABORATOR,
}

const technician: JwtPayload = {
  ...supervisor,
  sub: 'staff-tech-1',
  role: StaffRole.HOUSEKEEPER,
  department: Department.MAINTENANCE,
  level: StaffLevel.COLLABORATOR,
}

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-1',
    organizationId: 'org-1',
    propertyId: 'prop-1',
    roomId: 'room-1',
    unitId: null,
    assetTag: null,
    category: TicketCategory.PLUMBING,
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.OPEN,
    title: 'Grifo gotea',
    description: null,
    guestImpact: null,
    reportedById: 'staff-hk',
    assignedToId: null,
    resolvedById: null,
    verifiedById: null,
    approvedById: null,
    approvedAt: null,
    rejectedReason: null,
    requiresApproval: false,
    recurrenceTemplateId: null,
    estimatedMinutes: null,
    actualMinutes: null,
    acknowledgedAt: null,
    startedAt: null,
    waitingPartsAt: null,
    resolvedAt: null,
    verifiedAt: null,
    closedAt: null,
    slaBreachAt: null,
    sourceTaskId: null,
    createdAt: new Date('2026-05-10T10:00:00Z'),
    updatedAt: new Date('2026-05-10T10:00:00Z'),
    room: { id: 'room-1', number: '101' },
    unit: null,
    reportedBy: { id: 'staff-hk', name: 'Maria HK' },
    assignedTo: null,
    resolvedBy: null,
    verifiedBy: null,
    approvedBy: null,
    autoBlock: null,
    ...overrides,
  }
}

// ─── Mocks compartidos ────────────────────────────────────────────────────────

function buildMocks() {
  const prismaMock: any = {
    maintenanceTicket: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    maintenanceTicketLog: { create: jest.fn() },
    maintenanceTicketComment: { create: jest.fn() },
    maintenanceTicketPhoto: { create: jest.fn() },
    maintenanceRecurrenceTemplate: { findMany: jest.fn() },
    roomBlock: { create: jest.fn(), update: jest.fn() },
    blockLog: { create: jest.fn() },
    room: { findFirst: jest.fn() },
    unit: { findFirst: jest.fn() },
    staff: { findFirst: jest.fn(), findMany: jest.fn() },
    cleaningTask: { create: jest.fn() },
    propertySettings: { findUnique: jest.fn() },
  }
  prismaMock.$transaction = jest.fn((fn: any) => fn(prismaMock))

  const tenantMock = {
    getOrganizationId: jest.fn().mockReturnValue('org-1'),
    getPropertyId: jest.fn().mockReturnValue('prop-1'),
  }

  const sseMock = { emit: jest.fn() }
  const pushMock = { sendToStaff: jest.fn().mockResolvedValue(undefined) }
  const notifCenterMock = { send: jest.fn().mockResolvedValue('notif-1') }
  const availabilityMock = {
    check: jest.fn().mockResolvedValue({ available: true, conflicts: [], checkedChannex: false }),
    notifyReservation: jest.fn().mockResolvedValue(undefined),
    notifyRelease: jest.fn().mockResolvedValue(undefined),
  }

  return { prismaMock, tenantMock, sseMock, pushMock, notifCenterMock, availabilityMock }
}

async function buildModule(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MaintenanceService,
      { provide: PrismaService, useValue: mocks.prismaMock },
      { provide: TenantContextService, useValue: mocks.tenantMock },
      { provide: NotificationsService, useValue: mocks.sseMock },
      { provide: NotificationCenterService, useValue: mocks.notifCenterMock },
      { provide: PushService, useValue: mocks.pushMock },
      { provide: AvailabilityService, useValue: mocks.availabilityMock },
    ],
  }).compile()
  return module.get(MaintenanceService)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MaintenanceService — Sprint Mx-1', () => {
  let mocks: ReturnType<typeof buildMocks>
  let service: MaintenanceService

  beforeEach(async () => {
    jest.clearAllMocks()
    mocks = buildMocks()
    service = await buildModule(mocks)
    mocks.prismaMock.room.findFirst.mockResolvedValue({ propertyId: 'prop-1' })
    mocks.prismaMock.staff.findFirst.mockResolvedValue({
      id: 'staff-tech-1',
      department: Department.MAINTENANCE,
      name: 'Roberto',
    })
    mocks.prismaMock.maintenanceTicket.create.mockImplementation(async ({ data }: any) =>
      makeTicket({
        ...data,
        room: data.roomId ? { id: data.roomId, number: '101' } : null,
      }),
    )
    mocks.prismaMock.maintenanceTicket.findUnique.mockImplementation(async () =>
      makeTicket(),
    )
  })

  // ── Flujo A: top-down ─────────────────────────────────────────────────────

  it('Flujo A — supervisor asigna directamente → status ACKNOWLEDGED', async () => {
    // Arrange
    const dto = {
      roomId: 'room-1',
      category: TicketCategory.PLUMBING,
      title: 'Grifo gotea',
      assignedToId: 'staff-tech-1',
    }

    // Act
    await service.createTicket(dto as any, supervisor)

    // Assert
    expect(mocks.prismaMock.maintenanceTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.ACKNOWLEDGED,
          assignedToId: 'staff-tech-1',
          requiresApproval: false,
        }),
      }),
    )
    // Logs: CREATED + ASSIGNED + ACKNOWLEDGED
    const events = mocks.prismaMock.maintenanceTicketLog.create.mock.calls.map(
      (c: any) => c[0].data.event,
    )
    expect(events).toContain(TicketLogEvent.CREATED)
    expect(events).toContain(TicketLogEvent.ASSIGNED)
    expect(events).toContain(TicketLogEvent.ACKNOWLEDGED)
  })

  // ── Flujo B: bottom-up con aprobación ─────────────────────────────────────

  it('Flujo B — housekeeper levanta con requiresApproval → push al supervisor', async () => {
    // Arrange
    const dto = {
      roomId: 'room-1',
      category: TicketCategory.PLUMBING,
      title: 'Mancha rara',
      requiresApproval: true,
    }

    // Act
    await service.createTicket(dto as any, housekeeper)

    // Assert
    expect(mocks.prismaMock.maintenanceTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.OPEN,
          requiresApproval: true,
          assignedToId: null,
        }),
      }),
    )
    // Notif al supervisor
    const sentCategories = mocks.notifCenterMock.send.mock.calls.map((c: any) => c[0].category)
    expect(sentCategories).toContain('MAINTENANCE_TICKET_NEEDS_APPROVAL')
  })

  // ── Flujo C: cola sin asignar ─────────────────────────────────────────────

  it('Flujo C — sin asignee y sin approval → ticket queda en cola', async () => {
    // Arrange
    const dto = {
      roomId: 'room-1',
      category: TicketCategory.COSMETIC,
      title: 'Pintura desconchada',
    }
    mocks.prismaMock.propertySettings.findUnique.mockResolvedValue({
      maintenanceAutoAssignEnabled: false,
    })

    // Act
    await service.createTicket(dto as any, supervisor)

    // Assert
    expect(mocks.prismaMock.maintenanceTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.OPEN,
          assignedToId: null,
          requiresApproval: false,
        }),
      }),
    )
    const events = mocks.prismaMock.maintenanceTicketLog.create.mock.calls.map(
      (c: any) => c[0].data.event,
    )
    expect(events).toContain(TicketLogEvent.QUEUED)
  })

  // ── D-Mx2: CRITICAL → auto-bloqueo ────────────────────────────────────────

  it('D-Mx2: CRITICAL en habitación → crea RoomBlock atómicamente + Channex notify', async () => {
    // Arrange
    const dto = {
      roomId: 'room-1',
      category: TicketCategory.STRUCTURAL,
      priority: TicketPriority.CRITICAL,
      title: 'Aire acondicionado fallando — encerado en curso',
    }
    mocks.prismaMock.roomBlock.create.mockResolvedValue({ id: 'block-99' })

    // Act
    await service.createTicket(dto as any, supervisor)

    // Assert — RoomBlock creado en la misma transacción
    expect(mocks.prismaMock.roomBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          semantic: BlockSemantic.OUT_OF_ORDER,
          status: BlockStatus.APPROVED,
          maintenanceTicketId: expect.any(String),
        }),
      }),
    )
    // Audit trail con BLOCK_AUTO_CREATED
    const events = mocks.prismaMock.maintenanceTicketLog.create.mock.calls.map(
      (c: any) => c[0].data.event,
    )
    expect(events).toContain(TicketLogEvent.BLOCK_AUTO_CREATED)
    // Channex notificado fire-and-forget (post-tx)
    expect(mocks.availabilityMock.notifyReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'BLOCK', roomId: 'room-1' }),
    )
  })

  it('D-Mx2: CRITICAL con huésped activo → ConflictException con razón explícita', async () => {
    // Arrange
    mocks.availabilityMock.check.mockResolvedValueOnce({
      available: false,
      conflicts: [{ source: 'LOCAL_STAY', label: 'Marco Fernández' }],
      checkedChannex: false,
    })

    // Act + Assert
    await expect(
      service.createTicket(
        {
          roomId: 'room-1',
          category: TicketCategory.STRUCTURAL,
          priority: TicketPriority.CRITICAL,
          title: 'Test',
        } as any,
        supervisor,
      ),
    ).rejects.toThrow(ConflictException)
  })

  // ── Ticket no-de-habitación ───────────────────────────────────────────────

  it('Ticket no-de-habitación (assetTag, roomId null) — NO toca inventario ni bloque', async () => {
    // Arrange
    const dto = {
      assetTag: 'Lavadora-2',
      category: TicketCategory.APPLIANCE,
      priority: TicketPriority.HIGH,
      title: 'Lavadora hace ruido extraño',
    }

    // Act
    await service.createTicket(dto as any, supervisor)

    // Assert — sin RoomBlock, sin Channex notify
    expect(mocks.prismaMock.roomBlock.create).not.toHaveBeenCalled()
    expect(mocks.availabilityMock.notifyReservation).not.toHaveBeenCalled()
  })

  // ── Claim (voluntary pickup) ──────────────────────────────────────────────

  it('claim — técnico toma ticket de la cola → status ACKNOWLEDGED', async () => {
    // Arrange
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValueOnce(
      makeTicket({ assignedToId: null, status: TicketStatus.OPEN, requiresApproval: false }),
    )
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValueOnce(
      makeTicket({
        assignedToId: 'staff-tech-1',
        status: TicketStatus.ACKNOWLEDGED,
      }),
    )

    // Act
    await service.claimTicket('ticket-1', technician)

    // Assert
    expect(mocks.prismaMock.maintenanceTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: 'staff-tech-1',
          status: TicketStatus.ACKNOWLEDGED,
        }),
      }),
    )
    const events = mocks.prismaMock.maintenanceTicketLog.create.mock.calls.map(
      (c: any) => c[0].data.event,
    )
    expect(events).toContain(TicketLogEvent.CLAIMED)
  })

  it('claim — falla si el ticket ya está asignado', async () => {
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue(
      makeTicket({ assignedToId: 'other-tech', assignedTo: { id: 'other-tech', name: 'Otro' } }),
    )
    await expect(service.claimTicket('ticket-1', technician)).rejects.toThrow(ConflictException)
  })

  it('claim — falla si actor no es de mantenimiento', async () => {
    await expect(service.claimTicket('ticket-1', housekeeper)).rejects.toThrow(ForbiddenException)
  })

  // ── State machine ─────────────────────────────────────────────────────────

  it('start — ACKNOWLEDGED → IN_PROGRESS', async () => {
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue(
      makeTicket({ status: TicketStatus.ACKNOWLEDGED, assignedToId: 'staff-tech-1' }),
    )
    mocks.prismaMock.maintenanceTicket.update.mockResolvedValue(
      makeTicket({ status: TicketStatus.IN_PROGRESS }),
    )

    await service.startTicket('ticket-1', technician)

    expect(mocks.prismaMock.maintenanceTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: TicketStatus.IN_PROGRESS }) }),
    )
  })

  it('start — falla con BadRequest si transición inválida (OPEN → IN_PROGRESS)', async () => {
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue(
      makeTicket({ status: TicketStatus.OPEN, assignedToId: 'staff-tech-1' }),
    )
    await expect(service.startTicket('ticket-1', technician)).rejects.toThrow(BadRequestException)
  })

  // ── D-Mx3: VERIFIED libera bloque + crea CleaningTask post-mantenimiento ──

  it('D-Mx3: verify libera RoomBlock + crea CleaningTask MAINTENANCE_FOLLOWUP', async () => {
    // Arrange
    const ticketWithBlock = makeTicket({
      status: TicketStatus.RESOLVED,
      autoBlock: { id: 'block-99', status: BlockStatus.APPROVED },
      roomId: 'room-1',
      unitId: null,
      priority: TicketPriority.CRITICAL,
    })
    mocks.prismaMock.maintenanceTicket.findUnique
      .mockResolvedValueOnce(ticketWithBlock) // primer find (assertActor)
      .mockResolvedValueOnce(makeTicket({ status: TicketStatus.VERIFIED })) // post-tx find
    mocks.prismaMock.unit.findFirst.mockResolvedValue({ id: 'unit-1' })
    mocks.prismaMock.cleaningTask.create.mockResolvedValue({ id: 'task-followup' })

    // Act
    await service.verifyTicket('ticket-1', { approved: true } as any, supervisor)

    // Assert — bloque liberado + CleaningTask creada
    expect(mocks.prismaMock.roomBlock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'block-99' },
        data: { status: BlockStatus.CANCELLED },
      }),
    )
    expect(mocks.prismaMock.cleaningTask.create).toHaveBeenCalled()
    expect(mocks.availabilityMock.notifyRelease).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'RELEASE', roomId: 'room-1' }),
    )
    // Audit log incluye BLOCK_AUTO_RELEASED
    const events = mocks.prismaMock.maintenanceTicketLog.create.mock.calls.map(
      (c: any) => c[0].data.event,
    )
    expect(events).toContain(TicketLogEvent.VERIFIED)
    expect(events).toContain(TicketLogEvent.BLOCK_AUTO_RELEASED)
  })

  it('verify con approved=false → ticket regresa a IN_PROGRESS (rechazo de calidad)', async () => {
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue(
      makeTicket({ status: TicketStatus.RESOLVED }),
    )
    mocks.prismaMock.maintenanceTicket.update.mockResolvedValue(
      makeTicket({ status: TicketStatus.IN_PROGRESS }),
    )

    await service.verifyTicket(
      'ticket-1',
      { approved: false, rejectionReason: 'No quedó limpio el área' } as any,
      supervisor,
    )

    expect(mocks.prismaMock.maintenanceTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.IN_PROGRESS,
          resolvedAt: null,
          resolvedById: null,
        }),
      }),
    )
  })

  // ── Approve / reject (Flujo B) ────────────────────────────────────────────

  it('approve — supervisor aprueba ticket bottom-up + asigna técnico atómicamente', async () => {
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue(
      makeTicket({
        status: TicketStatus.OPEN,
        requiresApproval: true,
        approvedById: null,
      }),
    )

    await service.approveTicket(
      'ticket-1',
      { assignedToId: 'staff-tech-1' } as any,
      supervisor,
    )

    expect(mocks.prismaMock.maintenanceTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvedById: 'staff-sup',
          assignedToId: 'staff-tech-1',
          status: TicketStatus.ACKNOWLEDGED,
        }),
      }),
    )
  })

  it('reject — supervisor rechaza con razón → ticket cierra con rejectedReason', async () => {
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue(
      makeTicket({ status: TicketStatus.OPEN, requiresApproval: true }),
    )

    await service.rejectTicket(
      'ticket-1',
      { reason: 'Duplicado del ticket #45' } as any,
      supervisor,
    )

    expect(mocks.prismaMock.maintenanceTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TicketStatus.CLOSED,
          rejectedReason: 'Duplicado del ticket #45',
        }),
      }),
    )
  })

  it('approve — falla si actor no es supervisor', async () => {
    await expect(
      service.approveTicket('ticket-1', {} as any, technician),
    ).rejects.toThrow(ForbiddenException)
  })

  // ── Auto-assign (cola) ────────────────────────────────────────────────────

  it('auto-assign — load balancing por carga, gana el técnico con menor count', async () => {
    // Arrange
    mocks.prismaMock.propertySettings.findUnique.mockResolvedValue({
      maintenanceAutoAssignEnabled: true,
    })
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
      assignedToId: null,
      propertyId: 'prop-1',
    })
    mocks.prismaMock.staff.findMany.mockResolvedValue([
      { id: 'tech-A', name: 'Ana' },
      { id: 'tech-B', name: 'Bea' },
      { id: 'tech-C', name: 'Cesar' },
    ])
    mocks.prismaMock.maintenanceTicket.count
      .mockResolvedValueOnce(3) // Ana
      .mockResolvedValueOnce(0) // Bea — la menos cargada
      .mockResolvedValueOnce(1) // Cesar

    // Act
    await service.maybeAutoAssign('ticket-1', 'prop-1', 'org-1')

    // Assert
    expect(mocks.prismaMock.maintenanceTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: 'tech-B',
          status: TicketStatus.ACKNOWLEDGED,
        }),
      }),
    )
  })

  it('auto-assign — sin staff de mantenimiento → notif al supervisor', async () => {
    mocks.prismaMock.propertySettings.findUnique.mockResolvedValue({
      maintenanceAutoAssignEnabled: true,
    })
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
      assignedToId: null,
      propertyId: 'prop-1',
    })
    mocks.prismaMock.staff.findMany.mockResolvedValue([])

    await service.maybeAutoAssign('ticket-1', 'prop-1', 'org-1')

    expect(mocks.prismaMock.maintenanceTicket.update).not.toHaveBeenCalled()
    expect(mocks.notifCenterMock.send).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'MAINTENANCE_TICKET_QUEUED' }),
    )
  })

  // ── Reopen post-venta ─────────────────────────────────────────────────────

  it('reopen CRITICAL — falla con ConflictException si la habitación ya está vendida', async () => {
    mocks.prismaMock.maintenanceTicket.findUnique.mockResolvedValue(
      makeTicket({
        status: TicketStatus.CLOSED,
        priority: TicketPriority.CRITICAL,
        roomId: 'room-1',
      }),
    )
    mocks.availabilityMock.check.mockResolvedValueOnce({
      available: false,
      conflicts: [{ source: 'LOCAL_STAY', label: 'Pedro Quintana' }],
      checkedChannex: false,
    })

    await expect(
      service.reopenTicket('ticket-1', { reason: 'Volvió a fallar' } as any, supervisor),
    ).rejects.toThrow(ConflictException)
  })
})
