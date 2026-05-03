/**
 * useGlobalSSEListener — single SSE subscription mounted at root.
 *
 * Why one global listener (and not per-screen):
 *   Each `useSSE()` opens an EventSource. If we mount it in 3 screens
 *   we'd open 3 connections. Instead: ONE listener at the root layout,
 *   which dispatches each event to the relevant Zustand store / hook
 *   refetch.
 *
 * Dispatch table (current):
 *
 *   task:planned         → refresh task store + dashboard overview
 *   task:ready           → refresh task store + dashboard overview
 *   task:started         → refresh task store
 *   task:paused          → refresh task store
 *   task:resumed         → refresh task store
 *   task:done            → refresh task store + gamification (rings/streak)
 *   task:verified        → refresh task store + gamification rings
 *   task:cancelled       → refresh task store
 *   task:auto-assigned   → refresh task store
 *   task:reassigned      → refresh task store
 *   task:carryover       → refresh task store
 *   roster:published     → refresh task store
 *
 *   notification:new     → refresh notification center (existing hook)
 *
 *   block:* (any)        → invalidate dashboard overview (blocked rooms)
 *   stay:no_show         → invalidate dashboard overview
 *   checkin:confirmed    → invalidate dashboard overview
 *   checkout:early       → invalidate dashboard overview
 *
 * The listener calls a refresh callback that fans out to consumers.
 * Each consumer registers its refresh fn via `registerSseConsumer()`
 * to keep this file decoupled from feature modules.
 */

import { useCallback } from 'react'
import { useSSE } from './useSSE'
import { useTaskStore } from '../store/tasks'
import type { SseEvent, SseEventType } from '@zenix/shared'

// ── Consumer registry ─────────────────────────────────────────────
// Modules call `registerSseConsumer(eventTypes, fn)` to be notified.
// Stored in module scope so this file has no React-hook coupling.

type ConsumerFn = (e: SseEvent) => void
interface Consumer {
  types: Set<string>
  fn: ConsumerFn
}
const consumers: Consumer[] = []

export function registerSseConsumer(
  types: Array<SseEventType | '*'>,
  fn: ConsumerFn,
): () => void {
  const consumer: Consumer = { types: new Set(types), fn }
  consumers.push(consumer)
  return () => {
    const idx = consumers.indexOf(consumer)
    if (idx >= 0) consumers.splice(idx, 1)
  }
}

// ── Global listener ───────────────────────────────────────────────

const TASK_EVENTS: SseEventType[] = [
  'task:planned', 'task:ready', 'task:started',
  'task:paused', 'task:resumed', 'task:done', 'task:verified',
  'task:cancelled', 'task:unassigned',
  'task:auto-assigned', 'task:reassigned', 'task:carryover',
  'task:extension-confirmed',
  'roster:published',
]

export function useGlobalSSEListener() {
  // Cache the task store fetcher to avoid stale closures
  const fetchTasks = useTaskStore((s) => s.fetchTasks)

  const handleEvent = useCallback(
    (event: SseEvent) => {
      // 1. Refresh the local task store on any task:* / roster:* event.
      //    The store re-fetches `/v1/tasks?assignedToId=me` so the
      //    housekeeper's mobile sees changes the supervisor (web) made.
      if (TASK_EVENTS.includes(event.type as SseEventType)) {
        fetchTasks().catch(() => undefined)
      }

      // 2. Fan out to registered consumers (gamification, dashboard, etc.)
      for (const c of consumers) {
        if (c.types.has('*') || c.types.has(event.type)) {
          try {
            c.fn(event)
          } catch (e) {
            // eslint-disable-next-line no-console
            if (__DEV__) console.warn('[sse consumer threw]', e)
          }
        }
      }
    },
    [fetchTasks],
  )

  useSSE(handleEvent)
}
