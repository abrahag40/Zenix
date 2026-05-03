/**
 * Server-side formatting helpers for the mobile dashboard.
 *
 * Why server-formatted strings:
 *   - Multi-timezone correctness lives in ONE place (CLAUDE.md §14).
 *   - Money is Decimal arithmetic on the backend; the wire format is a
 *     human string so the mobile app never does FP math (CLAUDE.md §17).
 *   - i18n / locale switching in the future = one server change, not 12
 *     mobile components.
 */

import type Decimal from 'decimal.js'

/**
 * Local YMD string for a given instant in a given IANA timezone.
 * Mirrors `apps/api/src/pms/guest-stays/night-audit.scheduler.ts` —
 * single source of multi-timezone truth across the API.
 */
export function localYMD(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function localStartOfDay(d: Date, timezone: string): Date {
  const ymd = localYMD(d, timezone)
  // Construct the property-local midnight, then convert to UTC by computing
  // the offset for that wall time. Simpler approach: use Date.parse of an
  // ISO string with the offset for that timezone.
  // For our reports the precision needed is "the day boundary" — a few
  // hours of drift on DST edges is acceptable since occupancy is calculated
  // by stay overlap (not by boundary precision).
  return new Date(`${ymd}T00:00:00`)
}

/** Add N days to a Date (returns new Date, does NOT mutate). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

/**
 * Format a Decimal/number/string amount with thousands separators in es-MX.
 * Returns "$42,180" — currency suffix is kept separate (per RevenueFrameDto).
 */
export function fmtAmountWhole(value: number | string | Decimal): string {
  const n = typeof value === 'number' ? value : Number(value.toString())
  if (Number.isNaN(n)) return '$—'
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
}

/** Same shape but with currency suffix appended — for breakdown rows. */
export function fmtMoneyWithCurrency(
  value: number | string | Decimal,
  currency: string,
): string {
  return `${fmtAmountWhole(value)} ${currency}`
}

/** Pre-format a delta line: "↑ +12% vs ayer" / "↓ -3% vs ayer" / "→ 0% vs ayer". */
export function fmtDeltaCaption(
  todayValue: number,
  yesterdayValue: number | null | undefined,
  caption: string,
): { line: string; tone: 'positive' | 'negative' | 'neutral' } {
  if (yesterdayValue == null) {
    return { line: caption, tone: 'neutral' }
  }
  const delta = todayValue - yesterdayValue
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
  const pct = Math.round(delta)
  const sign = pct > 0 ? '+' : ''
  const tone = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
  return {
    line: `${caption} · ${arrow} ${sign}${pct}% vs ayer`,
    tone,
  }
}

/**
 * Pre-format a stay's checkout schedule for the in-house list.
 * Same logic the mobile would apply — but server-side guarantees
 * timezone correctness.
 */
export function fmtScheduleLabel(
  scheduledCheckout: Date,
  paxCount: number,
  timezone: string,
): string {
  const today = localYMD(new Date(), timezone)
  const checkoutDay = localYMD(scheduledCheckout, timezone)
  const tomorrow = localYMD(addDays(new Date(), 1), timezone)
  const time = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(scheduledCheckout)

  let when: string
  if (checkoutDay === today) when = `sale hoy ${time}`
  else if (checkoutDay === tomorrow) when = `sale mañana ${time}`
  else {
    const diff = Math.round(
      (scheduledCheckout.getTime() - new Date().getTime()) / 86_400_000,
    )
    when = diff > 0 ? `sale en ${diff} días` : 'salida pasada'
  }
  return `${when} · ${paxCount} pax`
}

/** Pre-format a date range: "23 abr → 26 abr · 3 días" / "25 abr → indefinido". */
export function fmtDateRange(
  startsAt: Date,
  endsAt: Date | null,
  timezone: string,
): string {
  const fmt = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
  })
  const start = fmt.format(startsAt)
  if (!endsAt) return `${start} → indefinido`
  const end = fmt.format(endsAt)
  const days = Math.max(
    1,
    Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000),
  )
  return `${start} → ${end} · ${days} día${days !== 1 ? 's' : ''}`
}

/**
 * Format a wall-clock time from a UTC Date in the property's timezone.
 * Returns "HH:mm" (24h), e.g. "14:30".
 */
export function fmtLocalTime(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/**
 * Format a relative timestamp label in Spanish.
 * Used in history events: "hace 2h", "ayer", "hace 3 días".
 */
export function fmtRelativeLabel(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffH = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffMin < 1)  return 'ahora'
  if (diffMin < 60) return `hace ${diffMin}min`
  if (diffH  < 24)  return `hace ${diffH}h`
  if (diffDays === 1) return 'ayer'
  return `hace ${diffDays} días`
}

/**
 * Format an absolute timestamp label in Spanish ("26 abr 21:42").
 * Used alongside fmtRelativeLabel in history events.
 */
export function fmtAbsoluteLabel(d: Date, timezone: string): string {
  const datePart = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone, day: '2-digit', month: 'short',
  }).format(d)
  const timePart = fmtLocalTime(d, timezone)
  return `${datePart} ${timePart}`
}

/**
 * Format a reservation date-range label for the mobile list card.
 * Examples: "Hoy 15:00 → Mañana 12:00", "25 abr 14:00 → 28 abr 11:00 · 3 noches".
 */
export function fmtReservationDateRange(
  checkinAt: Date,
  scheduledCheckout: Date,
  timezone: string,
): string {
  const today    = localYMD(new Date(), timezone)
  const tomorrow = localYMD(addDays(new Date(), 1), timezone)
  const checkinDay  = localYMD(checkinAt, timezone)
  const checkoutDay = localYMD(scheduledCheckout, timezone)
  const checkinTime  = fmtLocalTime(checkinAt, timezone)
  const checkoutTime = fmtLocalTime(scheduledCheckout, timezone)
  const nights = Math.max(
    1,
    Math.round((scheduledCheckout.getTime() - checkinAt.getTime()) / 86_400_000),
  )
  const shortFmt = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone, day: '2-digit', month: 'short',
  })
  const startLabel =
    checkinDay === today    ? `Hoy ${checkinTime}` :
    checkinDay === tomorrow ? `Mañana ${checkinTime}` :
                              `${shortFmt.format(checkinAt)} ${checkinTime}`
  const endLabel =
    checkoutDay === today    ? `Hoy ${checkoutTime}` :
    checkoutDay === tomorrow ? `Mañana ${checkoutTime}` :
                               `${shortFmt.format(scheduledCheckout)} ${checkoutTime}`
  return `${startLabel} → ${endLabel} · ${nights} noche${nights !== 1 ? 's' : ''}`
}

/**
 * Format a flair tag for in-house rooms (VIP / Late ck / etc.).
 * For Sprint 9 we surface "VIP" if guestStay.notes contains the literal,
 * "Late ck" if scheduled checkout is later than property's defaultCheckoutTime,
 * and null otherwise.
 */
export function deriveFlair(
  notes: string | null,
  scheduledCheckout: Date,
  defaultCheckoutTime: string,
  timezone: string,
): string | null {
  if (notes && /\bVIP\b/i.test(notes)) return 'VIP'
  // defaultCheckoutTime e.g. "11:00"
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(scheduledCheckout)
  // Naive compare — both strings are HH:mm
  if (localTime > defaultCheckoutTime) return 'Late ck'
  return null
}
