// Strips credentials and personal data from what the app sends to Sentry,
// with the same rules as the server (@zoink/shared redact.ts). Type-only
// Sentry imports, so the node test runner can load it (sentryScrub.test.ts).
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native'
import { redactText, scrubObject } from '@zoink/shared'

// A scrubbed copy: breadcrumb data can be live app objects (navigation
// params, a logged error), which must not be changed in place.
function scrubbedCopy<T>(value: T): T | undefined {
  try {
    return scrubObject(JSON.parse(JSON.stringify(value)) as T)
  } catch {
    return undefined
  }
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  // A console breadcrumb keeps the raw arguments; for a failed request that is
  // the axios error with its config, Authorization header included. The
  // joined message is enough.
  if (breadcrumb.category === 'console' && breadcrumb.data) {
    const { arguments: _args, ...rest } = breadcrumb.data
    breadcrumb.data = rest
  }
  if (breadcrumb.message) breadcrumb.message = redactText(breadcrumb.message)
  if (breadcrumb.data) breadcrumb.data = scrubbedCopy(breadcrumb.data)
  return breadcrumb
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // The SDK built this event from copies, so scrubbing in place is safe.
  scrubObject(event.extra)
  scrubObject(event.contexts)
  scrubObject(event.request)
  if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {}
  if (event.message) event.message = redactText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb)
  return event
}
