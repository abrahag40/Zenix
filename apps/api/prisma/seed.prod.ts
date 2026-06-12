/**
 * seed.prod.ts — Onboarding mínimo del hotel real para PRODUCCIÓN (MVP v0.1.0).
 *
 * NO es el seed de demo (seed.ts) — éste crea UN hotel real + su dueño, sin datos
 * ficticios. Parametrizado por env vars (con defaults) para no hardcodear datos.
 *
 * Uso (el owner lo corre UNA vez contra la BD de prod):
 *
 *   cd apps/api
 *   DATABASE_URL='<tu DATABASE_URL de Neon>' \
 *   HOTEL_NAME='Hotel Monica' CITY='Tulum' COUNTRY=MX CURRENCY=MXN \
 *   OWNER_NAME='Abraham García' OWNER_EMAIL='owner@hotel.com' OWNER_PASSWORD='CambiaEsto123' \
 *   ROOM_COUNT=12 \
 *   npx ts-node -r tsconfig-paths/register prisma/seed.prod.ts
 *
 * Idempotente: re-correrlo no duplica (upsert por ids estables). Las habitaciones
 * y tipos se pueden ajustar después desde la UI (Settings). El dueño cambia su
 * contraseña en el primer login (recomendado).
 */
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// ── Parámetros (env con defaults razonables) ────────────────────────────────
const HOTEL_NAME = process.env.HOTEL_NAME ?? 'Mi Hotel'
const CITY = process.env.CITY ?? 'Tulum'
const REGION = process.env.REGION ?? CITY
const COUNTRY = (process.env.COUNTRY ?? 'MX').toUpperCase()
const CURRENCY = (process.env.CURRENCY ?? 'MXN').toUpperCase()
const OWNER_NAME = process.env.OWNER_NAME ?? 'Dueño'
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? 'owner@hotel.com').toLowerCase()
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? 'Zenix123!'
const ROOM_COUNT = parseInt(process.env.ROOM_COUNT ?? '10', 10)
// Tarifa base por noche (en la moneda del hotel) para el tipo Estándar.
const BASE_RATE = parseInt(process.env.BASE_RATE ?? '1200', 10)
// IANA timezone del hotel — CRÍTICO: los schedulers (night audit de no-shows,
// morning roster de housekeeping) operan en esta TZ. Default Caribe MX.
// Ejemplos: America/Cancun (QRoo), America/Mexico_City (centro), America/Bogota, America/Lima.
const TIMEZONE = process.env.TIMEZONE ?? 'America/Cancun'

// ids estables derivados del slug del hotel → soporta MÚLTIPLES hoteles en la
// misma instancia (multi-tenant). Cada hotel = un slug único (HOTEL_SLUG o
// derivado del nombre). Re-correr con el mismo slug = idempotente (no duplica);
// con slug distinto = crea OTRO hotel sin tocar los existentes.
const HOTEL_SLUG = (process.env.HOTEL_SLUG ?? slugify(HOTEL_NAME))
const ORG_ID = `org-${HOTEL_SLUG}`
const LEGAL_ID = `legal-${HOTEL_SLUG}`
const PROP_ID = `prop-${HOTEL_SLUG}`

async function main() {
  console.log(`🌱 Onboarding PROD: "${HOTEL_NAME}" (${CITY}, ${COUNTRY}) · ${CURRENCY} · ${ROOM_COUNT} habitaciones`)

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: HOTEL_NAME },
    create: { id: ORG_ID, name: HOTEL_NAME, slug: slugify(HOTEL_NAME) },
  })

  // 2. LegalEntity (fiscalRegimeId null — v0.1.0 sin CFDI)
  const legal = await prisma.legalEntity.upsert({
    where: { id: LEGAL_ID },
    update: { name: HOTEL_NAME, baseCurrency: CURRENCY },
    create: {
      id: LEGAL_ID,
      organizationId: org.id,
      fiscalRegimeId: null,
      countryCode: COUNTRY,
      name: HOTEL_NAME,
      taxId: `PROD-${COUNTRY}-0001`,
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

  // 3b. PropertySettings — timezone para schedulers (night audit, morning roster).
  // El resto de campos (hora de checkout, corte de no-show, etc.) usan defaults.
  await prisma.propertySettings.upsert({
    where: { propertyId: property.id },
    update: { timezone: TIMEZONE },
    create: { organizationId: org.id, propertyId: property.id, timezone: TIMEZONE },
  })

  // 4. RoomType "Estándar" (el dueño agrega más tipos en la UI)
  const roomType = await prisma.roomType.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'STD' } },
    update: { baseRate: BASE_RATE, currency: CURRENCY },
    create: {
      organizationId: org.id,
      propertyId: property.id,
      name: 'Estándar',
      code: 'STD',
      maxOccupancy: 2,
      baseRate: BASE_RATE,
      currency: CURRENCY,
      amenities: ['WiFi'],
      isActive: true,
    },
  })

  // 5. Habitaciones (101, 102, … N)
  let created = 0
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const number = String(100 + i)
    await prisma.room.upsert({
      where: { propertyId_number: { propertyId: property.id, number } },
      update: { roomTypeId: roomType.id },
      create: {
        organizationId: org.id,
        propertyId: property.id,
        number,
        floor: 1,
        category: 'PRIVATE',
        capacity: 2,
        roomTypeId: roomType.id,
        status: 'AVAILABLE',
      },
    })
    created++
  }

  // 6. Admin del hotel = Staff SUPERVISOR (login → /dashboard PMS).
  // OJO: NO se crea como User/ORG_OWNER porque ese tier rutea a /nova/clientes
  // (interfaz de consultor), no al PMS. El SUPERVISOR es el rol operativo con
  // acceso completo al calendario/recepción/housekeeping/reportes.
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

  console.log(`✅ Hotel "${property.name}" listo · ${created} habitaciones · tipo Estándar @ ${CURRENCY} ${BASE_RATE}`)
  console.log(`✅ Login (SUPERVISOR, va al PMS): ${OWNER_EMAIL} / ${OWNER_PASSWORD}  (cambia la contraseña en el primer ingreso)`)
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'hotel'
}

main()
  .catch((e) => { console.error('❌ seed.prod falló:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
