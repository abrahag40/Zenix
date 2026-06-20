/**
 * run-channex-cert-scenarios.ts — Ejecuta los Test Scenarios #2–#10 de la
 * certificación Channex con los VALORES OFICIALES EXACTOS de la doc
 * (https://docs.channex.io/api-v.1-documentation/pms-certification-tests) y
 * captura el `task id` (data[0].id) de cada uno para el formulario.
 *
 * Test #1 (Full Sync) tiene su propio script: run-channex-cert-fullsync.ts.
 *
 * Ejecuta el gateway PRODUCTIVO (pushAvailability / pushRestrictions) contra
 * "Test Property - Zenix" en el sandbox. Cada escenario = 1 llamada batch (AP-4)
 * = 1 task id. Valores verificados contra la doc oficial el 2026-06-19.
 *
 * Correr:
 *   cd apps/api && set -a && source .env && set +a
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/run-channex-cert-scenarios.ts
 */
import { ConfigService } from '@nestjs/config'
import {
  ChannexGateway,
  ChannexAvailabilityEntry,
  ChannexRestrictionEntry,
} from '../../src/integrations/channex/channex.gateway'

const PROPERTY_ID = process.env.CHANNEX_SANDBOX_PROPERTY_ID ?? ''

// ── IDs del sandbox "Test Property - Zenix" (channex-cert-property-ids.md) ────
const TWIN = '2e0b297f-b44c-4d60-87c5-1d3e27219628' // room type
const DOUBLE = 'cdff8770-40ff-4f2d-b402-2463a2eec9c2' // room type
const TWIN_BAR = '88a90aa7-1bcc-41e4-a3dd-3e2a35227028'
const TWIN_BB = '56319005-c419-43af-b05b-5d3ad1944592'
const DOUBLE_BAR = 'c57ad75e-aeee-434e-9ce1-2170f379912c'
const DOUBLE_BB = 'ca745836-8385-4a9c-bad7-15fede59a755'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface ScenarioResult {
  test: string
  taskId: string | null
  error?: string
}

