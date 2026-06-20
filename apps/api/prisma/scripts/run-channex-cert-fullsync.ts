/**
 * run-channex-cert-fullsync.ts — Test case #1 (Full Sync) de la certificación.
 *
 * El cert pide: 500 días de Availability + Rates & restrictions para TODAS las
 * habitaciones y TODAS las tarifas, en EXACTAMENTE 2 API calls:
 *   1) 1× 500 días Availability (All Rooms)
 *   2) 1× 500 días Rates & restrictions (All Rates)
 * Docs: https://docs.channex.io/api-v.1-documentation/pms-certification-tests#id-1.-full-data-update-full-sync
 *
 * "All Rooms / All Rates" = descubrimos dinámicamente TODOS los room types y
 * rate plans de la property vía la API (listRoomTypes / listRatePlans) para no
 * dejar ninguno fuera. Cada call devuelve UN task id → reportar ambos, uno por
 * línea (como pide el formulario).
 *
 * Ejecuta el gateway PRODUCTIVO (mismos métodos que el worker). Solo captura el
 * task id de la respuesta.
 *
 * Correr (desde apps/api, .env apuntando al sandbox):
 *   set -a && source .env && set +a
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/run-channex-cert-fullsync.ts
 */
import { ConfigService } from '@nestjs/config'
import {
  ChannexGateway,
  ChannexAvailabilityEntry,
  ChannexRestrictionEntry,
} from '../../src/integrations/channex/channex.gateway'

const PROPERTY_ID = process.env.CHANNEX_SANDBOX_PROPERTY_ID ?? ''
const SYNC_DAYS = 500

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(base: Date, n: number): Date {
  return new Date(base.getTime() + n * 86_400_000)
}

async function main(): Promise<void> {
  const baseUrl = process.env.CHANNEX_BASE_URL ?? ''
  const apiKey = process.env.CHANNEX_API_KEY ?? ''
  if (!apiKey || !baseUrl.includes('staging.channex.io')) {
    console.error('❌ Necesita CHANNEX_API_KEY + CHANNEX_BASE_URL=staging.channex.io. set -a && source .env && set +a')
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

  const today = new Date()
  const dateFrom = isoDate(today)
  const dateTo = isoDate(addDays(today, SYNC_DAYS - 1))

  console.log('🔄 Full Sync (Test case #1) — Test Property - Zenix')
  console.log(`   property=${PROPERTY_ID} · ${SYNC_DAYS} días (${dateFrom} → ${dateTo})`)
  console.log('')

  // ── Descubrir TODAS las habitaciones y tarifas (All Rooms / All Rates) ────
  const roomTypes = await gateway.listRoomTypes(PROPERTY_ID)
  const ratePlans = await gateway.listRatePlans(PROPERTY_ID)
  console.log(`   room types: ${roomTypes.length} · rate plans: ${ratePlans.length}`)

  // ── Call 1: Availability — TODAS las habitaciones, 500 días, 1 sola call ──
  const availEntries: ChannexAvailabilityEntry[] = roomTypes
    .filter((rt) => rt.id)
    .map((rt) => ({
      propertyId: PROPERTY_ID,
      roomTypeId: rt.id!,
      dateFrom,
      dateTo,
      availability: rt.count_of_rooms ?? 5,
    }))

  // ── Call 2: Rates & restrictions — TODAS las tarifas, 500 días, 1 call ────
  const restrEntries: ChannexRestrictionEntry[] = ratePlans
    .filter((rp) => rp.id)
    .map((rp) => ({
      propertyId: PROPERTY_ID,
      ratePlanId: rp.id!,
      dateFrom,
      dateTo,
      rate: 100,
      minStayThrough: 1,
    }))

  const availRes = await gateway.pushAvailability(availEntries)
  console.log(`✓ Call 1 — Availability (${availEntries.length} room types): ${availRes.taskId}`)

  const restrRes = await gateway.pushRestrictions(restrEntries)
  console.log(`✓ Call 2 — Rates & restrictions (${restrEntries.length} rate plans): ${restrRes.taskId}`)

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' Test case #1 — pega estos 2 IDs en el formulario (uno por línea):')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(availRes.taskId ?? '(sin id)')
  console.log(restrRes.taskId ?? '(sin id)')
  console.log('═══════════════════════════════════════════════════════════════════')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Full sync falló:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
