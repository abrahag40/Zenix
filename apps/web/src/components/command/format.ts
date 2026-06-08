/**
 * Format helpers — Command Center.
 *
 * Centralizado para que las 5 zonas hablen el mismo idioma visual.
 * Pattern Linear "instrument panel": densas, tabular-nums, snug.
 */

const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const HOUR_RTF = new Intl.RelativeTimeFormat('es', { style: 'short', numeric: 'always' })

export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 6) return 'Trasnoche'
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function formatLongDate(iso: string, tz?: string): string {
  const d = new Date(iso)
  // Use UTC-derived parts if tz not supported in env
  try {
    const fmt = new Intl.DateTimeFormat('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: tz,
    })
    return fmt.format(d)
  } catch {
    const w = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d.getDay()]
    return `${w} ${d.getDate()} ${SPANISH_MONTHS[d.getMonth()]}`
  }
}

export function formatClockHM(iso: string, tz?: string): string {
  const d = new Date(iso)
  try {
    const fmt = new Intl.DateTimeFormat('es-MX', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: tz,
    })
    return fmt.format(d)
  } catch {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }
}

/** Returns string like "en 2 h 15 min" or "hace 35 min" */
export function timeRelative(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.round((then - now.getTime()) / 60000)
  if (diffMin === 0) return 'ahora'
  const abs = Math.abs(diffMin)
  if (abs < 60) return diffMin > 0 ? `en ${abs} min` : `hace ${abs} min`
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = diffMin > 0 ? 'en' : 'hace'
  return m === 0 ? `${sign} ${h} h` : `${sign} ${h} h ${m} min`
}

export function formatMoney(n: number, ccy = 'USD'): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${ccy} ${Math.round(n).toLocaleString()}`
  }
}

export function formatInteger(n: number): string {
  return n.toLocaleString('es-MX')
}

/** Maps role enum to Spanish display. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'RECEPTIONIST': return 'Recepción'
    case 'HOUSEKEEPER':  return 'Housekeeping'
    case 'MANAGER':      return 'Gerencia'
    case 'SUPERVISOR':   return 'Supervisión'
    case 'MAINTENANCE':  return 'Mantenimiento'
    default:             return role
  }
}

/** Suppress unused export warning for HOUR_RTF (kept for future). */
void HOUR_RTF
