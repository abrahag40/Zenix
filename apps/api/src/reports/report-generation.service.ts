import { Injectable } from '@nestjs/common'
import { buildReportCsv, buildReportXlsx, type ReportColumn } from '../common/report-export'
import { ReportsService } from './reports.service'
import { MetricsService } from '../pms/metrics/metrics.service'

/**
 * ReportGenerationService — seam único que produce un reporte (columnas + filas +
 * totales) a partir de su `reportKey`, reusando los build*ReportRows de cada
 * módulo. Lo consume el scheduler de reportes programados (P4a) para adjuntar el
 * .xlsx/.csv al email, y es el backbone del catálogo (Estándar de Reportes, D-REPORT5).
 *
 * v1 cubre los reportes que toman `propertyId`/`organizationId` explícitos (sin
 * contexto de request): métricas, no-shows, estadías, saldos vencidos. Los de caja
 * (turnos/movimientos/resumen) usan `TenantContextService.getPropertyId()` del
 * request → se agregan en un fast-follow envolviendo en `cls.run` o aceptando
 * propertyId explícito en sus builders.
 */

export type SchedulableReportKey = 'metrics' | 'no-shows' | 'stays' | 'overstayed'

export interface ReportGenInput {
  reportKey: string
  propertyId: string
  organizationId: string
  /** Rango de fechas (YYYY-MM-DD). Algunos reportes (overstayed) lo ignoran. */
  from: string
  to: string
  /** Filtros congelados opcionales (ej. { currency: 'MXN' }). */
  filters?: Record<string, unknown> | null
}

export interface GeneratedReport {
  sheetName: string
  /** Nombre base del archivo (sin extensión). */
  filenameBase: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  totalsRow: Record<string, unknown>
  rowCount: number
}

@Injectable()
export class ReportGenerationService {
  constructor(
    private readonly reports: ReportsService,
    private readonly metrics: MetricsService,
  ) {}

  /** Lista de keys soportadas por el generador (v1). */
  static readonly SUPPORTED: SchedulableReportKey[] = ['metrics', 'no-shows', 'stays', 'overstayed']

  isSupported(key: string): key is SchedulableReportKey {
    return (ReportGenerationService.SUPPORTED as string[]).includes(key)
  }

  async generate(input: ReportGenInput): Promise<GeneratedReport> {
    const f = (input.filters ?? {}) as Record<string, unknown>
    const currencyFilter = typeof f.currency === 'string' ? (f.currency as string) : undefined

    switch (input.reportKey) {
      case 'metrics': {
        const { rows, totals, currency } = await this.metrics.buildMetricsReportRows(
          input.propertyId,
          input.organizationId,
          { from: input.from, to: input.to },
        )
        return {
          sheetName: 'Métricas diarias',
          filenameBase: 'metricas-diarias',
          columns: metricsColumns(currency),
          rows: rows.map((r) => ({ ...r, date: r.date.slice(0, 10) })),
          totalsRow: {
            date: 'TOTALES',
            occupancy: totals.occupancy,
            roomsSold: totals.roomsSold,
            adr: totals.adr,
            revpar: totals.revpar,
            revenue: totals.revenue,
            arrivals: totals.arrivals,
            departures: totals.departures,
            cancellations: totals.cancellations,
            noShows: totals.noShows,
          },
          rowCount: rows.length,
        }
      }
      case 'no-shows': {
        const { rows, totals, currency } = await this.reports.buildNoShowReportRows(input.propertyId, {
          from: input.from,
          to: input.to,
          currency: currencyFilter,
        })
        return {
          sheetName: 'No-shows',
          filenameBase: 'no-shows',
          columns: noShowColumns(currency),
          rows: rows.map((r) => ({
            ...r,
            noShowAt: r.noShowAt.slice(0, 10),
            scheduledCheckin: r.scheduledCheckin.slice(0, 10),
          })),
          totalsRow: { guest: 'TOTALES', fee: totals.fee },
          rowCount: rows.length,
        }
      }
      case 'stays': {
        const { rows, totals, currency } = await this.reports.buildStayReportRows(input.propertyId, {
          from: input.from,
          to: input.to,
          currency: currencyFilter,
        })
        return {
          sheetName: 'Estadías extendidas',
          filenameBase: 'estadias-extendidas',
          columns: stayColumns(currency),
          rows: rows.map((r) => ({ ...r, checkIn: r.checkIn.slice(0, 10), checkOut: r.checkOut.slice(0, 10) })),
          totalsRow: { guest: 'TOTALES', nights: totals.nights, revenue: totals.revenue },
          rowCount: rows.length,
        }
      }
      case 'overstayed': {
        const { rows, totals, currency } = await this.reports.buildOverstayedReportRows(input.propertyId, {
          currency: currencyFilter,
        })
        return {
          sheetName: 'Saldos vencidos',
          filenameBase: 'saldos-vencidos',
          columns: overstayedColumns(currency),
          rows: rows.map((r) => ({ ...r, scheduledCheckout: r.scheduledCheckout.slice(0, 10) })),
          totalsRow: { guest: 'TOTALES', balance: totals.balance },
          rowCount: rows.length,
        }
      }
      default:
        throw new Error(`reportKey no soportado por el generador: ${input.reportKey}`)
    }
  }

