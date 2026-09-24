/**
 * seed-azucar-demo.ts — Reconfigura la propiedad piloto como "Azúcar Hotel Tulum"
 * con el inventario REAL del hotel (azucarhotel.com/alojamiento) + reservas vivas
 * relativas a HOY, para una demo con prospecto.
 *
 * Idempotente: se puede re-correr. Reutiliza la propiedad `prop-hotel-tulum-001`
 * (así el login de s@z.co cae directo en el calendario de Azúcar sin re-homing de
 * staff/usuarios). Requiere que `seed.ts` haya corrido antes (org + staff + legal
 * entity + user pivots ya existen).
 *
 * Inventario REAL (24 unidades, numeración operativa del hotel — owner 2026-09-17):
 *   · Bungalow ×6 — A1, A2, B1, B2, C1, C2 (jacuzzi, cap 2, $5,950 MXN)
 *   · Deluxe Doble Queen ×12 — 101-106 (piso 1) + 201-206 (piso 2) (2 camas, cap 4, $4,450 MXN)
 *   · Deluxe King ×6 — 301-306 (piso 3) (1 cama King, cap 2, $3,350 MXN)
 *
 * Todo en MXN (PMS + booking engine). El booking engine Fase 1 muestra la moneda
 * real de la tarifa (no convierte), por eso el hotel se denomina en pesos.
 *
 * Correr:
 *   cd apps/api && npx ts-node -r tsconfig-paths/register prisma/scripts/seed-azucar-demo.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const PROP = 'prop-hotel-tulum-001'
const USD_MXN = 18.6 // tipo de cambio de demo (realista sep-2026)

/** Fecha a N días de hoy, hora fija (mediodía UTC por default). */
function d(days: number, hour = 12, min = 0): Date {
  const x = new Date()
  x.setUTCHours(hour, min, 0, 0)
  x.setUTCDate(x.getUTCDate() + days)
  return x
}
/** Fecha (solo día) a N días de hoy — para campos @db.Date. */
function dateOnly(days: number): Date {
  const x = new Date()
  x.setUTCHours(0, 0, 0, 0)
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

async function main() {
  console.log('🍬 Azúcar Hotel Tulum — seed de demo\n')

  // ── 0. Lookups ──────────────────────────────────────────────────────────
  const prop = await prisma.property.findUnique({ where: { id: PROP } })
  if (!prop) throw new Error(`Propiedad ${PROP} no existe. Corre seed.ts primero.`)
  const orgId = prop.organizationId

  const staff = await prisma.staff.findMany({
    where: { email: { in: ['s@z.co', 'r@z.co', 'm@z.co', 'v@z.co'] } },
    select: { id: true, email: true },
  })
  const byEmail = Object.fromEntries(staff.map((s) => [s.email, s.id]))
  const sup = byEmail['s@z.co']
  const rec = byEmail['r@z.co']
  const hkMaria = byEmail['m@z.co']
  const hkVale = byEmail['v@z.co']
  if (!sup || !rec) throw new Error('Falta staff s@z.co / r@z.co. Corre seed.ts primero.')

  // ── 1. Rename property → Azúcar ─────────────────────────────────────────
  await prisma.property.update({
    where: { id: PROP },
    data: { name: 'Azúcar Hotel Tulum', region: 'Riviera Maya', city: 'Tulum', type: 'HOTEL' },
  })
  console.log('✅ Propiedad renombrada → Azúcar Hotel Tulum')

  // ── 2. Limpieza FK-safe de datos dinámicos de la propiedad ──────────────
  // Wipe en SQL ordenado por FK (la propiedad tiene un árbol de dependencias
  // profundo: checkouts, maintenance tickets+logs, readiness items, channex
  // webhook logs, staff coverages, rate seasons...). payment_logs tiene un
  // trigger append-only (§28) que hay que desactivar temporalmente — DDL es
  // transaccional, si algo falla se revierte todo. Idempotente.
  await prisma.$executeRawUnsafe(`
DO $$
DECLARE p TEXT := '${PROP}';
BEGIN
  DELETE FROM maintenance_ticket_logs     WHERE ticket_id IN (SELECT id FROM maintenance_tickets WHERE property_id=p);
  DELETE FROM maintenance_ticket_photos   WHERE ticket_id IN (SELECT id FROM maintenance_tickets WHERE property_id=p);
  DELETE FROM maintenance_ticket_comments WHERE ticket_id IN (SELECT id FROM maintenance_tickets WHERE property_id=p);
  DELETE FROM room_readiness_task_items WHERE task_id IN (SELECT id FROM room_readiness_tasks WHERE property_id=p);
  DELETE FROM room_readiness_tasks WHERE property_id=p;
  DELETE FROM room_blocks WHERE room_id IN (SELECT id FROM rooms WHERE "propertyId"=p);
  DELETE FROM unit_discrepancies WHERE "unitId" IN (SELECT u.id FROM units u JOIN rooms r ON u."roomId"=r.id WHERE r."propertyId"=p);
  DELETE FROM maintenance_issues WHERE "taskId" IN (SELECT ct.id FROM cleaning_tasks ct JOIN units u ON ct."unitId"=u.id JOIN rooms r ON u."roomId"=r.id WHERE r."propertyId"=p);
  DELETE FROM maintenance_tickets WHERE property_id=p;
  UPDATE channex_webhook_logs SET resulting_stay_id=NULL WHERE resulting_stay_id IN (SELECT id FROM guest_stays WHERE property_id=p);
  ALTER TABLE payment_logs DISABLE TRIGGER USER;
  DELETE FROM payment_logs WHERE stay_id IN (SELECT id FROM guest_stays WHERE property_id=p) OR paid_by_stay_id IN (SELECT id FROM guest_stays WHERE property_id=p);
  ALTER TABLE payment_logs ENABLE TRIGGER USER;
  DELETE FROM guest_contact_logs WHERE stay_id IN (SELECT id FROM guest_stays WHERE property_id=p);
  DELETE FROM guest_stay_notes   WHERE stay_id IN (SELECT id FROM guest_stays WHERE property_id=p);
  DELETE FROM guest_stay_logs    WHERE stay_id IN (SELECT id FROM guest_stays WHERE property_id=p);
  DELETE FROM stay_journey_events WHERE journey_id IN (SELECT id FROM stay_journeys WHERE property_id=p);
  DELETE FROM segment_nights WHERE segment_id IN (SELECT s.id FROM stay_segments s JOIN stay_journeys j ON s.journey_id=j.id WHERE j.property_id=p);
  DELETE FROM stay_segments WHERE journey_id IN (SELECT id FROM stay_journeys WHERE property_id=p);
  DELETE FROM stay_journeys WHERE property_id=p;
  DELETE FROM guest_stays WHERE property_id=p;
  DELETE FROM reservation_groups WHERE property_id=p;
  DELETE FROM task_logs WHERE "taskId" IN (SELECT ct.id FROM cleaning_tasks ct JOIN units u ON ct."unitId"=u.id JOIN rooms r ON u."roomId"=r.id WHERE r."propertyId"=p);
  DELETE FROM cleaning_notes WHERE "taskId" IN (SELECT ct.id FROM cleaning_tasks ct JOIN units u ON ct."unitId"=u.id JOIN rooms r ON u."roomId"=r.id WHERE r."propertyId"=p);
  DELETE FROM cleaning_tasks WHERE "unitId" IN (SELECT u.id FROM units u JOIN rooms r ON u."roomId"=r.id WHERE r."propertyId"=p);
  DELETE FROM checkouts WHERE "roomId" IN (SELECT id FROM rooms WHERE "propertyId"=p);
  DELETE FROM staff_coverages WHERE room_id IN (SELECT id FROM rooms WHERE "propertyId"=p);
  DELETE FROM units WHERE "roomId" IN (SELECT id FROM rooms WHERE "propertyId"=p);
  DELETE FROM rate_overrides WHERE property_id=p;
  DELETE FROM rate_seasons WHERE room_type_id IN (SELECT id FROM room_types WHERE property_id=p);
  DELETE FROM rooms WHERE "propertyId"=p;
  DELETE FROM room_types WHERE property_id=p;
END $$;`)
  console.log('✅ Datos dinámicos + inventario previo limpiados')

  // ── 3. Room types ───────────────────────────────────────────────────────
  const mkType = (name: string, code: string, maxOccupancy: number, baseRate: number, amenities: string[]) =>
    prisma.roomType.create({
      data: { organizationId: orgId, propertyId: PROP, name, code, maxOccupancy, baseRate, currency: 'MXN', amenities },
    })
  const [tBung, tKing, tQueen] = await Promise.all([
    mkType('Bungalow', 'BUNG', 2, 5950, ['Jacuzzi privado', 'Vista al mar', 'Roof top', 'WiFi', 'AC']),
    mkType('Deluxe King', 'DLXK', 2, 3350, ['Cama King', 'Vista jardín/mar', 'WiFi', 'AC', 'Minibar']),
    mkType('Deluxe Doble Queen', 'DLXQ', 4, 4450, ['2 Camas Queen', 'WiFi', 'AC', 'Minibar']),
  ])
  console.log('✅ RoomTypes: Bungalow, Deluxe King, Deluxe Doble Queen')

  // ── 4. Rooms + Units ────────────────────────────────────────────────────
  const roomSpecs: Array<{ number: string; floor: number; capacity: number; roomTypeId: string }> = [
    // 12 Deluxe Doble Queen — piso 1 (101-106) + piso 2 (201-206), 2 camas, cap 4
    ...['101', '102', '103', '104', '105', '106'].map((n) => ({ number: n, floor: 1, capacity: 4, roomTypeId: tQueen.id })),
    ...['201', '202', '203', '204', '205', '206'].map((n) => ({ number: n, floor: 2, capacity: 4, roomTypeId: tQueen.id })),
    // 6 Deluxe King — piso 3 (301-306), 1 cama King, cap 2
    ...['301', '302', '303', '304', '305', '306'].map((n) => ({ number: n, floor: 3, capacity: 2, roomTypeId: tKing.id })),
    // 6 Bungalows — A1/A2/B1/B2/C1/C2, jacuzzi, cap 2
    ...['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((n) => ({ number: n, floor: 0, capacity: 2, roomTypeId: tBung.id })),
  ]
  const roomByNumber: Record<string, string> = {}
  const unitByNumber: Record<string, string> = {}
  for (const s of roomSpecs) {
    const room = await prisma.room.create({
      data: {
        organizationId: orgId,
        propertyId: PROP,
        number: s.number,
        floor: s.floor,
        category: 'PRIVATE',
        capacity: s.capacity,
        roomTypeId: s.roomTypeId,
        status: 'AVAILABLE',
      },
    })
    roomByNumber[s.number] = room.id
    const unit = await prisma.unit.create({
      data: { organizationId: orgId, roomId: room.id, label: `Hab. ${s.number}`, status: 'AVAILABLE' },
    })
    unitByNumber[s.number] = unit.id
  }
  console.log(`✅ Rooms: ${roomSpecs.length} + units`)

  // ── 5. Booking Engine → azucar-tulum, MXN ───────────────────────────────
  await prisma.bookingEngineConfig.upsert({
    where: { propertyId: PROP },
    update: {
      slug: 'azucar-tulum',
      enabled: true,
      displayCurrency: 'MXN',
      heroTitle: 'Azúcar Hotel Tulum',
      heroSubtitle: 'Frente al mar en Tulum · Reserva directa sin comisiones · Pago en el hotel',
      primaryColor: '#a16207',
      publishedAt: new Date(),
    },
    create: {
      propertyId: PROP,
      slug: 'azucar-tulum',
      enabled: true,
      paymentPolicy: 'PAY_AT_HOTEL',
      heroTitle: 'Azúcar Hotel Tulum',
      heroSubtitle: 'Frente al mar en Tulum · Reserva directa sin comisiones · Pago en el hotel',
      primaryColor: '#a16207',
      defaultLanguage: 'es-MX',
      displayCurrency: 'MXN',
      publishedAt: new Date(),
    },
  })
  console.log('✅ Booking Engine: /book/azucar-tulum (MXN, enabled)')

  // ── 6. FX USD→MXN (ExchangeRate oficial + PropertyFxRate del hotel) ──────
  await prisma.exchangeRate.upsert({
    where: {
      organizationId_baseCurrency_quoteCurrency_effectiveDate_source: {
        organizationId: orgId,
        baseCurrency: 'USD',
        quoteCurrency: 'MXN',
        effectiveDate: dateOnly(0),
        source: 'BANXICO_SF43718',
      },
    },
    update: { rate: USD_MXN },
    create: {
      organizationId: orgId,
      baseCurrency: 'USD',
      quoteCurrency: 'MXN',
      rate: USD_MXN,
      source: 'BANXICO_SF43718',
      effectiveDate: dateOnly(0),
    },
  })
  await prisma.propertyFxRate.deleteMany({ where: { propertyId: PROP, baseCurrency: 'USD', quoteCurrency: 'MXN' } })
  await prisma.propertyFxRate.create({
    data: {
      propertyId: PROP,
      baseCurrency: 'USD',
      quoteCurrency: 'MXN',
      rate: USD_MXN,
      validFrom: dateOnly(-1),
      updatedById: sup,
    },
  })
  console.log(`✅ FX USD→MXN = ${USD_MXN}`)

  // ── 7. Reservas vivas (relativas a HOY) ─────────────────────────────────
  type StaySpec = {
    id: string
    room: string
    guest: string
    email: string
    phone: string
    nat: string
    pax: number
    inDay: number
    outDay: number
    rate: number
    source: string
    ota?: string
    otaCode?: string
    paymentModel?: 'HOTEL_COLLECT' | 'OTA_COLLECT'
    status?: 'inhouse' | 'arriving' | 'departed' | 'future' | 'noshow'
    paid?: 'full' | 'partial' | 'none'
    notes?: string
    guarantee?: boolean
  }

  const specs: StaySpec[] = [
    // IN-HOUSE
    { id: 'az-mar', room: 'A1', guest: 'Sophie Laurent', email: 'sophie.l@gmail.com', phone: '+33 6 12 34 56 78', nat: 'FR', pax: 2, inDay: -2, outDay: 2, rate: 5950, source: 'booking.com', ota: 'booking.com', otaCode: 'BDC-8842019', paymentModel: 'OTA_COLLECT', status: 'inhouse', paid: 'full', notes: 'Luna de miel — botella de vino de cortesía al llegar.' },
    { id: 'az-cielo', room: 'B1', guest: 'James Whitfield', email: 'jwhitfield@outlook.com', phone: '+44 7700 900123', nat: 'GB', pax: 2, inDay: -1, outDay: 3, rate: 5950, source: 'airbnb', ota: 'airbnb', otaCode: 'HM8QZ2KX', paymentModel: 'OTA_COLLECT', status: 'inhouse', paid: 'full' },
    { id: 'az-dk1', room: '301', guest: 'Carlos Mendoza', email: 'carlos.m@gmail.com', phone: '+52 984 111 0001', nat: 'MX', pax: 2, inDay: -1, outDay: 4, rate: 3350, source: 'direct', status: 'inhouse', paid: 'partial', notes: 'Viajero frecuente. Paga saldo al checkout.' },
    { id: 'az-dq1', room: '101', guest: 'Familia Gutiérrez', email: 'a.gutierrez@gmail.com', phone: '+52 55 2233 4455', nat: 'MX', pax: 4, inDay: -3, outDay: 1, rate: 4450, source: 'hostelworld', ota: 'hostelworld', otaCode: 'HW-552118', paymentModel: 'OTA_COLLECT', status: 'inhouse', paid: 'full', notes: 'Familia con 2 niños. Cuna solicitada.' },
    // SALE HOY (checkout hoy → tarea de limpieza)
    { id: 'az-arrecife', room: 'C1', guest: 'Elena Rossi', email: 'elena.rossi@gmail.com', phone: '+39 333 444 5566', nat: 'IT', pax: 2, inDay: -3, outDay: 0, rate: 5950, source: 'expedia', ota: 'expedia', otaCode: 'EXP-77120934', paymentModel: 'OTA_COLLECT', status: 'inhouse', paid: 'full' },
    // LLEGA HOY (sin confirmar)
    { id: 'az-agua', room: 'A2', guest: 'Nadia Petrova', email: 'nadia.p@gmail.com', phone: '+7 916 555 1234', nat: 'RU', pax: 2, inDay: 0, outDay: 4, rate: 5950, source: 'direct', status: 'arriving', paid: 'none' },
    { id: 'az-aire', room: 'B2', guest: 'Thomas Becker', email: 'thomas.becker@web.de', phone: '+49 151 2345 6789', nat: 'DE', pax: 2, inDay: 0, outDay: 3, rate: 5950, source: 'DIRECT_WEB', status: 'arriving', paid: 'none', notes: 'Reserva directa desde el sitio web del hotel (booking engine).' },
    { id: 'az-dq2', room: '102', guest: 'The Johnson Family', email: 'mjohnson@gmail.com', phone: '+1 305 555 7788', nat: 'US', pax: 4, inDay: 0, outDay: 5, rate: 4450, source: 'expedia', ota: 'expedia', otaCode: 'EXP-77340021', paymentModel: 'OTA_COLLECT', status: 'arriving', paid: 'full' },
    // NO-SHOW (ayer, cargo pendiente)
    { id: 'az-dk2', room: '302', guest: 'Robert Klein', email: 'rklein@gmail.com', phone: '+1 212 555 9090', nat: 'US', pax: 2, inDay: -1, outDay: 2, rate: 3350, source: 'booking.com', ota: 'booking.com', otaCode: 'BDC-8850432', paymentModel: 'OTA_COLLECT', status: 'noshow', paid: 'none', guarantee: true },
    // SALIÓ AYER (checked out → cuarto limpio)
    { id: 'az-luna', room: 'C2', guest: 'Marie Dubois', email: 'marie.d@gmail.com', phone: '+33 6 98 76 54 32', nat: 'FR', pax: 2, inDay: -5, outDay: -1, rate: 5950, source: 'direct', status: 'departed', paid: 'full' },
    // FUTURAS
    { id: 'az-dk3', room: '303', guest: 'Yuki Tanaka', email: 'yuki.t@gmail.com', phone: '+81 90 1234 5678', nat: 'JP', pax: 2, inDay: 3, outDay: 7, rate: 3350, source: 'airbnb', ota: 'airbnb', otaCode: 'HM7RT4PL', paymentModel: 'OTA_COLLECT', status: 'future', paid: 'full' },
    { id: 'az-dq3', room: '201', guest: 'Grupo López', email: 'lopez.eventos@gmail.com', phone: '+52 998 123 4567', nat: 'MX', pax: 4, inDay: 5, outDay: 8, rate: 4450, source: 'direct', status: 'future', paid: 'none' },
  ]

  const nights = (i: number, o: number) => Math.max(1, o - i)
  let created = 0
  for (const s of specs) {
    const roomId = roomByNumber[s.room]
    const n = nights(s.inDay, s.outDay)
    const total = s.rate * n
    const amountPaid = s.paid === 'full' ? total : s.paid === 'partial' ? Math.round(total / 2) : 0
    const paymentStatus = s.paid === 'full' ? 'PAID' : s.paid === 'partial' ? 'PARTIAL' : 'PENDING'
    const isInHouse = s.status === 'inhouse'
    const isDeparted = s.status === 'departed'
    const isNoShow = s.status === 'noshow'

    await prisma.guestStay.create({
      data: {
        id: s.id,
        organizationId: orgId,
        propertyId: PROP,
        roomId,
        guestName: s.guest,
        guestEmail: s.email,
        guestPhone: s.phone,
        nationality: s.nat,
        paxCount: s.pax,
        checkinAt: d(s.inDay, 15),
        scheduledCheckout: d(s.outDay, 12),
        actualCheckout: isDeparted ? d(s.outDay, 11, 20) : null,
        actualCheckin: isInHouse || isDeparted ? d(s.inDay, 15, 30) : null,
        checkinConfirmedById: isInHouse || isDeparted ? rec : null,
        ratePerNight: s.rate,
        currency: 'MXN',
        totalAmount: total,
        amountPaid,
        paymentStatus: paymentStatus as any,
        paymentModel: (s.paymentModel ?? 'HOTEL_COLLECT') as any,
        source: s.source,
        notes: s.notes ?? null,
        keyType: isInHouse || isDeparted ? 'PHYSICAL' : null,
        checkedInById: rec,
        checkedOutById: isDeparted ? rec : null,
        channexOtaName: s.ota ?? null,
        otaReservationCode: s.otaCode ?? null,
        channexGuaranteeMeta: s.guarantee
          ? { card_number: '****4242', card_type: 'visa', is_virtual: true, expiry: '11/28' }
          : undefined,
        noShowAt: isNoShow ? d(-1, 2) : null,
        noShowById: isNoShow ? sup : null,
        noShowReason: isNoShow ? 'No se presentó — night audit' : null,
        noShowFeeAmount: isNoShow ? s.rate : null,
        noShowFeeCurrency: isNoShow ? 'MXN' : null,
        noShowChargeStatus: isNoShow ? 'PENDING' : null,
        bookingLeadDays: Math.max(0, -s.inDay + Math.floor(Math.random() * 20)),
      },
    })

    // Payment log para pagados / parciales (folio con historial)
    if (amountPaid > 0) {
      await prisma.paymentLog.create({
        data: {
          organizationId: orgId,
          propertyId: PROP,
          stayId: s.id,
          method: s.paymentModel === 'OTA_COLLECT' ? 'OTA_PREPAID' : 'CASH',
          amount: amountPaid,
          currency: 'MXN',
          shiftDate: dateOnly(s.inDay),
          collectedById: rec,
        },
      })
    }
    created++
  }
  console.log(`✅ Reservas: ${created} (in-house, llegadas hoy, salida hoy, no-show, futuras)`)

  // ── 8. Tareas de housekeeping (para Hub Recamarista mobile) ─────────────
  const mkTask = async (roomNumber: string, status: string, priority: string, assignedToId: string | null, opts: { sameDay?: boolean; startedAt?: Date; finishedAt?: Date; verifiedAt?: Date } = {}) => {
    await prisma.cleaningTask.create({
      data: {
        organizationId: orgId,
        unitId: unitByNumber[roomNumber],
        assignedToId,
        status: status as any,
        taskType: 'CLEANING',
        requiredCapability: 'CLEANING',
        priority: priority as any,
        hasSameDayCheckIn: opts.sameDay ?? false,
        scheduledFor: dateOnly(0),
        startedAt: opts.startedAt ?? null,
        finishedAt: opts.finishedAt ?? null,
        verifiedAt: opts.verifiedAt ?? null,
        verifiedById: opts.verifiedAt ? sup : null,
      },
    })
  }
  // Bungalow C1 (Elena) salió hoy → listo para limpiar (María)
  await mkTask('C1', 'READY', 'HIGH', hkMaria ?? null)
  // King 304 → limpieza en progreso (Valentina)
  await mkTask('304', 'IN_PROGRESS', 'MEDIUM', hkVale ?? hkMaria ?? null, { startedAt: d(0, 10) })
  // Bungalow C2 (Marie) salió ayer → verificado (cuarto listo)
  await mkTask('C2', 'VERIFIED', 'MEDIUM', hkMaria ?? null, { startedAt: d(-1, 11, 30), finishedAt: d(-1, 12), verifiedAt: d(-1, 12, 20) })
  // Queen 202 → stayover pendiente sin asignar
  await mkTask('202', 'UNASSIGNED', 'LOW', null)
  console.log('✅ Tareas de housekeeping: 4 (READY, IN_PROGRESS, VERIFIED, UNASSIGNED)')

  // Estados de cuarto acordes
  await prisma.room.update({ where: { id: roomByNumber['C1'] }, data: { status: 'CLEANING' } }).catch(() => {})

  console.log('\n🍬 Listo — Azúcar Hotel Tulum sembrado para demo.\n')
  console.log('   Login:  s@z.co / 123456  (Supervisor)  ·  r@z.co / 123456 (Recepción)')
  console.log('   PMS:    http://localhost:5173  →  calendario Azúcar')
  console.log('   Booking: http://localhost:5173/book/azucar-tulum')
}

main()
  .catch((e) => {
    console.error('❌', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
