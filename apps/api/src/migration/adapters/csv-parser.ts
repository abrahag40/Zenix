/**
 * Parser CSV sin dependencias (subset RFC 4180) para MIGRATION-CORE Sprint 1.
 *
 * Soporta: campos entre comillas, comas y saltos de línea dentro de comillas,
 * comillas escapadas (""), CRLF/LF, BOM UTF-8. Suficiente para los exports de
 * los PMS (todos exportan CSV — ver pms-export-landscape.md).
 *
 * XLSX queda como follow-up (requiere lib `xlsx`/`exceljs`); mientras, cualquier
 * export se puede "Guardar como CSV". Decisión documentada en el plan Sprint 1.
 */

export interface ParsedCsv {
  headers: string[]
  /** Cada fila como objeto { header: value }. */
  rows: Record<string, string>[]
}

/** Tokeniza un CSV en matriz de celdas (respetando comillas). */
function tokenize(text: string): string[][] {
  // Quita BOM UTF-8 si existe.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++ } // comilla escapada ""
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\r') { continue } // CRLF → ignora CR
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  // Última celda/fila (si el archivo no termina en \n).
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

/**
 * Parsea texto CSV a { headers, rows }. La primera fila no vacía son los
 * headers. Filas con distinto número de columnas se rellenan/truncan al header.
 */
export function parseCsv(text: string): ParsedCsv {
  const matrix = tokenize(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (matrix.length === 0) return { headers: [], rows: [] }

  const headers = matrix[0].map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r]
    const obj: Record<string, string> = {}
    headers.forEach((h, c) => { obj[h] = (cells[c] ?? '').trim() })
    rows.push(obj)
  }
  return { headers, rows }
}
