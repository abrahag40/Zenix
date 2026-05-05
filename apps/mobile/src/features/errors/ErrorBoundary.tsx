/**
 * ErrorBoundary — class component (required by React).
 *
 * Best practices applied (with citation):
 *
 *   1. Class component is the ONLY way (React docs):
 *      "Error boundaries cannot be functional components. There is currently
 *      no Hook equivalent for componentDidCatch."
 *      https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 *
 *   2. componentDidCatch logs to telemetry (Sentry/Bugsnag/Datadog
 *      pattern). Today we console.error in __DEV__ and stub a hook
 *      `onError` for future telemetry providers — clean abstraction for
 *      Sprint 9 when we wire Sentry.
 *
 *   3. Reset key (Kent C. Dodds, "Use react-error-boundary"
 *      https://kentcdodds.com/blog/use-react-error-boundary-to-handle-errors-in-react):
 *      after the user retries, re-mount children by bumping a key.
 *      Without this, the same error re-fires immediately because the
 *      tree state didn't change.
 *
 *   4. Caveat documented (React docs):
 *      Error boundaries DO NOT catch:
 *        - event handlers (use try/catch)
 *        - asynchronous code (setTimeout, fetch — use unhandled rejection)
 *        - errors thrown in the boundary itself
 *      Our globalErrorHandler.ts complements this for async paths.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorScreen } from './ErrorScreen'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional override — used by callers that want a custom fallback shape. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode
  /** Side-effect hook — wire telemetry here in Sprint 9 (Sentry, Bugsnag, etc). */
  onError?: (error: Error, info: ErrorInfo) => void
  /** Secondary recovery action exposed to the fallback (e.g., logout). */
  onLogout?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
  /** Bumped on every reset so children re-mount fresh — avoids re-throwing
   *  the same error immediately (Kent C. Dodds pattern). */
  resetKey: number
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // React calls this DURING render — must be pure. Just record state.
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Side effects go here, NOT in getDerivedStateFromError.
    if (__DEV__) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }
    // Forward to telemetry adapter (no-op until Sprint 9).
    this.props.onError?.(error, info)
  }

  reset = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }))
  }

  render() {
    const { error, resetKey } = this.state
    const { children, fallback, onLogout } = this.props

    if (error) {
      if (fallback) {
        return fallback({ error, reset: this.reset })
      }
      return <ErrorScreen error={error} onRetry={this.reset} onLogout={onLogout} />
    }

    // Wrap children in a fragment with the resetKey — every reset re-mounts
    // the subtree so transient state is cleared.
    // eslint-disable-next-line react/jsx-key
    return <Resetter resetKey={resetKey}>{children}</Resetter>
  }
}

/**
 * Tiny wrapper to apply a key to the children subtree without forcing
 * callers to wrap with <Fragment key>. Bumping the key re-creates the
 * subtree on reset.
 */
function Resetter({ children, resetKey }: { children: ReactNode; resetKey: number }) {
  return <ResetterInner key={resetKey}>{children}</ResetterInner>
}
function ResetterInner({ children }: { children: ReactNode }) {
  return <>{children}</>
}
