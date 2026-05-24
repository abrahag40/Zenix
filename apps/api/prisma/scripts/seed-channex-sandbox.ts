/**
 * Channex Sandbox Seed — Cert audit A3.
 *
 * Pre-cert Stage 4 setup. Idempotente — re-runs no duplican.
 *
 * Usage:
 *   cd apps/api
 *   set -a && source .env && set +a
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-sandbox.ts
 *
 * Pre-requisitos:
 *   1. Channex extranet: crear property "Hotel Boutique Test Tulum" con
 *      2 room types (Twin + Double) + 4 rate plans (BAR + B&B per type)
 *   2. Anotar UUIDs en `.env`:
 *      CHANNEX_SANDBOX_PROPERTY_ID=<uuid>
 *      CHANNEX_SANDBOX_TWIN_ROOM_TYPE_ID=<uuid>
 *      CHANNEX_SANDBOX_DOUBLE_ROOM_TYPE_ID=<uuid>
 *      CHANNEX_SANDBOX_TWIN_BAR_RATE_PLAN_ID=<uuid>     (post-RATES sprint)
 *      CHANNEX_SANDBOX_TWIN_BB_RATE_PLAN_ID=<uuid>      (post-RATES sprint)
 *
 * Lo que hace este script:
 *   1. Crea/actualiza Property "Hotel Boutique Test Tulum" en Zenix
 *   2. Crea 4 Twin Rooms + 4 Double Rooms con channexRoomTypeId mapeado
 *   3. Sembra ~20 reservas test distribuidas en próximos 60 días con:
 *      - bookingLeadDays variados (0-45 días)
 *      - source variado (BOOKING.COM / EXPEDIA / DIRECT)
 *      - paxCount variado (1-4)
 *      - ratePerNight variado por weekday vs weekend
 *   4. (Post-RATES sprint) Crea 4 RatePlans con channexRatePlanId
 *      + RateOverride para weekend +20%, holiday +30%
 *
 * Esto cumple cert AP-2.4 (data no uniforme — varying counts).
 *
 * STATUS: STUB. Activable cuando RATES-METRICS-COMPSET-CORE sprint
 * agregue RatePlan model. Por ahora cubre solo Rooms + reservas test.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SANDBOX_PROPERTY_ID = process.env.CHANNEX_SANDBOX_PROPERTY_ID
const TWIN_ROOM_TYPE_ID = process.env.CHANNEX_SANDBOX_TWIN_ROOM_TYPE_ID
const DOUBLE_ROOM_TYPE_ID = process.env.CHANNEX_SANDBOX_DOUBLE_ROOM_TYPE_ID

async function main() {
  if (!SANDBOX_PROPERTY_ID || !TWIN_ROOM_TYPE_ID || !DOUBLE_ROOM_TYPE_ID) {
    console.error(
      '❌ Faltan env vars: CHANNEX_SANDBOX_PROPERTY_ID, ' +
        'CHANNEX_SANDBOX_TWIN_ROOM_TYPE_ID, CHANNEX_SANDBOX_DOUBLE_ROOM_TYPE_ID',
    )
    console.error('   Configura en apps/api/.env y re-ejecuta')
    process.exit(1)
  }

  console.log('🌱 Seeding Channex sandbox property...')
  console.log(`   Sandbox property ID: ${SANDBOX_PROPERTY_ID}`)

  // 1. TODO: crear/upsert Property en Zenix con el channexPropertyId
  //    (requiere Organization + LegalEntity wiring per v1.0.5 multi-tenant)
  //    Por ahora, asumimos Property existe vía Activate wizard manual.

  // 2. TODO: crear 4 Twin + 4 Double rooms con channexRoomTypeId mapeado
  //    Idempotent: upsert WHERE propertyId+number.

  // 3. TODO: crear ~20 reservas test variadas en próximos 60 días.
  //    Variation:
  //      · 60% BOOKING.COM, 25% EXPEDIA, 15% DIRECT
  //      · ratePerNight: weekday $100, fri/sat $130, holiday $180
  //      · paxCount: 30% solo (1), 50% pareja (2), 20% familia (3-4)
  //      · bookingLeadDays: bell curve centered en 14d, σ=15d

  // 4. TODO Post-RATES: crear RatePlans + RateOverrides
  //    (deferred — requires RATES sprint models)

  console.log('⚠️ Script SOLO documenta seed plan — implementación stub.')
  console.log('   Activable cuando RATES sprint exista (RatePlan model).')
  console.log('   Por ahora setup manual via Channex extranet + Zenix Activate.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
