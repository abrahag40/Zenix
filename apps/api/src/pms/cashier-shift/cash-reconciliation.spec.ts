import { computeShiftReconciliation, ReconciliationInput } from './cash-reconciliation'

const base = (over: Partial<ReconciliationInput> = {}): ReconciliationInput => ({
  openingFloat: { MXN: 2000 },
  cashPayments: [],
  movements: [],
  actualClose: { MXN: 2000 },
  varianceThreshold: 50,
  ...over,
})

describe('computeShiftReconciliation — arqueo per-divisa (D-CASH3/6)', () => {
  it('cuadra exacto: solo fondo, sin pagos ni movimientos → variance 0, within', () => {
    const r = computeShiftReconciliation(base())
    expect(r.expected).toEqual({ MXN: 2000 })
    expect(r.variance).toEqual({ MXN: 0 })
    expect(r.withinTolerance).toBe(true)
    expect(r.maxAbsVariance).toBe(0)
  })

  it('cuadra con pagos en efectivo: esperado = fondo + Σpagos', () => {
    const r = computeShiftReconciliation(
      base({
        cashPayments: [
          { currency: 'MXN', amount: 500 },
          { currency: 'MXN', amount: 250 },
        ],
        actualClose: { MXN: 2750 },
      }),
    )
    expect(r.expected.MXN).toBe(2750)
    expect(r.variance.MXN).toBe(0)
    expect(r.withinTolerance).toBe(true)
  })

  it('sobrante (overage) dentro de tolerancia → within, variance positiva', () => {
    const r = computeShiftReconciliation(base({ actualClose: { MXN: 2030 } }))
    expect(r.variance.MXN).toBe(30)
    expect(r.withinTolerance).toBe(true)
  })

  it('faltante (shortage) fuera de tolerancia → NOT within, variance negativa', () => {
    const r = computeShiftReconciliation(base({ actualClose: { MXN: 1900 } }))
    expect(r.variance.MXN).toBe(-100)
    expect(r.maxAbsVariance).toBe(100)
    expect(r.withinTolerance).toBe(false)
  })

  it('límite exacto del umbral cuenta como DENTRO de tolerancia (<=)', () => {
    const r = computeShiftReconciliation(base({ actualClose: { MXN: 2050 }, varianceThreshold: 50 }))
    expect(r.variance.MXN).toBe(50)
    expect(r.withinTolerance).toBe(true)
  })

  it('paid-out (movimiento negativo) reduce el esperado', () => {
    const r = computeShiftReconciliation(
      base({
        cashPayments: [{ currency: 'MXN', amount: 1000 }],
        movements: [{ currency: 'MXN', amount: -300 }], // PAID_OUT
        actualClose: { MXN: 2700 },
      }),
    )
    expect(r.expected.MXN).toBe(2700) // 2000 + 1000 − 300
    expect(r.variance.MXN).toBe(0)
    expect(r.withinTolerance).toBe(true)
  })

  it('cambio dado + corrección: suma de movimientos firmados', () => {
    const r = computeShiftReconciliation(
      base({
        movements: [
          { currency: 'MXN', amount: -120 }, // CHANGE_GIVEN
          { currency: 'MXN', amount: 20 }, // CORRECTION (entró de más, se ajusta)
        ],
        actualClose: { MXN: 1900 },
      }),
    )
    expect(r.expected.MXN).toBe(1900) // 2000 − 120 + 20
    expect(r.variance.MXN).toBe(0)
  })

  it('multi-divisa: MXN cuadra, USD descuadra → per-divisa, NO agregado (D-CASH3)', () => {
    const r = computeShiftReconciliation({
      openingFloat: { MXN: 2000, USD: 100 },
      cashPayments: [
        { currency: 'MXN', amount: 500 },
        { currency: 'USD', amount: 40 },
      ],
      movements: [],
      actualClose: { MXN: 2500, USD: 80 }, // USD faltan 60
      varianceThreshold: 50,
    })
    expect(r.expected).toEqual({ MXN: 2500, USD: 140 })
    expect(r.variance).toEqual({ MXN: 0, USD: -60 })
    expect(r.maxAbsVariance).toBe(60)
    expect(r.withinTolerance).toBe(false) // USD rompe la tolerancia aunque MXN cuadre
    expect(r.currencies).toEqual(['MXN', 'USD'])
  })

  it('divisa presente solo en el conteo (no en fondo ni pagos) → esperado 0, variance = contado', () => {
    const r = computeShiftReconciliation(base({ actualClose: { MXN: 2000, EUR: 10 } }))
    expect(r.expected.EUR).toBe(0)
    expect(r.variance.EUR).toBe(10)
  })

  it('redondea a 2 decimales (sin drift de float)', () => {
    const r = computeShiftReconciliation(
      base({
        openingFloat: { MXN: 0 },
        cashPayments: [
          { currency: 'MXN', amount: 0.1 },
          { currency: 'MXN', amount: 0.2 },
        ],
        actualClose: { MXN: 0.3 },
      }),
    )
    expect(r.expected.MXN).toBe(0.3)
    expect(r.variance.MXN).toBe(0)
  })
})