async function main(): Promise<void> {
  const baseUrl = process.env.CHANNEX_BASE_URL ?? ''
  const apiKey = process.env.CHANNEX_API_KEY ?? ''
  if (!apiKey || !baseUrl.includes('staging.channex.io')) {
    console.error('❌ Necesita CHANNEX_API_KEY + CHANNEX_BASE_URL=staging. set -a && source .env && set +a')
    process.exit(1)
  }
  if (!PROPERTY_ID) {
    console.error('❌ Falta CHANNEX_SANDBOX_PROPERTY_ID en .env.')
    process.exit(1)
  }

  const config = new ConfigService()
  ;(config as unknown as { get: (k: string) => unknown }).get = (k: string) => {
    if (k === 'CHANNEX_API_KEY') return apiKey
    if (k === 'CHANNEX_BASE_URL') return baseUrl
    return undefined
  }
  const gateway = new ChannexGateway(config)
  const results: ScenarioResult[] = []
  const P = PROPERTY_ID

  async function restr(test: string, entries: ChannexRestrictionEntry[]): Promise<void> {
    try {
      const { taskId } = await gateway.pushRestrictions(entries)
      results.push({ test, taskId })
      console.log(`✓ ${test}: ${taskId ?? '(sin id)'}`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ test, taskId: null, error })
      console.log(`✗ ${test}: ERROR ${error}`)
    }
    await sleep(900)
  }
  async function avail(test: string, entries: ChannexAvailabilityEntry[]): Promise<void> {
    try {
      const { taskId } = await gateway.pushAvailability(entries)
      results.push({ test, taskId })
      console.log(`✓ ${test}: ${taskId ?? '(sin id)'}`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ test, taskId: null, error })
      console.log(`✗ ${test}: ERROR ${error}`)
    }
    await sleep(900)
  }

  console.log('🚀 Test Scenarios #2–#10 (valores oficiales) — Test Property - Zenix\n')

  // Test #2 — single date, single rate: Twin BAR @ 2026-11-22 = 333
  await restr('Test 2', [{ propertyId: P, ratePlanId: TWIN_BAR, date: '2026-11-22', rate: 333 }])

  // Test #3 — single date, multiple rates (1 call)
  await restr('Test 3', [
    { propertyId: P, ratePlanId: TWIN_BAR, date: '2026-11-21', rate: 333 },
    { propertyId: P, ratePlanId: DOUBLE_BAR, date: '2026-11-25', rate: 444 },
    { propertyId: P, ratePlanId: DOUBLE_BB, date: '2026-11-29', rate: 456.23 },
  ])

  // Test #4 — multiple dates, multiple rates (1 call)
  await restr('Test 4', [
    { propertyId: P, ratePlanId: TWIN_BAR, dateFrom: '2026-11-01', dateTo: '2026-11-10', rate: 241 },
    { propertyId: P, ratePlanId: DOUBLE_BAR, dateFrom: '2026-11-10', dateTo: '2026-11-16', rate: 312.66 },
    { propertyId: P, ratePlanId: DOUBLE_BB, dateFrom: '2026-11-01', dateTo: '2026-11-20', rate: 111 },
  ])

  // Test #5 — min stay (1 call)
  await restr('Test 5', [
    { propertyId: P, ratePlanId: TWIN_BAR, date: '2026-11-23', minStayThrough: 3 },
    { propertyId: P, ratePlanId: DOUBLE_BAR, date: '2026-11-25', minStayThrough: 2 },
    { propertyId: P, ratePlanId: DOUBLE_BB, date: '2026-11-15', minStayThrough: 5 },
  ])

  // Test #6 — stop sell (1 call)
  await restr('Test 6', [
    { propertyId: P, ratePlanId: TWIN_BAR, date: '2026-11-14', stopSell: true },
    { propertyId: P, ratePlanId: DOUBLE_BAR, date: '2026-11-16', stopSell: true },
    { propertyId: P, ratePlanId: DOUBLE_BB, date: '2026-11-20', stopSell: true },
  ])

  // Test #7 — multiple restrictions combined (1 call)
  await restr('Test 7', [
    { propertyId: P, ratePlanId: TWIN_BAR, dateFrom: '2026-11-01', dateTo: '2026-11-10', closedToArrival: true, closedToDeparture: false, maxStay: 4, minStayThrough: 1 },
    { propertyId: P, ratePlanId: TWIN_BB, dateFrom: '2026-11-12', dateTo: '2026-11-16', closedToArrival: false, closedToDeparture: true, minStayThrough: 6 },
    { propertyId: P, ratePlanId: DOUBLE_BAR, dateFrom: '2026-11-10', dateTo: '2026-11-16', closedToArrival: true, minStayThrough: 2 },
    { propertyId: P, ratePlanId: DOUBLE_BB, dateFrom: '2026-11-01', dateTo: '2026-11-20', minStayThrough: 10 },
  ])

  // Test #8 — half-year (1 call)
  await restr('Test 8', [
    { propertyId: P, ratePlanId: TWIN_BAR, dateFrom: '2026-12-01', dateTo: '2027-05-01', rate: 432, minStayThrough: 2 },
    { propertyId: P, ratePlanId: DOUBLE_BAR, dateFrom: '2026-12-01', dateTo: '2027-05-01', rate: 342, minStayThrough: 3 },
  ])

  // Test #9 — single date availability (1 call, ambas room types batched)
  await avail('Test 9', [
    { propertyId: P, roomTypeId: TWIN, date: '2026-11-21', availability: 7 },
    { propertyId: P, roomTypeId: DOUBLE, date: '2026-11-25', availability: 0 },
  ])

  // Test #10 — multi-date availability (1 call)
  await avail('Test 10', [
    { propertyId: P, roomTypeId: TWIN, dateFrom: '2026-11-10', dateTo: '2026-11-16', availability: 3 },
    { propertyId: P, roomTypeId: DOUBLE, dateFrom: '2026-11-17', dateTo: '2026-11-24', availability: 4 },
  ])

  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log(' RESULTADOS — task id por test case (pegar en el formulario)')
  console.log('═══════════════════════════════════════════════════════════════════')
  for (const r of results) {
    console.log(`${r.test.padEnd(10)} | ${r.taskId ?? `ERROR: ${r.error ?? 'sin id'}`}`)
  }
  console.log('═══════════════════════════════════════════════════════════════════')
  const ok = results.filter((r) => r.taskId).length
  console.log(`${ok}/${results.length} con task id.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Runner falló:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
