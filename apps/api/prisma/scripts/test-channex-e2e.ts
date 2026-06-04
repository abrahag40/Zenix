/**
 * E2E Channex inbound test — pre-prod validation.
 *
 * 1. Configura BD dev con mappings reales del sandbox Tulum:
 *    - PropertySettings.channexPropertyId + channexWebhookSecret
 *    - Room.channexRoomTypeId por cada Room.roomTypeId
 * 2. Emite webhook sintético hacia http://localhost:3000/api/webhooks/channex
 *    con la booking real BDC-5149600805 (Che Tulum) ya en Channex sandbox.
 * 3. Espera procesamiento async (outbox + puller) y verifica que:
 *    - ChannexWebhookLog persistió la entrega
 *    - ChannexOutbox quedó en SUCCEEDED (o FAILED con razón)
 *    - GuestStay con channexBookingId set
 *
 * Nota: el booking sandbox tiene `room_type_id: null` → se espera conflict
 * UNMAPPED_RATE_PLAN (path documentado §137). Eso es feature, no bug — prueba
 * el pipeline de conflict resolution + SUPERVISOR notif.
 *
 * Run: `npx ts-node -r tsconfig-paths/register prisma/scripts/test-channex-e2e.ts`
 */
import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'

const CHANNEX_PROPERTY_ID = 'ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13'
const ZENIX_PROPERTY_ID = 'prop-hotel-tulum-001'
const BOOKING_ID = 'f2f58987-bd2f-4601-84f1-30bba95e4308'
const REVISION_ID = '90331fc6-eb77-4c4b-aa03-0d24c53f5d05'

// Mapping Channex roomTypeId ↔ Zenix RoomType.name
const ROOM_TYPE_MAP: Record<string, string> = {
  '8ed90f98-f082-450b-9d46-1b41c5ad2c2b': 'Cabaña',
  '2bde3aba-2f90-4890-a61d-2ab28f3a979b': 'Estándar',
  'e18cc549-1a68-4ec5-92c1-2ae89295b6ae': 'Junior Suite',
  'b938aec0-0261-4acd-99c4-78aa2ce424ab': 'Suite',
  'c73d5ea8-89ea-46e3-ba92-78a47e44b0d5': 'Superior',
}

