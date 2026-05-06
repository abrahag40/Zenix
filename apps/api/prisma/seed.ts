import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Zenix seed — organización "Zenix Demo" con DOS hoteles del mismo tenant:
 *
 *   1. Hotel Tulum  (prop-hotel-tulum-001) — 22 habitaciones en 3 pisos +
 *      cabañas. Recibe el set completo de escenarios operativos vía SQL fixture.
 *      Plantilla realista: 1 supervisor, 2 recepcionistas, 4 HK, 1 mantenimiento.
 *
 *   2. Hotel Cancún (prop-hotel-cancun-001) — 8 habitaciones, banco de pruebas
 *      de aislamiento entre propiedades. 1 supervisor, 1 recepcionista, 2 HK,
 *      1 mantenimiento.
 *
 * Credenciales de acceso (todas activas, password '123456'):
 *   ── Tulum ────────────────────────────────────────────────────────────────
 *   s@z.co    (Supervisor   · Ana García)
 *   r@z.co    (Recepción    · Carlos López   · turno mañana)
 *   r2@z.co   (Recepción    · Sofía Martínez · turno tarde)
 *   m@z.co    (Housekeeper  · María Torres   · mañana Lun-Vie  piso 1)
 *   v@z.co    (Housekeeper  · Valentina Cruz · mañana Lun-Sáb  piso 2)
 *   p@z.co    (Housekeeper  · Pedro Ramírez  · tarde  Mar-Sáb  piso 3)
 *   d@z.co    (Housekeeper  · Diego Flores   · tarde  Lun-Vie  cabañas)
 *   j@z.co    (Mantenimiento · Javier Ruiz   · Lun-Vie 08-17)
 *   ── Cancún ───────────────────────────────────────────────────────────────
 *   sc@z.co   (Supervisor   · Rodrigo Vega)
 *   rc@z.co   (Recepción    · Laura Mendez)
 *   l@z.co    (Housekeeper  · Luis Herrera   · pisos 2)
 *   c@z.co    (Housekeeper  · Carmen Silva   · pisos 3-4)
 *   rb@z.co   (Mantenimiento · Roberto Díaz  · Lun-Sáb 08-17)
 */

const prisma = new PrismaClient()
const hash = (pw: string) => bcrypt.hash(pw, 12)

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Days-offset helper for constructing guest-stay check-in/out timestamps
 * relative to the current date. All times normalize to noon UTC so they sit
 * inside the timeline grid regardless of local timezone.
 */
