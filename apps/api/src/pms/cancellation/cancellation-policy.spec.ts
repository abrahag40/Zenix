/**
 * cancellation-policy.spec.ts — Sprint GROUP-BILLING Fase C
 *
 * Cubre el motor PURO computeCancellationOutcome (D-GRP-C4): ventana gratuita,
 * tramos NIGHTS/PERCENT/FIXED, cap al total, cálculo de reembolso, y no-show
 * (check-in pasado → último tramo).
 */
import {
  computeCancellationOutcome,
  DEFAULT_POLICY_TIERS,
  DEFAULT_FREE_WINDOW_HOURS,
  type PolicyShape,
} from './cancellation-policy.service'

const POLICY: PolicyShape = {
  freeWindowHours: DEFAULT_FREE_WINDOW_HOURS, // 48
  tiers: DEFAULT_POLICY_TIERS, // 48-24h → 1 noche; 24-0h → 100%
}

// Stay base: 3 noches × $120 = $360, pagado $360, check-in en una fecha fija.
const CHECKIN = new Date('2026-06-10T15:00:00.000Z')
const stay = (overrides: Partial<{ totalAmount: number; amountPaid: number; ratePerNight: number }> = {}) => ({
  checkinAt: CHECKIN,
  totalAmount: 360,
  amountPaid: 360,
  ratePerNight: 120,
  currency: 'USD',
  ...overrides,
})
// now a X horas antes del check-in
const hoursBefore = (h: number) => new Date(CHECKIN.getTime() - h * 3_600_000)

describe('computeCancellationOutcome', () => {
  it('ventana gratuita (≥48h antes) → sin retención, reembolso total', () => {
    const r = computeCancellationOutcome(POLICY, stay(), hoursBefore(72))
    expect(r.free).toBe(true)
    expect(r.retention).toBe(0)
    expect(r.refund).toBe(360)
  })

  it('exactamente 48h → aún gratis (límite inclusivo)', () => {
    const r = computeCancellationOutcome(POLICY, stay(), hoursBefore(48))
    expect(r.free).toBe(true)
    expect(r.retention).toBe(0)
  })

  it('tramo 48-24h → retiene 1 noche ($120), reembolsa el resto', () => {
    const r = computeCancellationOutcome(POLICY, stay(), hoursBefore(36))
    expect(r.free).toBe(false)
    expect(r.appliedTier?.chargeType).toBe('NIGHTS')
    expect(r.retention).toBe(120)
    expect(r.refund).toBe(240)
  })

  it('tramo <24h → retiene 100% ($360), reembolso 0', () => {
    const r = computeCancellationOutcome(POLICY, stay(), hoursBefore(12))
    expect(r.retention).toBe(360)
    expect(r.refund).toBe(0)
  })

  it('no-show (check-in pasado) → cae en el último tramo (100%)', () => {
    const r = computeCancellationOutcome(POLICY, stay(), hoursBefore(-5)) // 5h DESPUÉS
    expect(r.retention).toBe(360)
    expect(r.refund).toBe(0)
  })

  it('PERCENT 50% → retiene la mitad del total', () => {
    const policy: PolicyShape = { freeWindowHours: 48, tiers: [{ fromHours: 48, toHours: 0, chargeType: 'PERCENT', value: 50 }] }
    const r = computeCancellationOutcome(policy, stay(), hoursBefore(10))
    expect(r.retention).toBe(180)
    expect(r.refund).toBe(180)
  })

  it('FIXED → retiene monto absoluto, capado al total', () => {
    const policy: PolicyShape = { freeWindowHours: 48, tiers: [{ fromHours: 48, toHours: 0, chargeType: 'FIXED', value: 1000 }] }
    const r = computeCancellationOutcome(policy, stay(), hoursBefore(10))
    expect(r.retention).toBe(360) // capado al total, no $1000
    expect(r.refund).toBe(0)
  })

  it('retención solo se reembolsa de lo PAGADO (pago parcial)', () => {
    // Pagó solo $100 de $360; cae en <24h (retención 100% = $360 capado).
    // El reembolso no puede ser negativo → 0.
    const r = computeCancellationOutcome(POLICY, stay({ amountPaid: 100 }), hoursBefore(12))
    expect(r.retention).toBe(360)
    expect(r.refund).toBe(0)
  })

  it('retención parcial con pago total → reembolsa la diferencia', () => {
    // 1 noche retenida ($120) de $360 pagados → reembolso $240.
    const r = computeCancellationOutcome(POLICY, stay({ amountPaid: 360 }), hoursBefore(30))
    expect(r.retention).toBe(120)
    expect(r.refund).toBe(240)
  })
})
