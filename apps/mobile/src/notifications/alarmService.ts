/**
 * alarmService — singleton alarm registry.
 *
 * Any module calls alarmService.show(payload) to trigger the full-screen
 * alarm overlay. Only one alarm is active at a time; a second show() while
 * one is active is a no-op (the user must acknowledge the current alarm first).
 *
 * AlarmHost subscribes at root level and drives the AlarmOverlay render.
 */

import type { AlarmPayload } from './types'

type Listener = (alarm: AlarmPayload | null) => void

class AlarmService {
  private current: AlarmPayload | null = null
  private listeners = new Set<Listener>()

  /** Trigger the alarm overlay. No-op if an alarm is already active. */
  show(payload: AlarmPayload): void {
    if (this.current) return
    this.current = payload
    this.notify()
  }

  /** Dismiss the active alarm (called internally after acknowledge). */
  dismiss(): void {
    this.current = null
    this.notify()
  }

  getCurrent(): AlarmPayload | null {
    return this.current
  }

  /**
   * Subscribe to alarm state changes.
   * Returns an unsubscribe function — pass it as the useEffect cleanup.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.current) // fire immediately with current state
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.current))
  }
}

export const alarmService = new AlarmService()
