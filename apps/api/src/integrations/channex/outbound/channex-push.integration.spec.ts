/**
 * Channex push — INTEGRACIÓN DE BD REAL (regresión de los bugs de cert PMS).
 *
 * Por qué existe: los bugs encontrados durante la certificación (disponibilidad
 * 0/1 por doble conteo GuestStay+StaySegment, resolución de rate plan por par
 * roomType×ratePlan, min_stay→min_stay_through) NO los atrapaban los unit tests
 * porque MOCKEABAN Prisma con datos no realistas. Este spec usa **BD real**
 * (CI levanta Postgres + migraciones + seed) y ejerce el **codepath real** de
 * los servicios, asegurando que los datos calculados que se empujan a Channex
 * son correctos contra el invariante real del esquema (§137: cada reserva =
 * GuestStay + StayJourney + StaySegment ORIGINAL).
 *
 * Estándar: integration test a nivel servicio contra BD real, fixtures aislados
 * con timestamp + cleanup en orden inverso de FKs (mismo patrón que
 * access-control.service.spec). Se asercionan los EVENTOS de dominio emitidos
 * (lo que define qué se manda a Channex); el transporte HTTP es capa fina ya
 * cubierta por el gateway + el spec opt-in de sandbox.
 */
import { PrismaClient } from '@prisma/client'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AvailabilityService } from '../../../pms/availability/availability.service'
import { RatesService } from '../../../pms/rates/rates.service'
import {
  CHANNEX_AVAILABILITY_CHANGED,
  CHANNEX_RESTRICTION_UPDATED,
} from './channex-outbound-events'

