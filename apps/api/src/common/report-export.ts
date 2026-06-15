import { Workbook } from 'exceljs'

/**
 * Export de reportes server-side (Estándar de Reportes, D-REPORT4) — .xlsx
 * preferido por contabilidad, CSV fallback. Helper genérico reusable por TODOS
 * los reportes (no reinventar por módulo).
 */

export interface ReportColumn {
  key: string
  header: string
  width?: number
  numFmt?: string // formato Excel, ej. '#,##0.00'
}

/** Genera un .xlsx (Buffer) con encabezado en negrita + fila de totales opcional. */
export async function buildReportXlsx(
  sheetName: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  totals?: Record<string, unknown>,
): Promise<Buffer> {
  const wb = new Workbook()
  wb.creator = 'Zenix PMS'
  const ws = wb.addWorksheet(sheetName.slice(0, 31)) // Excel limita el nombre a 31 chars
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
    style: c.numFmt ? { numFmt: c.numFmt } : {},
  }))
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).alignment = { vertical: 'middle' }
  for (const r of rows) ws.addRow(r)
  if (totals) {
    const tr = ws.addRow(totals)
    tr.font = { bold: true }
  }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Genera un CSV (RFC 4180) con BOM para que Excel abra acentos correctamente. */
export function buildReportCsv(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  totals?: Record<string, unknown>,
): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c.key])).join(','))
  if (totals) lines.push(columns.map((c) => csvCell(totals[c.key])).join(','))
  return '﻿' + lines.join('\n')
}
