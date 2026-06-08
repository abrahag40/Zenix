/**
 * Helpers compartidos entre los 2 listeners HK realtime (Etapa A del plan
 * MOBILE-DASHBOARD §A1 + §A2). Funciones puras + sin BD para reusar en tests.
 */

export function toLocalDateUtc(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * UTC midnight del día local en la timezone de la property.
 * Convierte "2026-06-08" (local de Tulum) → 2026-06-08T00:00:00.000Z (UTC).
 * Patrón usado por morning-roster + scheduled cleaning tasks.
 */
export function startOfLocalDayUtc(date: Date, timezone: string): Date {
  const localDate = toLocalDateUtc(date, timezone)
  return new Date(`${localDate}T00:00:00.000Z`)
}

/**
 * True si `checkInIso` (ISO date string del stay) cae HOY en la timezone
 * de la property. Owner caso 1: booking aterriza 10AM con check-in HOY 14:00
 * → la recamarista debe ver URGENT.
 */
export function isSameDayInTimezone(checkInIso: string, propertyTimezone: string, now = new Date()): boolean {
  const checkInLocal = toLocalDateUtc(new Date(checkInIso), propertyTimezone)
  const todayLocal = toLocalDateUtc(now, propertyTimezone)
  return checkInLocal === todayLocal
}
