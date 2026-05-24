/**
 * AvailabilityService — unit tests para el filtro de "overstayed/zombie".
 *
 * Sprint AVAIL-OVERSTAY (2026-05-19). Cubre:
 *   1. check() filtra stays cuya scheduledCheckout < startOfDay(today) y
 *      actualCheckout=null (zombies).
 *   2. check() respeta el cutoff combinado dayAfterNewCheckIn ∪ zombieCutoff.
 *   3. findOverstayed() retorna exactamente las zombies (counterpart de check).
 *   4. Stays con actualCheckout != null o noShowAt != null nunca son zombies.
 */

import { AvailabilityService } from './availability.service'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'

function utcDay(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d))
}

function makePrismaMock() {
  return {
    guestStay: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staySegment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    roomBlock: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    room: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    propertySettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  }
}

function makeChannexMock(): ChannexGateway {
  return {
    enabled: false,
    pullAvailability: jest.fn(),
    pushInventory: jest.fn(),
    pushAbsoluteAvailability: jest.fn(),
  } as unknown as ChannexGateway
}

describe('AvailabilityService — overstayed/zombie filter', () => {
  let svc: AvailabilityService
  let prisma: ReturnType<typeof makePrismaMock>
  const realDateNow = Date.now

  beforeEach(() => {
    // Pin "now" a 2026-05-19 14:00 UTC para tests determinísticos.
    Date.now = () => Date.UTC(2026, 4, 19, 14, 0, 0)
    prisma = makePrismaMock()
    svc = new AvailabilityService(prisma as any, makeChannexMock(), {
      // EventEmitter2 mock — Day 3 refactor: notifyChannex ahora emite event
      // en vez de llamar Gateway direct. Para los tests existentes que solo
      // verifican `check()` (no notify), el emit es no-op.
      emit: jest.fn(),
    } as any)
  })

  afterEach(() => {
    Date.now = realDateNow
    jest.useRealTimers()
  })

  describe('check() — filtro zombie en GuestStay query', () => {
    it('aplica filtro effectiveCheckoutCutoff = max(dayAfterNewCheckIn, todayStart)', async () => {
      // Future booking: from=May 22, to=May 25 → dayAfter=May 23.
      // todayStart=May 19. max=May 23 → no override, comportamiento clásico.
      await svc.check({
        roomId: 'r1',
        from: utcDay(2026, 5, 22),
        to: utcDay(2026, 5, 25),
      })

      const where = prisma.guestStay.findMany.mock.calls[0][0].where
      expect(where.scheduledCheckout).toEqual({ gte: utcDay(2026, 5, 23) })
    })

    it('cuando dragged.checkIn está en pasado, cutoff se eleva a startOfDay(today)', async () => {
      // Elena drag con su checkIn=May 15 (pasado) → dayAfter=May 16.
      // todayStart=May 19. max=May 19. Carlos zombie (sch=May 17) queda fuera.
      await svc.check({
        roomId: 'r1',
        from: utcDay(2026, 5, 15),
        to: utcDay(2026, 5, 22),
      })

      const where = prisma.guestStay.findMany.mock.calls[0][0].where
      expect(where.scheduledCheckout).toEqual({ gte: utcDay(2026, 5, 19) })
    })

    it('segment query también recibe el filtro zombie + cutoff combinado', async () => {
      await svc.check({
        roomId: 'r1',
        from: utcDay(2026, 5, 15),
        to: utcDay(2026, 5, 22),
      })

      const where = prisma.staySegment.findMany.mock.calls[0][0].where
      expect(where.checkOut).toEqual({ gte: utcDay(2026, 5, 19) })
      // Stay padre del segment también debe pasar zombieCutoff
      expect(where.journey.guestStay.scheduledCheckout).toEqual({
        gte: utcDay(2026, 5, 19),
      })
    })
  })

  describe('findOverstayed() — counterpart del filtro', () => {
    it('retorna solo stays con scheduledCheckout < startOfDay(today)', async () => {
      const propertyId = 'prop-1'
      const carlosZombie = {
        id: 'carlos',
        guestName: 'Carlos Pérez',
        guestEmail: 'carlos@example.com',
        guestPhone: '+52...',
        roomId: 'r2',
        room: { number: 'A2', category: 'PRIVATE' },
        checkinAt: utcDay(2026, 5, 13),
        scheduledCheckout: utcDay(2026, 5, 17),
        actualCheckin: utcDay(2026, 5, 13),
        source: 'BOOKING',
        bookingRef: 'MX-D-001-2605-0042',
        paymentStatus: 'PARTIAL',
        totalAmount: 480,
        amountPaid: 120,
      }
      prisma.guestStay.findMany.mockResolvedValueOnce([carlosZombie])

      const result = await svc.findOverstayed(propertyId)

      expect(prisma.guestStay.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            propertyId,
            actualCheckout: null,
            noShowAt: null,
            cancelledAt: null,
            scheduledCheckout: { lt: utcDay(2026, 5, 19) },
          }),
        }),
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'carlos',
        guestName: 'Carlos Pérez',
        roomNumber: 'A2',
        outstandingBalance: 360, // 480 - 120
      })
      expect(result[0].hoursOverdue).toBeGreaterThan(0)
    })

    it('outstandingBalance = totalAmount - amountPaid', async () => {
      prisma.guestStay.findMany.mockResolvedValueOnce([
        {
          id: 's1',
          guestName: 'X',
          guestEmail: null,
          guestPhone: null,
          roomId: 'r',
          room: null,
          checkinAt: utcDay(2026, 5, 14),
          scheduledCheckout: utcDay(2026, 5, 16),
          actualCheckin: null,
          source: null,
          bookingRef: null,
          paymentStatus: 'PAID',
          totalAmount: 200,
          amountPaid: 200,
        },
      ])

      const result = await svc.findOverstayed('p')
      expect(result[0].outstandingBalance).toBe(0)
    })

    it('ordena por scheduledCheckout asc', async () => {
      prisma.guestStay.findMany.mockResolvedValueOnce([])
      await svc.findOverstayed('p')
      const args = prisma.guestStay.findMany.mock.calls[0][0]
      expect(args.orderBy).toEqual({ scheduledCheckout: 'asc' })
    })
  })
})
