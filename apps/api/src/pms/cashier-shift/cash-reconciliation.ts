/**
 * Arqueo de caja — función PURA (sin BD), Sprint CASH-DRAWER-REPORTS Sprint 2 (D-CASH3/6).
 *
 * Calcula el esperado per-divisa de un turno y la variance contra el conteo físico.
 * Patrón de funciones puras testeables del repo (`resolveNightlyRate`,
 * `computeCancellationOutcome`).
 *
 *   esperado[divisa] = fondoApertura[divisa]
 *                    + Σ(pagos CASH de la divisa)
 *                    + Σ(movimientos firmados de la divisa)   // PAID_OUT/CHANGE = negativos
 *   variance[divisa] = contado[divisa] − esperado[divisa]
 *
 * Multi-divisa per-divisa, NUNCA agregado (D-CASH3): nunca se suman divisas distintas.
 *
 * Tolerancia (D-CASH6): el umbral se aplica POR DIVISA (un umbral de 50 = cualquier
 * divisa de la gaveta descuadrada por >50 de SUS propias unidades marca fuera de
 * tolerancia). La normalización FX del umbral a una sola moneda base requiere tipos
 * de cambio y queda para PAY-CORE (§81); aquí el criterio per-divisa es conservador.
 */

export type CashRecord = Record<string, number>

export interface CashLine {
  currency: string
  amount: number // pagos CASH: positivo. movimientos: firmado (PAID_OUT/CHANGE negativos).
}

export interface ReconciliationInput {
  openingFloat: CashRecord
  cashPayments: CashLine[] // PaymentLog method=CASH, no-void
  movements: CashLine[] // CashMovement firmados, EXCLUYE SPOT_COUNT
  actualClose: CashRecord // conteo físico del cajero
  varianceThreshold: number // por divisa (D-CASH6)
}

export interface ReconciliationResult {
  expected: CashRecord
  variance: CashRecord // contado − esperado
  withinTolerance: boolean
  maxAbsVariance: number
  currencies: string[]
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function computeShiftReconciliation(input: ReconciliationInput): ReconciliationResult {
  const { openingFloat, cashPayments, movements, actualClose, varianceThreshold } = input

  // Universo de divisas tocadas por cualquier fuente.
  const currencies = [
    ...new Set([
      ...Object.keys(openingFloat ?? {}),
      ...cashPayments.map((p) => p.currency),
      ...movements.map((m) => m.currency),
      ...Object.keys(actualClose ?? {}),
    ]),
  ].sort()

  const expected: CashRecord = {}
  const variance: CashRecord = {}
  let maxAbsVariance = 0

  for (const cur of currencies) {
    const open = openingFloat?.[cur] ?? 0
    const pay = cashPayments.filter((p) => p.currency === cur).reduce((s, p) => s + p.amount, 0)
    const mov = movements.filter((m) => m.currency === cur).reduce((s, m) => s + m.amount, 0)
    const exp = round2(open + pay + mov)
    const act = actualClose?.[cur] ?? 0
    const v = round2(act - exp)
    expected[cur] = exp
    variance[cur] = v
    if (Math.abs(v) > maxAbsVariance) maxAbsVariance = Math.abs(v)
  }

  return {
    expected,
    variance,
    withinTolerance: maxAbsVariance <= varianceThreshold,
    maxAbsVariance,
    currencies,
  }
}