function daysFromNow(days: number, hour = 12): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Zenix seed — starting…\n')

  // 0. CLEANUP LEGACY (phase 1 — delete data that doesn't gate on the new
  // property existing). Previous seeds used `seed-property-1`; retire it
  // so the timeline shows only the Tulum/Cancún dataset. Phase 2 (deleting
  // the property row itself) runs later, after the new properties exist
  // and staff have been re-homed.
  const legacyPropertyId = 'seed-property-1'
  await prisma.guestStay.deleteMany({ where: { propertyId: legacyPropertyId } })
  await prisma.cleaningTask.deleteMany({ where: { unit: { room: { propertyId: legacyPropertyId } } } })
  await prisma.unit.deleteMany({ where: { room: { propertyId: legacyPropertyId } } })
  await prisma.room.deleteMany({ where: { propertyId: legacyPropertyId } })
  await prisma.roomType.deleteMany({ where: { propertyId: legacyPropertyId } })
  await prisma.propertySettings.deleteMany({ where: { propertyId: legacyPropertyId } })

  // 1. ORGANIZATION ─────────────────────────────────────────────────────────
  // Upsert by id so re-running the seed renames the old `demo-org` → `zenix-demo`
  // in-place without creating a second tenant.
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org-1' },
    update: { name: 'Zenix Demo', slug: 'zenix-demo' },
    create: {
      id: 'seed-org-1',
      name: 'Zenix Demo',
      slug: 'zenix-demo',
      plan: 'STARTER',
      countryCode: 'MX',
      timezone: 'America/Cancun',
      currency: 'USD',
    },
  })
  console.log(`✅ Org: ${org.name}`)

  // 2. PROPERTIES ───────────────────────────────────────────────────────────
  const tulum = await prisma.property.upsert({
    where: { id: 'prop-hotel-tulum-001' },
    update: { name: 'Hotel Tulum', region: 'Riviera Maya', city: 'Tulum' },
    create: {
      id: 'prop-hotel-tulum-001',
      organizationId: org.id,
      name: 'Hotel Tulum',
      type: 'HOTEL',
      region: 'Riviera Maya',
      city: 'Tulum',
    },
  })
  const cancun = await prisma.property.upsert({
    where: { id: 'prop-hotel-cancun-001' },
    update: { name: 'Hotel Cancún', region: 'Zona Hotelera Cancún', city: 'Cancún' },
    create: {
      id: 'prop-hotel-cancun-001',
      organizationId: org.id,
      name: 'Hotel Cancún',
      type: 'HOTEL',
      region: 'Zona Hotelera Cancún',
      city: 'Cancún',
    },
  })
  console.log(`✅ Properties: ${tulum.name}, ${cancun.name}`)

  // 3. ROOM TYPES ───────────────────────────────────────────────────────────

  async function upsertRoomType(args: {
    propertyId: string
    name: string
    code: string
    maxOccupancy: number
    baseRate: number
    amenities: string[]
  }) {
    return prisma.roomType.upsert({
      where: { propertyId_code: { propertyId: args.propertyId, code: args.code } },
      update: {
        name: args.name,
        maxOccupancy: args.maxOccupancy,
        baseRate: args.baseRate,
        amenities: args.amenities,
      },
      create: {
        organizationId: org.id,
        propertyId: args.propertyId,
        name: args.name,
        code: args.code,
        maxOccupancy: args.maxOccupancy,
        baseRate: args.baseRate,
        currency: 'USD',
        amenities: args.amenities,
      },
    })
  }

  const [tStd, tSup, tJrSuite, tSuite, tCabin] = await Promise.all([
    upsertRoomType({ propertyId: tulum.id, name: 'Estándar',    code: 'STD', maxOccupancy: 2, baseRate:  70, amenities: ['WiFi', 'AC', 'TV'] }),
    upsertRoomType({ propertyId: tulum.id, name: 'Superior',    code: 'SUP', maxOccupancy: 2, baseRate: 110, amenities: ['WiFi', 'AC', 'TV', 'Minibar'] }),
    upsertRoomType({ propertyId: tulum.id, name: 'Junior Suite', code: 'JRS', maxOccupancy: 3, baseRate: 180, amenities: ['WiFi', 'AC', 'TV', 'Balcón'] }),
    upsertRoomType({ propertyId: tulum.id, name: 'Suite',        code: 'STE', maxOccupancy: 4, baseRate: 280, amenities: ['WiFi', 'AC', 'TV', 'Jacuzzi', 'Balcón'] }),
    upsertRoomType({ propertyId: tulum.id, name: 'Cabaña',       code: 'CAB', maxOccupancy: 2, baseRate: 130, amenities: ['WiFi', 'Fan', 'Hammock', 'Private garden'] }),
  ])

  const [cStd, cSup, cSuite] = await Promise.all([
    upsertRoomType({ propertyId: cancun.id, name: 'Estándar', code: 'STD', maxOccupancy: 2, baseRate: 100, amenities: ['WiFi', 'AC', 'TV'] }),
    upsertRoomType({ propertyId: cancun.id, name: 'Superior', code: 'SUP', maxOccupancy: 3, baseRate: 150, amenities: ['WiFi', 'AC', 'TV', 'Ocean View'] }),
    upsertRoomType({ propertyId: cancun.id, name: 'Suite',    code: 'STE', maxOccupancy: 4, baseRate: 250, amenities: ['WiFi', 'AC', 'TV', 'Jacuzzi', 'Ocean View'] }),
  ])
  console.log(`✅ RoomTypes: Tulum(${5}), Cancún(${3})`)

  // 4. ROOMS ────────────────────────────────────────────────────────────────

  async function upsertRoom(args: {
    propertyId: string
    number: string
    floor: number | null
    category: 'PRIVATE' | 'SHARED'
    capacity: number
    roomTypeId: string
    status?: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING'
  }) {
    return prisma.room.upsert({
      where: { propertyId_number: { propertyId: args.propertyId, number: args.number } },
      update: { floor: args.floor, capacity: args.capacity, roomTypeId: args.roomTypeId },
      create: {
        organizationId: org.id,
        propertyId: args.propertyId,
        number: args.number,
        floor: args.floor,
        category: args.category,
        capacity: args.capacity,
        roomTypeId: args.roomTypeId,
        status: args.status ?? 'AVAILABLE',
      },
    })
  }

  // Hotel Tulum — 22 rooms matching the SQL fixture expectations.
  // Floor 1 (101-106) STD · Floor 2 (201-205) SUP · Floor 3 (301-305) JRS
  // Cabanas A1/A2 CAB · Villas B1/B2 STE · Premium C1/C2 STE
  const tulumRoomSpecs: Array<Parameters<typeof upsertRoom>[0]> = [
    { propertyId: tulum.id, number: '101', floor: 1, category: 'PRIVATE', capacity: 2, roomTypeId: tStd.id },
    { propertyId: tulum.id, number: '102', floor: 1, category: 'PRIVATE', capacity: 2, roomTypeId: tStd.id },
    { propertyId: tulum.id, number: '103', floor: 1, category: 'PRIVATE', capacity: 2, roomTypeId: tStd.id },
    { propertyId: tulum.id, number: '104', floor: 1, category: 'PRIVATE', capacity: 2, roomTypeId: tStd.id },
    { propertyId: tulum.id, number: '105', floor: 1, category: 'PRIVATE', capacity: 2, roomTypeId: tStd.id },
    { propertyId: tulum.id, number: '106', floor: 1, category: 'PRIVATE', capacity: 2, roomTypeId: tStd.id },
    { propertyId: tulum.id, number: '201', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: tSup.id },
    { propertyId: tulum.id, number: '202', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: tSup.id },
    { propertyId: tulum.id, number: '203', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: tSup.id },
    { propertyId: tulum.id, number: '204', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: tSup.id },
    { propertyId: tulum.id, number: '205', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: tSup.id },
    { propertyId: tulum.id, number: '301', floor: 3, category: 'PRIVATE', capacity: 3, roomTypeId: tJrSuite.id },
    { propertyId: tulum.id, number: '302', floor: 3, category: 'PRIVATE', capacity: 3, roomTypeId: tJrSuite.id },
    { propertyId: tulum.id, number: '303', floor: 3, category: 'PRIVATE', capacity: 3, roomTypeId: tJrSuite.id },
    { propertyId: tulum.id, number: '304', floor: 3, category: 'PRIVATE', capacity: 3, roomTypeId: tJrSuite.id },
    { propertyId: tulum.id, number: '305', floor: 3, category: 'PRIVATE', capacity: 3, roomTypeId: tJrSuite.id },
    { propertyId: tulum.id, number: 'A1',  floor: 0, category: 'PRIVATE', capacity: 2, roomTypeId: tCabin.id },
    { propertyId: tulum.id, number: 'A2',  floor: 0, category: 'PRIVATE', capacity: 2, roomTypeId: tCabin.id },
    { propertyId: tulum.id, number: 'B1',  floor: 0, category: 'PRIVATE', capacity: 4, roomTypeId: tSuite.id },
    { propertyId: tulum.id, number: 'B2',  floor: 0, category: 'PRIVATE', capacity: 4, roomTypeId: tSuite.id },
    { propertyId: tulum.id, number: 'C1',  floor: 0, category: 'PRIVATE', capacity: 4, roomTypeId: tSuite.id },
    { propertyId: tulum.id, number: 'C2',  floor: 0, category: 'PRIVATE', capacity: 4, roomTypeId: tSuite.id },
  ]
  await Promise.all(tulumRoomSpecs.map(upsertRoom))

  // Hotel Cancún — 8 rooms, smaller property for multi-property testing.
  const cancunRoomSpecs: Array<Parameters<typeof upsertRoom>[0]> = [
    { propertyId: cancun.id, number: '201', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: cStd.id },
    { propertyId: cancun.id, number: '202', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: cStd.id },
    { propertyId: cancun.id, number: '203', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: cStd.id },
    { propertyId: cancun.id, number: '204', floor: 2, category: 'PRIVATE', capacity: 2, roomTypeId: cStd.id },
    { propertyId: cancun.id, number: '301', floor: 3, category: 'PRIVATE', capacity: 3, roomTypeId: cSup.id },
    { propertyId: cancun.id, number: '302', floor: 3, category: 'PRIVATE', capacity: 3, roomTypeId: cSup.id },
    { propertyId: cancun.id, number: '401', floor: 4, category: 'PRIVATE', capacity: 4, roomTypeId: cSuite.id },
    { propertyId: cancun.id, number: '402', floor: 4, category: 'PRIVATE', capacity: 4, roomTypeId: cSuite.id },
  ]
  const cancunRooms = await Promise.all(cancunRoomSpecs.map(upsertRoom))
  console.log(`✅ Rooms: Tulum(${tulumRoomSpecs.length}), Cancún(${cancunRoomSpecs.length})`)

  // 5. STAFF ────────────────────────────────────────────────────────────────

  async function upsertStaff(args: {
    email: string
    name: string
    password: string
    role: 'SUPERVISOR' | 'RECEPTIONIST' | 'HOUSEKEEPER'
    department?: 'HOUSEKEEPING' | 'MAINTENANCE' | 'LAUNDRY' | 'PUBLIC_AREAS' | 'GARDENING' | 'RECEPTION'
    propertyId: string
    capabilities?: Array<'CLEANING' | 'SANITIZATION' | 'MAINTENANCE'>
  }) {
    return prisma.housekeepingStaff.upsert({
      where: { email: args.email },
      update: { propertyId: args.propertyId, organizationId: org.id, name: args.name },
      create: {
        organizationId: org.id,
        propertyId: args.propertyId,
        email: args.email,
        name: args.name,
        passwordHash: await hash(args.password),
        role: args.role,
        department: args.department,
        capabilities: args.capabilities ?? [],
      },
    })
  }

  // Plantilla realista por propiedad. Email breve (fácil en teclado móvil).
  // Password uniforme '123456' — solo para demo. Producción usa onboarding flow.
  const DEMO_PASSWORD = '123456'

  // ── Tulum ─────────────────────────────────────────────────────────────────
  const supervisor  = await upsertStaff({ email: 's@z.co',  name: 'Ana García',      password: DEMO_PASSWORD, role: 'SUPERVISOR',   department: 'HOUSEKEEPING', propertyId: tulum.id, capabilities: ['CLEANING', 'SANITIZATION', 'MAINTENANCE'] })
  const reception   = await upsertStaff({ email: 'r@z.co',  name: 'Carlos López',    password: DEMO_PASSWORD, role: 'RECEPTIONIST', department: 'RECEPTION',    propertyId: tulum.id })
  const reception2  = await upsertStaff({ email: 'r2@z.co', name: 'Sofía Martínez',  password: DEMO_PASSWORD, role: 'RECEPTIONIST', department: 'RECEPTION',    propertyId: tulum.id })
  // Turno mañana — pisos 1 y 2
  const hk1         = await upsertStaff({ email: 'm@z.co',  name: 'María Torres',    password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'HOUSEKEEPING', propertyId: tulum.id, capabilities: ['CLEANING', 'SANITIZATION'] })
  const hk4         = await upsertStaff({ email: 'v@z.co',  name: 'Valentina Cruz',  password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'HOUSEKEEPING', propertyId: tulum.id, capabilities: ['CLEANING', 'SANITIZATION'] })
  // Turno tarde — piso 3 y cabañas
  const hk2         = await upsertStaff({ email: 'p@z.co',  name: 'Pedro Ramírez',   password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'HOUSEKEEPING', propertyId: tulum.id, capabilities: ['CLEANING', 'MAINTENANCE'] })
  const hk5         = await upsertStaff({ email: 'd@z.co',  name: 'Diego Flores',    password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'HOUSEKEEPING', propertyId: tulum.id, capabilities: ['CLEANING'] })
  // Técnico de mantenimiento (role=HOUSEKEEPER, dept=MAINTENANCE — patrón D-Mx5)
  const maint1      = await upsertStaff({ email: 'j@z.co',  name: 'Javier Ruiz',     password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'MAINTENANCE',  propertyId: tulum.id, capabilities: ['MAINTENANCE'] })

  // ── Cancún ────────────────────────────────────────────────────────────────
  const supervisorC = await upsertStaff({ email: 'sc@z.co', name: 'Rodrigo Vega',    password: DEMO_PASSWORD, role: 'SUPERVISOR',   department: 'HOUSEKEEPING', propertyId: cancun.id, capabilities: ['CLEANING', 'SANITIZATION', 'MAINTENANCE'] })
  const receptionC  = await upsertStaff({ email: 'rc@z.co', name: 'Laura Mendez',    password: DEMO_PASSWORD, role: 'RECEPTIONIST', department: 'RECEPTION',    propertyId: cancun.id })
  const hk3         = await upsertStaff({ email: 'l@z.co',  name: 'Luis Herrera',    password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'HOUSEKEEPING', propertyId: cancun.id, capabilities: ['CLEANING'] })
  const hk6         = await upsertStaff({ email: 'c@z.co',  name: 'Carmen Silva',    password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'HOUSEKEEPING', propertyId: cancun.id, capabilities: ['CLEANING', 'SANITIZATION'] })
  const maint2      = await upsertStaff({ email: 'rb@z.co', name: 'Roberto Díaz',    password: DEMO_PASSWORD, role: 'HOUSEKEEPER',  department: 'MAINTENANCE',  propertyId: cancun.id, capabilities: ['MAINTENANCE'] })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = [reception2, supervisorC, receptionC] // referenced for type safety

  console.log(`✅ Staff: 13 cuentas demo Tulum(8) Cancún(5) — password '${DEMO_PASSWORD}'`)

  // 5c. STAFF SHIFTS + COVERAGE (Sprint 8H) ──────────────────────────────────
  // Plantilla realista: turnos diferenciados por propiedad + cobertura por piso.
  //
  // Tulum — 2 turnos solapados para cubrir 7:00-22:00:
  //   María    (HK · piso 1)    Lun-Vie  07:00-15:00
  //   Valentina(HK · piso 2)    Lun-Sáb  07:00-15:00
  //   Pedro    (HK · piso 3)    Mar-Sáb  14:00-22:00
  //   Diego    (HK · cabañas)   Lun-Vie  13:00-21:00
  //   Javier   (Maint)          Lun-Vie  08:00-17:00
  //
  // Cancún — turno único mañana:
  //   Luis     (HK · piso 2)    Lun-Dom  08:00-16:00
  //   Carmen   (HK · pisos 3-4) Lun-Sáb  08:00-16:00
  //   Roberto  (Maint)          Lun-Sáb  08:00-17:00
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  async function upsertShift(args: {
    staffId: string; propertyId: string; dayOfWeek: number; startTime: string; endTime: string
  }) {
    const existing = await prisma.staffShift.findFirst({
      where: { staffId: args.staffId, dayOfWeek: args.dayOfWeek, propertyId: args.propertyId, active: true },
    })
    if (existing) {
      return prisma.staffShift.update({
        where: { id: existing.id },
        data: { startTime: args.startTime, endTime: args.endTime, effectiveFrom: today, active: true },
      })
    }
    return prisma.staffShift.create({
      data: {
        organizationId: org.id,
        propertyId: args.propertyId,
        staffId: args.staffId,
        dayOfWeek: args.dayOfWeek,
        startTime: args.startTime,
        endTime: args.endTime,
        effectiveFrom: today,
        active: true,
      },
    })
  }

  // ── Tulum shifts ──────────────────────────────────────────────────────────
  // María: Lun-Vie 07-15 (turno mañana piso 1)
  for (let day = 1; day <= 5; day++) {
    await upsertShift({ staffId: hk1.id, propertyId: tulum.id, dayOfWeek: day, startTime: '07:00', endTime: '15:00' })
  }
  // Valentina: Lun-Sáb 07-15 (turno mañana piso 2, +sábado)
  for (let day = 1; day <= 6; day++) {
    await upsertShift({ staffId: hk4.id, propertyId: tulum.id, dayOfWeek: day, startTime: '07:00', endTime: '15:00' })
  }
  // Pedro: Mar-Sáb 14-22 (turno tarde piso 3, cubre check-outs tardíos)
  for (let day = 2; day <= 6; day++) {
    await upsertShift({ staffId: hk2.id, propertyId: tulum.id, dayOfWeek: day, startTime: '14:00', endTime: '22:00' })
  }
  // Diego: Lun-Vie 13-21 (turno tarde cabañas + solapamiento con mañana)
  for (let day = 1; day <= 5; day++) {
    await upsertShift({ staffId: hk5.id, propertyId: tulum.id, dayOfWeek: day, startTime: '13:00', endTime: '21:00' })
  }
  // Javier (Mantenimiento): Lun-Vie 08-17
  for (let day = 1; day <= 5; day++) {
    await upsertShift({ staffId: maint1.id, propertyId: tulum.id, dayOfWeek: day, startTime: '08:00', endTime: '17:00' })
  }

  // ── Cancún shifts ─────────────────────────────────────────────────────────
  // Luis: Lun-Dom 08-16 (única recamarista + domingo para alta ocupación)
  for (let day = 0; day <= 6; day++) {
    await upsertShift({ staffId: hk3.id, propertyId: cancun.id, dayOfWeek: day, startTime: '08:00', endTime: '16:00' })
  }
  // Carmen: Lun-Sáb 08-16 (refuerzo pisos 3-4)
  for (let day = 1; day <= 6; day++) {
    await upsertShift({ staffId: hk6.id, propertyId: cancun.id, dayOfWeek: day, startTime: '08:00', endTime: '16:00' })
  }
  // Roberto (Mantenimiento): Lun-Sáb 08-17
  for (let day = 1; day <= 6; day++) {
    await upsertShift({ staffId: maint2.id, propertyId: cancun.id, dayOfWeek: day, startTime: '08:00', endTime: '17:00' })
  }
  console.log('✅ Staff shifts: Tulum(5 personas) Cancún(3 personas) — turnos realistas')

  async function upsertCoverage(args: {
    propertyId: string; staffId: string; roomId: string; isPrimary: boolean
  }) {
    return prisma.staffCoverage.upsert({
      where: {
        staffId_roomId_isPrimary: {
          staffId: args.staffId, roomId: args.roomId, isPrimary: args.isPrimary,
        },
      },
      update: {},
      create: args,
    })
  }

  // ── Tulum coverage — por piso ─────────────────────────────────────────────
  // Piso 1 (101-106): María primary, Valentina backup
  // Piso 2 (201-205): Valentina primary, María backup
  // Piso 3 (301-305): Pedro primary, Diego backup
  // Piso 0 (A1,A2,B1,B2,C1,C2): Diego primary, Pedro backup
  const tulumRoomList = await prisma.room.findMany({
    where: { propertyId: tulum.id }, orderBy: { number: 'asc' },
  })
  for (const room of tulumRoomList) {
    const n = room.number
    const isFloor1 = n.match(/^1\d\d$/)
    const isFloor2 = n.match(/^2\d\d$/)
    const isFloor3 = n.match(/^3\d\d$/)

    let primary, backup
    if (isFloor1) {
      primary = hk1; backup = hk4
    } else if (isFloor2) {
      primary = hk4; backup = hk1
    } else if (isFloor3) {
      primary = hk2; backup = hk5
    } else {
      // Cabañas A1/A2/B1/B2/C1/C2 — Diego primary, Pedro backup
      primary = hk5; backup = hk2
    }
    await upsertCoverage({ propertyId: tulum.id, staffId: primary.id, roomId: room.id, isPrimary: true })
    await upsertCoverage({ propertyId: tulum.id, staffId: backup.id,  roomId: room.id, isPrimary: false })
  }

  // ── Cancún coverage — por piso ────────────────────────────────────────────
  // Piso 2 (201-204): Luis primary, Carmen backup
  // Pisos 3-4 (301,302,401,402): Carmen primary, Luis backup
  const cancunRoomsByNumber = await prisma.room.findMany({
    where: { propertyId: cancun.id }, orderBy: { number: 'asc' },
  })
  for (const room of cancunRoomsByNumber) {
    const isFloor2 = room.number.match(/^2\d\d$/)
    const primary = isFloor2 ? hk3 : hk6
    const backup  = isFloor2 ? hk6 : hk3
    await upsertCoverage({ propertyId: cancun.id, staffId: primary.id, roomId: room.id, isPrimary: true })
    await upsertCoverage({ propertyId: cancun.id, staffId: backup.id,  roomId: room.id, isPrimary: false })
  }
  console.log('✅ Staff coverage: Tulum por piso (4 zonas), Cancún por piso (Luis/Carmen)')

  // 5b. CLEANUP LEGACY (phase 2) ────────────────────────────────────────────
  // Now that Tulum exists and staff have been re-homed via the
  // upsertStaff.update path above, we can delete the retired property.
  await prisma.housekeepingStaff.updateMany({
    where: { propertyId: legacyPropertyId },
    data:  { propertyId: tulum.id },
  })
  await prisma.property.deleteMany({ where: { id: legacyPropertyId } })

  // 6. PROPERTY SETTINGS ───────────────────────────────────────────────────
  for (const p of [tulum, cancun]) {
    await prisma.propertySettings.upsert({
      where: { propertyId: p.id },
      update: {},
      create: {
        organizationId: org.id,
        propertyId: p.id,
        timezone: 'America/Cancun',
      },
    })
  }

  // 7. TULUM GUEST DATA — run the SQL fixture ──────────────────────────────
  // Pre-cleanup FK chains that the fixture's own DELETE block doesn't handle:
  //   guest_contact_logs  → guest_stays (stay_id FK)
  await prisma.$executeRawUnsafe(
    `DELETE FROM guest_contact_logs WHERE stay_id IN (SELECT id FROM guest_stays WHERE property_id = $1)`,
    tulum.id,
  )
  const sqlPath = path.join(__dirname, 'seed_hotel_tulum_v5.sql')
  if (fs.existsSync(sqlPath)) {
    const sql = fs.readFileSync(sqlPath, 'utf8')
    console.log(`\n🏖  Loading Hotel Tulum fixture (${sql.length.toLocaleString()} chars)…`)
    await prisma.$executeRawUnsafe(sql)
    const [{ count: tulumStays }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM guest_stays WHERE property_id = $1`,
      tulum.id,
    )
    const [{ count: tulumJourneys }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM stay_journeys WHERE property_id = $1`,
      tulum.id,
    )
    console.log(`   Tulum: ${tulumStays} stays · ${tulumJourneys} journeys`)
  } else {
    console.warn(`⚠️  ${sqlPath} not found — Tulum timeline will be empty`)
  }

  // 8. CANCÚN GUEST DATA — run the SQL fixture ─────────────────────────────
  await prisma.$executeRawUnsafe(
    `DELETE FROM guest_contact_logs WHERE stay_id IN (SELECT id FROM guest_stays WHERE property_id = $1)`,
    cancun.id,
  )
  const sqlCancunPath = path.join(__dirname, 'seed_hotel_cancun_v3.sql')
  if (fs.existsSync(sqlCancunPath)) {
    const sqlCancun = fs.readFileSync(sqlCancunPath, 'utf8')
    console.log(`\n🏙  Loading Hotel Cancún fixture (${sqlCancun.length.toLocaleString()} chars)…`)
    await prisma.$executeRawUnsafe(sqlCancun)
    const [{ count: cancunStayCount }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM guest_stays WHERE property_id = $1`,
      cancun.id,
    )
    const [{ count: cancunJourneys }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM stay_journeys WHERE property_id = $1`,
      cancun.id,
    )
    console.log(`   Cancún: ${cancunStayCount} stays · ${cancunJourneys} journeys`)
  } else {
    console.warn(`⚠️  ${sqlCancunPath} not found — Cancún timeline will be empty`)
  }


  // 9. HOUSEKEEPING SEED — units + tasks en estados variados para pruebas mobile ──────────
  //
  // Cada habitación privada necesita 1 Unit (cama). Se usan IDs determinísticos para
  // que el seed sea idempotente (upsert by id). Las tareas cubren todos los estados
  // del flujo: READY, UNASSIGNED, IN_PROGRESS, PAUSED, DONE, VERIFIED.
  //
  // SEED_DEMO_TASKS=0 → salta las 16 tareas demo (deja solo flujo real driven por
  // calendario → batchCheckout). Units siguen creándose porque sección 10 las usa.

  const now = new Date()
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)
  const hoursAgo   = (h: number) => new Date(now.getTime() - h * 3_600_000)
  const seedDemoTasks = process.env.SEED_DEMO_TASKS !== '0'

  // 9a. Units — 1 por habitación Tulum (habitaciones privadas)
  const tulumRoomIds = await prisma.room.findMany({
    where: { propertyId: tulum.id },
    select: { id: true, number: true },
    orderBy: { number: 'asc' },
  })

  async function upsertUnit(roomId: string, roomNumber: string) {
    const id = `seed-unit-tulum-${roomNumber}`
    return prisma.unit.upsert({
      where: { id },
      update: {},
      create: { id, organizationId: org.id, roomId, label: `Hab. ${roomNumber}`, status: 'AVAILABLE' },
    })
  }

  const unitMap: Record<string, string> = {} // roomNumber → unitId
  for (const r of tulumRoomIds) {
    const unit = await upsertUnit(r.id, r.number)
    unitMap[r.number] = unit.id
  }
  console.log(`✅ Units: ${tulumRoomIds.length} unidades Tulum (idempotentes)`)

  if (!seedDemoTasks) {
    // Aún limpiamos por si previamente se corrió el seed con tareas demo.
    const seedTaskIdsLegacy = [
      'seed-task-t-101-ready', 'seed-task-t-102-ready-urgent', 'seed-task-t-103-ip',
      'seed-task-t-104-unassigned', 'seed-task-t-105-paused', 'seed-task-t-106-done',
      'seed-task-t-201-ready-urgent', 'seed-task-t-202-unassigned', 'seed-task-t-203-ip',
      'seed-task-t-204-paused', 'seed-task-t-205-done', 'seed-task-t-302-ready',
      'seed-task-t-303-done', 'seed-task-t-304-ip-urgent', 'seed-task-t-301-verified',
      'seed-task-t-305-verified',
    ]
    await prisma.taskLog.deleteMany({ where: { taskId: { in: seedTaskIdsLegacy } } })
    await prisma.cleaningNote.deleteMany({ where: { taskId: { in: seedTaskIdsLegacy } } })
    await prisma.cleaningTask.deleteMany({ where: { id: { in: seedTaskIdsLegacy } } })
    console.log('⏭  SEED_DEMO_TASKS=0 — saltando 16 tareas demo. Solo flujo real (calendar → batchCheckout)')
  }
  if (seedDemoTasks) {

  // 9b. Cleanup de tareas seed anteriores para reinicio limpio
  const seedTaskIds = [
    'seed-task-t-101-ready',   'seed-task-t-102-ready-urgent',  'seed-task-t-103-ip',
    'seed-task-t-104-unassigned', 'seed-task-t-105-paused',     'seed-task-t-106-done',
    'seed-task-t-201-ready-urgent', 'seed-task-t-202-unassigned', 'seed-task-t-203-ip',
    'seed-task-t-204-paused',  'seed-task-t-205-done',           'seed-task-t-302-ready',
    'seed-task-t-303-done',    'seed-task-t-304-ip-urgent',      'seed-task-t-301-verified',
    'seed-task-t-305-verified',
  ]
  await prisma.taskLog.deleteMany({ where: { taskId: { in: seedTaskIds } } })
  await prisma.cleaningNote.deleteMany({ where: { taskId: { in: seedTaskIds } } })
  await prisma.cleaningTask.deleteMany({ where: { id: { in: seedTaskIds } } })

  // Helper para crear tarea + logs de forma concisa
  async function seedTask(args: {
    id: string
    unitId: string
    assignedToId: string | null
    status: string
    priority: string
    hasSameDayCheckIn?: boolean
    startedAt?: Date
    finishedAt?: Date
    verifiedAt?: Date
    verifiedById?: string
    logs: Array<{ event: string; staffId?: string | null; note?: string; createdAt: Date }>
    notes?: Array<{ staffId: string; content: string }>
  }) {
    const task = await prisma.cleaningTask.create({
      data: {
        id: args.id,
        organizationId: org.id,
        unitId: args.unitId,
        assignedToId: args.assignedToId,
        status: args.status as any,
        taskType: 'CLEANING',
        requiredCapability: 'CLEANING',
        priority: args.priority as any,
        hasSameDayCheckIn: args.hasSameDayCheckIn ?? false,
        startedAt: args.startedAt ?? null,
        finishedAt: args.finishedAt ?? null,
        verifiedAt: args.verifiedAt ?? null,
        verifiedById: args.verifiedById ?? null,
        scheduledFor: new Date(now.toISOString().slice(0, 10)),
      },
    })
    for (const log of args.logs) {
      await prisma.taskLog.create({
        data: {
          taskId: task.id,
          organizationId: org.id,
          staffId: log.staffId ?? null,
          event: log.event as any,
          note: log.note ?? null,
          createdAt: log.createdAt,
        },
      })
    }
    if (args.notes) {
      for (const note of args.notes) {
        await prisma.cleaningNote.create({
          data: {
            taskId: task.id,
            organizationId: org.id,
            staffId: note.staffId,
            content: note.content,
          },
        })
      }
    }
    return task
  }

  // ── READY — esperando que la recamarista comience ────────────────────────
  // 101 → María, checkout normal
  await seedTask({
    id: 'seed-task-t-101-ready', unitId: unitMap['101'],
    assignedToId: hk1.id, status: 'READY', priority: 'MEDIUM',
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(2) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(1.5) },
      { event: 'ASSIGNED', staffId: hk1.id, createdAt: hoursAgo(1.5), note: 'Auto-asignada (COVERAGE_PRIMARY)' },
    ],
  })
  // 102 → Pedro, hoy entra nuevo huésped (URGENT)
  await seedTask({
    id: 'seed-task-t-102-ready-urgent', unitId: unitMap['102'],
    assignedToId: hk2.id, status: 'READY', priority: 'URGENT', hasSameDayCheckIn: true,
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(2) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(1.8) },
      { event: 'ASSIGNED', staffId: hk2.id, createdAt: hoursAgo(1.8) },
    ],
  })
  // 201 → María, check-in urgente
  await seedTask({
    id: 'seed-task-t-201-ready-urgent', unitId: unitMap['201'],
    assignedToId: hk1.id, status: 'READY', priority: 'URGENT', hasSameDayCheckIn: true,
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(1.5) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(1) },
      { event: 'ASSIGNED', staffId: hk1.id, createdAt: hoursAgo(1), note: 'Auto-asignada (COVERAGE_PRIMARY)' },
    ],
  })
  // 302 → Pedro, checkout normal
  await seedTask({
    id: 'seed-task-t-302-ready', unitId: unitMap['302'],
    assignedToId: hk2.id, status: 'READY', priority: 'MEDIUM',
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(3) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(2.5) },
      { event: 'ASSIGNED', staffId: hk2.id, createdAt: hoursAgo(2.5) },
    ],
  })

  // ── UNASSIGNED — sin recamarista asignada, supervisor debe asignar ────────
  // 104 → sin asignar, MEDIUM
  await seedTask({
    id: 'seed-task-t-104-unassigned', unitId: unitMap['104'],
    assignedToId: null, status: 'UNASSIGNED', priority: 'MEDIUM',
    logs: [
      { event: 'CREATED', staffId: null, createdAt: hoursAgo(1) },
      { event: 'READY',   staffId: null, createdAt: minutesAgo(45) },
    ],
  })
  // 202 → sin asignar, HIGH
  await seedTask({
    id: 'seed-task-t-202-unassigned', unitId: unitMap['202'],
    assignedToId: null, status: 'UNASSIGNED', priority: 'HIGH',
    logs: [
      { event: 'CREATED', staffId: null, createdAt: hoursAgo(1.5) },
      { event: 'READY',   staffId: null, createdAt: minutesAgo(60) },
    ],
  })

  // ── IN_PROGRESS — limpieza en curso ───────────────────────────────────────
  // 103 → María, 22 min limpiando
  await seedTask({
    id: 'seed-task-t-103-ip', unitId: unitMap['103'],
    assignedToId: hk1.id, status: 'IN_PROGRESS', priority: 'MEDIUM',
    startedAt: minutesAgo(22),
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(2) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(1.5) },
      { event: 'ASSIGNED', staffId: hk1.id, createdAt: hoursAgo(1.5) },
      { event: 'STARTED',  staffId: hk1.id, createdAt: minutesAgo(22) },
    ],
  })
  // 203 → Pedro, 8 min limpiando
  await seedTask({
    id: 'seed-task-t-203-ip', unitId: unitMap['203'],
    assignedToId: hk2.id, status: 'IN_PROGRESS', priority: 'HIGH',
    startedAt: minutesAgo(8),
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(2) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(1.5) },
      { event: 'ASSIGNED', staffId: hk2.id, createdAt: hoursAgo(1.5) },
      { event: 'STARTED',  staffId: hk2.id, createdAt: minutesAgo(8) },
    ],
  })
  // 304 → Pedro, urgente + check-in hoy, 15 min limpiando
  await seedTask({
    id: 'seed-task-t-304-ip-urgent', unitId: unitMap['304'],
    assignedToId: hk2.id, status: 'IN_PROGRESS', priority: 'URGENT', hasSameDayCheckIn: true,
    startedAt: minutesAgo(15),
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(1.5) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(1) },
      { event: 'ASSIGNED', staffId: hk2.id, createdAt: hoursAgo(1) },
      { event: 'STARTED',  staffId: hk2.id, createdAt: minutesAgo(15) },
    ],
  })

  // ── PAUSED — en pausa (recamarista fue a otra tarea) ─────────────────────
  // 105 → María, inició hace 40 min, pausó hace 25 min
  await seedTask({
    id: 'seed-task-t-105-paused', unitId: unitMap['105'],
    assignedToId: hk1.id, status: 'PAUSED', priority: 'MEDIUM',
    startedAt: minutesAgo(40),
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(2.5) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(2) },
      { event: 'ASSIGNED', staffId: hk1.id, createdAt: hoursAgo(2) },
      { event: 'STARTED',  staffId: hk1.id, createdAt: minutesAgo(40) },
      { event: 'PAUSED',   staffId: hk1.id, createdAt: minutesAgo(25), note: 'Fue a atender habitación urgente' },
    ],
  })
  // 204 → Pedro, en pausa con nota
  await seedTask({
    id: 'seed-task-t-204-paused', unitId: unitMap['204'],
    assignedToId: hk2.id, status: 'PAUSED', priority: 'HIGH',
    startedAt: minutesAgo(35),
    logs: [
      { event: 'CREATED',  staffId: null,   createdAt: hoursAgo(3) },
      { event: 'READY',    staffId: null,   createdAt: hoursAgo(2.5) },
      { event: 'ASSIGNED', staffId: hk2.id, createdAt: hoursAgo(2.5) },
      { event: 'STARTED',  staffId: hk2.id, createdAt: minutesAgo(35) },
      { event: 'PAUSED',   staffId: hk2.id, createdAt: minutesAgo(20) },
    ],
    notes: [
      { staffId: hk2.id, content: 'Huésped dejó objetos en la cama, esperando que pase a recogerlos' },
    ],
  })

  // ── DONE — terminada, pendiente de verificación ───────────────────────────
  // 106 → María, terminó hace 50 min
  await seedTask({
    id: 'seed-task-t-106-done', unitId: unitMap['106'],
    assignedToId: hk1.id, status: 'DONE', priority: 'MEDIUM',
    startedAt: hoursAgo(2), finishedAt: minutesAgo(50),
    logs: [
      { event: 'CREATED',   staffId: null,   createdAt: hoursAgo(3) },
      { event: 'READY',     staffId: null,   createdAt: hoursAgo(2.5) },
      { event: 'ASSIGNED',  staffId: hk1.id, createdAt: hoursAgo(2.5) },
      { event: 'STARTED',   staffId: hk1.id, createdAt: hoursAgo(2) },
      { event: 'COMPLETED', staffId: hk1.id, createdAt: minutesAgo(50) },
    ],
  })
  // 205 → Pedro, terminó hace 1.5h con notas para recepción
  await seedTask({
    id: 'seed-task-t-205-done', unitId: unitMap['205'],
    assignedToId: hk2.id, status: 'DONE', priority: 'MEDIUM',
    startedAt: hoursAgo(2.5), finishedAt: hoursAgo(1.5),
    logs: [
      { event: 'CREATED',   staffId: null,   createdAt: hoursAgo(3.5) },
      { event: 'READY',     staffId: null,   createdAt: hoursAgo(3) },
      { event: 'ASSIGNED',  staffId: hk2.id, createdAt: hoursAgo(3) },
      { event: 'STARTED',   staffId: hk2.id, createdAt: hoursAgo(2.5) },
      { event: 'COMPLETED', staffId: hk2.id, createdAt: hoursAgo(1.5) },
    ],
    notes: [
      { staffId: hk2.id, content: 'El jacuzzi tiene una pequeña mancha persistente, revisar con mantenimiento' },
      { staffId: hk2.id, content: 'Repuse todos los amenities, necesitamos más champú en almacén' },
    ],
  })
  // 303 → María, urgente (check-in hoy), terminó hace 2h
  await seedTask({
    id: 'seed-task-t-303-done', unitId: unitMap['303'],
    assignedToId: hk1.id, status: 'DONE', priority: 'URGENT', hasSameDayCheckIn: true,
    startedAt: hoursAgo(3), finishedAt: hoursAgo(2),
    logs: [
      { event: 'CREATED',   staffId: null,   createdAt: hoursAgo(4) },
      { event: 'READY',     staffId: null,   createdAt: hoursAgo(3.5) },
      { event: 'ASSIGNED',  staffId: hk1.id, createdAt: hoursAgo(3.5) },
      { event: 'STARTED',   staffId: hk1.id, createdAt: hoursAgo(3) },
      { event: 'COMPLETED', staffId: hk1.id, createdAt: hoursAgo(2) },
    ],
  })

  // ── VERIFIED — completamente verificadas por la supervisora ───────────────
  // 301 → María, verificada hace 3.5h
  await seedTask({
    id: 'seed-task-t-301-verified', unitId: unitMap['301'],
    assignedToId: hk1.id, status: 'VERIFIED', priority: 'MEDIUM',
    startedAt: hoursAgo(5), finishedAt: hoursAgo(4), verifiedAt: hoursAgo(3.5),
    verifiedById: supervisor.id,
    logs: [
      { event: 'CREATED',   staffId: null,         createdAt: hoursAgo(6) },
      { event: 'READY',     staffId: null,         createdAt: hoursAgo(5.5) },
      { event: 'ASSIGNED',  staffId: hk1.id,       createdAt: hoursAgo(5.5) },
      { event: 'STARTED',   staffId: hk1.id,       createdAt: hoursAgo(5) },
      { event: 'COMPLETED', staffId: hk1.id,       createdAt: hoursAgo(4) },
      { event: 'VERIFIED',  staffId: supervisor.id, createdAt: hoursAgo(3.5) },
    ],
  })
  // 305 → Pedro, verificada hace 3h
  await seedTask({
    id: 'seed-task-t-305-verified', unitId: unitMap['305'],
    assignedToId: hk2.id, status: 'VERIFIED', priority: 'HIGH',
    startedAt: hoursAgo(4.5), finishedAt: hoursAgo(3.5), verifiedAt: hoursAgo(3),
    verifiedById: supervisor.id,
    logs: [
      { event: 'CREATED',   staffId: null,         createdAt: hoursAgo(5.5) },
      { event: 'READY',     staffId: null,         createdAt: hoursAgo(5) },
      { event: 'ASSIGNED',  staffId: hk2.id,       createdAt: hoursAgo(5) },
      { event: 'STARTED',   staffId: hk2.id,       createdAt: hoursAgo(4.5) },
      { event: 'COMPLETED', staffId: hk2.id,       createdAt: hoursAgo(3.5) },
      { event: 'VERIFIED',  staffId: supervisor.id, createdAt: hoursAgo(3) },
    ],
  })

  const taskCount = await prisma.cleaningTask.count({ where: { id: { in: seedTaskIds } } })
  console.log(`✅ Housekeeping seed: ${taskCount} tareas (READY×4, UNASSIGNED×2, IN_PROGRESS×3, PAUSED×2, DONE×3, VERIFIED×2)`)
  } // end if (seedDemoTasks)

  // 10. CHECKOUT FLOW SEED — Huéspedes IN_HOUSE con checkout hoy/mañana/pasado ──────────────
  //
  // Propósito: permitir probar el flujo completo:
  //   DailyPlanningPage → batchCheckout → confirmDeparture → HK mobile → verify
  //
  // Rooms usadas (sin tareas activas del seed anterior):
  //   Tulum:  A1, A2, B1  → checkout HOY
  //           B2, C1      → checkout MAÑANA
  //           C2          → checkout PASADO MAÑANA
  //   Cancún: 201, 202    → checkout HOY
  //           301         → checkout MAÑANA
  //           401         → checkout PASADO MAÑANA
  //
  // Cada GuestStay necesita StayJourney + StaySegment (arquitectura PMS).

  const TODAY_STR    = now.toISOString().slice(0, 10)
  const TOMORROW_STR = daysFromNow(1).toISOString().slice(0, 10)
  const DAY2_STR     = daysFromNow(2).toISOString().slice(0, 10)

  // Helper: crea una estadía IN_HOUSE + journey + segment (idempotente por id)
  async function seedCheckoutStay(args: {
    stayId: string
    journeyId: string
    segmentId: string
    propertyId: string
    roomId: string
    guestName: string
    checkinAt: Date         // check-in pasado
    scheduledCheckout: Date // cuándo debe salir
    ratePerNight: number
    nights: number
    paxCount?: number
    source?: string
  }) {
    const totalAmount = args.ratePerNight * args.nights

    // Limpiar si ya existe (idempotencia)
    const existingStay = await prisma.guestStay.findUnique({ where: { id: args.stayId } })
    if (existingStay) {
      await prisma.staySegment.deleteMany({ where: { id: args.segmentId } })
      await prisma.stayJourney.deleteMany({ where: { id: args.journeyId } })
      await prisma.guestStay.delete({ where: { id: args.stayId } })
    }

    const stay = await prisma.guestStay.create({
      data: {
        id:                args.stayId,
        organizationId:    org.id,
        propertyId:        args.propertyId,
        roomId:            args.roomId,
        guestName:         args.guestName,
        checkinAt:         args.checkinAt,
        scheduledCheckout: args.scheduledCheckout,
        actualCheckin:     args.checkinAt, // ya confirmado
        checkedInById:     reception.id,
        ratePerNight:      args.ratePerNight,
        totalAmount,
        amountPaid:        totalAmount,
        paymentStatus:     'PAID',
        paxCount:          args.paxCount ?? 1,
        source:            args.source ?? 'DIRECT',
        currency:          'USD',
      },
    })

    const journey = await prisma.stayJourney.create({
      data: {
        id:             args.journeyId,
        organizationId: org.id,
        propertyId:     args.propertyId,
        guestStayId:    stay.id,
        guestName:      args.guestName,
        status:         'ACTIVE',
        journeyCheckIn: args.checkinAt,
        journeyCheckOut: args.scheduledCheckout,
      },
    })

    await prisma.staySegment.create({
      data: {
        id:         args.segmentId,
        journeyId:  journey.id,
        roomId:     args.roomId,
        guestStayId: stay.id,
        checkIn:    args.checkinAt,
        checkOut:   args.scheduledCheckout,
        status:     'ACTIVE',
        reason:     'ORIGINAL',
        rateSnapshot: args.ratePerNight,
      },
    })

    // Marcar habitación como OCCUPIED
    await prisma.room.update({
      where: { id: args.roomId },
      data:  { status: 'OCCUPIED' },
    })

    return stay
  }

  // Obtener roomIds por número (para ambas propiedades)
  const getRoomId = async (propertyId: string, number: string) => {
    const r = await prisma.room.findUnique({ where: { propertyId_number: { propertyId, number } } })
    if (!r) throw new Error(`Room ${number} not found in property ${propertyId}`)
    return r.id
  }

  // ── Tulum — checkout HOY ──────────────────────────────────────────────────
  const tRoomA1 = await getRoomId(tulum.id, 'A1')
  const tRoomA2 = await getRoomId(tulum.id, 'A2')
  const tRoomB1 = await getRoomId(tulum.id, 'B1')

  await seedCheckoutStay({
    stayId: 'seed-co-tulum-a1-today', journeyId: 'seed-jn-tulum-a1-today', segmentId: 'seed-sg-tulum-a1-today',
    propertyId: tulum.id, roomId: tRoomA1,
    guestName: 'Valentina Herrera', checkinAt: daysFromNow(-2, 15),
    scheduledCheckout: new Date(`${TODAY_STR}T12:00:00.000Z`),
    ratePerNight: 130, nights: 2, paxCount: 2, source: 'BOOKING_COM',
  })
  await seedCheckoutStay({
    stayId: 'seed-co-tulum-a2-today', journeyId: 'seed-jn-tulum-a2-today', segmentId: 'seed-sg-tulum-a2-today',
    propertyId: tulum.id, roomId: tRoomA2,
    guestName: 'Carlos Méndez', checkinAt: daysFromNow(-3, 15),
    scheduledCheckout: new Date(`${TODAY_STR}T12:00:00.000Z`),
    ratePerNight: 130, nights: 3, paxCount: 1, source: 'AIRBNB',
  })
  await seedCheckoutStay({
    stayId: 'seed-co-tulum-b1-today', journeyId: 'seed-jn-tulum-b1-today', segmentId: 'seed-sg-tulum-b1-today',
    propertyId: tulum.id, roomId: tRoomB1,
    guestName: 'Familia Rodríguez', checkinAt: daysFromNow(-4, 15),
    scheduledCheckout: new Date(`${TODAY_STR}T12:00:00.000Z`),
    ratePerNight: 280, nights: 4, paxCount: 4, source: 'DIRECT',
  })

  // ── Tulum — checkout MAÑANA ───────────────────────────────────────────────
  const tRoomB2 = await getRoomId(tulum.id, 'B2')
  const tRoomC1 = await getRoomId(tulum.id, 'C1')

  await seedCheckoutStay({
    stayId: 'seed-co-tulum-b2-tmrw', journeyId: 'seed-jn-tulum-b2-tmrw', segmentId: 'seed-sg-tulum-b2-tmrw',
    propertyId: tulum.id, roomId: tRoomB2,
    guestName: 'Andrés Morales', checkinAt: daysFromNow(-2, 15),
    scheduledCheckout: new Date(`${TOMORROW_STR}T12:00:00.000Z`),
    ratePerNight: 280, nights: 3, paxCount: 2, source: 'EXPEDIA',
  })
  await seedCheckoutStay({
    stayId: 'seed-co-tulum-c1-tmrw', journeyId: 'seed-jn-tulum-c1-tmrw', segmentId: 'seed-sg-tulum-c1-tmrw',
    propertyId: tulum.id, roomId: tRoomC1,
    guestName: 'Laura Gutiérrez', checkinAt: daysFromNow(-1, 15),
    scheduledCheckout: new Date(`${TOMORROW_STR}T12:00:00.000Z`),
    ratePerNight: 280, nights: 2, paxCount: 3, source: 'DIRECT',
  })

  // ── Tulum — checkout PASADO MAÑANA ────────────────────────────────────────
  const tRoomC2 = await getRoomId(tulum.id, 'C2')

  await seedCheckoutStay({
    stayId: 'seed-co-tulum-c2-day2', journeyId: 'seed-jn-tulum-c2-day2', segmentId: 'seed-sg-tulum-c2-day2',
    propertyId: tulum.id, roomId: tRoomC2,
    guestName: 'Roberto Quintero', checkinAt: daysFromNow(-1, 15),
    scheduledCheckout: new Date(`${DAY2_STR}T12:00:00.000Z`),
    ratePerNight: 280, nights: 3, paxCount: 2, source: 'BOOKING_COM',
  })

  console.log('✅ Tulum checkout stays: A1/A2/B1 (hoy) · B2/C1 (mañana) · C2 (pasado)')

  // ── Cancún — checkout HOY ─────────────────────────────────────────────────
  const cRoom201 = await getRoomId(cancun.id, '201')
  const cRoom202 = await getRoomId(cancun.id, '202')

  await seedCheckoutStay({
    stayId: 'seed-co-cancun-201-today', journeyId: 'seed-jn-cancun-201-today', segmentId: 'seed-sg-cancun-201-today',
    propertyId: cancun.id, roomId: cRoom201,
    guestName: 'Marco Fernández', checkinAt: daysFromNow(-2, 15),
    scheduledCheckout: new Date(`${TODAY_STR}T12:00:00.000Z`),
    ratePerNight: 100, nights: 2, paxCount: 2, source: 'BOOKING_COM',
  })
  await seedCheckoutStay({
    stayId: 'seed-co-cancun-202-today', journeyId: 'seed-jn-cancun-202-today', segmentId: 'seed-sg-cancun-202-today',
    propertyId: cancun.id, roomId: cRoom202,
    guestName: 'Patricia Vásquez', checkinAt: daysFromNow(-3, 15),
    scheduledCheckout: new Date(`${TODAY_STR}T12:00:00.000Z`),
    ratePerNight: 100, nights: 3, paxCount: 1, source: 'DIRECT',
  })

  // ── Cancún — checkout MAÑANA ──────────────────────────────────────────────
  const cRoom301 = await getRoomId(cancun.id, '301')

  await seedCheckoutStay({
    stayId: 'seed-co-cancun-301-tmrw', journeyId: 'seed-jn-cancun-301-tmrw', segmentId: 'seed-sg-cancun-301-tmrw',
    propertyId: cancun.id, roomId: cRoom301,
    guestName: 'Isabel Montoya', checkinAt: daysFromNow(-2, 15),
    scheduledCheckout: new Date(`${TOMORROW_STR}T12:00:00.000Z`),
    ratePerNight: 150, nights: 3, paxCount: 2, source: 'EXPEDIA',
  })

  // ── Cancún — checkout PASADO MAÑANA ──────────────────────────────────────
  const cRoom401 = await getRoomId(cancun.id, '401')

  await seedCheckoutStay({
    stayId: 'seed-co-cancun-401-day2', journeyId: 'seed-jn-cancun-401-day2', segmentId: 'seed-sg-cancun-401-day2',
    propertyId: cancun.id, roomId: cRoom401,
    guestName: 'Jorge Salamanca', checkinAt: daysFromNow(-1, 15),
    scheduledCheckout: new Date(`${DAY2_STR}T12:00:00.000Z`),
    ratePerNight: 250, nights: 3, paxCount: 4, source: 'AIRBNB',
  })

  console.log('✅ Cancún checkout stays: 201/202 (hoy) · 301 (mañana) · 401 (pasado)')
  console.log(`\n📅 Fechas de checkout (UTC):
     HOY         ${TODAY_STR}  → Tulum: A1, A2, B1  | Cancún: 201, 202
     MAÑANA      ${TOMORROW_STR}  → Tulum: B2, C1      | Cancún: 301
     PASADO MÑN  ${DAY2_STR}  → Tulum: C2           | Cancún: 401`)

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log("\n📋 Credenciales (todas con password '123456'):")
  console.log('  ── Tulum ──────────────────────────────────────────────────')
  console.log('  s@z.co     (Supervisor    · Ana García)')
  console.log('  r@z.co     (Recepción     · Carlos López   · mañana)')
  console.log('  r2@z.co    (Recepción     · Sofía Martínez · tarde)')
  console.log('  m@z.co     (Housekeeper   · María Torres   · piso 1 · Lun-Vie 7-15)')
  console.log('  v@z.co     (Housekeeper   · Valentina Cruz · piso 2 · Lun-Sáb 7-15)')
  console.log('  p@z.co     (Housekeeper   · Pedro Ramírez  · piso 3 · Mar-Sáb 14-22)')
  console.log('  d@z.co     (Housekeeper   · Diego Flores   · cabañas· Lun-Vie 13-21)')
  console.log('  j@z.co     (Mantenimiento · Javier Ruiz    · Lun-Vie 8-17)')
  console.log('  ── Cancún ─────────────────────────────────────────────────')
  console.log('  sc@z.co    (Supervisor    · Rodrigo Vega)')
  console.log('  rc@z.co    (Recepción     · Laura Mendez)')
  console.log('  l@z.co     (Housekeeper   · Luis Herrera   · piso 2 · Lun-Dom 8-16)')
  console.log('  c@z.co     (Housekeeper   · Carmen Silva   · pisos 3-4 · Lun-Sáb 8-16)')
  console.log('  rb@z.co    (Mantenimiento · Roberto Díaz   · Lun-Sáb 8-17)')
  console.log('\n✨ Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
