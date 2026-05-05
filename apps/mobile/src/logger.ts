/**
 * Zenix Mobile — Structured Logger
 *
 * Standard logging layer for the entire mobile app.
 *
 * Design decisions:
 *   - In __DEV__: all levels (debug → error) printed with module prefix so
 *     you can immediately spot which module emitted each line.
 *   - In production: only warn + error reach the output. debug/info are
 *     no-ops — zero overhead, zero noise in crash reports.
 *   - Module prefix format: [Zenix][MODULE] to make `grep "[Zenix][auth]"`
 *     in Metro logs instant.
 *   - Each level maps to the corresponding console method so React Native's
 *     LogBox color-codes them correctly (yellow for warn, red for error).
 *   - Extra data (objects, arrays) are spread as additional args so the
 *     Metro inspector renders them collapsible — not stringified into
 *     unreadable noise.
 *
 * Usage:
 *   import { createLogger } from '../logger'
 *   const log = createLogger('auth')
 *
 *   log.debug('token read from SecureStore', { length: token.length })
 *   log.info('login success', { userId, propertyId })
 *   log.warn('retry attempt', { attempt, maxRetries })
 *   log.error('login failed', error)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface Logger {
  debug: (message: string, ...extra: unknown[]) => void
  info:  (message: string, ...extra: unknown[]) => void
  warn:  (message: string, ...extra: unknown[]) => void
  error: (message: string, ...extra: unknown[]) => void
}

const noop = () => undefined

export function createLogger(module: string): Logger {
  const prefix = `[Zenix][${module}]`

  if (__DEV__) {
    return {
      debug: (msg, ...extra) => console.debug(prefix, msg, ...extra),
      info:  (msg, ...extra) => console.info(prefix, msg, ...extra),
      warn:  (msg, ...extra) => console.warn(prefix, msg, ...extra),
      error: (msg, ...extra) => console.error(prefix, msg, ...extra),
    }
  }

  // Production: silence debug/info; keep warn/error so crash reporters
  // (Sentry, Datadog) capture actionable signals.
  return {
    debug: noop,
    info:  noop,
    warn:  (msg, ...extra) => console.warn(prefix, msg, ...extra),
    error: (msg, ...extra) => console.error(prefix, msg, ...extra),
  }
}
