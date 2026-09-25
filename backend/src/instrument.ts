import * as Sentry from '@sentry/node'
import { scrubBreadcrumb, scrubEvent } from './utils/sentryScrub'

// NODE_ENV === 'test' is skipped so the integration test suite (which
// exercises real error paths, including 500s) never generates Sentry noise.
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Without an explicit value the SDK defaults to "production", so local dev
    // was showing up alongside prod. On Railway, Railpack sets
    // NODE_ENV=production (SENTRY_ENVIRONMENT can override it).
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // Credentials, payment data, emails, phone numbers and one-time codes are
    // stripped from every event and breadcrumb (see utils/sentryScrub.ts).
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}

export { Sentry }
