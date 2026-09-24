import { PrismaClient } from '@prisma/client'

/**
 * 🔴 LA PRUEBA QUE JUSTIFICA LA DECISIÓN DE DISEÑO, contra base real.
 *
 * La opción obvia era una tabla `inventory_holds` aparte. Se descartó porque
 * quedaría FUERA de la restricción `stay_segments_sin_solape` —lo único que
 * hace la sobreventa imposible en vez de improbable— y sería una segunda
 * fuente de ocupación que cada consulta nueva tendría que recordar.
 *
 * La decisión fue: **una retención es un `StaySegment` con estado PENDING**.
 * Eso sólo vale si PENDING de verdad ocupa inventario en las dos capas. Aquí
 * se comprueba ejecutándolo, no leyendo el código:
 *
 *   1. La restricción de exclusión rechaza un solape contra un PENDING.
 *   2. Cancelar la retención libera la habitación de verdad.
 *
 * Sin estas dos, la decisión sería una suposición razonable — que es
 * exactamente lo que nos costó el defecto anterior.
 */
describe('retención = segmento PENDING — integración BD real', () => {
  const prisma = new PrismaClient()
  const ts = Date.now().toString()
  let org: any, prop: any, roomType: any, room: any, journey: any, stay: any, staff: any

  const noche = (d: string) => new Date(`${d}T00:00:00Z`)

  beforeAll(async () => {
    org = await prisma.organization.create({
      data: { name: 'Hold ITest Org', slug: `hold-itest-${ts}`, countryCode: 'MX', currency: 'MXN' },
    })
    prop = await prisma.property.create({
      data: { organizationId: org.id, name: 'Hold ITest Prop', type: 'HOTEL' },
    })
    roomType = await prisma.roomType.create({
      data: {
        organizationId: org.id, propertyId: prop.id, name: 'Suite ITest',
        code: `SUITE-${ts}`, maxOccupancy: 2, baseRate: 1000, amenities: [],
      },
    })
    room = await prisma.room.create({
      data: {
        organizationId: org.id, propertyId: prop.id, number: `HOLD-${ts}`,
        category: 'PRIVATE', capacity: 2, roomTypeId: roomType.id,
      },
    })
    // `GuestStay.checkedInById` es obligatorio: toda estancia la registra
    // alguien. El motor público usa un empleado de sistema para las reservas
    // web; aquí se replica esa misma idea.
    staff = await prisma.staff.create({
      data: {
        organizationId: org.id, propertyId: prop.id,
        name: 'Sistema ITest', email: `itest-hold-${ts}@zenix.test`,
        role: 'SUPERVISOR', passwordHash: 'x',
      } as never,
    })
    stay = await prisma.guestStay.create({
      data: {
        organizationId: org.id, propertyId: prop.id, roomId: room.id,
        guestName: 'Retención de prueba', paxCount: 2,
        checkinAt: noche('2027-03-10'), scheduledCheckout: noche('2027-03-13'),
        ratePerNight: 1000, currency: 'MXN', totalAmount: 3000,
        source: 'DIRECT_WEB',
        checkedInById: staff.id,
        // La retención: caduca, y por eso ocupa sólo un rato.
        holdExpiresAt: new Date(Date.now() + 15 * 60_000),
      } as never,
    })
    journey = await prisma.stayJourney.create({
      data: {
        organizationId: org.id, propertyId: prop.id, guestStayId: stay.id,
        guestName: 'Retención de prueba',
        journeyCheckIn: noche('2027-03-10'), journeyCheckOut: noche('2027-03-13'),
      } as never,
    })
    await prisma.staySegment.create({
      data: {
        journeyId: journey.id, roomId: room.id, guestStayId: stay.id,
        checkIn: noche('2027-03-10'), checkOut: noche('2027-03-13'),
        status: 'PENDING', reason: 'ORIGINAL',
      },
    })
  })

  afterAll(async () => {
    await prisma.staySegment.deleteMany({ where: { roomId: room.id } })
    await prisma.stayJourney.deleteMany({ where: { propertyId: prop.id } })
    await prisma.guestStay.deleteMany({ where: { propertyId: prop.id } })
    await prisma.room.deleteMany({ where: { propertyId: prop.id } })
    await prisma.staff.deleteMany({ where: { propertyId: prop.id } })
    await prisma.roomType.deleteMany({ where: { propertyId: prop.id } })
    await prisma.property.deleteMany({ where: { id: prop.id } })
    await prisma.organization.deleteMany({ where: { id: org.id } })
    await prisma.$disconnect()
  })

  const crearSegmento = (desde: string, hasta: string, status: 'PENDING' | 'ACTIVE' = 'ACTIVE') =>
    prisma.staySegment.create({
      data: {
        journeyId: journey.id, roomId: room.id,
        checkIn: noche(desde), checkOut: noche(hasta), status, reason: 'ORIGINAL',
      },
    })

  it('🔴 la restricción RECHAZA vender encima de una retención', async () => {
    // Si esto pasara, la retención no retendría nada y la decisión de diseño
    // entera sería falsa.
    await expect(crearSegmento('2027-03-11', '2027-03-12')).rejects.toThrow(
      /stay_segments_sin_solape|exclusion|conflict/i,
    )
  })

  it('rechaza también el solape parcial por ambos lados', async () => {
    await expect(crearSegmento('2027-03-08', '2027-03-11')).rejects.toThrow(/sin_solape|exclusion|conflict/i)
    await expect(crearSegmento('2027-03-12', '2027-03-15')).rejects.toThrow(/sin_solape|exclusion|conflict/i)
  })

  it('la rotación del día de salida SÍ se permite: la noche de salida no se vende', async () => {
    // Intervalo semiabierto `[entrada, salida)`. El huésped sale el 13 y otro
    // entra el 13: no comparten ninguna noche.
    const s = await crearSegmento('2027-03-13', '2027-03-16')
    expect(s.id).toBeTruthy()
    await prisma.staySegment.delete({ where: { id: s.id } })
  })

  it('🔑 liberada la retención, la habitación vuelve a venderse', async () => {
    // Es lo que hace el liberador cuando caduca: CANCELLED, no borrar.
    await prisma.staySegment.updateMany({
      where: { guestStayId: stay.id },
      data: { status: 'CANCELLED' },
    })

    const nuevo = await crearSegmento('2027-03-11', '2027-03-12')
    expect(nuevo.id).toBeTruthy()

    // Y la historia se conserva: la retención caducada sigue ahí, cancelada.
    const historica = await prisma.staySegment.findFirst({ where: { guestStayId: stay.id } })
    expect(historica?.status).toBe('CANCELLED')

    await prisma.staySegment.delete({ where: { id: nuevo.id } })
    await prisma.staySegment.updateMany({ where: { guestStayId: stay.id }, data: { status: 'PENDING' } })
  })
})
