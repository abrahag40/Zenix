/**
 * Shared types for the modular notification system.
 *
 * Two public surfaces:
 *   1. AlarmPayload  → alarmService.show()  → full-screen overlay + vibration
 *   2. LocalNotificationInput → scheduleLocalNotification() → OS banner only
 *
 * Any module (housekeeping, maintenance, …) constructs one of these and
 * calls the corresponding function. The host components in app/_layout.tsx
 * wire the rendering and OS delivery.
 */

export interface AlarmBadge {
  text: string
  tint: string
}

/**
 * Everything the generic AlarmOverlay needs to render any module's alarm.
 * The module-specific consumer builds this from the SSE event and calls
 * alarmService.show(payload).
 */
export interface AlarmPayload {
  /** Unique identifier for de-duplication (taskId, ticketId, …). */
  id: string
  /** Source module — used for logging and notification data routing. */
  module: string

  // ── Visual content ──────────────────────────────────────────────────
  /** ALL-CAPS micro label at the top of the overlay. */
  sectionLabel: string
  /** Short prefix rendered smaller, e.g. "Hab." */
  entityLabel: string
  /** Large hero value, e.g. "101" */
  entityValue: string
  /** Descriptive body text below the hero. */
  caption: string
  /** Optional priority badges rendered below the hero. */
  badges?: AlarmBadge[]
  /**
   * Accent color for the pulsing dot, badge borders and slide thumb.
   * Defaults to emerald (#34D399) if omitted.
   */
  accent?: string

  // ── OS notification ─────────────────────────────────────────────────
  /** Notification banner title (shown on lock screen / shade). */
  notificationTitle: string
  /** Notification banner body. */
  notificationBody: string
  /** Android notification channel id. */
  notificationChannelId?: string

  // ── Lifecycle ───────────────────────────────────────────────────────
  /** Called after the user completes the slide-to-acknowledge gesture. */
  onAcknowledge: () => void
}

/** Input for a standalone OS notification (no in-app overlay). */
export interface LocalNotificationInput {
  title: string
  body: string
  /** Extra data attached to the notification (for tap deep-linking). */
  data?: Record<string, unknown>
  /** Android channel id. */
  channelId?: string
}
