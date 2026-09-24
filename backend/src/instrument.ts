import * as Sentry from '@sentry/node'

// Keys that must never leave this app, wherever they show up — headers,
// body fields, or query params. Payment data (Stripe secrets) and auth
// material (JWTs, session tokens) are the highest-value leaks here.
const SENSITIVE_KEY_PATTERN = /password|token|secret|key|authorization/i

function scrubObject(obj: Record<string, unknown> | null | undefined) {
  if (!obj || typeof obj !== 'object') return obj
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      obj[key] = '[Filtered]'
    } else if (obj[key] && typeof obj[key] === 'object') {
      scrubObject(obj[key] as Record<string, unknown>)
    }
  }
  return obj
}

// NODE_ENV === 'test' is skipped so the integration test suite (which
// exercises real error paths, including 500s) never generates Sentry noise.
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Without an explicit value the SDK defaults to "production", so local dev
    // was showing up alongside prod. Railway sets SENTRY_ENVIRONMENT=production.
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    beforeSend(event) {
      scrubObject(event.request?.headers)
      scrubObject(event.request?.data as Record<string, unknown>)
      scrubObject(event.request?.cookies as Record<string, unknown>)
      scrubObject(event.extra)
      return event
    },
  })
}

export { Sentry }
