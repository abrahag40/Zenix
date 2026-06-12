import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PublicReservationsService } from './public-reservations.service'

/**
 * BOOKING-ENGINE B7 — reservas públicas + AISLAMIENTO MULTI-TENANT.
 *
 * Verifica la pregunta del owner: ¿el sistema detecta a qué hotel y qué
 * habitaciones se reserva, con multi-tenancy? Sí:
 *   · El hotel se resuelve del SLUG (hosted) o de la API key — server-side.
 *   · Cada roomTypeId se valida `propertyId: property.id` → un tipo de OTRO
 *     hotel se rechaza (cross-tenant isolation).
 *   · El organizationId se toma de la property resuelta, NUNCA del cliente.
 */
describe('PublicReservationsService', () => {
  let prisma: any
  let tx: any
  let availability: any
  let service: PublicReservationsService

  // Hotel A (el de la reserva) y su tipo de habitación.
  const propertyA = {
    id: 'prop-A', organizationId: 'org-1', propCode: '001',
    settings: { timezone: 'America/Cancun' },
    legalEntity: { countryCode: 'MX', baseCurrency: 'MXN' },
    bookingEngineConfig: { enabled: true, paymentPolicy: 'PAY_AT_HOTEL', displayCurrency: 'MXN' },
  }
  const roomTypeA = {
    id: 'rt-A', name: 'Estándar', maxOccupancy: 2, baseRate: new Prisma.Decimal(100), currency: 'USD',
    rooms: [{ id: 'room-A1', number: '101' }],
  }

  const dto = (roomTypeId = 'rt-A', adults = 2) => ({
    guest: { name: 'Test Guest' },
    rooms: [{ roomTypeId, checkIn: '2026-09-01', checkOut: '2026-09-03', adults }],
  })

  beforeEach(() => {
    tx = {
      guestStay: { create: jest.fn().mockResolvedValue({ id: 's1', roomId: 'room-A1', checkinAt: new Date(), scheduledCheckout: new Date(), guestName: 'Test Guest', guestEmail: null }), count: jest.fn().mockResolvedValue(0) },
      stayJourney: { create: jest.fn().mockResolvedValue({ id: 'j1' }) },
      staySegment: { create: jest.fn().mockResolvedValue({}) },
      reservationGroup: { create: jest.fn().mockResolvedValue({ id: 'g1' }) },
    }
    prisma = {
      bookingEngineConfig: { findUnique: jest.fn() },
      bookingIdempotencyRecord: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      property: { findUnique: jest.fn().mockResolvedValue(propertyA) },
      roomType: { findFirst: jest.fn() },
      guestStay: { findFirst: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
    }
    availability = { check: jest.fn().mockResolvedValue({ available: true }) }
    const notifications = { emit: jest.fn() }
    const systemStaff = { getOrCreate: jest.fn().mockResolvedValue('staff-sys') }
    const events = { emit: jest.fn() }
    service = new PublicReservationsService(prisma, availability, notifications as any, systemStaff as any, events as any)
  })

  it('detecta el hotel por SLUG y crea la reserva con source=DIRECT_WEB', async () => {
    prisma.bookingEngineConfig.findUnique.mockResolvedValue({ propertyId: 'prop-A', enabled: true })
    prisma.roomType.findFirst.mockResolvedValue(roomTypeA)

    const r: any = await service.createReservationBySlug('hotel-a', dto(), 'idem-1')

    // El config se resolvió por slug → property A.
    expect(prisma.bookingEngineConfig.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'hotel-a' } }))
    // La GuestStay se creó con la org de la property (no del cliente) + DIRECT_WEB.
    const created = tx.guestStay.create.mock.calls[0][0].data
    expect(created.organizationId).toBe('org-1')
    expect(created.propertyId).toBe('prop-A')
    expect(created.source).toBe('DIRECT_WEB')
    expect(created.paymentModel).toBe('HOTEL_COLLECT')
    expect(r.reservationRef).toMatch(/^MX-W-001-/)
  })

  it('AISLAMIENTO: un roomTypeId de OTRO hotel se rechaza (cross-tenant)', async () => {
    prisma.bookingEngineConfig.findUnique.mockResolvedValue({ propertyId: 'prop-A', enabled: true })
    // El query roomType.findFirst incluye `propertyId: prop-A`; un tipo de otro
    // hotel no matchea → null. Simulamos exactamente eso.
    prisma.roomType.findFirst.mockResolvedValue(null)

    await expect(service.createReservationBySlug('hotel-a', dto('rt-DE-OTRO-HOTEL'), 'idem-x'))
      .rejects.toBeInstanceOf(NotFoundException)
    // El where SIEMPRE scopea por la property resuelta.
    expect(prisma.roomType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'rt-DE-OTRO-HOTEL', propertyId: 'prop-A' }) }),
    )
    expect(tx.guestStay.create).not.toHaveBeenCalled()
  })

  it('rechaza si pax excede la capacidad del tipo (400)', async () => {
    prisma.bookingEngineConfig.findUnique.mockResolvedValue({ propertyId: 'prop-A', enabled: true })
    prisma.roomType.findFirst.mockResolvedValue(roomTypeA) // maxOccupancy 2
    await expect(service.createReservationBySlug('hotel-a', dto('rt-A', 4), 'idem-cap'))
      .rejects.toBeInstanceOf(BadRequestException)
  })

  it('rechaza 409 si no hay habitación libre del tipo', async () => {
    prisma.bookingEngineConfig.findUnique.mockResolvedValue({ propertyId: 'prop-A', enabled: true })
    prisma.roomType.findFirst.mockResolvedValue(roomTypeA)
    availability.check.mockResolvedValue({ available: false })
    await expect(service.createReservationBySlug('hotel-a', dto(), 'idem-409'))
      .rejects.toBeInstanceOf(ConflictException)
  })

  it('idempotencia: misma key + mismo body → devuelve la respuesta cacheada sin crear de nuevo', async () => {
    prisma.bookingEngineConfig.findUnique.mockResolvedValue({ propertyId: 'prop-A', enabled: true })
    prisma.bookingIdempotencyRecord.findUnique.mockResolvedValue({
      requestHash: require('crypto').createHash('sha256').update(JSON.stringify(dto())).digest('hex'),
      responseJson: { reservationRef: 'CACHED' },
    })
    const r: any = await service.createReservationBySlug('hotel-a', dto(), 'idem-dup')
    expect(r.reservationRef).toBe('CACHED')
    expect(prisma.property.findUnique).not.toHaveBeenCalled()
  })

  it('idempotencia: misma key + body DISTINTO → 409', async () => {
    prisma.bookingEngineConfig.findUnique.mockResolvedValue({ propertyId: 'prop-A', enabled: true })
    prisma.bookingIdempotencyRecord.findUnique.mockResolvedValue({ requestHash: 'OTRO_HASH', responseJson: {} })
    await expect(service.createReservationBySlug('hotel-a', dto(), 'idem-conflict'))
      .rejects.toBeInstanceOf(ConflictException)
  })

  it('slug inexistente o motor apagado → 404 (no filtra existencia)', async () => {
    prisma.bookingEngineConfig.findUnique.mockResolvedValue(null)
    await expect(service.createReservationBySlug('no-existe', dto(), 'idem')).rejects.toBeInstanceOf(NotFoundException)
    prisma.bookingEngineConfig.findUnique.mockResolvedValue({ propertyId: 'prop-A', enabled: false })
    await expect(service.createReservationBySlug('apagado', dto(), 'idem')).rejects.toBeInstanceOf(NotFoundException)
  })
})
