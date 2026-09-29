import type { Breadcrumb, ErrorEvent } from '@sentry/node'

// Values under these keys never leave the server in an error report:
// credentials and payment data, plus personal data (email, phone) and
// one-time codes. Matched anywhere in the key, case-insensitively…
const SENSITIVE_KEY_PATTERN =
  /password|passwd|token|secret|key|authorization|cookie|session|email|phone|otp|card|cvc|cvv|iban|account_?number|routing/i
// …except `code`, which is matched exactly so e.g. `status_code` survives.
const SENSITIVE_EXACT_KEYS = new Set(['code'])

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export const FILTERED = '[Filtered]'

function isSensitiveKey(key: string) {
  return SENSITIVE_EXACT_KEYS.has(key.toLowerCase()) || SENSITIVE_KEY_PATTERN.test(key)
}

export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email]')
}

export function scrubObject<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      value[i] = typeof item === 'string' ? redactEmails(item) : scrubObject(item)
    })
    return value
  }
  const obj = value as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (isSensitiveKey(key)) obj[key] = FILTERED
    else if (typeof v === 'string') obj[key] = redactEmails(v)
    else if (v && typeof v === 'object') scrubObject(v)
  }
  return value
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = redactEmails(breadcrumb.message)
  scrubObject(breadcrumb.data)
  return breadcrumb
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request
  if (request) {
    scrubObject(request.headers)
    scrubObject(request.cookies)
    // A raw (string) body — e.g. the Stripe webhook payload — can't be
    // scrubbed field by field, so it isn't sent at all.
    if (typeof request.data === 'string') request.data = FILTERED
    else scrubObject(request.data)
    if (typeof request.query_string === 'string') request.query_string = redactEmails(request.query_string)
    else scrubObject(request.query_string)
    if (request.url) request.url = redactEmails(request.url)
  }

  scrubObject(event.extra)
  if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {}
  if (event.message) event.message = redactEmails(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactEmails(exception.value)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb)
  return event
}
