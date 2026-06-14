/**
 * reservation-mapper — aplica un MigrationColumnMapping a las filas crudas del
 * CSV y produce DTOs canónicos. Núcleo PURO (sin BD), testeable. MIGRATION-CORE
 * Sprint 1. La normalización profunda (timezone IANA, ISO 4217, dedup) y la
 * detección de empalmes son Sprint 2 — aquí solo se hace el mapeo + parseo de
 * fecha básico para dejar el DTO listo en staging.
 */
import type {
  MigrationColumnMapping,
  MigrationReservationDto,
  MigrationGuestDto,
} from '@zenix/shared'

/** Campos canónicos mapeables de una reserva (claves de mapping.reservation). */
export const RESERVATION_FIELDS = [
  'sourceId', 'guestName', 'guestFirstName', 'guestLastName', 'guestEmail',
  'guestPhone', 'guestCountry', 'guestDocument', 'checkIn', 'checkOut',
  'roomLabel', 'roomTypeLabel', 'ratePerNight', 'totalAmount', 'amountPaid',
  'balance', 'currency', 'status', 'sourceChannel', 'otaReservationCode',
  'adults', 'children', 'notes',
] as const

/**
 * Parsea una fecha de origen a ISO `YYYY-MM-DD`. Soporta el formato declarado
 * en `dateFormat` (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) + ISO directo. Devuelve
 * `null` si no es parseable o es imposible (el caller lo marca BAD_DATE).
 */
export function parseSourceDate(value: string, dateFormat?: string): string | null {
  const v = (value ?? '').trim()
  if (!v) return null
  // ISO directo YYYY-MM-DD(THH...) → toma la parte de fecha.
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return validYmd(+iso[1], +iso[2], +iso[3])

  const parts = v.split(/[/.\-]/).map((p) => p.trim())
  if (parts.length !== 3) return null
  let y: number, m: number, d: number
  if (dateFormat === 'MM/DD/YYYY') { m = +parts[0]; d = +parts[1]; y = +parts[2] }
  else if (dateFormat === 'YYYY-MM-DD') { y = +parts[0]; m = +parts[1]; d = +parts[2] }
  else { d = +parts[0]; m = +parts[1]; y = +parts[2] } // DD/MM/YYYY (default LATAM)
  if (y < 100) y += 2000
  return validYmd(y, m, d)
}

function validYmd(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  // Rechaza fechas imposibles (ej. 31/02 → JS rola a marzo).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function num(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined
  // Quita símbolos de moneda y separadores de miles simples.
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '')
  const n = Number(cleaned.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function pick(row: Record<string, string>, mapping: MigrationColumnMapping, field: string): string | undefined {
  const header = mapping.reservation[field]
  if (!header) return undefined
  const val = row[header]
  return val == null || val.trim() === '' ? undefined : val.trim()
}

export interface MapRowsResult {
  reservations: MigrationReservationDto[]
  guests: MigrationGuestDto[]
}

/**
 * Mapea filas crudas → reservas + huéspedes canónicos según el mapping. NO
 * valida empalmes ni normaliza timezone (Sprint 2); sí parsea fechas y deriva
 * guestName/amountPaid. Filas sin sourceId reciben un id sintético por índice.
 */
export function mapRows(
  rows: Record<string, string>[],
  mapping: MigrationColumnMapping,
): MapRowsResult {
  const reservations: MigrationReservationDto[] = []
  const guestsByKey = new Map<string, MigrationGuestDto>()

  rows.forEach((row, i) => {
    const first = pick(row, mapping, 'guestFirstName')
    const last = pick(row, mapping, 'guestLastName')
    const fullFromParts = [first, last].filter(Boolean).join(' ').trim()
    const guestName = pick(row, mapping, 'guestName') || fullFromParts || 'Sin nombre'

    const total = num(pick(row, mapping, 'totalAmount'))
    const balance = num(pick(row, mapping, 'balance'))
    const explicitPaid = num(pick(row, mapping, 'amountPaid'))
    const amountPaid =
      explicitPaid != null ? explicitPaid
      : total != null && balance != null ? round2(total - balance)
      : undefined

    const res: MigrationReservationDto = {
      sourceId: pick(row, mapping, 'sourceId') || `ROW-${i + 1}`,
      guestName,
      guestFirstName: first,
      guestLastName: last,
      guestEmail: pick(row, mapping, 'guestEmail'),
      guestPhone: pick(row, mapping, 'guestPhone'),
      guestCountry: pick(row, mapping, 'guestCountry'),
      guestDocument: pick(row, mapping, 'guestDocument'),
      checkIn: parseSourceDate(pick(row, mapping, 'checkIn') ?? '', mapping.dateFormat) ?? '',
      checkOut: parseSourceDate(pick(row, mapping, 'checkOut') ?? '', mapping.dateFormat) ?? '',
      roomLabel: pick(row, mapping, 'roomLabel'),
      roomTypeLabel: pick(row, mapping, 'roomTypeLabel'),
      ratePerNight: num(pick(row, mapping, 'ratePerNight')),
      totalAmount: total,
      amountPaid,
      currency: pick(row, mapping, 'currency'),
      status: pick(row, mapping, 'status'),
      sourceChannel: pick(row, mapping, 'sourceChannel'),
      otaReservationCode: pick(row, mapping, 'otaReservationCode'),
      adults: intOrUndef(pick(row, mapping, 'adults')),
      children: intOrUndef(pick(row, mapping, 'children')),
      notes: pick(row, mapping, 'notes'),
      raw: row,
    }
    reservations.push(res)

    // Dedup ligero de huéspedes por email > teléfono > nombre (el dedup real es Sprint 2).
    const key = (res.guestEmail || res.guestPhone || guestName).toLowerCase()
    if (!guestsByKey.has(key)) {
      guestsByKey.set(key, {
        sourceId: res.sourceId,
        fullName: guestName,
        firstName: first,
        lastName: last,
        email: res.guestEmail,
        phone: res.guestPhone,
        country: res.guestCountry,
        document: res.guestDocument,
      })
    }
  })

  return { reservations, guests: [...guestsByKey.values()] }
}

function intOrUndef(v: string | undefined): number | undefined {
  const n = num(v)
  return n == null ? undefined : Math.trunc(n)
}
function round2(n: number): number { return Math.round(n * 100) / 100 }
