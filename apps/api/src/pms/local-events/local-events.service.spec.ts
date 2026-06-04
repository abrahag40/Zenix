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

  it('resuelve property location desde LegalEntity.countryCode', async () => {
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: 'Caribe', legalEntity: { countryCode: 'MX' } })
    const loc = await service.resolvePropertyLocation(PROP)
    expect(loc.city).toBe('Tulum')
    expect(loc.countryCode).toBe('MX')
    expect(loc.regionCode).toBeNull() // TODO v1.0.1
    expect(loc.latitude).toBeNull()
  })

  it('city match + country-wide se combinan; region (sin ISO) NO match', async () => {
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: 'Caribe', legalEntity: { countryCode: 'MX' } })
    prisma.localEvent.findMany.mockResolvedValue([
      { id: 'e1', name: 'Bahidorá', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'HIGH', expectedAttendance: 5000, source: 'MANUAL', sourceUrl: null },
      { id: 'e2', name: 'Día de Muertos', description: null, category: 'NATIONAL_HOLIDAY', startDate: FROM, endDate: TO, demandImpact: 'EXTREME', expectedAttendance: null, source: 'MANUAL', sourceUrl: null },
    ])
    prisma.localEventOverride.findMany.mockResolvedValue([])

    const res = await service.findEventsForProperty(PROP, FROM, TO)
    expect(res.events).toHaveLength(2)
    expect(res.events.map((e) => e.name)).toEqual(['Bahidorá', 'Día de Muertos'])
    // Verifica que el OR del query usa city + countryCode (no regionCode hasta v1.0.1)
    const where = prisma.localEvent.findMany.mock.calls[0][0].where
    expect(where.OR).toContainEqual({ city: { equals: 'Tulum', mode: 'insensitive' } })
    expect(where.OR).toContainEqual({ countryCode: 'MX', regionCode: null, city: null })
  })

  it('override disabled=true oculta el evento base', async () => {
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: null, legalEntity: { countryCode: 'MX' } })
    prisma.localEvent.findMany.mockResolvedValue([
      { id: 'e1', name: 'Festival X', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'HIGH', expectedAttendance: null, source: 'MANUAL', sourceUrl: null },
    ])
    prisma.localEventOverride.findMany.mockResolvedValue([
      { id: 'o1', baseEventId: 'e1', disabled: true, customName: null, customDemandImpact: null, baseEvent: null },
    ])
    const res = await service.findEventsForProperty(PROP, FROM, TO)
    expect(res.events).toHaveLength(0)
  })

  it('override customName + customDemandImpact reemplazan los del base', async () => {
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: null, legalEntity: { countryCode: 'MX' } })
    prisma.localEvent.findMany.mockResolvedValue([
      { id: 'e1', name: 'Festival original', description: null, category: 'FESTIVAL', startDate: FROM, endDate: TO, demandImpact: 'MEDIUM', expectedAttendance: null, source: 'MANUAL', sourceUrl: null },
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
    prisma.property.findUnique.mockResolvedValue({ city: 'Tulum', region: null, legalEntity: { countryCode: 'MX' } })
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
