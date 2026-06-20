/**
 * seed-channex-cert-tenant.ts — Crea el TENANT de Zenix para la certificación
 * Channex, mapeado a la propiedad de prueba que ya existe en el sandbox
 * (`Test Property - Zenix`, creada por seed-channex-cert-property.ts).
 *
 * Crea (multi-tenant 4-level, mismo patrón que seed.prod.ts):
 *   - Organization "Zenix Cert Test"
 *   - LegalEntity (USD)
 *   - Property "Test Property - Zenix"
 *   - PropertySettings con channexPropertyId mapeado al sandbox + pull enabled
 *   - RoomType Twin Room + Double Room (Zenix-side)
 *   - 5 Twin rooms (channexRoomTypeId Twin) + 5 Double rooms (channexRoomTypeId Double)
 *   - Staff SUPERVISOR (login → PMS)
 *
 * Esto habilita el demo end-to-end del cert DESDE el PMS:
 *   - OUTBOUND: cambias disponibilidad/tarifa en Zenix → push al sandbox (local
 *     PUEDE alcanzar staging.channex.io).
 *   - INBOUND: el feed scheduler + full sync funcionan local (Channex no puede
 *     llamar a localhost por webhook, pero el feed cubre la recepción de reservas).
 *
 * Cómo correr (local; usa el DATABASE_URL del .env):
 *   cd apps/api
 *   set -a && source .env && set +a
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-channex-cert-tenant.ts
 *
 * Para PROD: correr el MISMO script con el DATABASE_URL de prod
 * (DATABASE_URL='<neon>' npx ts-node ...). Idempotente por ids estables.
 *
 * IDs del sandbox (resource IDs, NO secretos) — de docs/ops/channex-cert-property-ids.md:
 */
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// ── Mapeo al sandbox de Channex (Test Property - Zenix) ─────────────────────
const CHANNEX_PROPERTY_ID = '94d70281-07a8-4e6b-9273-724fa3b725dd'
const CHANNEX_TWIN_ROOM_TYPE_ID = '2e0b297f-b44c-4d60-87c5-1d3e27219628'
const CHANNEX_DOUBLE_ROOM_TYPE_ID = 'cdff8770-40ff-4f2d-b402-2463a2eec9c2'
// Rate plans BAR (1 rate plan ↔ 1 room type para el push de tarifas UI→Channex).
const CHANNEX_TWIN_BAR_RATE_PLAN_ID = '88a90aa7-1bcc-41e4-a3dd-3e2a35227028'
const CHANNEX_DOUBLE_BAR_RATE_PLAN_ID = 'c57ad75e-aeee-434e-9ce1-2170f379912c'

// ── Datos del tenant (defaults sensatos) ────────────────────────────────────
const ORG_NAME = process.env.CERT_ORG_NAME ?? 'Zenix Cert Test'
const HOTEL_NAME = process.env.CERT_HOTEL_NAME ?? 'Test Property - Zenix'
const CITY = process.env.CERT_CITY ?? 'Tulum'
const REGION = process.env.CERT_REGION ?? 'Quintana Roo'
const COUNTRY = (process.env.CERT_COUNTRY ?? 'MX').toUpperCase()
const CURRENCY = (process.env.CERT_CURRENCY ?? 'USD').toUpperCase()
const TIMEZONE = process.env.CERT_TIMEZONE ?? 'America/Cancun'
const OWNER_NAME = process.env.CERT_OWNER_NAME ?? 'Cert Supervisor'
const OWNER_EMAIL = (process.env.CERT_OWNER_EMAIL ?? 'cert@zenix.test').toLowerCase()
const OWNER_PASSWORD = process.env.CERT_OWNER_PASSWORD ?? '123456'
const TWIN_COUNT = parseInt(process.env.CERT_TWIN_COUNT ?? '5', 10)
const DOUBLE_COUNT = parseInt(process.env.CERT_DOUBLE_COUNT ?? '5', 10)
const BASE_RATE = parseInt(process.env.CERT_BASE_RATE ?? '100', 10) // USD, espejo del BAR

