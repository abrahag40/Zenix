/**
 * ChannexBookingMapper — pure function tests, no DI.
 *
 * Covers the Channex official revision schema fully:
 *   - amount + currency + nights → ratePerNight
 *   - payment_collect → paymentModel + paymentStatus + amountPaid
 *   - arrival_date + arrival_hour combined in property TZ
 *   - rooms[].guests preferred over customer for name resolution
 *   - notes append [Channex] disclosure for OTA-collect
 *   - leadDays = arrival - inserted_at
 */

import { Prisma } from '@prisma/client'
import { ChannexBookingRevision } from '../channex.gateway'
import { ChannexBookingMapper } from './channex-booking.mapper'

function makeRevision(overrides: Partial<ChannexBookingRevision> = {}): ChannexBookingRevision {
  return {
    id: 'rev-1',
    property_id: 'prop-1',
    booking_id: 'book-1',
    ota_name: 'Booking.com',
    ota_reservation_code: 'BDC-1234',
    status: 'new',
    arrival_date: '2026-06-01',
    departure_date: '2026-06-04', // 3 nights
    arrival_hour: '16:30',
    amount: '450.00',
    currency: 'USD',
    occupancy: { adults: 2, children: 0, infants: 0 },
    rooms: [
      {
        amount: '450.00',
        checkin_date: '2026-06-01',
        checkout_date: '2026-06-04',
        rate_plan_id: 'rate-bar',
        room_type_id: 'rt-standard',
        occupancy: { adults: 2, children: 0, infants: 0 },
        days: {
          '2026-06-01': '150.00',
          '2026-06-02': '150.00',
          '2026-06-03': '150.00',
        },
      },
    ],
    customer: {
      name: 'Maria',
      surname: 'Garcia',
      mail: 'maria@example.com',
      phone: '+5215551234567',
      country: 'MX',
    },
    inserted_at: '2026-05-22T18:00:00.000Z',
    payment_collect: 'property',
    ...overrides,
  }
}

