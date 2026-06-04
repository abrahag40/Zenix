/**
 * rate-resolver — Sprint RATES-METRICS-COMPSET-CORE Fase 1 (D-RATES2, 2026-06-03).
 *
 * Resolución PURA del precio por noche (sin BD), reutilizable por RatesService
 * (quote grid + push a Channex) y testeable en aislamiento — mismo patrón que
 * `computeCancellationOutcome`.
 *
 * Precedencia D-RATES2 (de mayor a menor prioridad):
 *   1. RateOverride manual por fecha           → gana siempre (decisión humana)
 *   2. RateSeason que matchea la fecha          → overrideRate ó base×multiplier
 *      × DayOfWeekRule del día                  → × multiplier del día de semana
 *   3. RatePlan.baseRate / estrategia base      → fallback
 *
 * La estrategia base del plan:
 *   - FIXED      → ratePlan.baseRate
 *   - MULTIPLIER → BAR (tarifa base del room type) × ratePlan.baseMultiplier
 *   - BAR        → BAR (tarifa base del room type) tal cual
 */

export type BaseStrategy = 'BAR' | 'FIXED' | 'MULTIPLIER'

export interface ResolverPlan {
  baseStrategy: BaseStrategy
  baseRate?: number | null
  baseMultiplier?: number | null
}

export interface ResolverSeason {
  startDate: Date
  endDate: Date
  /** null = aplica a todos los room types del plan. */
  roomTypeId?: string | null
  overrideRate?: number | null
  multiplier?: number | null
}

export interface ResolverDayRule {
  dayOfWeek: number // 0=Dom..6=Sáb
  multiplier: number
}

export interface ResolveRateInput {
  date: Date
  /** BAR = tarifa base del room type (RoomTypeGroup.baseRate). Requerida para BAR/MULTIPLIER. */
  bar: number
  roomTypeId: string
  plan: ResolverPlan
  seasons?: ResolverSeason[]
  dayOfWeekRules?: ResolverDayRule[]
  /** Override manual para esta (roomType, plan, fecha), si existe. */
  overrideRate?: number | null
}

export interface ResolvedRate {
  rate: number
  /** Capa que determinó el precio — para debug/auditoría. */
  source: 'OVERRIDE' | 'SEASON_OVERRIDE' | 'SEASON_MULTIPLIER' | 'BASE'
  appliedDayOfWeekMultiplier: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** ¿`date` cae dentro de [startDate, endDate] (inclusive, por día)? */
function dateInRange(date: Date, start: Date, end: Date): boolean {
  const d = date.getTime()
  return d >= startOfDay(start) && d <= endOfDay(end)
}
function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
}
function endOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
}

export function resolveNightlyRate(input: ResolveRateInput): ResolvedRate {
  // 1. Override manual gana siempre.
  if (input.overrideRate != null) {
    return { rate: round2(input.overrideRate), source: 'OVERRIDE', appliedDayOfWeekMultiplier: null }
  }

  // 2. Base del plan.
  let base: number
  if (input.plan.baseStrategy === 'FIXED') {
    base = Number(input.plan.baseRate ?? 0)
  } else if (input.plan.baseStrategy === 'MULTIPLIER') {
    base = input.bar * Number(input.plan.baseMultiplier ?? 1)
  } else {
    base = input.bar // BAR
  }

  // 3. Season que matchea la fecha (la primera; el caller las ordena). Una season
  //    roomType-specific gana sobre la general (null) si ambas matchean.
  const matching = (input.seasons ?? []).filter((s) => dateInRange(input.date, s.startDate, s.endDate))
  const season =
    matching.find((s) => s.roomTypeId === input.roomTypeId) ??
    matching.find((s) => s.roomTypeId == null) ??
    null

  let source: ResolvedRate['source'] = 'BASE'
  let rate = base
  if (season) {
    if (season.overrideRate != null) {
      rate = Number(season.overrideRate)
      source = 'SEASON_OVERRIDE'
    } else if (season.multiplier != null) {
      rate = base * Number(season.multiplier)
      source = 'SEASON_MULTIPLIER'
    }
  }

  // 4. Day-of-week multiplier (se aplica salvo que la season fije un overrideRate
  //    absoluto — un precio fijo de season no se modula por día de semana).
  let dowMult: number | null = null
  if (source !== 'SEASON_OVERRIDE') {
    const dow = new Date(input.date).getUTCDay()
    const rule = (input.dayOfWeekRules ?? []).find((r) => r.dayOfWeek === dow)
    if (rule) {
      dowMult = Number(rule.multiplier)
      rate = rate * dowMult
    }
  }

  return { rate: round2(rate), source, appliedDayOfWeekMultiplier: dowMult }
}
