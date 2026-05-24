/**
 * Sprint CHANNEX-UX-E2-E3 demo seed.
 *
 * Inyecta 3 reservas OTA en Hotel Tulum para verificar el flujo E2:
 *   1. Booking.com — futura, sin cancelar (target del cancel dialog OTA push)
 *   2. Expedia    — futura, con channexLastSyncAt previo (caso chip "Última sync")
 *   3. Airbnb     — futura, sin cancelar (target del warning Airbnb extranet)
 *
 * Idempotente — borra y re-crea las 3 con channexBookingId fijos.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-demo.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PROPERTY_ID = 'prop-hotel-tulum-001'

async function main() {
  const rooms = await prisma.room.findMany({
    where: { propertyId: PROPERTY_ID },
    take: 5,
    orderBy: { number: 'asc' },
  })
  if (rooms.length < 3) throw new Error('Need at least 3 rooms in Hotel Tulum seed')

  const property = await prisma.property.findUnique({
    where: { id: PROPERTY_ID },
    select: { organizationId: true },
  })
  if (!property) throw new Error('Property not found')

  // Pick any recepción staff to satisfy NOT NULL checkedInById
  const staff = await prisma.staff.findFirst({
    where: { propertyId: PROPERTY_ID, department: 'RECEPTION' },
    select: { id: true },
  })
  if (!staff) throw new Error('No reception staff in Hotel Tulum')

  const FIXED_IDS = [
    'demo-channex-booking-001',
    'demo-channex-booking-002',
    'demo-channex-booking-003',
  ]

  // Cleanup previous demo rows — FK-safe ordering (logs → stays).
  const existingStays = await prisma.guestStay.findMany({
    where: { channexBookingId: { in: FIXED_IDS } },
    select: { id: true },
  })
  if (existingStays.length) {
    const ids = existingStays.map((s) => s.id)
    await prisma.guestStayLog.deleteMany({ where: { stayId: { in: ids } } })
    await prisma.guestStay.deleteMany({ where: { id: { in: ids } } })
  }

  const baseDate = new Date()
  baseDate.setHours(15, 0, 0, 0)
  const tomorrow = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000)
  const dayAfter = new Date(tomorrow.getTime() + 48 * 60 * 60 * 1000)

  // Nota: el guestName NUNCA debe incluir el nombre del OTA — el chip de brand
  // (color oficial Booking navy / Airbnb coral / Expedia yellow) ya identifica el
  // canal de manera limpia (NN/g 2024 chip-pattern).
  const reservations = [
    {
      channexBookingId: FIXED_IDS[0],
      channexOtaName: 'booking_com',
      guestName: 'María González',
      roomId: rooms[0].id,
      ratePerNight: 120,
      paymentModel: 'OTA_COLLECT' as const,
      channexLastSyncAt: null,
    },
    {
      channexBookingId: FIXED_IDS[1],
      channexOtaName: 'expedia',
      guestName: 'Tom Smith',
      roomId: rooms[1].id,
      ratePerNight: 145,
      paymentModel: 'HOTEL_COLLECT' as const,
      // Sync previa (no cancelado todavía) — caso chip "Última sync OTA hace…"
      channexLastSyncAt: new Date(Date.now() - 10 * 60 * 1000), // hace 10 min
    },
    {
      channexBookingId: FIXED_IDS[2],
      channexOtaName: 'airbnb',
      guestName: 'Pierre Dubois',
      roomId: rooms[2].id,
      ratePerNight: 95,
      paymentModel: 'OTA_COLLECT' as const,
      channexLastSyncAt: null,
    },
  ]

  for (const r of reservations) {
    await prisma.guestStay.create({
      data: {
        organizationId: property.organizationId,
        propertyId: PROPERTY_ID,
        roomId: r.roomId,
        guestName: r.guestName,
        guestEmail: 'demo@example.com',
        paxCount: 2,
        currency: 'USD',
        ratePerNight: r.ratePerNight,
        totalAmount: r.ratePerNight * 2,
        amountPaid: r.paymentModel === 'OTA_COLLECT' ? r.ratePerNight * 2 : 0,
        checkinAt: tomorrow,
        scheduledCheckout: dayAfter,
        source: 'OTA',
        checkedInById: staff.id,
        channexBookingId: r.channexBookingId,
        channexOtaName: r.channexOtaName,
        channexLastSyncAt: r.channexLastSyncAt,
        paymentModel: r.paymentModel,
      },
    })
    console.log(`✓ ${r.guestName} → Hab ${rooms.find(rm => rm.id === r.roomId)?.number}`)
  }

  console.log('\n✨ Demo Channex stays seeded.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
