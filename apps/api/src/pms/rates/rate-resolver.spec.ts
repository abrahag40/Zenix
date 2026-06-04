import { resolveNightlyRate, type ResolveRateInput } from './rate-resolver'

// Lunes 2026-06-15 (getUTCDay → 1), Sábado 2026-06-20 (→ 6)
const MON = new Date('2026-06-15T12:00:00.000Z')
const SAT = new Date('2026-06-20T12:00:00.000Z')

function base(overrides: Partial<ResolveRateInput> = {}): ResolveRateInput {
  return {
    date: MON,
    bar: 100,
    roomTypeId: 'rt-cabana',
    plan: { baseStrategy: 'BAR' },
    seasons: [],
    dayOfWeekRules: [],
    overrideRate: null,
    ...overrides,
  }
}

describe('resolveNightlyRate — precedencia D-RATES2', () => {
  it('BASE: estrategia BAR usa la tarifa BAR del room type', () => {
    const r = resolveNightlyRate(base())
    expect(r).toEqual({ rate: 100, source: 'BASE', appliedDayOfWeekMultiplier: null })
  })

  it('BASE: estrategia FIXED usa baseRate del plan (ignora BAR)', () => {
    const r = resolveNightlyRate(base({ plan: { baseStrategy: 'FIXED', baseRate: 250 }, bar: 100 }))
    expect(r.rate).toBe(250)
    expect(r.source).toBe('BASE')
  })

  it('BASE: estrategia MULTIPLIER aplica baseMultiplier sobre BAR', () => {
    const r = resolveNightlyRate(base({ plan: { baseStrategy: 'MULTIPLIER', baseMultiplier: 0.85 }, bar: 200 }))
    expect(r.rate).toBe(170) // 200 × 0.85
  })

  it('OVERRIDE manual gana sobre todo (season + dow)', () => {
    const r = resolveNightlyRate(base({
      overrideRate: 999,
      seasons: [{ startDate: MON, endDate: MON, overrideRate: 500 }],
      dayOfWeekRules: [{ dayOfWeek: 1, multiplier: 2 }],
    }))
    expect(r).toEqual({ rate: 999, source: 'OVERRIDE', appliedDayOfWeekMultiplier: null })
  })

  it('SEASON_OVERRIDE: precio fijo de temporada NO se modula por día de semana', () => {
    const r = resolveNightlyRate(base({
      seasons: [{ startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'), overrideRate: 300 }],
      dayOfWeekRules: [{ dayOfWeek: 1, multiplier: 1.5 }],
    }))
    expect(r.rate).toBe(300)
    expect(r.source).toBe('SEASON_OVERRIDE')
    expect(r.appliedDayOfWeekMultiplier).toBeNull()
  })

  it('SEASON_MULTIPLIER × DayOfWeek se componen sobre la base', () => {
    const r = resolveNightlyRate(base({
      bar: 100,
      seasons: [{ startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'), multiplier: 1.2 }],
      dayOfWeekRules: [{ dayOfWeek: 1, multiplier: 1.1 }], // lunes
    }))
    expect(r.rate).toBe(132) // 100 × 1.2 × 1.1
    expect(r.source).toBe('SEASON_MULTIPLIER')
    expect(r.appliedDayOfWeekMultiplier).toBe(1.1)
  })

  it('DayOfWeek solo (sin season) aplica weekend premium', () => {
    const r = resolveNightlyRate(base({
      date: SAT, bar: 100,
      dayOfWeekRules: [{ dayOfWeek: 6, multiplier: 1.5 }], // sábado
    }))
    expect(r.rate).toBe(150)
    expect(r.source).toBe('BASE')
    expect(r.appliedDayOfWeekMultiplier).toBe(1.5)
  })

  it('season roomType-specific gana sobre la general (null) cuando ambas matchean', () => {
    const range = { startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30') }
    const r = resolveNightlyRate(base({
      roomTypeId: 'rt-cabana', bar: 100,
      seasons: [
        { ...range, roomTypeId: null, multiplier: 1.2 },
        { ...range, roomTypeId: 'rt-cabana', overrideRate: 500 },
      ],
    }))
    expect(r.rate).toBe(500)
    expect(r.source).toBe('SEASON_OVERRIDE')
  })

  it('season fuera de rango NO aplica → cae a base', () => {
    const r = resolveNightlyRate(base({
      date: MON, bar: 100,
      seasons: [{ startDate: new Date('2026-12-01'), endDate: new Date('2026-12-31'), multiplier: 2 }],
    }))
    expect(r.rate).toBe(100)
    expect(r.source).toBe('BASE')
  })
})
