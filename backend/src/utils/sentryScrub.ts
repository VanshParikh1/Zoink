import type { Breadcrumb, ErrorEvent } from '@sentry/node'
import { FILTERED, redactText, scrubObject } from '@zoink/shared'

// Which keys and which text count as credentials or personal data lives in
// @zoink/shared (redact.ts), so the app's Sentry setup strips the same things.
export { FILTERED }

// A PrismaClientValidationError's message prints the failed call with its
// arguments: an email, a password hash, a name. Keep the first paragraph (the
// call) and the last (the reason); drop what's between.
const PRISMA_INVOCATION = /Invalid `prisma\.[^`]*` invocation/

export function redactPrismaArguments(text: string): string {
  if (!PRISMA_INVOCATION.test(text)) return text
  const paragraphs = text.trim().split(/\n\s*\n/)
  if (paragraphs.length >= 3) return [paragraphs[0], '[arguments omitted]', paragraphs[paragraphs.length - 1]].join('\n\n')
  const lines = text.trim().split('\n')
  return lines.length > 2 ? `${lines[0]}\n[arguments omitted]\n${lines[lines.length - 1]}` : text
}

function redact(text: string): string {
  return redactText(redactPrismaArguments(text))
}

/** The error's message, safe to store or show (e.g. in a booking's ERROR event). */
export function loggableMessage(error: unknown): string {
  return error instanceof Error ? redact(error.message) : 'UNKNOWN_ERROR'
}

/** The error to hand console.error: the same error when nothing in it needs
 *  hiding, otherwise a copy with the message (and the stack's copy of it)
 *  redacted and the stack frames kept. */
export function loggableError(error: unknown): unknown {
  if (typeof error === 'string') return redact(error)
  if (!(error instanceof Error)) return error
  const message = redact(error.message)
  if (message === error.message) return error
  const copy = new Error(message)
  copy.name = error.name
  const frames = (error.stack ?? '').split('\n').filter((line) => line.trimStart().startsWith('at '))
  copy.stack = [`${error.name}: ${message}`, ...frames].join('\n')
  return copy
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = redact(breadcrumb.message)
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
    if (typeof request.query_string === 'string') request.query_string = redactText(request.query_string)
    else scrubObject(request.query_string)
    if (request.url) request.url = redactText(request.url)
  }

  scrubObject(event.extra)
  if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {}
  if (event.message) event.message = redact(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redact(exception.value)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb)
  return event
}
