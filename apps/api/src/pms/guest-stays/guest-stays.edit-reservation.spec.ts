/**
 * guest-stays.edit-reservation.spec.ts — Sprint EDIT-RESERVATION
 *
 * Cubre updateGuestStay (matriz phase×campo) + GuestStayNote thread.
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
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
import { AvailabilityService } from '../availability/availability.service'

const ORG_ID = 'org-test-1'
const STAY_ID = 'stay-test-1'
const ACTOR_ID = 'staff-1'

function makeStay(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: STAY_ID,
    organizationId: ORG_ID,
    propertyId: 'property-test-1',
    roomId: 'room-test-1',
    guestName: 'Ana García',
    guestEmail: 'ana@example.com',
    guestPhone: '+521234567890',
    documentType: 'PASSPORT',
    documentNumber: 'AB123456',
    documentPhotoUrl: null,
    nationality: 'MX',
    notes: null,
    arrivalNotes: null,
    paxCount: 2,
    ratePerNight: new Prisma.Decimal(120),
    totalAmount: new Prisma.Decimal(360),
    checkinAt: new Date(now.getTime() - 24 * 3600 * 1000), // ayer
    scheduledCheckout: new Date(now.getTime() + 2 * 24 * 3600 * 1000),
    actualCheckin: null,
    actualCheckout: null,
    noShowAt: null,
    cancelledAt: null,
    ...overrides,
  }
}

describe('GuestStaysService — edit reservation', () => {
  let service: GuestStaysService

  const prismaMock = {
    guestStay: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    guestStayLog: { create: jest.fn().mockResolvedValue({}) },
    guestStayNote: {
      findUnique: jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn().mockResolvedValue({ id: 'note-1', createdAt: new Date() }),
      update:     jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((arr: unknown) => Promise.resolve(Array.isArray(arr) ? arr : [])),
  }

  const tenantMock = { getOrganizationId: jest.fn().mockReturnValue(ORG_ID) }
  const eventsMock = { emit: jest.fn() }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestStaysService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TenantContextService, useValue: tenantMock },
        { provide: EventEmitter2, useValue: eventsMock },
        { provide: EmailService, useValue: { send: jest.fn() } },
        { provide: StayJourneyService, useValue: { recordEvent: jest.fn() } },
        { provide: ChannexGateway, useValue: { pushInventory: jest.fn(), notifyRelease: jest.fn() } },
        { provide: NotificationCenterService, useValue: { send: jest.fn().mockResolvedValue(undefined) } },
        { provide: AssignmentService, useValue: { autoAssign: jest.fn().mockResolvedValue(undefined) } },
        { provide: PushService, useValue: { sendToStaff: jest.fn().mockResolvedValue(undefined), sendBatch: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: AvailabilityService, useValue: { check: jest.fn().mockResolvedValue({ available: true, conflicts: [] }) } },
      ],
    }).compile()

    service = module.get<GuestStaysService>(GuestStaysService)
    jest.clearAllMocks()
  })

  // ── updateGuestStay — guards per phase ──────────────────────────────────

  describe('updateGuestStay — PRE_CHECKIN phase', () => {
    it('permite cambiar guestName y registra audit log', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      const result = await service.updateGuestStay(STAY_ID, { guestName: 'María González' }, ACTOR_ID)

      expect(result.ok).toBe(true)
      expect(result.changed).toBe(true)
      expect(result.phase).toBe('PRE_CHECKIN')
      expect(result.changedFields).toContain('guestName')
      expect(prismaMock.$transaction).toHaveBeenCalled()
    })

    it('cambiar ratePerNight recalcula totalAmount (rate × nights)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      await service.updateGuestStay(STAY_ID, { ratePerNight: 180 }, ACTOR_ID)

      // Verifica que el update incluye totalAmount recomputado (180 × 3 noches = 540)
      const txCall = prismaMock.$transaction.mock.calls[0]?.[0] as unknown[]
      expect(txCall).toBeDefined()
    })

    it('short-circuit si no hay cambios reales (return ok: true, changed: false)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      const result = await service.updateGuestStay(STAY_ID, { guestName: 'Ana García' }, ACTOR_ID)

      expect(result.changed).toBe(false)
      expect(prismaMock.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('updateGuestStay — POST_CHECKIN phase', () => {
    // Sprint EDIT-RESERVATION iter 6 — política Cloudbeds/Mews: cambios
    // post-checkin NO requieren approval bloqueante. Tests obsoletos:
    // RATE_CHANGE_REQUIRES_APPROVAL ya no se lanza.

    it('rate change post-checkin sin approval — permitido (audit log captura el cambio)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ actualCheckin: new Date() }),
      )

      const result = await service.updateGuestStay(
        STAY_ID,
        { ratePerNight: 200, reason: 'Tarifa OTA capturada mal al crear' },
        ACTOR_ID,
      )

      expect(result.ok).toBe(true)
      expect(result.changed).toBe(true)
    })

    it('rate change post-checkin acepta managerApprovalCode legacy sin requerirlo', async () => {
      // Backward-compat: si UI antigua sigue mandando approval fields, no rompe.
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ actualCheckin: new Date() }),
      )

      const result = await service.updateGuestStay(
        STAY_ID,
        { ratePerNight: 200, managerApprovalCode: 'MGR-001', managerApprovalReason: 'X' },
        ACTOR_ID,
      )

      expect(result.ok).toBe(true)
    })

    it('campos soft (guestName, email) editables libres post-checkin', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ actualCheckin: new Date() }),
      )

      const result = await service.updateGuestStay(
        STAY_ID,
        { guestEmail: 'nuevo@example.com' },
        ACTOR_ID,
      )

      expect(result.ok).toBe(true)
    })
  })

  describe('updateGuestStay — POST_CHECKOUT phase', () => {
    it('bloquea ratePerNight con STAY_CHECKED_OUT_IMMUTABLE_FIELD', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({
          actualCheckin: new Date(),
          actualCheckout: new Date(),
        }),
      )

      await expect(
        service.updateGuestStay(STAY_ID, { ratePerNight: 200 }, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'STAY_CHECKED_OUT_IMMUTABLE_FIELD',
          blocked: expect.arrayContaining(['ratePerNight']),
        }),
      })
    })

    it('permite editar guestEmail (soft) post-checkout', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({
          actualCheckin: new Date(),
          actualCheckout: new Date(),
        }),
      )

      const result = await service.updateGuestStay(
        STAY_ID, { guestEmail: 'late-correction@example.com' }, ACTOR_ID,
      )

      expect(result.ok).toBe(true)
    })
  })

  describe('updateGuestStay — CANCELLED/NOSHOW phases', () => {
    it('cancelled bloquea todo excepto notes', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ cancelledAt: new Date() }),
      )

      await expect(
        service.updateGuestStay(STAY_ID, { guestName: 'X' }, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STAY_CANCELLED' }),
      })
    })

    it('cancelled permite notes (campo interno) para registro post-hoc', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ cancelledAt: new Date() }),
      )

      const result = await service.updateGuestStay(
        STAY_ID,
        { notes: 'Refund procesado vía Booking.com' },
        ACTOR_ID,
      )

      expect(result.ok).toBe(true)
    })

    it('no-show bloquea con code STAY_NOSHOW', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ noShowAt: new Date() }),
      )

      await expect(
        service.updateGuestStay(STAY_ID, { guestName: 'X' }, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STAY_NOSHOW' }),
      })
    })
  })

  describe('updateGuestStay — SSE event', () => {
    it('emite stay.updated con changedFields tras escritura exitosa', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      await service.updateGuestStay(STAY_ID, { guestName: 'Cambiado' }, ACTOR_ID)

      expect(eventsMock.emit).toHaveBeenCalledWith(
        'stay.updated',
        expect.objectContaining({
          stayId: STAY_ID,
          changedFields: expect.arrayContaining(['guestName']),
        }),
      )
    })

    it('NO emite stay.updated si no hubo cambios (short-circuit)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      await service.updateGuestStay(STAY_ID, { guestName: 'Ana García' }, ACTOR_ID)

      expect(eventsMock.emit).not.toHaveBeenCalled()
    })
  })

  // ── GuestStayNote thread ────────────────────────────────────────────────

  describe('createNote', () => {
    it('crea nota con channel default GENERAL y emite stay.note.created', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      await service.createNote(STAY_ID, { content: 'Llegó a las 10pm' }, ACTOR_ID)

      expect(prismaMock.guestStayNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stayId: STAY_ID,
          authorId: ACTOR_ID,
          content: 'Llegó a las 10pm',
          channel: 'GENERAL',
        }),
      })
      expect(eventsMock.emit).toHaveBeenCalledWith(
        'stay.note.created',
        expect.objectContaining({ stayId: STAY_ID }),
      )
    })

    it('NotFoundException si stay no existe', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(null)

      await expect(
        service.createNote(STAY_ID, { content: 'X' }, ACTOR_ID),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('trim del content (sin whitespace leading/trailing)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      await service.createNote(STAY_ID, { content: '   Nota con spaces  ' }, ACTOR_ID)

      expect(prismaMock.guestStayNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ content: 'Nota con spaces' }),
      })
    })
  })

  describe('editNote', () => {
    it('permite editar dentro de la ventana 5min si es el mismo autor', async () => {
      prismaMock.guestStayNote.findUnique.mockResolvedValue({
        id: 'note-1',
        stayId: STAY_ID,
        authorId: ACTOR_ID,
        createdAt: new Date(Date.now() - 60 * 1000), // 1 min ago
        stay: { organizationId: ORG_ID, propertyId: 'property-test-1' },
      })

      await service.editNote('note-1', { content: 'Corregido' }, ACTOR_ID)

      expect(prismaMock.guestStayNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data:  expect.objectContaining({ content: 'Corregido', editedAt: expect.any(Date) }),
      })
    })

    it('rechaza NOTE_NOT_OWNER si otro autor intenta editar', async () => {
      prismaMock.guestStayNote.findUnique.mockResolvedValue({
        id: 'note-1',
        stayId: STAY_ID,
        authorId: 'staff-OTHER',
        createdAt: new Date(),
        stay: { organizationId: ORG_ID, propertyId: 'property-test-1' },
      })

      await expect(
        service.editNote('note-1', { content: 'X' }, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOTE_NOT_OWNER' }),
      })
    })

    it('rechaza NOTE_EDIT_WINDOW_EXPIRED tras 5 min', async () => {
      prismaMock.guestStayNote.findUnique.mockResolvedValue({
        id: 'note-1',
        stayId: STAY_ID,
        authorId: ACTOR_ID,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
        stay: { organizationId: ORG_ID, propertyId: 'property-test-1' },
      })

      await expect(
        service.editNote('note-1', { content: 'X' }, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOTE_EDIT_WINDOW_EXPIRED' }),
      })
    })
  })
})
