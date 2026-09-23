import { PublicPricingService } from './public-pricing.service'

/**
 * C2 — el puerto publica la tarifa RESUELTA con su total real.
 *
 * La prueba que manda es el SNAPSHOT DE CONTRATO: el website del hotel va a
 * leer estos nombres de campo. Cambiar uno sin cambiar el snapshot rompe la
 * página de un cliente en producción y nadie se entera hasta que llama. Con el
 * snapshot, el cambio deja de ser accidental: hay que aceptarlo a mano.
 *
 * Es una forma barata de *consumer-driven contract* para un consumidor que
 * todavía no existe — y por eso es el momento de fijarlo.
 */
describe('PublicPricingService', () => {
  let prisma: any
  let service: PublicPricingService

  const jurisdiccionTulum = {
    countryCode: 'MX', stateCode: 'ROO', municipality: 'Tulum', city: 'Tulum',
    lodgingKind: 'HOTEL' as const, optIns: [] as string[],
  }
  const base = {
    checkIn: new Date('2026-12-24T00:00:00Z'),
    checkOut: new Date('2026-12-27T00:00:00Z'), // 3 noches
    occupants: 2,
    currency: 'MXN',
    bar: 2000,
    roomTypeId: 'rt-1',
    jurisdiction: jurisdiccionTulum,
  }

  const ctxPlano = {
    planId: 'plan-1',
    planCode: 'BAR-PUBLICA',
    plan: { baseStrategy: 'BAR' as const, baseRate: null, baseMultiplier: null },
    seasons: [],
    dayOfWeekRules: [],
    overrides: new Map<string, number>(),
  }

  beforeEach(() => {
    prisma = {
      ratePlan: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      rateOverride: { findMany: jest.fn().mockResolvedValue([]) },
    }
    service = new PublicPricingService(prisma)
  })

  // ── El contrato ───────────────────────────────────────────────────────────
  it('🔒 SNAPSHOT DE CONTRATO — la forma que el website va a leer', () => {
    const r = service.price({ ...base, ratesIncludeTaxes: false, ctx: ctxPlano })
    expect(r).toMatchSnapshot()
  })

  it('el invariante: totalCents === netCents + taxesCents', () => {
    for (const incluye of [true, false]) {
      for (let bar = 500; bar <= 8000; bar += 37) {
        const r = service.price({ ...base, bar, ratesIncludeTaxes: incluye, ctx: ctxPlano })
        expect(r.totalCents).toBe(r.netCents + r.taxesCents)
      }
    }
  })

  // ── Lo que la BAR no sabía hacer ──────────────────────────────────────────
  it('🔴 una temporada alta SÍ se ve en el precio publicado', () => {
    const conTemporada = {
      ...ctxPlano,
      seasons: [
        {
          startDate: new Date('2026-12-20T00:00:00Z'),
          endDate: new Date('2027-01-05T00:00:00Z'),
          roomTypeId: null,
          overrideRate: null,
          multiplier: 1.5,
        },
      ],
    }
    const normal = service.price({ ...base, ratesIncludeTaxes: false, ctx: ctxPlano })
    const alta = service.price({ ...base, ratesIncludeTaxes: false, ctx: conTemporada })
    expect(alta.netCents).toBe(normal.netCents * 1.5)
    expect(alta.nightly.every((n) => n.source === 'SEASON_MULTIPLIER')).toBe(true)
  })

  it('🔴 el recargo de fin de semana afecta SÓLO a sus noches', () => {
    const ctx = { ...ctxPlano, dayOfWeekRules: [{ dayOfWeek: 6, multiplier: 2 }] } // sábado
    const r = service.price({ ...base, ratesIncludeTaxes: false, ctx })
    // 24, 25 y 26 de diciembre de 2026: jueves, viernes y SÁBADO.
    expect(r.nightly.map((n) => n.netCents)).toEqual([200_000, 200_000, 400_000])
    expect(r.netCents).toBe(800_000)
  })

  it('🔴 un override manual del gerente gana sobre todo lo demás', () => {
    const ctx = {
      ...ctxPlano,
      dayOfWeekRules: [{ dayOfWeek: 6, multiplier: 2 }],
      overrides: new Map([['rt-1|2026-12-26', 999]]),
    }
    const r = service.price({ ...base, ratesIncludeTaxes: false, ctx })
    expect(r.nightly[2]).toEqual({ date: '2026-12-26', netCents: 99_900, source: 'OVERRIDE' })
  })

  it('🔴 el total publicado lleva impuestos — IVA 16% + ISH 5%', () => {
    const r = service.price({ ...base, ratesIncludeTaxes: false, ctx: ctxPlano })
    expect(r.netCents).toBe(600_000)                       // 3 noches × $2,000
    expect(r.taxes.map((t) => t.code)).toEqual(['IVA', 'ISH'])
    expect(r.taxes.find((t) => t.code === 'IVA')!.amountCents).toBe(96_000)
    expect(r.taxes.find((t) => t.code === 'ISH')!.amountCents).toBe(30_000)
    expect(r.totalCents).toBe(726_000)                     // +21%
  })

  it('tarifa INCLUSIVA: el total es lo cargado y el neto se deriva hacia atrás', () => {
    const r = service.price({ ...base, ratesIncludeTaxes: true, ctx: ctxPlano })
    expect(r.totalCents).toBe(600_000)
    expect(r.netCents).toBeLessThan(600_000)
    expect(r.netCents + r.taxesCents).toBe(600_000)
  })

  // ── Lo que se niega a adivinar ────────────────────────────────────────────
  it('🔴 con DOS planes publicables y ninguno elegido, NO sortea: cae a la BAR y lo dice', async () => {
    prisma.ratePlan.findMany.mockResolvedValue([
      { id: 'p1', code: 'A', baseStrategy: 'BAR', baseRate: null, baseMultiplier: null, seasons: [], dayOfWeekRules: [] },
      { id: 'p2', code: 'B', baseStrategy: 'BAR', baseRate: null, baseMultiplier: null, seasons: [], dayOfWeekRules: [] },
    ])
    const { ctx, reason } = await service.loadPlanContext('prop-1', null, base.checkIn, base.checkOut)
    expect(ctx).toBeNull()
    expect(reason).toMatch(/2 planes publicables/)

    const r = service.price({ ...base, ratesIncludeTaxes: false, ctx, fallbackReason: reason })
    expect(r.priceSource).toBe('BAR_FALLBACK')
    expect(r.ratePlanCode).toBeNull()
    expect(r.notes).toContain(reason)
  })

  it('con UN solo plan publicable lo usa sin pedir configuración', async () => {
    prisma.ratePlan.findMany.mockResolvedValue([
      { id: 'p1', code: 'WEB', baseStrategy: 'BAR', baseRate: null, baseMultiplier: null, seasons: [], dayOfWeekRules: [] },
    ])
    const { ctx } = await service.loadPlanContext('prop-1', null, base.checkIn, base.checkOut)
    expect(ctx?.planCode).toBe('WEB')
  })

  it('un plan configurado que ya no existe degrada con motivo, no revienta', async () => {
    prisma.ratePlan.findFirst.mockResolvedValue(null)
    const { ctx, reason } = await service.loadPlanContext('prop-1', 'plan-borrado', base.checkIn, base.checkOut)
    expect(ctx).toBeNull()
    expect(reason).toMatch(/no existe o está inactivo/)
  })

  it('fuera de una jurisdicción configurada avisa que el total está incompleto', () => {
    const r = service.price({
      ...base,
      jurisdiction: {
        countryCode: 'CR', stateCode: null, municipality: null, city: 'Tamarindo',
        lodgingKind: 'HOTEL' as const, optIns: [],
      },
      ratesIncludeTaxes: false,
      ctx: ctxPlano,
    })
    expect(r.taxesConfigured).toBe(false)
    expect(r.totalCents).toBe(r.netCents)
    expect(r.notes.join(' ')).toMatch(/sin cargar/i)
  })

  it('🔴 el MISMO hotel en otro municipio del MISMO estado publica otro total', () => {
    const tulum = service.price({ ...base, ratesIncludeTaxes: false, ctx: ctxPlano })
    const chetumal = service.price({
      ...base,
      jurisdiction: {
        ...jurisdiccionTulum,
        municipality: 'Othón P. Blanco', city: 'Chetumal',
        optIns: ['IVA_REGION_FRONTERIZA_SUR'],
      },
      ratesIncludeTaxes: false,
      ctx: ctxPlano,
    })
    // Mismo neto, distinto IVA: 16% contra 8% del estímulo de región fronteriza.
    expect(chetumal.netCents).toBe(tulum.netCents)
    expect(tulum.totalCents).toBe(726_000)
    expect(chetumal.totalCents).toBe(678_000)
    expect(tulum.taxesVerified).toBe(true)
    expect(tulum.taxesInferred).toBe(false)
  })

  it('un estado sin verificar lo DECLARA en la respuesta que lee el website', () => {
    const r = service.price({
      ...base,
      jurisdiction: { ...jurisdiccionTulum, stateCode: 'JAL', municipality: 'Puerto Vallarta', city: 'Puerto Vallarta' },
      ratesIncludeTaxes: false,
      ctx: ctxPlano,
    })
    expect(r.taxesVerified).toBe(false)
    expect(r.taxes.map((t) => t.code)).toEqual(['IVA'])
    expect(r.notes.join(' ')).toMatch(/SIN VERIFICAR/)
  })

  it('lleva su fundamento legal para que el desglose sea auditable', () => {
    const r = service.price({ ...base, ratesIncludeTaxes: false, ctx: ctxPlano })
    expect(r.legalBasis).toContain('16-dic-2025')
  })
})
