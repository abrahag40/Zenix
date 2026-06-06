/**
 * guest-stays.checkin.spec.ts — Sprint CHECK-IN-α
 *
 * Cubre los cambios del Día 1:
 *   - confirmCheckin con paymentModel=OTA_COLLECT saltea guard BALANCE_UNPAID
 *   - confirmCheckin con paymentModel=HOTEL_COLLECT mantiene guard BALANCE_UNPAID
 *   - confirmCheckin idempotente devuelve code='CHECKIN_ALREADY_CONFIRMED'
 *   - confirmCheckin sobre no-show devuelve code='NOSHOW_LOCKED'
 *   - confirmCheckin futuro devuelve code='FUTURE_CHECKIN'
 *   - getCheckinContext devuelve balanceProjection + canCheckIn + warnings correctos
 *   - getCheckinContext sobre stay OTA_COLLECT no agrega BALANCE_PENDING warning
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { KeyDeliveryType, PaymentMethod } from '@zenix/shared'
import { ConfirmCheckinDto } from './dto/confirm-checkin.dto'
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
const PROPERTY_ID = 'property-test-1'
const ROOM_ID = 'room-test-1'
const STAY_ID = 'stay-test-1'
const ACTOR_ID = 'staff-1'

// Check-in dentro del día actual (no future, no past) → siempre permitido.
const TODAY_CHECKIN = new Date()
const TOMORROW_CHECKOUT = new Date(Date.now() + 24 * 60 * 60 * 1000)
const FUTURE_CHECKIN = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)

function makeStay(overrides: Record<string, unknown> = {}) {
  return {
    id: STAY_ID,
    organizationId: ORG_ID,
    propertyId: PROPERTY_ID,
    roomId: ROOM_ID,
    guestName: 'Ana García',
    guestEmail: 'ana@example.com',
    guestPhone: null,
    documentType: 'PASSPORT',
    documentNumber: 'AB123456',
    nationality: 'MX',
    paxCount: 2,
    currency: 'USD',
    ratePerNight: new Prisma.Decimal(120),
    totalAmount: new Prisma.Decimal(360),
    amountPaid: new Prisma.Decimal(0),
    paymentModel: 'HOTEL_COLLECT',
    paymentStatus: 'PENDING',
    bookingRef: null,
    source: 'DIRECT',
    arrivalNotes: null,
    checkinAt: TODAY_CHECKIN,
    scheduledCheckout: TOMORROW_CHECKOUT,
    actualCheckout: null,
    actualCheckin: null,
    noShowAt: null,
    cancelledAt: null,
    stayJourney: null,
    paymentLogs: [],
    documentPhotoUrl: null,
    room: {
      id: ROOM_ID,
      number: '101',
      status: 'AVAILABLE',
      property: {
        id: PROPERTY_ID,
        settings: { timezone: 'America/Mexico_City' },
        legalEntity: { baseCurrency: 'USD' },
      },
    },
    ...overrides,
  }
}

const baseDto: ConfirmCheckinDto = {
  documentVerified: true,
  documentType: 'PASSPORT',
  documentNumber: 'AB123456',
  keyType: KeyDeliveryType.PHYSICAL,
  arrivalNotes: undefined,
  payments: [],
}

describe('GuestStaysService — check-in alpha', () => {
  let service: GuestStaysService

  const prismaMock = {
    guestStay: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null), // BUG #31 fix — room-occupancy guard
      update: jest.fn().mockResolvedValue({}),
    },
    // BUG #31 fix — confirmCheckin ahora hace findUnique para room.category guard.
    room: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ category: 'PRIVATE' }),
    },
    paymentLog: { create: jest.fn().mockResolvedValue({}) },
    exchangeRate:    { findFirst: jest.fn().mockResolvedValue(null) },
    propertyFxRate:  { findFirst: jest.fn().mockResolvedValue(null) },
    stayJourneyEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((fnOrArr: unknown) => {
      if (typeof fnOrArr === 'function') {
        return (fnOrArr as (tx: typeof prismaMock) => unknown)(prismaMock)
      }
      return Promise.resolve(fnOrArr)
    }),
  }

  const tenantMock = { getOrganizationId: jest.fn().mockReturnValue(ORG_ID), getPropertyId: jest.fn().mockReturnValue('test-property-id') }
  const eventsMock = { emit: jest.fn() }
  const notifCenterMock = { send: jest.fn().mockResolvedValue(undefined) }

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
        { provide: NotificationCenterService, useValue: notifCenterMock },
        { provide: AssignmentService, useValue: { autoAssign: jest.fn().mockResolvedValue(undefined) } },
        { provide: PushService, useValue: { sendToStaff: jest.fn().mockResolvedValue(undefined), sendBatch: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: AuditOutboxService, useValue: { emit: jest.fn(), recordStayCheckinConfirmed: jest.fn(), recordCheckout: jest.fn(), recordLateCheckout: jest.fn(), recordStayUpdated: jest.fn(), recordStayExtended: jest.fn(), recordRoomMoved: jest.fn(), recordRoomsSwapped: jest.fn(), recordStayRestored: jest.fn(), recordNoShowMarked: jest.fn(), recordNoShowReverted: jest.fn(), recordNoShowChargeRegistered: jest.fn(), recordPaymentRegistered: jest.fn(), recordPaymentVoided: jest.fn(), recordCancelRefundRegistered: jest.fn() } }, { provide: AvailabilityService, useValue: { check: jest.fn().mockResolvedValue({ available: true, conflicts: [] }) } },
      ],
    }).compile()

    service = module.get<GuestStaysService>(GuestStaysService)
    jest.clearAllMocks()
  })

  // ── confirmCheckin ──────────────────────────────────────────────────────────

  describe('confirmCheckin', () => {
    it('paymentModel=OTA_COLLECT saltea el guard BALANCE_UNPAID — confirma sin payments[]', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ paymentModel: 'OTA_COLLECT', source: 'BOOKING_COM' }),
      )

      const result = await service.confirmCheckin(STAY_ID, baseDto, ACTOR_ID)

      expect(result.success).toBe(true)
      // Stay actualizado con paymentStatus=PAID aunque payments[] esté vacío.
      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentStatus: 'PAID',
            actualCheckin: expect.any(Date),
          }),
        }),
      )
      // No se creó ningún PaymentLog porque payments[] estaba vacío.
      expect(prismaMock.paymentLog.create).not.toHaveBeenCalled()
    })

    it('paymentModel=HOTEL_COLLECT con balance > 0 sin payment lanza BadRequest code=BALANCE_UNPAID', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      await expect(
        service.confirmCheckin(STAY_ID, baseDto, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BALANCE_UNPAID' }),
      })
    })

    it('COMP cubre el saldo SIN requerir aprobación de manager (fix Fase B — §C1.13)', async () => {
      // Antes de Fase B, Guard 7 lanzaba ForbiddenException para COMP/$0 sin
      // approvedById/approvalReason → el dialog Fase D (que ya no captura
      // aprobación) habría dado 403 en cualquier check-in con Cortesía.
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay()) // balance 360

      const result = await service.confirmCheckin(
        STAY_ID,
        { ...baseDto, payments: [{ method: PaymentMethod.COMP, amount: 360 }] },
        ACTOR_ID,
      )

      expect(result.success).toBe(true)
      expect(prismaMock.guestStay.update).toHaveBeenCalled()
    })

    it('idempotencia — stay ya checked-in devuelve ConflictException code=CHECKIN_ALREADY_CONFIRMED', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ actualCheckin: new Date('2026-05-01T15:00:00.000Z') }),
      )

      await expect(
        service.confirmCheckin(STAY_ID, baseDto, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CHECKIN_ALREADY_CONFIRMED' }),
      })
    })

    it('no-show locked — devuelve BadRequest code=NOSHOW_LOCKED', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ noShowAt: new Date('2026-05-01T03:00:00.000Z') }),
      )

      await expect(
        service.confirmCheckin(STAY_ID, baseDto, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOSHOW_LOCKED' }),
      })
    })

    it('check-in futuro — devuelve BadRequest code=FUTURE_CHECKIN', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ checkinAt: FUTURE_CHECKIN }),
      )

      await expect(
        service.confirmCheckin(STAY_ID, baseDto, ACTOR_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FUTURE_CHECKIN' }),
      })
    })

    it('bloquea overpayment con code=BALANCE_OVERPAID (instinct Opera/RoomRaccoon)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      await expect(
        service.confirmCheckin(
          STAY_ID,
          {
            ...baseDto,
            payments: [{ method: PaymentMethod.CASH, amount: 400 }], // total = 360
          },
          ACTOR_ID,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BALANCE_OVERPAID', excess: 40 }),
      })
    })

    it('persiste documentPhotoUrl en GuestStay.update', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay({ paymentModel: 'OTA_COLLECT' }))

      await service.confirmCheckin(
        STAY_ID,
        { ...baseDto, documentPhotoUrl: 'data:image/jpeg;base64,FAKE...' },
        ACTOR_ID,
      )

      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentPhotoUrl: 'data:image/jpeg;base64,FAKE...',
          }),
        }),
      )
    })

    it('happy path HOTEL_COLLECT con pago en efectivo cubre balance y confirma', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      const result = await service.confirmCheckin(
        STAY_ID,
        {
          ...baseDto,
          payments: [{ method: PaymentMethod.CASH, amount: 360 }],
        },
        ACTOR_ID,
      )

      expect(result.success).toBe(true)
      expect(prismaMock.paymentLog.create).toHaveBeenCalledTimes(1)
      expect(prismaMock.guestStay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentStatus: 'PAID' }),
        }),
      )
    })
  })

  // ── getCheckinContext ───────────────────────────────────────────────────────

  describe('getCheckinContext', () => {
    it('HOTEL_COLLECT con balance pendiente — agrega warning BALANCE_PENDING', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(makeStay())

      const ctx = await service.getCheckinContext(STAY_ID)

      expect(ctx.paymentModel).toBe('HOTEL_COLLECT')
      expect(ctx.balanceProjection).toMatchObject({
        totalAmount: 360,
        amountPaid: 0,
        balance: 360,
        currency: 'USD',
      })
      expect(ctx.canCheckIn.ok).toBe(true)
      expect(ctx.canCheckIn.warnings).toContain('BALANCE_PENDING')
    })

    it('OTA_COLLECT con balance pendiente — NO agrega warning BALANCE_PENDING', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ paymentModel: 'OTA_COLLECT' }),
      )

      const ctx = await service.getCheckinContext(STAY_ID)

      expect(ctx.paymentModel).toBe('OTA_COLLECT')
      expect(ctx.canCheckIn.ok).toBe(true)
      expect(ctx.canCheckIn.warnings).not.toContain('BALANCE_PENDING')
    })

    it('stay ya checked-in — canCheckIn.ok=false con reason CHECKIN_ALREADY_CONFIRMED', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ actualCheckin: new Date('2026-05-01T15:00:00.000Z') }),
      )

      const ctx = await service.getCheckinContext(STAY_ID)

      expect(ctx.canCheckIn.ok).toBe(false)
      expect(ctx.canCheckIn.reasons).toContain('CHECKIN_ALREADY_CONFIRMED')
    })

    it('stay inexistente — lanza NotFoundException', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(null)

      await expect(service.getCheckinContext(STAY_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    it('identityCaptured refleja si documentType+documentNumber están seteados', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({ documentType: null, documentNumber: null, documentPhotoUrl: null }),
      )

      const ctx = await service.getCheckinContext(STAY_ID)
      expect(ctx.identityCaptured).toBe(false)
    })

    it('identityCaptured=true cuando hay foto aunque no haya número', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({
          documentType: null,
          documentNumber: null,
          documentPhotoUrl: 'data:image/jpeg;base64,XYZ',
        }),
      )

      const ctx = await service.getCheckinContext(STAY_ID)
      expect(ctx.identityCaptured).toBe(true)
    })

    it('propertyCurrency = LegalEntity.baseCurrency cuando existe (no folio currency)', async () => {
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({
          currency: 'USD',
          room: {
            id: ROOM_ID, number: '101', status: 'AVAILABLE',
            property: {
              id: PROPERTY_ID,
              settings: { timezone: 'America/Mexico_City' },
              legalEntity: { baseCurrency: 'MXN' },
            },
          },
        }),
      )

      const ctx = await service.getCheckinContext(STAY_ID)
      expect(ctx.propertyCurrency).toBe('MXN')
    })

    it('secondaryRates.USD computado vía lookup inverso (USD→MXN en BD → MXN→USD en ctx)', async () => {
      // Banxico provee USD→MXN (1 USD = 17.20 MXN). Para mostrar MXN→USD el
      // servicio invierte: 1 MXN = 1/17.20 USD.
      prismaMock.exchangeRate.findFirst.mockImplementation(
        ({ where }: { where: { baseCurrency: string; quoteCurrency: string } }) => {
          if (where.baseCurrency === 'USD' && where.quoteCurrency === 'MXN') {
            return Promise.resolve({ rate: 17.2 } as { rate: number })
          }
          return Promise.resolve(null)
        },
      )
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({
          room: {
            id: ROOM_ID, number: '101', status: 'AVAILABLE',
            property: {
              id: PROPERTY_ID,
              settings: { timezone: 'America/Mexico_City' },
              legalEntity: { baseCurrency: 'MXN' },
            },
          },
        }),
      )

      const ctx = await service.getCheckinContext(STAY_ID)
      expect(ctx.secondaryRates.USD).toBeCloseTo(1 / 17.2, 4)
      expect(ctx.secondaryRates.EUR).toBeNull()
      // Cuando propertyCurrency=MXN, MXN no aparece en el output.
      expect(ctx.secondaryRates.MXN).toBeUndefined()
    })

    it('propertyCurrency=USD expone MXN+EUR como targets (no USD)', async () => {
      prismaMock.exchangeRate.findFirst.mockImplementation(
        ({ where }: { where: { baseCurrency: string; quoteCurrency: string } }) => {
          // Hay USD→MXN en BD → para USD→MXN se usa directo (17.20).
          if (where.baseCurrency === 'USD' && where.quoteCurrency === 'MXN') {
            return Promise.resolve({ rate: 17.2 } as { rate: number })
          }
          return Promise.resolve(null)
        },
      )
      prismaMock.guestStay.findUnique.mockResolvedValue(
        makeStay({
          room: {
            id: ROOM_ID, number: '101', status: 'AVAILABLE',
            property: {
              id: PROPERTY_ID,
              settings: { timezone: 'America/Mexico_City' },
              legalEntity: { baseCurrency: 'USD' },
            },
          },
        }),
      )

      const ctx = await service.getCheckinContext(STAY_ID)
      expect(ctx.secondaryRates.MXN).toBeCloseTo(17.2, 4)
      expect(ctx.secondaryRates.EUR).toBeNull()
      // Cuando propertyCurrency=USD, USD no aparece en el output.
      expect(ctx.secondaryRates.USD).toBeUndefined()
    })
  })
})