describe('Channex push — integración BD real (regresión bugs cert)', () => {
  const prisma = new PrismaClient()
  const events = new EventEmitter2()
  const channex = { enabled: true } as any
  // RatesService usa TenantContext.getOrganizationId() — stub que devuelve el org del fixture.
  const ts = Date.now().toString()
  const CHX_PROP = `itest-chxprop-${ts}`
  const CHX_RT = `itest-chxrt-${ts}`
  const CHX_RP_BAR = `itest-chxrp-bar-${ts}`
  const CHX_RP_BB = `itest-chxrp-bb-${ts}`

  let org: any, prop: any, roomType: any, planBar: any, planBb: any
  const rooms: any[] = []
  let availSvc: AvailabilityService
  let ratesSvc: RatesService
  let emitSpy: jest.SpyInstance

  beforeAll(async () => {
    org = await prisma.organization.create({
      data: { name: 'PushITest Org', slug: `push-itest-${ts}`, countryCode: 'MX', currency: 'USD' },
    })
    prop = await prisma.property.create({
      data: { organizationId: org.id, name: 'PushITest Prop', type: 'HOTEL' },
    })
    await prisma.propertySettings.create({
      data: { propertyId: prop.id, channexPropertyId: CHX_PROP, timezone: 'America/Cancun' },
    })
    roomType = await prisma.roomType.create({
      data: { organizationId: org.id, propertyId: prop.id, name: 'Twin ITest', code: `TWIN-${ts}`, maxOccupancy: 2, baseRate: 100, amenities: [] },
    })
    // 5 cuartos físicos, todos del MISMO room type Channex (modelo hotel).
    for (let i = 1; i <= 5; i++) {
      rooms.push(
        await prisma.room.create({
          data: { organizationId: org.id, propertyId: prop.id, number: `IT${i}-${ts}`, category: 'PRIVATE', capacity: 2, roomTypeId: roomType.id, channexRoomTypeId: CHX_RT },
        }),
      )
    }
    // Rate plans + links (par roomType×ratePlan → channex rate_plan_id).
    planBar = await prisma.ratePlan.create({ data: { propertyId: prop.id, code: `BAR-${ts}`, name: 'BAR ITest', baseStrategy: 'FIXED', baseRate: 100 } })
    planBb = await prisma.ratePlan.create({ data: { propertyId: prop.id, code: `BB-${ts}`, name: 'B&B ITest', baseStrategy: 'FIXED', baseRate: 120 } })
    await prisma.channexRatePlanLink.create({ data: { propertyId: prop.id, roomTypeId: roomType.id, ratePlanId: planBar.id, channexRatePlanId: CHX_RP_BAR } })
    await prisma.channexRatePlanLink.create({ data: { propertyId: prop.id, roomTypeId: roomType.id, ratePlanId: planBb.id, channexRatePlanId: CHX_RP_BB } })

    availSvc = new AvailabilityService(prisma as any, channex, events)
    const tenantStub = { getOrganizationId: () => org.id } as any
    ratesSvc = new RatesService(prisma as any, tenantStub, events)
  })

  beforeEach(() => {
    emitSpy = jest.spyOn(events, 'emit')
  })

  afterEach(async () => {
    emitSpy.mockRestore()
    // Limpiar bookings + overrides/restricciones entre tests (cuentas predecibles).
    const roomIds = rooms.map((r) => r.id)
    await prisma.staySegment.deleteMany({ where: { roomId: { in: roomIds } } })
    await prisma.stayJourney.deleteMany({ where: { propertyId: prop.id } })
    await prisma.guestStay.deleteMany({ where: { propertyId: prop.id } })
    await prisma.rateOverride.deleteMany({ where: { propertyId: prop.id } })
    await prisma.rateRestriction.deleteMany({ where: { ratePlanId: { in: [planBar.id, planBb.id] } } })
  })

  afterAll(async () => {
    const roomIds = rooms.map((r) => r.id)
    await prisma.staySegment.deleteMany({ where: { roomId: { in: roomIds } } })
    await prisma.stayJourney.deleteMany({ where: { propertyId: prop.id } })
    await prisma.guestStay.deleteMany({ where: { propertyId: prop.id } })
    await prisma.rateOverride.deleteMany({ where: { propertyId: prop.id } })
    await prisma.rateRestriction.deleteMany({ where: { ratePlanId: { in: [planBar.id, planBb.id] } } })
    await prisma.channexRatePlanLink.deleteMany({ where: { propertyId: prop.id } })
    await prisma.ratePlan.deleteMany({ where: { propertyId: prop.id } })
    await prisma.room.deleteMany({ where: { propertyId: prop.id } })
    await prisma.roomType.deleteMany({ where: { propertyId: prop.id } })
    await prisma.propertySettings.deleteMany({ where: { propertyId: prop.id } })
    await prisma.property.deleteMany({ where: { id: prop.id } })
    await prisma.organization.delete({ where: { id: org.id } })
    await prisma.$disconnect()
  })

  // Crea una reserva REALISTA: GuestStay + StayJourney + StaySegment ORIGINAL
  // (el invariante §137 que los unit tests no representaban).
  async function makeBooking(roomId: string, checkIn: Date, checkOut: Date) {
    const stay = await prisma.guestStay.create({
      data: { organizationId: org.id, propertyId: prop.id, roomId, guestName: 'ITest Guest', checkinAt: checkIn, scheduledCheckout: checkOut, ratePerNight: 100, totalAmount: 100, checkedInById: 'itest' },
    })
    const journey = await prisma.stayJourney.create({
      data: { organizationId: org.id, propertyId: prop.id, guestStayId: stay.id, guestName: 'ITest Guest', journeyCheckIn: checkIn, journeyCheckOut: checkOut },
    })
    await prisma.staySegment.create({
      data: { journeyId: journey.id, roomId, checkIn, checkOut, status: 'ACTIVE', reason: 'ORIGINAL', guestStayId: stay.id },
    })
    return stay
  }

  function lastEvent(name: string) {
    const call = [...emitSpy.mock.calls].reverse().find((c) => c[0] === name)
    return call ? call[1] : null
  }

  const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

  // ── DISPONIBILIDAD (regresión doble conteo) ────────────────────────────────
  it('1 reserva (GuestStay + segmento ORIGINAL) → availability 4, NO 0 ni 3', async () => {
    const ci = D(2027, 3, 10), co = D(2027, 3, 11)
    await makeBooking(rooms[0].id, ci, co)

    await availSvc.notifyReservation({ roomId: rooms[0].id, from: ci, to: co, reason: 'RESERVATION', traceId: 'it-1' })

    const ev = lastEvent(CHANNEX_AVAILABILITY_CHANGED)
    expect(ev).not.toBeNull()
    const entry = ev.entries.find((e: any) => e.date === '2027-03-10')
    expect(entry).toBeDefined()
    expect(entry.propertyId).toBe(CHX_PROP)
    expect(entry.roomTypeId).toBe(CHX_RT)
    // 5 cuartos − 1 reserva = 4. El bug daba 0 (hardcode) o 3 (doble conteo).
    expect(entry.availability).toBe(4)
  })

  it('2 reservas en cuartos distintos, misma noche → availability 3', async () => {
    const ci = D(2027, 3, 10), co = D(2027, 3, 11)
    await makeBooking(rooms[0].id, ci, co)
    await makeBooking(rooms[1].id, ci, co)

    await availSvc.notifyReservation({ roomId: rooms[1].id, from: ci, to: co, reason: 'RESERVATION', traceId: 'it-2' })

    const ev = lastEvent(CHANNEX_AVAILABILITY_CHANGED)
    const entry = ev.entries.find((e: any) => e.date === '2027-03-10')
    expect(entry.availability).toBe(3) // 5 − 2
  })

  it('reserva cancelada NO ocupa → availability vuelve a 5', async () => {
    const ci = D(2027, 3, 10), co = D(2027, 3, 11)
    const stay = await makeBooking(rooms[0].id, ci, co)
    await prisma.guestStay.update({ where: { id: stay.id }, data: { cancelledAt: new Date() } })

    await availSvc.notifyRelease({ roomId: rooms[0].id, from: ci, to: co, reason: 'CANCELLATION', traceId: 'it-3' })

    const ev = lastEvent(CHANNEX_AVAILABILITY_CHANGED)
    const entry = ev.entries.find((e: any) => e.date === '2027-03-10')
    expect(entry.availability).toBe(5) // cancelada libera inventario
  })

  // ── RATES & RESTRICTIONS (regresión resolución de rate plan + min_stay) ─────
  it('rate por par roomType×ratePlan → resuelve el channex rate_plan_id correcto (BAR vs B&B)', async () => {
    await ratesSvc.applyRatesAndRestrictions(prop.id, 'itest', [
      { roomTypeId: roomType.id, ratePlanId: planBar.id, dateFrom: D(2026, 11, 22), dateTo: D(2026, 11, 22), rate: 333 },
      { roomTypeId: roomType.id, ratePlanId: planBb.id, dateFrom: D(2026, 11, 29), dateTo: D(2026, 11, 29), rate: 456.23 },
    ])

    const ev = lastEvent(CHANNEX_RESTRICTION_UPDATED)
    expect(ev).not.toBeNull()
    const bar = ev.entries.find((e: any) => e.ratePlanId === CHX_RP_BAR)
    const bb = ev.entries.find((e: any) => e.ratePlanId === CHX_RP_BB)
    expect(bar).toBeDefined()
    expect(bb).toBeDefined()
    expect(bar.rate).toBe(333)
    expect(bb.rate).toBe(456.23) // decimal preservado
    // Cada plan a su rate_plan_id (no se confunden BAR y B&B)
    expect(bar.ratePlanId).not.toBe(bb.ratePlanId)
  })

  it('min stay se envía como min_stay_through (no min_stay plano)', async () => {
    await ratesSvc.applyRatesAndRestrictions(prop.id, 'itest', [
      { roomTypeId: roomType.id, ratePlanId: planBar.id, dateFrom: D(2026, 11, 23), dateTo: D(2026, 11, 23), minStay: 3 },
    ])

    const ev = lastEvent(CHANNEX_RESTRICTION_UPDATED)
    const entry = ev.entries.find((e: any) => e.ratePlanId === CHX_RP_BAR)
    expect(entry.minStayThrough).toBe(3)
    expect(entry.minStay).toBeUndefined() // NO se manda min_stay plano
  })
})