describe('ChannexBookingMapper', () => {
  describe('toGuestStayCreate (happy path)', () => {
    const result = ChannexBookingMapper.toGuestStayCreate({
      revision: makeRevision(),
      propertyId: 'prop-1',
      organizationId: 'org-1',
      propertyTimezone: 'America/Cancun', // UTC-5
      roomId: 'room-a1',
      channexConflict: false,
    })

    it('mapea identificadores y datos base', () => {
      expect(result.propertyId).toBe('prop-1')
      expect(result.organizationId).toBe('org-1')
      expect(result.roomId).toBe('room-a1')
      expect(result.channexBookingId).toBe('book-1')
      expect(result.channexOtaName).toBe('Booking.com')
      expect(result.channexConflict).toBe(false)
      expect(result.source).toBe('BOOKING.COM')
    })

    it('combina nombre + apellido del customer', () => {
      expect(result.guestName).toBe('Maria Garcia')
      expect(result.guestEmail).toBe('maria@example.com')
      expect(result.guestPhone).toBe('+5215551234567')
      expect(result.nationality).toBe('MX')
    })

    it('computa ratePerNight = total / nights', () => {
      // 450/3 = 150
      expect(new Prisma.Decimal(result.ratePerNight as Prisma.Decimal).toFixed(2)).toBe('150.00')
      expect(new Prisma.Decimal(result.totalAmount as Prisma.Decimal).toFixed(2)).toBe('450.00')
      expect(result.currency).toBe('USD')
    })

    it('paymentModel HOTEL_COLLECT cuando payment_collect=property', () => {
      expect(result.paymentModel).toBe('HOTEL_COLLECT')
      expect(result.paymentStatus).toBe('PENDING')
      expect(new Prisma.Decimal(result.amountPaid as Prisma.Decimal).toFixed(2)).toBe('0.00')
    })

    it('paxCount = adults + children (infants no cuentan)', () => {
      expect(result.paxCount).toBe(2)
    })

    it('checkinAt combina arrival_date + arrival_hour en timezone America/Cancun', () => {
      // 16:30 local Cancun (UTC-5) → 21:30 UTC
      const checkIn = result.checkinAt as Date
      expect(checkIn.toISOString()).toBe('2026-06-01T21:30:00.000Z')
    })

    it('scheduledCheckout usa default 11:00 local', () => {
      // 11:00 local Cancun (UTC-5) → 16:00 UTC
      const checkOut = result.scheduledCheckout as Date
      expect(checkOut.toISOString()).toBe('2026-06-04T16:00:00.000Z')
    })

    it('bookingLeadDays = arrival - inserted_at', () => {
      // 2026-05-22 → 2026-06-01 = 10 days
      expect(result.bookingLeadDays).toBe(10)
    })

    it('channexLastSyncAt = inserted_at', () => {
      const sync = result.channexLastSyncAt as Date
      expect(sync.toISOString()).toBe('2026-05-22T18:00:00.000Z')
    })
  })

  describe('payment_collect mapping', () => {
    it('payment_collect=ota → OTA_COLLECT + PAID + amountPaid=total', () => {
      const result = ChannexBookingMapper.toGuestStayCreate({
        revision: makeRevision({ payment_collect: 'ota' }),
        propertyId: 'prop-1',
        organizationId: 'org-1',
        propertyTimezone: 'America/Cancun',
        roomId: 'room-a1',
        channexConflict: false,
      })
      expect(result.paymentModel).toBe('OTA_COLLECT')
      expect(result.paymentStatus).toBe('PAID')
      expect(new Prisma.Decimal(result.amountPaid as Prisma.Decimal).toFixed(2)).toBe('450.00')
      expect((result.notes as string | null) ?? '').toContain('Payment collected by OTA')
    })

    it('payment_collect=null → HOTEL_COLLECT default', () => {
      const result = ChannexBookingMapper.toGuestStayCreate({
        revision: makeRevision({ payment_collect: undefined }),
        propertyId: 'prop-1',
        organizationId: 'org-1',
        propertyTimezone: 'America/Cancun',
        roomId: 'room-a1',
        channexConflict: false,
      })
      expect(result.paymentModel).toBe('HOTEL_COLLECT')
    })
  })

  describe('fallbacks', () => {
    it('cuando amount falta, suma rooms[].days', () => {
      const result = ChannexBookingMapper.toGuestStayCreate({
        revision: makeRevision({ amount: undefined }),
        propertyId: 'prop-1',
        organizationId: 'org-1',
        propertyTimezone: 'America/Cancun',
        roomId: 'room-a1',
        channexConflict: false,
      })
      expect(new Prisma.Decimal(result.totalAmount as Prisma.Decimal).toFixed(2)).toBe('450.00')
    })

    it('arrival_hour ausente → 15:00 local default (Mews/AHLEI std)', () => {
      const result = ChannexBookingMapper.toGuestStayCreate({
        revision: makeRevision({ arrival_hour: undefined }),
        propertyId: 'prop-1',
        organizationId: 'org-1',
        propertyTimezone: 'America/Cancun',
        roomId: 'room-a1',
        channexConflict: false,
      })
      const checkIn = result.checkinAt as Date
      expect(checkIn.toISOString()).toBe('2026-06-01T20:00:00.000Z') // 15:00 -5 = 20:00 UTC
    })

    it('customer sin nombre + room.guests con nombre → usa room.guests', () => {
      const result = ChannexBookingMapper.toGuestStayCreate({
        revision: makeRevision({
          customer: { mail: 'x@y.com' },
          rooms: [
            {
              amount: '450.00',
              checkin_date: '2026-06-01',
              checkout_date: '2026-06-04',
              rate_plan_id: 'rate-bar',
              room_type_id: 'rt-standard',
              occupancy: { adults: 2, children: 0, infants: 0 },
              guests: [{ name: 'Carlos', surname: 'Lopez' }],
            },
          ],
        }),
        propertyId: 'prop-1',
        organizationId: 'org-1',
        propertyTimezone: 'America/Cancun',
        roomId: 'room-a1',
        channexConflict: false,
      })
      expect(result.guestName).toBe('Carlos Lopez')
    })

    it('sin nombre en ningún lugar → fallback "Guest <ota_code>"', () => {
      const result = ChannexBookingMapper.toGuestStayCreate({
        revision: makeRevision({
          customer: undefined,
          rooms: [
            {
              amount: '450.00',
              checkin_date: '2026-06-01',
              checkout_date: '2026-06-04',
              rate_plan_id: 'rate-bar',
              room_type_id: 'rt-standard',
              occupancy: { adults: 2, children: 0, infants: 0 },
            },
          ],
        }),
        propertyId: 'prop-1',
        organizationId: 'org-1',
        propertyTimezone: 'America/Cancun',
        roomId: 'room-a1',
        channexConflict: false,
      })
      expect(result.guestName).toBe('Guest BDC-1234')
    })
  })

  describe('static helpers', () => {
    it('computeNights cuenta días entre arrival y departure', () => {
      expect(ChannexBookingMapper.computeNights('2026-06-01', '2026-06-04')).toBe(3)
      expect(ChannexBookingMapper.computeNights('2026-06-01', '2026-06-02')).toBe(1)
      expect(ChannexBookingMapper.computeNights('2026-06-01', '2026-06-01')).toBe(0)
    })

    it('derivePaymentModel maneja channel (undocumented) como OTA_COLLECT', () => {
      expect(ChannexBookingMapper.derivePaymentModel('ota')).toBe('OTA_COLLECT')
      expect(ChannexBookingMapper.derivePaymentModel('channel')).toBe('OTA_COLLECT')
      expect(ChannexBookingMapper.derivePaymentModel('property')).toBe('HOTEL_COLLECT')
      expect(ChannexBookingMapper.derivePaymentModel(undefined)).toBe('HOTEL_COLLECT')
    })

    it('combineDateAndHour respeta timezone IANA (Buenos Aires UTC-3)', () => {
      const result = ChannexBookingMapper.combineDateAndHour(
        '2026-06-01',
        '14:00',
        'America/Argentina/Buenos_Aires',
        'checkin',
      )
      // 14:00 ART (UTC-3) → 17:00 UTC
      expect(result.toISOString()).toBe('2026-06-01T17:00:00.000Z')
    })
  })
})
