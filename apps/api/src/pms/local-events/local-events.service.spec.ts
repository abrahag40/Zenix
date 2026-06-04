import { Test, TestingModule } from '@nestjs/testing'
import { LocalEventsService } from './local-events.service'
import { PrismaService } from '../../prisma/prisma.service'

const PROP = 'prop-1'

describe('LocalEventsService.findEventsForProperty — 4-niveles resolution', () => {
  let service: LocalEventsService
  const prisma = {
    property: { findUnique: jest.fn() },
    localEvent: { findMany: jest.fn() },
    localEventOverride: { findMany: jest.fn() },
  }
  const FROM = new Date('2026-07-01T00:00:00Z')
  const TO = new Date('2026-07-31T00:00:00Z')

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [LocalEventsService, { provide: PrismaService, useValue: prisma }],
    }).compile()
    service = mod.get(LocalEventsService)
    jest.clearAllMocks()
  })

  it('resuelve property location con regionCode + lat/lng + LegalEntity.countryCode', async () => {
    prisma.property.findUnique.mockResolvedValue({
      city: 'Tulum', region: 'Caribe', regionCode: 'MX-ROO', latitude: 20.21, longitude: -87.46,
      legalEntity: { countryCode: 'MX' },
    })
    const loc = await service.resolvePropertyLocation(PROP)
    expect(loc.city).toBe('Tulum')
    expect(loc.countryCode).toBe('MX')
    expect(loc.regionCode).toBe('MX-ROO')
    expect(loc.latitude).toBe(20.21)
    expect(loc.longitude).toBe(-87.46)
  })

  it('city + regionCode + country-wide combinan; radius excluye eventos lejanos', async () => {
    prisma.property.findUnique.mockResolvedValue({
      city: 'Tulum', region: 'Caribe', regionCode: 'MX-ROO', latitude: 20.21, longitude: -87.46,
      legalEntity: { countryCode: 'MX' },
    })
    prisma.localEvent.findMany.mockResolvedValue([
      { id: 'e1', name: 'Bahidorá', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'HIGH', expectedAttendance: 5000, source: 'MANUAL', sourceUrl: null, city: 'Tulum', regionCode: null, latitude: null, longitude: null, radiusKm: null },
      { id: 'e2', name: 'Día de Muertos', description: null, category: 'NATIONAL_HOLIDAY', startDate: FROM, endDate: TO, demandImpact: 'EXTREME', expectedAttendance: null, source: 'MANUAL', sourceUrl: null, city: null, regionCode: null, latitude: null, longitude: null, radiusKm: null },
      // Festival con punto+radio: 50km de Tulum (~en Playa del Carmen) → dentro de 100km radius
      { id: 'e3', name: 'Festival Cercano', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'HIGH', expectedAttendance: 2000, source: 'MANUAL', sourceUrl: null, city: null, regionCode: null, latitude: 20.62, longitude: -87.07, radiusKm: 100 },
      // Festival lejano: CDMX (~1200km) con radio 50 → no debe matchear
      { id: 'e4', name: 'Festival Lejano', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'HIGH', expectedAttendance: 2000, source: 'MANUAL', sourceUrl: null, city: null, regionCode: null, latitude: 19.43, longitude: -99.13, radiusKm: 50 },
    ])
    prisma.localEventOverride.findMany.mockResolvedValue([])

    const res = await service.findEventsForProperty(PROP, FROM, TO)
    const names = res.events.map((e) => e.name)
    expect(names).toContain('Bahidorá')
    expect(names).toContain('Día de Muertos')
    expect(names).toContain('Festival Cercano')
    expect(names).not.toContain('Festival Lejano')
    const where = prisma.localEvent.findMany.mock.calls[0][0].where
    expect(where.OR).toContainEqual({ city: { equals: 'Tulum', mode: 'insensitive' } })
    expect(where.OR).toContainEqual({ regionCode: 'MX-ROO', city: null })
    expect(where.OR).toContainEqual({ countryCode: 'MX', regionCode: null, city: null })
  })

  it('override disabled=true oculta el evento base', async () => {
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: null, regionCode: null, latitude: null, longitude: null, legalEntity: { countryCode: 'MX' } })
    prisma.localEvent.findMany.mockResolvedValue([
      { id: 'e1', name: 'Festival X', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'HIGH', expectedAttendance: null, source: 'MANUAL', sourceUrl: null, city: 'Tulum', regionCode: null, latitude: null, longitude: null, radiusKm: null },
    ])
    prisma.localEventOverride.findMany.mockResolvedValue([
      { id: 'o1', baseEventId: 'e1', disabled: true, customName: null, customDemandImpact: null, baseEvent: null },
    ])
    const res = await service.findEventsForProperty(PROP, FROM, TO)
    expect(res.events).toHaveLength(0)
  })

  it('override customName + customDemandImpact reemplazan los del base', async () => {
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: null, regionCode: null, latitude: null, longitude: null, legalEntity: { countryCode: 'MX' } })
    prisma.localEvent.findMany.mockResolvedValue([
      { id: 'e1', name: 'Festival original', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'MEDIUM', expectedAttendance: null, source: 'MANUAL', sourceUrl: null, city: 'Tulum', regionCode: null, latitude: null, longitude: null, radiusKm: null },
    ])
    prisma.localEventOverride.findMany.mockResolvedValue([
      { id: 'o1', baseEventId: 'e1', disabled: false, customName: 'Festival adaptado', customDemandImpact: 'EXTREME', baseEvent: null },
    ])
    const res = await service.findEventsForProperty(PROP, FROM, TO)
    expect(res.events).toHaveLength(1)
    expect(res.events[0].name).toBe('Festival adaptado')
    expect(res.events[0].demandImpact).toBe('EXTREME')
    expect(res.events[0].overridden).toBe(true)
  })

  it('evento 100% custom (baseEventId=null) aparece en la lista', async () => {
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: null, regionCode: null, latitude: null, longitude: null, legalEntity: { countryCode: 'MX' } })
    prisma.localEvent.findMany.mockResolvedValue([])
    prisma.localEventOverride.findMany.mockResolvedValue([
      { id: 'oCustom', baseEventId: null, disabled: false, customName: 'Boda del dueño', customDemandImpact: 'HIGH', baseEvent: null },
    ])
    const res = await service.findEventsForProperty(PROP, FROM, TO)
    expect(res.events).toHaveLength(1)
    expect(res.events[0].name).toBe('Boda del dueño')
    expect(res.events[0].category).toBe('CUSTOM')
    expect(res.events[0].source).toBe('CUSTOM_OVERRIDE')
  })
})
