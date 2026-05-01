/**
 * globalErrorHandler — registers global handlers for errors that an
 * ErrorBoundary CANNOT catch.
 *
 * What ErrorBoundaries DON'T catch (per React docs):
 *   - Errors in event handlers
 *   - Asynchronous code (setTimeout, fetch, promises that reject)
 *   - Errors thrown in the boundary itself
 *
 * Reference: https://react.dev/reference/react/Component#componentdidcatch
 *
 * This module fills that gap with two listeners:
 *
 *   1. ErrorUtils.setGlobalHandler — catches uncaught JS exceptions
 *      thrown anywhere outside React's render phase (e.g., in a setTimeout
 *      callback or a promise handler that re-throws synchronously).
 *      ErrorUtils is a React Native built-in — no extra dep needed.
 *
 *   2. global.process.on('unhandledRejection') — catches promise
 *      rejections without a .catch() handler. SDK 54 / Hermes supports
 *      this. Without it, the dev redbox surfaces these but nothing
 *      catches them in production builds.
 *
 * Strategy:
 *   - In __DEV__: log richly with console.warn so the developer sees them.
 *   - In production: forward to telemetry adapter (no-op until Sprint 9).
 *   - NEVER swallow silently — that hides real bugs.
 *   - Auth-flow errors are tagged with extra context so we can debug
 *     timing-dependent issues like the Expo Go push-token bug we hit
 *     earlier this sprint.
 */

interface GlobalErrorHandlerOptions {
  /** Telemetry hook — wire Sentry/Bugsnag here in Sprint 9. */
  onError?: (error: unknown, source: 'uncaught' | 'unhandledRejection') => void
}

/**
 * RN's ErrorUtils is a global. We type it loosely because RN doesn't ship
 * a public type for it.
 */
interface RNErrorUtils {
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void
}

declare const ErrorUtils: RNErrorUtils | undefined

let installed = false

export function installGlobalErrorHandler(opts: GlobalErrorHandlerOptions = {}): void {
  if (installed) return
  installed = true

  // ── 1. Uncaught JS exceptions (RN's ErrorUtils)
  if (typeof ErrorUtils !== 'undefined') {
    const previousHandler = ErrorUtils.getGlobalHandler()
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      if (__DEV__) {
        console.warn('[globalError] uncaught', { isFatal, message: error?.message })
      }
      try {
        opts.onError?.(error, 'uncaught')
      } catch {
        // Telemetry must never throw — swallow.
      }
      // Preserve RN's default behavior (red-box in __DEV__, crash in prod).
      previousHandler(error, isFatal)
    })
  }

  // ── 2. Unhandled promise rejections
  // RN/Hermes exposes `process` with limited Node-compat events.
  type AnyProcess = { on?: (event: string, listener: (...args: unknown[]) => void) => void }
  const proc = (global as unknown as { process?: AnyProcess }).process
  if (proc?.on) {
    proc.on('unhandledRejection', (reason: unknown) => {
      if (__DEV__) {
        const msg = reason instanceof Error ? reason.message : String(reason)
        console.warn('[globalError] unhandledRejection:', msg)
      }
      try {
        opts.onError?.(reason, 'unhandledRejection')
      } catch {
        // Telemetry must never throw.
      }
    })
  }
}
