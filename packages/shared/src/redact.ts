// Credentials and personal data that must never reach logs or error reports.
// The server's Sentry scrubber and log lines and the app's Sentry setup all
// use these, so both sides strip the same things.

// Values under these keys are replaced wholesale: credentials and payment
// data, plus personal data (email, phone) and one-time codes. Matched anywhere
// in the key, case-insensitively…
const SENSITIVE_KEY_PATTERN =
  /password|passwd|token|secret|key|authorization|cookie|session|email|phone|otp|card|cvc|cvv|iban|account_?number|routing/i
// …except `code`, which is matched exactly so e.g. `status_code` survives.
const SENSITIVE_EXACT_KEYS = new Set(['code'])

export const FILTERED = '[Filtered]'

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_EXACT_KEYS.has(key.toLowerCase()) || SENSITIVE_KEY_PATTERN.test(key)
}

// Personal data and credentials that turn up inside free text: an SES error
// naming the recipient, an Expo error quoting the device's push token, a
// logged header. Phone numbers in the form accounts store them (+1 and ten
// digits).
const TEXT_PATTERNS: [RegExp, string][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [/Expo(nent)?PushToken\[[^\]]*\]/g, '[push-token]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [Filtered]'],
  [/\+1\d{10}\b/g, '[phone]'],
]

export function redactText(text: string): string {
  return TEXT_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}

/** Scrubs `value` in place: sensitive keys at any depth are replaced, and
 *  strings have personal data redacted. Only pass objects this code owns (a
 *  copy, or an event the SDK built), never live app state. */
export function scrubObject<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      value[i] = typeof item === 'string' ? redactText(item) : scrubObject(item)
    })
    return value
  }
  const obj = value as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (isSensitiveKey(key)) obj[key] = FILTERED
    else if (typeof v === 'string') obj[key] = redactText(v)
    else if (v && typeof v === 'object') scrubObject(v)
  }
  return value
}
