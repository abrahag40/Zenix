/**
 * Seed mínimo de LocalEvent — Fase 3 chunk 2. Curated por Events Curator interno
 * (D-COMPSET9). Cobertura MX inicial; LATAM (CO/PE/CR/AR) en chunk 3+ con más
 * research per country.
 *
 * Run: `npx ts-node -r tsconfig-paths/register prisma/scripts/seed-local-events.ts`
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface Seed {
  name: string
  description: string
  category: string
  startDate: string
  endDate: string
  countryCode: string
  regionCode?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  radiusKm?: number | null
  demandImpact: string
  expectedAttendance?: number | null
  sourceUrl?: string | null
}

const events: Seed[] = [
  // National holidays MX (country-wide, sin region/city)
  {
    name: 'Día de la Independencia',
    description: 'Grito de Independencia 15-sep / desfile 16-sep. Demanda nacional alta.',
    category: 'NATIONAL_HOLIDAY',
    startDate: '2026-09-15',
    endDate: '2026-09-16',
    countryCode: 'MX',
    demandImpact: 'HIGH',
    expectedAttendance: null,
  },
  {
    name: 'Día de Muertos',
    description: 'Feriado emblemático 1-2 noviembre. Mixquic, Oaxaca, Michoacán pico.',
    category: 'NATIONAL_HOLIDAY',
    startDate: '2026-11-01',
    endDate: '2026-11-02',
    countryCode: 'MX',
    demandImpact: 'EXTREME',
  },
  {
    name: 'Navidad',
    description: 'Pico anual de demanda nacional, especialmente Caribe y centro.',
    category: 'NATIONAL_HOLIDAY',
    startDate: '2026-12-22',
    endDate: '2026-12-26',
    countryCode: 'MX',
    demandImpact: 'EXTREME',
  },
  {
    name: 'Año Nuevo',
    description: 'Cierre de año + fin de semana largo de Reyes.',
    category: 'NATIONAL_HOLIDAY',
    startDate: '2026-12-30',
    endDate: '2027-01-06',
    countryCode: 'MX',
    demandImpact: 'EXTREME',
  },
  {
    name: 'Semana Santa',
    description: 'Lunes santo a domingo de Resurrección. Pico playero + interior.',
    category: 'RELIGIOUS',
    startDate: '2026-03-30',
    endDate: '2026-04-05',
    countryCode: 'MX',
    demandImpact: 'EXTREME',
  },
  // Quintana Roo (MX-ROO) — region-level
  {
    name: 'BPM Festival Tulum',
    description: 'Festival electrónico boutique. Demanda extrema en Tulum + ciudades cercanas.',
    category: 'FESTIVAL',
    startDate: '2026-01-09',
    endDate: '2026-01-15',
    countryCode: 'MX',
    regionCode: 'MX-ROO',
    city: 'Tulum',
    latitude: 20.2114,
    longitude: -87.4654,
    radiusKm: 80,
    demandImpact: 'EXTREME',
    expectedAttendance: 12000,
  },
  {
    name: 'Festival Sayulita',
    description: 'Música + surf. Demanda alta en Riviera Nayarit, contagia interior.',
    category: 'FESTIVAL',
    startDate: '2026-02-19',
    endDate: '2026-02-22',
    countryCode: 'MX',
    regionCode: 'MX-NAY',
    city: 'Sayulita',
    latitude: 20.8728,
    longitude: -105.4424,
    radiusKm: 50,
    demandImpact: 'HIGH',
    expectedAttendance: 5000,
  },
  // CDMX events
  {
    name: 'Festival Internacional Cervantino',
    description: 'Festival artístico internacional en Guanajuato — boom hotelero regional.',
    category: 'FESTIVAL',
    startDate: '2026-10-08',
    endDate: '2026-10-25',
    countryCode: 'MX',
    regionCode: 'MX-GUA',
    city: 'Guanajuato',
    latitude: 21.0190,
    longitude: -101.2574,
    radiusKm: 60,
    demandImpact: 'HIGH',
    expectedAttendance: 200000,
  },
  // Tulum-city specific (city level)
  {
    name: 'Art With Me Tulum',
    description: 'Festival arte + wellness. Demanda alta Tulum + Akumal.',
    category: 'FESTIVAL',
    startDate: '2026-11-05',
    endDate: '2026-11-11',
    countryCode: 'MX',
    regionCode: 'MX-ROO',
    city: 'Tulum',
    latitude: 20.2114,
    longitude: -87.4654,
    radiusKm: 40,
    demandImpact: 'HIGH',
    expectedAttendance: 8000,
  },
  {
    name: 'Día de Reyes',
    description: 'Feriado religioso 6-ene; cierre del periodo vacacional.',
    category: 'RELIGIOUS',
    startDate: '2026-01-06',
    endDate: '2026-01-06',
    countryCode: 'MX',
    demandImpact: 'MEDIUM',
  },
]

async function main() {
  let created = 0
  let skipped = 0
  for (const e of events) {
    // Idempotent: dedup por (countryCode, name, startDate) — no UNIQUE pero seguro para seed.
    const existing = await prisma.localEvent.findFirst({
      where: { countryCode: e.countryCode, name: e.name, startDate: new Date(e.startDate) },
    })
    if (existing) {
      skipped += 1
      continue
    }
    await prisma.localEvent.create({
      data: {
        name: e.name,
        description: e.description,
        category: e.category,
        startDate: new Date(e.startDate),
        endDate: new Date(e.endDate),
        countryCode: e.countryCode,
        regionCode: e.regionCode ?? null,
        city: e.city ?? null,
        latitude: e.latitude ?? null,
        longitude: e.longitude ?? null,
        radiusKm: e.radiusKm ?? null,
        demandImpact: e.demandImpact,
        expectedAttendance: e.expectedAttendance ?? null,
        source: 'MANUAL',
        sourceUrl: e.sourceUrl ?? null,
        verifiedAt: new Date(), // curated → verificado de origen
      },
    })
    created += 1
  }
  // eslint-disable-next-line no-console
  console.log(`[seed-local-events] created=${created} skipped=${skipped} total=${events.length}`)
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