const prisma = new PrismaClient()

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' E2E Channex inbound test — Hotel Tulum')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // ── Step 1: configure PropertySettings ───────────────────────────────
  const webhookSecret = randomBytes(32).toString('hex')
  await prisma.propertySettings.update({
    where: { propertyId: ZENIX_PROPERTY_ID },
    data: {
      channexPropertyId: CHANNEX_PROPERTY_ID,
      channexWebhookSecret: webhookSecret,
      channexWebhookSecretRequired: true,
    },
  })
  console.log(`✓ PropertySettings: channexPropertyId=${CHANNEX_PROPERTY_ID.slice(0, 12)}…`)
  console.log(`✓ Webhook secret rotated (32 bytes hex)`)

  // ── Step 2: map rooms ────────────────────────────────────────────────
  const zenixRoomTypes = await prisma.roomType.findMany({
    where: { propertyId: ZENIX_PROPERTY_ID },
    select: { id: true, name: true },
  })
  const reverseMap: Record<string, string> = {}
  for (const [channexId, name] of Object.entries(ROOM_TYPE_MAP)) {
    const zt = zenixRoomTypes.find((r) => r.name === name)
    if (zt) reverseMap[zt.id] = channexId
  }
  let totalMapped = 0
  for (const [zenixTypeId, channexTypeId] of Object.entries(reverseMap)) {
    const res = await prisma.room.updateMany({
      where: { propertyId: ZENIX_PROPERTY_ID, roomTypeId: zenixTypeId },
      data: { channexRoomTypeId: channexTypeId },
    })
    totalMapped += res.count
    console.log(`  · mapped ${res.count} rooms of "${zenixRoomTypes.find((r) => r.id === zenixTypeId)?.name}" → ${channexTypeId.slice(0, 12)}…`)
  }
  console.log(`✓ Total rooms mapped: ${totalMapped}`)

  // ── Step 3: emit synthetic webhook ───────────────────────────────────
  const payload = {
    event: 'booking_new',
    property_id: CHANNEX_PROPERTY_ID,
    user_id: 'test-script',
    timestamp: new Date().toISOString(),
    payload: { booking_id: BOOKING_ID, revision_id: REVISION_ID },
  }

  console.log()
  console.log('→ POST http://localhost:3000/api/webhooks/channex')
  console.log(`  event: booking_new · booking: ${BOOKING_ID.slice(0, 12)}… · revision: ${REVISION_ID.slice(0, 12)}…`)

  const t0 = Date.now()
  const res = await fetch('http://localhost:3000/api/webhooks/channex', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-channex-property-id': ZENIX_PROPERTY_ID,
      authorization: `Bearer ${webhookSecret}`,
    },
    body: JSON.stringify(payload),
  })
  const ack = (await res.json()) as any
  console.log(`✓ HTTP ${res.status} in ${Date.now() - t0}ms`)
  console.log(`  ack: logId=${ack.logId?.slice(0, 8)} outboxId=${ack.outboxId?.slice(0, 8)} msg="${ack.message}"`)

  // ── Step 4: wait + verify ────────────────────────────────────────────
  console.log()
  console.log('… waiting 6s for async processing (outbox + puller)…')
  await new Promise((r) => setTimeout(r, 6000))

  const log = await prisma.channexWebhookLog.findUnique({ where: { id: ack.logId } })
  console.log(`✓ ChannexWebhookLog: ${log ? 'PERSISTED' : 'MISSING'} ${log ? `· result=${log.result ?? '(in-flight)'}` : ''}`)

  const outbox = ack.outboxId ? await prisma.channexOutbox.findUnique({ where: { id: ack.outboxId } }) : null
  console.log(`✓ ChannexOutbox: ${outbox ? `status=${outbox.status} attempts=${outbox.attempts}` : 'MISSING'}`)
  if (outbox?.lastError) console.log(`  lastError: ${outbox.lastError}`)

  const stay = await prisma.guestStay.findUnique({ where: { channexBookingId: BOOKING_ID } })
  if (stay) {
    console.log(`✓ GuestStay created:`)
    console.log(`  · id: ${stay.id.slice(0, 8)}`)
    console.log(`  · guestName: ${stay.guestName}`)
    console.log(`  · channexBookingId: ${stay.channexBookingId}`)
    console.log(`  · channexOtaName: ${stay.channexOtaName}`)
    console.log(`  · channexConflict: ${stay.channexConflict}`)
    console.log(`  · checkinAt: ${stay.checkinAt?.toISOString().slice(0, 10)}`)
    console.log(`  · scheduledCheckout: ${stay.scheduledCheckout.toISOString().slice(0, 10)}`)
    console.log(`  · totalAmount: ${stay.totalAmount} ${stay.currency}`)
    console.log(`  · roomId: ${stay.roomId} (${stay.channexConflict ? 'placeholder' : 'mapped'})`)
  } else {
    console.log(`✗ GuestStay NOT created — pipeline broken`)
  }

  // Notif a SUPERVISOR
  const notif = await prisma.appNotification.findFirst({
    where: { type: 'ACTION_REQUIRED', body: { contains: 'Channex' } },
    orderBy: { createdAt: 'desc' },
  })
  if (notif) {
    console.log(`✓ AppNotification raised: ${notif.title}`)
    console.log(`  · priority: ${notif.priority}`)
  }

  console.log()
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' Done. Inspect via Zenix UI:')
  console.log('   /channex/conflicts → review queue')
  console.log('   /pms → calendar (mostrará el conflict si ya tiene fecha visible)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