// ids estables (idempotencia)
const SLUG = 'channex-cert'
const ORG_ID = `org-${SLUG}`
const LEGAL_ID = `legal-${SLUG}`
const PROP_ID = `prop-${SLUG}`

async function main(): Promise<void> {
  console.log(`🌱 Tenant cert Channex: "${ORG_NAME}" → "${HOTEL_NAME}" (${CURRENCY})`)
  console.log(`   channexPropertyId = ${CHANNEX_PROPERTY_ID}`)

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: ORG_NAME },
    create: { id: ORG_ID, name: ORG_NAME, slug: SLUG },
  })

  // 2. LegalEntity (USD, sin CFDI para el cert)
  const legal = await prisma.legalEntity.upsert({
    where: { id: LEGAL_ID },
    update: { name: HOTEL_NAME, baseCurrency: CURRENCY },
    create: {
      id: LEGAL_ID,
      organizationId: org.id,
      fiscalRegimeId: null,
      countryCode: COUNTRY,
      name: HOTEL_NAME,
      taxId: `CERT-${COUNTRY}-0001`,
      legalAddress: { city: CITY, country: COUNTRY },
      baseCurrency: CURRENCY,
      accountingPeriodStart: 1,
      active: true,
    },
  })

  // 3. Property
  const property = await prisma.property.upsert({
    where: { id: PROP_ID },
    update: { name: HOTEL_NAME, city: CITY, region: REGION, legalEntityId: legal.id },
    create: {
      id: PROP_ID,
      organizationId: org.id,
      legalEntityId: legal.id,
      name: HOTEL_NAME,
      type: 'HOTEL',
      city: CITY,
      region: REGION,
    },
  })

  // 3b. PropertySettings — mapeo Channex + timezone para schedulers.
  //   channexPullEnabled=true → habilita feed + full sync.
  //   channexWebhookSecretRequired=false → modo sandbox (Channex no alcanza
  //   localhost; el feed cubre inbound). En PROD se setea un secret real + true.
  await prisma.propertySettings.upsert({
    where: { propertyId: property.id },
    update: {
      timezone: TIMEZONE,
      channexPropertyId: CHANNEX_PROPERTY_ID,
      channexPullEnabled: true,
      channexWebhookSecretRequired: false,
    },
    create: {
      organizationId: org.id,
      propertyId: property.id,
      timezone: TIMEZONE,
      channexPropertyId: CHANNEX_PROPERTY_ID,
      channexPullEnabled: true,
      channexWebhookSecretRequired: false,
    },
  })

  // 4. RoomTypes Zenix-side: Twin + Double
  const twinType = await prisma.roomType.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'TWIN' } },
    update: { baseRate: BASE_RATE, currency: CURRENCY },
    create: {
      organizationId: org.id,
      propertyId: property.id,
      name: 'Twin Room',
      code: 'TWIN',
      maxOccupancy: 2,
      baseRate: BASE_RATE,
      currency: CURRENCY,
      amenities: ['WiFi'],
      isActive: true,
    },
  })
  const doubleType = await prisma.roomType.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'DBL' } },
    update: { baseRate: BASE_RATE, currency: CURRENCY },
    create: {
      organizationId: org.id,
      propertyId: property.id,
      name: 'Double Room',
      code: 'DBL',
      maxOccupancy: 2,
      baseRate: BASE_RATE,
      currency: CURRENCY,
      amenities: ['WiFi'],
      isActive: true,
    },
  })

  // 4b. ChannexRatePlanMapping — REQUERIDO para que el cambio de tarifa desde
  //     la UI (RatesService) sepa a qué rate plan de Channex empujar.
  //     1 rate plan ↔ 1 room type: Twin→Twin BAR, Double→Double BAR.
  //     createdById debe ser un User real (FK ON DELETE RESTRICT) — usamos el
  //     PLATFORM_ADMIN; fallback a cualquier User si no existe.
  const createdBy =
    (await prisma.user.findFirst({ where: { systemRole: 'PLATFORM_ADMIN' }, select: { id: true } })) ??
    (await prisma.user.findFirst({ select: { id: true } }))
  if (!createdBy) {
    console.warn(
      '   ⚠ No hay ningún User en la BD → no puedo crear ChannexRatePlanMapping. ' +
        'El push de TARIFAS desde la UI quedará deshabilitado (availability sí funciona). ' +
        'Corre seed.platform.ts primero si quieres el demo de tarifas.',
    )
  } else {
    const ratePlanMappings = [
      {
        channexRoomTypeId: CHANNEX_TWIN_ROOM_TYPE_ID,
        channexRatePlanId: CHANNEX_TWIN_BAR_RATE_PLAN_ID,
        title: 'BAR — Twin Room',
      },
      {
        channexRoomTypeId: CHANNEX_DOUBLE_ROOM_TYPE_ID,
        channexRatePlanId: CHANNEX_DOUBLE_BAR_RATE_PLAN_ID,
        title: 'BAR — Double Room',
      },
    ]
    for (const m of ratePlanMappings) {
      await prisma.channexRatePlanMapping.upsert({
        where: { channexRatePlanId: m.channexRatePlanId },
        update: { isActive: true, channexRoomTypeId: m.channexRoomTypeId, title: m.title },
        create: {
          organizationId: org.id,
          propertyId: property.id,
          channexRatePlanId: m.channexRatePlanId,
          channexRoomTypeId: m.channexRoomTypeId,
          title: m.title,
          currency: CURRENCY,
          sellMode: 'per_room',
          rateMode: 'manual',
          defaultRate: BASE_RATE,
          defaultOccupancy: 2,
          isActive: true,
          createdById: createdBy.id,
        },
      })
    }
    console.log(`   ✓ ${ratePlanMappings.length} ChannexRatePlanMapping creados (Twin BAR + Double BAR)`)
  }

  // 5. Habitaciones con channexRoomTypeId mapeado.
  //    Twin: 101..10N → Channex Twin room type. Double: 201..20N → Channex Double.
  let createdRooms = 0
  async function makeRooms(
    count: number,
    base: number,
    roomTypeId: string,
    channexRoomTypeId: string,
  ): Promise<void> {
    for (let i = 1; i <= count; i++) {
      const number = String(base + i)
      await prisma.room.upsert({
        where: { propertyId_number: { propertyId: property.id, number } },
        update: { roomTypeId, channexRoomTypeId },
        create: {
          organizationId: org.id,
          propertyId: property.id,
          number,
          floor: Math.floor(base / 100),
          category: 'PRIVATE',
          capacity: 2,
          roomTypeId,
          channexRoomTypeId,
          status: 'AVAILABLE',
        },
      })
      createdRooms++
    }
  }
  await makeRooms(TWIN_COUNT, 100, twinType.id, CHANNEX_TWIN_ROOM_TYPE_ID)
  await makeRooms(DOUBLE_COUNT, 200, doubleType.id, CHANNEX_DOUBLE_ROOM_TYPE_ID)

  // 6. Staff SUPERVISOR (login → PMS, no Nova)
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12)
  await prisma.staff.upsert({
    where: { email: OWNER_EMAIL },
    update: { organizationId: org.id, propertyId: property.id, role: 'SUPERVISOR', active: true },
    create: {
      organizationId: org.id,
      propertyId: property.id,
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      passwordHash,
      role: 'SUPERVISOR',
      department: 'RECEPTION',
      level: 'LEAD',
      active: true,
    },
  })

  console.log(`✅ Tenant listo · ${createdRooms} habitaciones (${TWIN_COUNT} Twin + ${DOUBLE_COUNT} Double)`)
  console.log(`   Twin rooms  → channexRoomTypeId ${CHANNEX_TWIN_ROOM_TYPE_ID}`)
  console.log(`   Double rooms→ channexRoomTypeId ${CHANNEX_DOUBLE_ROOM_TYPE_ID}`)
  console.log(`✅ Login PMS (SUPERVISOR): ${OWNER_EMAIL} / ${OWNER_PASSWORD}`)
  console.log(`✅ Property Zenix id=${property.id} ↔ Channex ${CHANNEX_PROPERTY_ID}`)
}

main()
  .catch((e) => {
    console.error('❌ seed cert tenant falló:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
