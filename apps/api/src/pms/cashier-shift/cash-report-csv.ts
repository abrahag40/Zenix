import { CashDailySummaryDto, CashierShiftReportDto } from '@zenix/shared'

/**
 * Export CSV de los reportes de caja — funciones PURAS (Sprint 3, R7).
 * CSV "sectioned" (USALI-friendly): cada sección con su encabezado, separada por
 * línea en blanco. Escapado RFC 4180 mínimo (comillas + comas + saltos de línea).
 */

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function row(...cells: unknown[]): string {
  return cells.map(esc).join(',')
}

/** Serializa un saldo per-divisa { MXN: -100, USD: 0 } → "MXN:-100; USD:0". */
function cashStr(rec: Record<string, number> | null | undefined): string {
  if (!rec) return ''
  return Object.entries(rec)
    .map(([c, n]) => `${c}:${n}`)
    .join('; ')
}

export function shiftReportToCsv(report: CashierShiftReportDto): string {
  const lines: string[] = []
  const s = report.shift
  lines.push('Reporte de turno de caja')
  lines.push(row('Turno', s.id))
  lines.push(row('Cajero', s.cashier?.name ?? ''))
  lines.push(row('Estado', s.status))
  lines.push(row('Apertura', s.openedAt))
  lines.push(row('Cierre', s.closedAt ?? ''))
  lines.push(row('Origen del fondo', s.openingSource))
  lines.push(row('Fondo de apertura', cashStr(s.openingFloat)))
  lines.push(row('Recibido (handover de)', s.handoverFromShiftId ?? ''))
  lines.push(row('Aceptado por', s.openingAcceptedBy?.name ?? ''))
  lines.push(row('Testigo del cierre', s.closingWitness?.name ?? ''))

  lines.push('')
  lines.push('Pagos por método y divisa')
  lines.push(row('Método', 'Divisa', 'Total', 'Cantidad'))
  for (const p of report.payments.byMethodCurrency) {
    lines.push(row(p.method, p.currency, p.total.toFixed(2), p.count))
  }

  lines.push('')
  lines.push('Movimientos de caja')
  lines.push(row('Tipo', 'Divisa', 'Monto', 'Nota', 'Por', 'Fecha'))
  for (const m of report.movements) {
    lines.push(row(m.type, m.currency, m.amount.toFixed(2), m.notes ?? '', m.createdBy?.name ?? '', m.createdAt))
  }

  // Arqueo — solo cuando el reporte incluye reconciliación (SUPERVISOR, R3).
  if (report.reconciliation) {
    const r = report.reconciliation
    lines.push('')
    lines.push('Arqueo (over/short)')
    lines.push(row('Esperado', cashStr(r.expected)))
    lines.push(row('Contado', cashStr(r.actual)))
    lines.push(row('Variance', cashStr(r.variance)))
    lines.push(row('Razón', r.varianceReason ?? ''))
    lines.push(row('Conciliado por', r.reconciledBy?.name ?? '', r.reconciledAt ?? ''))
    if (r.spotCounts.length) {
      lines.push('')
      lines.push('Arqueos spot (supervisor)')
      lines.push(row('Divisa', 'Contado', 'Por', 'Fecha', 'Nota'))
      for (const sc of r.spotCounts) {
        lines.push(row(sc.currency, sc.counted.toFixed(2), sc.createdBy?.name ?? '', sc.createdAt, sc.notes ?? ''))
      }
    }
  }

  return lines.join('\n')
}

export function cashSummaryToCsv(summary: CashDailySummaryDto): string {
  const lines: string[] = []
  lines.push(row('Resumen diario de caja', summary.date, summary.propertyId))

  lines.push('')
  lines.push('Por divisa y método')
  lines.push(row('Divisa', 'Método', 'Total', 'Cantidad'))
  for (const e of summary.byCurrencyMethod) {
    lines.push(row(e.currency, e.method, e.total.toFixed(2), e.count))
  }

  lines.push('')
  lines.push('Por cajero')
  lines.push(row('Cajero', 'Divisa', 'Total', 'Cantidad'))
  for (const c of summary.byCollector) {
    lines.push(row(c.collectorName, c.currency, c.total.toFixed(2), c.count))
  }

  lines.push('')
  lines.push('Turnos')
  lines.push(row('Turno', 'Cajero', 'Estado', 'Apertura', 'Cierre', 'Variance'))
  for (const sh of summary.shifts) {
    lines.push(row(sh.id, sh.cashier?.name ?? '', sh.status, sh.openedAt, sh.closedAt ?? '', cashStr(sh.variance)))
  }

  return lines.join('\n')
}
