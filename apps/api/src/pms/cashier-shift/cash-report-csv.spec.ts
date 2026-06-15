import { cashSummaryToCsv, shiftReportToCsv } from './cash-report-csv'
import {
  CashDailySummaryDto,
  CashierShiftReportDto,
  CashierShiftStatus,
  CashMovementType,
  CashOpeningSource,
  PaymentMethod,
} from '@zenix/shared'

const reportBase = (): CashierShiftReportDto => ({
  shift: {
    id: 'shift-1',
    status: CashierShiftStatus.RECONCILED,
    openedAt: '2026-06-14T08:00:00.000Z',
    closedAt: '2026-06-14T16:00:00.000Z',
    openingSource: CashOpeningSource.FRESH_BANK,
    openingFloat: { MXN: 2000 },
    cashier: { id: 'staff-A', name: 'Ana' },
    openingAcceptedBy: null,
    closingWitness: null,
    handoverFromShiftId: null,
  },
  payments: {
    byMethodCurrency: [{ method: PaymentMethod.CASH, currency: 'MXN', total: 1000, count: 3 }],
    cashTotalByCurrency: { MXN: 1000 },
  },
  movements: [
    {
      id: 'm1',
      type: CashMovementType.PAID_OUT,
      currency: 'MXN',
      amount: -300,
      notes: 'proveedor agua',
      createdBy: { id: 'staff-A', name: 'Ana' },
      createdAt: '2026-06-14T10:00:00.000Z',
    },
  ],
  reconciliation: {
    expected: { MXN: 2700 },
    actual: { MXN: 2700 },
    variance: { MXN: 0 },
    varianceReason: null,
    reconciledBy: null,
    reconciledAt: null,
    spotCounts: [],
  },
})

describe('cash-report-csv', () => {
  it('shiftReportToCsv incluye apertura, pagos, movimientos y arqueo', () => {
    const csv = shiftReportToCsv(reportBase())
    expect(csv).toContain('Reporte de turno de caja')
    expect(csv).toContain('Cajero,Ana')
    expect(csv).toContain('CASH,MXN,1000.00,3')
    expect(csv).toContain('PAID_OUT,MXN,-300.00')
    expect(csv).toContain('Arqueo (over/short)')
    expect(csv).toContain('Variance,MXN:0')
  })

  it('shiftReportToCsv OMITE el arqueo cuando reconciliation es null (vista cajero, R3)', () => {
    const r = reportBase()
    r.reconciliation = null
    const csv = shiftReportToCsv(r)
    expect(csv).not.toContain('Arqueo (over/short)')
    expect(csv).toContain('Pagos por método y divisa')
  })

  it('escapa comas/comillas en notas (RFC 4180)', () => {
    const r = reportBase()
    r.movements[0].notes = 'pago a "Acme, S.A."'
    const csv = shiftReportToCsv(r)
    expect(csv).toContain('"pago a ""Acme, S.A."""')
  })

  it('cashSummaryToCsv arma secciones por divisa/método, cajero y turnos', () => {
    const summary: CashDailySummaryDto = {
      date: '2026-06-14',
      propertyId: 'prop-1',
      byCurrencyMethod: [{ currency: 'MXN', method: PaymentMethod.CASH, total: 1500, count: 5 }],
      byCollector: [{ collectedById: 'staff-A', collectorName: 'Ana', currency: 'MXN', total: 1500, count: 5 }],
      shifts: [
        {
          id: 'shift-1',
          cashier: { id: 'staff-A', name: 'Ana' },
          status: CashierShiftStatus.CLOSED,
          openedAt: '2026-06-14T08:00:00.000Z',
          closedAt: '2026-06-14T16:00:00.000Z',
          variance: { MXN: -100 },
        },
      ],
    }
    const csv = cashSummaryToCsv(summary)
    expect(csv).toContain('Resumen diario de caja,2026-06-14,prop-1')
    expect(csv).toContain('MXN,CASH,1500.00,5')
    expect(csv).toContain('Ana,MXN,1500.00,5')
    expect(csv).toContain('shift-1,Ana,CLOSED')
    expect(csv).toContain('MXN:-100')
  })
})
