import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function login(email: string, pass: string): Promise<string> {
  const r = await fetch('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) })
  return (await r.json()).accessToken
}
;(async () => {
  // Create a fresh test stay arriving NOW in a free room. Pick room A1 (Cabaña).
  const room = await p.room.findFirst({ where: { number: 'A1', propertyId: 'prop-hotel-tulum-001' }, select: { id: true } })
  if (!room) { console.log('no room A1'); await p.$disconnect(); return }
  // Cleanup any prior test stay
  await p.guestStay.deleteMany({ where: { guestName: 'RaceTest Subject', roomId: room.id } })
  const now = new Date()
  const supervisor = await p.user.findUnique({ where: { email: 's@z.co' }, select: { id: true } })
  const stay = await p.guestStay.create({
    data: {
      organizationId: (await p.property.findUnique({ where: { id: 'prop-hotel-tulum-001' }, select: { organizationId: true } }))!.organizationId,
      propertyId: 'prop-hotel-tulum-001',
      roomId: room.id,
      guestName: 'RaceTest Subject',
      paxCount: 1,
      checkinAt: now,
      scheduledCheckout: new Date(now.getTime() + 86400000),
      ratePerNight: 100, totalAmount: 100, amountPaid: 100, currency: 'USD',
      paymentStatus: 'PAID', paymentModel: 'HOTEL_COLLECT',
      checkedInById: supervisor!.id,
    },
  })
  console.log('test stay created:', stay.id)
  const [t1, t2] = await Promise.all([login('s@z.co', '123456'), login('r@z.co', '123456')])
  const url = `http://localhost:3000/api/v1/guest-stays/${stay.id}/confirm-checkin`
  const body = JSON.stringify({ documentVerified: true, documentType: 'PASSPORT', documentPhotoUrl: 'data:image/jpeg;base64,/9j/test', payments: [] })
  console.log('=== 2 concurrent confirm-checkin ===')
  const t0 = Date.now()
  const results = await Promise.allSettled([
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t1}` }, body }),
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t2}` }, body }),
  ])
  console.log('elapsed:', Date.now() - t0, 'ms')
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'rejected') { console.log(`req ${i+1}: REJECTED`, r.reason); continue }
    const text = await r.value.text()
    console.log(`req ${i+1}: HTTP ${r.value.status}`, text.slice(0, 200))
  }
  const after = await p.guestStay.findUnique({ where: { id: stay.id }, select: { actualCheckin: true, checkinConfirmedById: true, paymentLogs: { select: { id: true, amount: true } } } })
  console.log('after:', JSON.stringify(after, null, 2))
  // Cleanup
  await p.paymentLog.deleteMany({ where: { stayId: stay.id } })
  await p.guestStayLog.deleteMany({ where: { stayId: stay.id } })
  await p.guestStay.delete({ where: { id: stay.id } })
  console.log('cleanup done')
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
