/**
 * normalize-reservation (MIGRATION-CORE Sprint 2) — validación + normalización
 * PURA de una reserva ya mapeada. Detecta filas inválidas (fecha imposible,
 * checkout≤checkin, monto negativo, sin fechas) y normaliza moneda + estado.
 * Las fechas ya vienen en ISO desde el mapper; aquí se validan invariantes.
 */
import type { MigrationReservationDto } from '@zenix/shared'
import { MigrationRowStatus } from '@zenix/shared'

export interface NormalizeIssue {
  type: 'BAD_DATE' | 'NEGATIVE_AMOUNT' | 'MISSING_DATES'
  message: string
}

export interface NormalizedReservation {
  reservation: MigrationReservationDto
  status: MigrationRowStatus
  issues: NormalizeIssue[]
  /** Estado canónico Zenix derivado (ARRIVING/IN_HOUSE/CHECKED_OUT/NO_SHOW/CANCELLED). */
  canonicalStatus: string
  /** true si la reserva NO ocupa inventario (cancelada/no-show) → no entra al detector de empalmes. */
  occupies: boolean
}

const STATUS_MAP: Record<string, string> = {
  // Cloudbeds / genéricos → canónico Zenix
  'confirmed': 'ARRIVING', 'reserved': 'ARRIVING', 'booked': 'ARRIVING', 'not arrived': 'ARRIVING',
  'checked in': 'IN_HOUSE', 'in house': 'IN_HOUSE', 'inhouse': 'IN_HOUSE', 'arrived': 'IN_HOUSE',
  'checked out': 'CHECKED_OUT', 'departed': 'CHECKED_OUT', 'checkout': 'CHECKED_OUT',
  'no show': 'NO_SHOW', 'noshow': 'NO_SHOW', 'no-show': 'NO_SHOW',
  'cancelled': 'CANCELLED', 'canceled': 'CANCELLED', 'void': 'CANCELLED',
}

export function normalizeStatus(raw?: string): string {
  if (!raw) return 'ARRIVING'
  return STATUS_MAP[raw.trim().toLowerCase()] ?? 'ARRIVING'
}

export function normalizeReservation(
  input: MigrationReservationDto,
  ctx: { defaultCurrency: string },
): NormalizedReservation {
  const issues: NormalizeIssue[] = []
  const canonicalStatus = normalizeStatus(input.status)

  // Fechas: el mapper deja '' si no parseó. Validar presencia + orden.
  if (!input.checkIn || !input.checkOut) {
    issues.push({ type: 'MISSING_DATES', message: 'Falta o no se pudo leer la fecha de entrada/salida.' })
  } else if (input.checkOut <= input.checkIn) {
    issues.push({ type: 'BAD_DATE', message: `Salida (${input.checkOut}) no es posterior a la entrada (${input.checkIn}).` })
  }

  if (input.totalAmount != null && input.totalAmount < 0) {
    issues.push({ type: 'NEGATIVE_AMOUNT', message: `Monto total negativo (${input.totalAmount}).` })
  }

  const reservation: MigrationReservationDto = {
    ...input,
    currency: input.currency || ctx.defaultCurrency,
    status: canonicalStatus,
  }

  // Severidad: fecha inválida/faltante = ERROR (no cargable); monto negativo = WARN.
  const hasError = issues.some((i) => i.type === 'BAD_DATE' || i.type === 'MISSING_DATES')
  const status = hasError
    ? MigrationRowStatus.ERROR
    : issues.length > 0
      ? MigrationRowStatus.WARN
      : MigrationRowStatus.OK

  // Ocupa inventario salvo cancelada/no-show o fila con error de fechas.
  const occupies = !hasError && canonicalStatus !== 'CANCELLED' && canonicalStatus !== 'NO_SHOW'

  return { reservation, status, issues, canonicalStatus, occupies }
}
