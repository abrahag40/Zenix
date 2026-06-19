/**
 * ZenixTemplateAdapter — la PLANTILLA oficial Zenix (CSV). Patrón SuccessFactors
 * de carga masiva: el consultor exporta de su PMS, rellena nuestra plantilla con
 * los encabezados canónicos y la sube. Como los encabezados YA son los campos
 * canónicos, el mapeo es IDENTIDAD (header === campo) → no requiere el wizard.
 *
 * Por qué CSV y no XLSX: ingesta sin dependencias (ya parseamos CSV), universal
 * (todo PMS lo exporta, Excel/Sheets/Numbers lo abren y guardan), patrón
 * SuccessFactors/SAP/Salesforce Data Loader. XLSX con dropdowns = mejora UX v2.
 *
 * `TEMPLATE_FIELDS` es la ÚNICA fuente de verdad de las columnas: la usa el
 * defaultMapping() (identidad) Y el generador del archivo descargable, así no
 * se desincronizan.
 */
import { Injectable } from '@nestjs/common'
import { MigrationSource } from '@zenix/shared'
import type { MigrationColumnMapping } from '@zenix/shared'
import type { ISourcePmsAdapter } from './source-pms-adapter.interface'

/** Columnas de la plantilla, en orden. `req` documenta obligatoriedad (para el legend). */
export const TEMPLATE_FIELDS: Array<{ field: string; req: boolean; help: string }> = [
  { field: 'sourceId',           req: true,  help: 'ID de la reserva en el PMS de origen (clave de idempotencia)' },
  { field: 'guestName',          req: true,  help: 'Nombre completo del huésped (si no usas first/last)' },
  { field: 'guestFirstName',     req: false, help: 'Nombre(s)' },
  { field: 'guestLastName',      req: false, help: 'Apellido(s)' },
  { field: 'guestEmail',         req: false, help: 'Correo del huésped' },
  { field: 'guestPhone',         req: false, help: 'Teléfono (con o sin guiones)' },
  { field: 'guestCountry',       req: false, help: 'País / nacionalidad' },
  { field: 'guestDocument',      req: false, help: 'Documento de identidad (sin datos de tarjeta — PCI)' },
  { field: 'checkIn',            req: true,  help: 'Entrada en formato ISO YYYY-MM-DD (ej. 2026-07-15)' },
  { field: 'checkOut',           req: true,  help: 'Salida en formato ISO YYYY-MM-DD (posterior a la entrada)' },
  { field: 'roomLabel',          req: false, help: 'Número/nombre de la habitación o cama (ej. 201, "Dorm A - Cama 3")' },
  { field: 'roomTypeLabel',      req: false, help: 'Tipo de habitación del origen (ej. Estándar, Suite, Dorm 6)' },
  { field: 'ratePerNight',       req: false, help: 'Tarifa por noche (número, sin símbolo)' },
  { field: 'totalAmount',        req: false, help: 'Importe total de la estadía (número)' },
  { field: 'amountPaid',         req: false, help: 'Monto ya pagado (número)' },
  { field: 'currency',           req: false, help: 'Moneda ISO 4217 (MXN, USD, EUR). Si falta, usa la base del hotel' },
  { field: 'status',             req: false, help: 'ARRIVING | IN_HOUSE | CHECKED_OUT | NO_SHOW | CANCELLED' },
  { field: 'sourceChannel',      req: false, help: 'Canal de la reserva (Booking.com, Directo, Walk-in…)' },
  { field: 'otaReservationCode', req: false, help: 'Código de reserva de la OTA (si aplica)' },
  { field: 'adults',             req: false, help: 'Número de adultos (entero)' },
  { field: 'children',           req: false, help: 'Número de menores (entero)' },
  { field: 'notes',              req: false, help: 'Notas / comentarios' },
]

/** Filas de ejemplo en la plantilla descargable (se borran al rellenar). */
const EXAMPLE_ROWS: Record<string, string>[] = [
  {
    sourceId: 'EJEMPLO-001', guestName: 'Ana García', guestFirstName: 'Ana', guestLastName: 'García',
    guestEmail: 'ana@example.com', guestPhone: '+52 998 123 4567', guestCountry: 'MX', guestDocument: '',
    checkIn: '2026-07-15', checkOut: '2026-07-18', roomLabel: '201', roomTypeLabel: 'Estándar',
    ratePerNight: '1200', totalAmount: '3600', amountPaid: '3600', currency: 'MXN',
    status: 'CHECKED_OUT', sourceChannel: 'Booking.com', otaReservationCode: 'BDC-4471829',
    adults: '2', children: '0', notes: 'Llegada tardía',
  },
  {
    sourceId: 'EJEMPLO-002', guestName: 'John Smith', guestFirstName: 'John', guestLastName: 'Smith',
    guestEmail: 'john@example.com', guestPhone: '', guestCountry: 'US', guestDocument: '',
    checkIn: '2026-08-01', checkOut: '2026-08-05', roomLabel: '202', roomTypeLabel: 'Suite',
    ratePerNight: '2500', totalAmount: '10000', amountPaid: '0', currency: 'MXN',
    status: 'ARRIVING', sourceChannel: 'Directo', otaReservationCode: '',
    adults: '1', children: '0', notes: '',
  },
]

/** Escapa un valor CSV (RFC 4180): comillas si contiene coma/comilla/salto. */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Genera la plantilla CSV oficial (encabezados canónicos + 2 filas de ejemplo). */
export function buildZenixTemplateCsv(): string {
  const headers = TEMPLATE_FIELDS.map((f) => f.field)
  const lines = [headers.join(',')]
  for (const row of EXAMPLE_ROWS) lines.push(headers.map((h) => csvCell(row[h] ?? '')).join(','))
  return lines.join('\r\n') + '\r\n'
}

@Injectable()
export class ZenixTemplateAdapter implements ISourcePmsAdapter {
  readonly id = MigrationSource.ZENIX_TEMPLATE
  readonly label = 'Plantilla Zenix (CSV)'

  /** Mapeo identidad: cada campo canónico se llama igual que su encabezado. */
  defaultMapping(): MigrationColumnMapping {
    const reservation: Record<string, string> = {}
    for (const { field } of TEMPLATE_FIELDS) reservation[field] = field
    return { reservation, dateFormat: 'YYYY-MM-DD' }
  }
}
