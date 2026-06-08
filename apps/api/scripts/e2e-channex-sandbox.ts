/**
 * E2E Channex sandbox real test.
 * 1. Probe Channex outbound queue state (DEAD_LETTER counts, recent attempts).
 * 2. Trigger an availability push for Hotel Tulum → observe outbox row.
 * 3. Verify worker drains it OR shows pending state.
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function login(): Promise<string> {
  const r = await fetch('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 's@z.co', password: '123456' }) })
  return (await r.json()).accessToken
}

;(async () => {
  console.log('=== Channex outbound queue snapshot ===')
  const outboxRows = await p.channexOutboundQueue.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    select: { id: true, kind: true, status: true, attempts: true, lastError: true, createdAt: true, processedAt: true, nextAttemptAt: true },
  })
  console.log(`outbox rows: ${outboxRows.length}`)
  const byStatus: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  for (const r of outboxRows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
  }
  console.log('by status:', byStatus)
  console.log('by kind:', byKind)

  const deadLetters = outboxRows.filter((r) => r.status === 'DEAD_LETTER')
  console.log(`\nDEAD_LETTER count: ${deadLetters.length}`)
  for (const dl of deadLetters.slice(0, 5)) {
    console.log(`  ${dl.id.slice(0, 8)} kind=${dl.kind} attempts=${dl.attempts} err=${(dl.lastError ?? '').slice(0, 100)}`)
  }

  console.log('\n=== Channex inbound webhook log snapshot ===')
  const webhookLogs = await p.channexWebhookLog.findMany({
    take: 20,
    orderBy: { receivedAt: 'desc' },
    select: { id: true, eventType: true, result: true, errorMessage: true, receivedAt: true, processedAt: true, signatureValid: true, propertyId: true },
  })
  console.log(`recent webhooks: ${webhookLogs.length}`)
  for (const w of webhookLogs.slice(0, 5)) {
    console.log(`  ${w.eventType} result=${w.result} valid=${w.signatureValid} ${w.receivedAt.toISOString().slice(0, 19)} ${(w.errorMessage ?? '').slice(0, 60)}`)
  }

  console.log('\n=== Full sync state ===')
  const props = await p.propertySettings.findMany({
    select: { propertyId: true, channexPropertyId: true, channexLastFullSyncAt: true, channexProvisioningStatus: true },
    where: { channexPropertyId: { not: null } },
  })
  for (const ps of props) {
    console.log(`  propertyId=${ps.propertyId.slice(0,8)} chnxId=${ps.channexPropertyId?.slice(0,8)} lastFullSync=${ps.channexLastFullSyncAt?.toISOString() ?? 'never'} provision=${ps.channexProvisioningStatus}`)
  }

  console.log('\n=== Outbound recent failures ===')
  const failures = outboxRows.filter((r) => r.lastError).slice(0, 10)
  for (const f of failures) {
    console.log(`  ${f.id.slice(0, 8)} ${f.kind} ${f.status} attempts=${f.attempts} err=${(f.lastError ?? '').slice(0, 80)}`)
  }
  await p.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