  /** Genera el archivo (Buffer xlsx o string csv) listo para adjuntar/descargar. */
  async generateFile(
    input: ReportGenInput,
    format: 'xlsx' | 'csv',
  ): Promise<{ filename: string; content: Buffer; rowCount: number }> {
    const g = await this.generate(input)
    if (format === 'csv') {
      const csv = buildReportCsv(g.columns, g.rows, g.totalsRow)
      return { filename: `${g.filenameBase}.csv`, content: Buffer.from(csv, 'utf-8'), rowCount: g.rowCount }
    }
    const buf = await buildReportXlsx(g.sheetName, g.columns, g.rows, g.totalsRow)
    return { filename: `${g.filenameBase}.xlsx`, content: buf, rowCount: g.rowCount }
  }
}

// ── Column specs (export shape) — mirror de los controllers, single-source aquí ──

function metricsColumns(currency: string): ReportColumn[] {
  return [
    { key: 'date', header: 'Fecha', width: 14 },
    { key: 'occupancy', header: 'Ocupación %', width: 13, numFmt: '#,##0.00' },
    { key: 'roomsSold', header: 'Hab. vendidas', width: 14 },
    { key: 'adr', header: `ADR (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'revpar', header: `RevPAR (${currency})`, width: 14, numFmt: '#,##0.00' },
    { key: 'revenue', header: `Ingreso (${currency})`, width: 16, numFmt: '#,##0.00' },
    { key: 'arrivals', header: 'Llegadas', width: 11 },
    { key: 'departures', header: 'Salidas', width: 11 },
    { key: 'cancellations', header: 'Cancelaciones', width: 14 },
    { key: 'noShows', header: 'No-shows', width: 11 },
  ]
}

function noShowColumns(currency: string): ReportColumn[] {
  return [
    { key: 'noShowAt', header: 'Marcado', width: 16 },
    { key: 'guest', header: 'Huésped', width: 24 },
    { key: 'room', header: 'Habitación', width: 12 },
    { key: 'scheduledCheckin', header: 'Llegada esperada', width: 16 },
    { key: 'source', header: 'Canal', width: 14 },
    { key: 'fee', header: `Cargo (${currency})`, width: 12, numFmt: '#,##0.00' },
    { key: 'chargeStatus', header: 'Estado cargo', width: 14 },
    { key: 'reason', header: 'Razón', width: 24 },
    { key: 'markedBy', header: 'Marcado por', width: 20 },
  ]
}

function stayColumns(currency: string): ReportColumn[] {
  return [
    { key: 'guest', header: 'Huésped', width: 24 },
    { key: 'room', header: 'Habitación', width: 12 },
    { key: 'checkIn', header: 'Llegada', width: 14 },
    { key: 'checkOut', header: 'Salida', width: 14 },
    { key: 'nights', header: 'Noches extra', width: 12 },
    { key: 'revenue', header: `Ingreso extra (${currency})`, width: 16, numFmt: '#,##0.00' },
    { key: 'source', header: 'Canal', width: 14 },
    { key: 'contact', header: 'Contacto', width: 26 },
  ]
}

function overstayedColumns(currency: string): ReportColumn[] {
  return [
    { key: 'guest', header: 'Huésped', width: 24 },
    { key: 'room', header: 'Habitación', width: 12 },
    { key: 'scheduledCheckout', header: 'Salida programada', width: 16 },
    { key: 'daysOverdue', header: 'Días vencidos', width: 13 },
    { key: 'hoursOverdue', header: 'Horas vencidas', width: 14 },
    { key: 'balance', header: `Saldo pendiente (${currency})`, width: 18, numFmt: '#,##0.00' },
    { key: 'source', header: 'Canal', width: 14 },
    { key: 'paymentStatus', header: 'Estado de pago', width: 16 },
    { key: 'contact', header: 'Contacto', width: 26 },
  ]
}
