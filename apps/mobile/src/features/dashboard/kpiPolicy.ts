/**
 * KPI Policy — adaptive dashboard logic.
 *
 * Anchored to CLAUDE.md §37 + ARCHITECTURE.md AD-015.
 *
 * Pure function that decides which KPIs to render at the current local
 * hour of the property. Rotates between 4 windows:
 *
 *   morning    (06:00-12:00) → check-outs pendientes
 *   afternoon  (12:00-17:00) → check-ins recibidos vs esperados
 *   evening    (17:00-22:00) → no-shows potenciales (post warning hour)
 *   overnight  (22:00-06:00) → resumen del día
 *
 * Justification:
 *   - Pousman & Stasko 2006 (ACM): "Display only what is relevant to the
 *     user's current context."
 *   - Sweller 1988: information not relevant now consumes working memory
 *     unnecessarily.
 *   - Apple Today widgets: content varies by time of day.
 *
 * Design notes:
 *   - Uses Intl.DateTimeFormat with the property's timezone (multi-tz safe,
 *     same pattern as NightAuditScheduler in CLAUDE.md §14).
 *   - Pure function — easy to unit-test (no hooks, no side effects).
 *   - Suppression rules: when a KPI's value reaches 0 in the wrong window,
 *     it is replaced with a contextually-relevant alternative.
 */

export type KpiSlot = 'primary' | 'secondary'

export type KpiKey =
  | 'occupancy'
  | 'roomsGrid'
  | 'inHouse'           // permanent — guests currently in-house
  | 'myDay'
  | 'checkoutsPending'
  | 'roomsToClean'
  | 'checkinsReceived'
  | 'fxRate'            // morning — FX rate for USD/EUR-quoting properties
  // walkInsAvailable removed (Research #3): walk-ins are 4-9% of revenue
  // and constitute noise on a daily dashboard. Re-add only if requested.
  | 'noShowsList'       // evening — visual list of overdue arrivals
  | 'lateCheckIns'
  | 'daySummary'
  | 'nextDayArrivals'
  | 'comingSoon'

export interface KpiSpec {
  key: KpiKey
  slot: KpiSlot
  /** Optional reason copy shown in __DEV__ for QA verification of policy. */
  debugReason?: string
}

interface KpiPolicyInput {
  /** Current instant; pass `new Date()` from caller for testability. */
  now: Date
  /** IANA timezone of the user's property (e.g., 'America/Cancun'). */
  timezone: string
  /** Property setting — when to surface no-shows-potential KPI. Default 20. */
  potentialNoShowWarningHour?: number
}

/**
 * Returns the local hour (0-23) for the given instant in the given timezone.
 * Mirrors the pattern in apps/api/src/pms/guest-stays/night-audit.scheduler.ts
 * — single source of multi-timezone truth across the stack.
 */
function localHour(now: Date, tz: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(now)
  return Number(formatted) % 24
}

/**
 * Always-visible KPIs (24/7) — universal across all time windows.
 * These are added first in render order.
 */
const PERMANENT_KPIS: KpiSpec[] = [
  { key: 'occupancy', slot: 'primary',   debugReason: 'Universal — always relevant (STR Global #1 KPI)' },
  { key: 'inHouse',   slot: 'primary',   debugReason: 'Universal — drives every operational decision' },
  { key: 'roomsGrid', slot: 'primary',   debugReason: 'Universal — visual room status pre-attentive' },
  { key: 'myDay',     slot: 'secondary', debugReason: 'Personalized to user role' },
]

/**
 * Pure function — given the current time + property timezone, returns the
 * full set of KPIs to render in the dashboard, in render order.
 */
export function pickKpis(input: KpiPolicyInput): KpiSpec[] {
  const { now, timezone, potentialNoShowWarningHour = 20 } = input
  const h = localHour(now, timezone)

  let adaptive: KpiSpec[] = []

  if (h >= 6 && h < 12) {
    // ── Morning: operational priorities + FX (LATAM hostels quote in USD/EUR).
    // checkoutsPending removed: the dashboard is dominated by housekeeping
    // and inHouse cards, which already surface the relevant info.
    adaptive = [
      { key: 'fxRate',           slot: 'secondary', debugReason: 'morning — receptionist needs daily FX for quotes' },
    ]
  } else if (h >= 12 && h < 17) {
    // ── Afternoon: arrivals are now covered by MovementsCard (Capa 3).
    // No additional small KPIs surface during this window — keeps the
    // dashboard signal-rich rather than padding with redundant counters.
    adaptive = []
  } else if (h >= 17 && h < 22) {
    // ── Evening: visible no-shows list (after warning hour).
    // checkinsReceived removed — MovementsCard already surfaces today's
    // arrivals + departures with role-aware details.
    if (h >= potentialNoShowWarningHour) {
      adaptive = [
        { key: 'noShowsList',  slot: 'primary',   debugReason: `evening ${h}h ≥ warningHour ${potentialNoShowWarningHour}` },
        { key: 'lateCheckIns', slot: 'secondary', debugReason: 'evening — late arrival ops' },
      ]
    } else {
      adaptive = [
        { key: 'lateCheckIns',     slot: 'secondary', debugReason: 'evening — late arrival ops' },
      ]
    }
  } else {
    // ── Overnight (22-06): NoShowsList still relevant during day-hotelero
    // (CLAUDE.md §36 — day ends at noShowCutoffHour ~02:00, not midnight)
    adaptive = [
      { key: 'noShowsList',     slot: 'primary',   debugReason: `overnight ${h}h — pre-audit window` },
      { key: 'daySummary',      slot: 'secondary', debugReason: `overnight ${h}h — day summary` },
      { key: 'nextDayArrivals', slot: 'secondary', debugReason: 'overnight — preview tomorrow' },
    ]
  }

  return [...PERMANENT_KPIS, ...adaptive]
}

/**
 * Returns a human-readable label for the current time window.
 * Used by the dashboard header to communicate WHY the KPIs are what they are.
 */
export function currentWindowLabel(now: Date, tz: string): string {
  const h = localHour(now, tz)
  if (h >= 6  && h < 12) return 'Mañana'
  if (h >= 12 && h < 17) return 'Tarde'
  if (h >= 17 && h < 22) return 'Noche'
  return 'Madrugada'
}

/**
 * Suppression rule helper: given a KPI key + its current count, returns
 * either the same key (if relevant) or a replacement key.
 *
 * Example:
 *   suppressionReplacement('checkoutsPending', count=0, hour=14) →
 *     returns 'checkinsReceived' because morning checkouts are done.
 *
 * For Sprint 8I this is a placeholder that always returns the original key.
 * Real implementation in Sprint 9 when we have live data feeds.
 */
export function suppressionReplacement(
  key: KpiKey,
  count: number,
  hour: number,
): KpiKey {
  if (key === 'checkoutsPending' && count === 0 && hour >= 12) {
    return 'checkinsReceived'
  }
  if (key === 'myDay' && count === 0) {
    return 'comingSoon' // placeholder for "todo limpio" message
  }
  return key
}

// ── Helpers exportados para tests ────────────────────────────────────────
export const _internal = { localHour }
