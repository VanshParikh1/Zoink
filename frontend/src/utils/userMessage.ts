// Every error the app shows a person goes through userMessage(): server
// answers, network failures and offline refusals become plain sentences.
//
// The server's own text is shown only when it's one of the sentences below,
// which the API writes for the people using the app. Anything else (internal
// messages, Stripe's own wording inside a 500, validation internals, "No token
// provided.") gets the plain message for its kind instead. The raw error is
// logged once, where the request fails (services/api.ts).
//
// utils/userMessage.test.ts checks that every sentence listed here still
// exists word for word in backend/src, so a reworded server message can't
// silently fall back to the generic text.

import { isOffline } from '../services/onlineState'

export type ErrorKind =
  | 'offline'
  | 'network'
  | 'session'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'tooLarge'
  | 'rateLimited'
  | 'invalid'
  | 'server'
  | 'unknown'

export type MessageContext = {
  /** Said when the failure has no better explanation, e.g. "Couldn't save your changes. Please try again." */
  action?: string
  /** Said for a 404, e.g. "This listing is no longer available." */
  notFound?: string
}

type ErrorLike = {
  /** Set on a write refused before sending because the device is offline (services/api.ts). */
  offline?: boolean
  response?: { status?: number; data?: unknown }
}

/** The handoff was refused because the rent couldn't be captured (backend PickupPaymentFailedError). */
const PICKUP_PAYMENT_FAILED =
  "The rental payment couldn't be collected, so the pickup didn't go through. Keep the item for now and try Zoink It again. If it keeps failing, contact support."

/** Server sentences shown exactly as sent. */
const SHOWN_AS_IS = new Set([
  // Sign-in, sign-up, verification
  'Invalid email or password.',
  'An account with this email already exists.',
  'Incorrect verification code.',
  'No verification code found. Please request a new one.',
  'Verification code has expired. Please request a new one.',
  'Too many incorrect attempts. Please request a new code.',
  'Please wait 60 seconds before requesting a new code.',
  'Too many codes have been sent to this email today. Please try again tomorrow.',
  'Your account is already verified.',
  'Please update the app to continue — our terms have changed.',
  'Please verify your university email to continue.',
  'This account is no longer active.',
  "Email addresses with a '+' can't be used to sign up. Please use your plain student email address.",
  'Enter a valid 10-digit Canadian phone number, e.g. (416) 555-0192.',
  'Enter the 6-digit code from the email.',
  'Select your university from the list.',
  'You must confirm you are 18 or older.',
  // Listings
  'This listing is currently unavailable.',
  "This listing has a booking that isn't finished yet. Decline or cancel it, or complete the rental, then delete the listing.",
  'This listing appears to include an item Zoink does not allow (see our Terms of Service, section 6 — Prohibited items). If this is a false match, contact zoinksupport@gmail.com.',
  'Only image files are allowed.',
  'You do not own this listing.',
  // Bookings and payment
  'You cannot book your own listing.',
  'Pick a start date from today onwards.',
  'Start and end dates are invalid.',
  'Those dates overlap with another accepted booking.',
  'Once the rental start time has passed, this booking can no longer be cancelled.',
  'The owner needs to connect Stripe before accepting bookings.',
  'This booking has already been paid.',
  'This booking is not ready for payment.',
  'Payment authorization is not ready yet.',
  'This booking was updated by someone else. Please refresh and try again.',
  'Your previous payment attempt is still being processed. Please try again in a moment.',
  'You do not have access to this booking.',
  // Handoffs
  'Upload handoff photos before tapping Zoink It.',
  'Handoff photos must be taken and uploaded in the Zoink app.',
  'Only the booking owner can initiate pickup.',
  'Only the booking renter can initiate return.',
  PICKUP_PAYMENT_FAILED,
  "Payment hasn't gone through. The renter needs to pay before pickup.",
  'Photos are only available after the rental is completed',
  // Messages, blocks, reports
  'Message body cannot be empty.',
  'You cannot open a conversation with your own listing.',
  'You do not have access to this conversation.',
  'You can no longer interact with this user.',
  'You cannot block yourself.',
  'You cannot report your own listing.',
  'You cannot report your own message.',
  'You cannot report yourself.',
  'You can only report messages in your own conversations.',
  // Reviews
  'This rental is not ready for review yet.',
  'This review has already been submitted.',
  'You cannot submit this review.',
  'Item rating must be a whole number between 1 and 5.',
  'Scores must be whole numbers between 1 and 5.',
  // Disputes (renters, owners and admins)
  'An open dispute already exists for this booking.',
  'Only the renter or owner can open a dispute for this booking.',
  "This booking's deposit has already been resolved by a previous dispute.",
  'Not authorized to view this dispute.',
  'Dispute is already resolved.',
  'Report has already been reviewed.',
  'A partial refund is not possible before the payment has been captured. Resolve this dispute as a full refund, or wait until after pickup to issue a partial refund.',
])

/** Server sentences that carry a number or a name; `source` is how the backend writes it. */
const SHOWN_PATTERNS: { source: string; pattern: RegExp }[] = [
  { source: 'A listing can have at most ${MAX_LISTING_IMAGES} photos.', pattern: /^A listing can have at most \d+ photos\.$/ },
  { source: 'Bookings cannot exceed ${MAX_RENTAL_DAYS} days.', pattern: /^Bookings cannot exceed \d+ days\.$/ },
  {
    source: 'The dispute window has closed. Disputes must be filed within ${DISPUTE_WINDOW_HOURS} hours of the booking completing.',
    pattern: /^The dispute window has closed\. Disputes must be filed within \d+ hours of the booking completing\.$/,
  },
  {
    source: 'Please use your ${UNIVERSITY_LABELS[data.university]} student email (${domains}).',
    pattern: /^Please use your [\w .'&-]+ student email \(@[\w.-]+(?:,? (?:or )?@[\w.-]+)*\)\.$/,
  },
]

/** Server sentences written for the API rather than for people, said plainly instead. */
const REWORDED: Record<string, string> = {
  'That booking transition is not allowed.': 'This booking has already moved on. Refresh to see where it stands.',
  'itemRating is required for this review.': 'Rate the item from 1 to 5 to send this review.',
  'photos must contain 2 to 3 Cloudinary URLs.': 'Take 2 or 3 photos, then try again.',
  'depositAmount cannot exceed itemValue.': "The deposit can't be more than the item's value.",
  'Admin access required.': 'Only Zoink admins can do this.',
  'That file is too large.': 'That photo is too large. Choose a smaller one.',
}

const REWORDED_PATTERNS: { source: string; pattern: RegExp; say: (match: RegExpMatchArray) => string }[] = [
  {
    // Carries Stripe's own error text in the middle.
    source: 'Could not authorize the deposit — payment was not completed: ',
    pattern: /^Could not authorize the deposit — payment was not completed: /,
    say: () => "Your deposit couldn't be authorized, so the payment didn't go through. Please try again.",
  },
  {
    source: 'refundAmountCents cannot exceed the deposit amount of $${formatCents(depositCapCents)}.',
    pattern: /^refundAmountCents cannot exceed the deposit amount of (\$[\d.,]+)\.$/,
    say: (m) => `The amount can't be more than the deposit (${m[1]}).`,
  },
  {
    source: 'refundAmountCents cannot exceed the remaining refundable balance of $${formatCents(remainingRefundableCents)} (booking total minus prior refunds).',
    pattern: /^refundAmountCents cannot exceed the remaining refundable balance of (\$[\d.,]+) /,
    say: (m) => `The refund can't be more than what's left to refund (${m[1]}).`,
  },
]

const PLAIN: Record<ErrorKind, string> = {
  offline: "You're offline. Check your connection and try again.",
  network: "Couldn't reach Zoink. Check your connection and try again.",
  session: 'Your session has ended. Please log in again.',
  forbidden: "You don't have access to this.",
  notFound: 'This is no longer available.',
  conflict: 'This changed while you were on it. Refresh and try again.',
  tooLarge: 'That photo is too large. Choose a smaller one.',
  rateLimited: "You're doing that too often. Wait a minute and try again.",
  invalid: "Something here isn't quite right. Check it and try again.",
  server: 'Something went wrong on our side. Please try again in a moment.',
  unknown: 'Something went wrong. Please try again.',
}

/** What a refused offline write says: nothing reached the server. */
const NOT_SENT_OFFLINE = "You're offline, so this wasn't sent. Try again when you're back online."

/** The HTTP status of a failed request, or undefined when there was no answer. */
export function errorStatus(error: unknown): number | undefined {
  const status = (error as ErrorLike | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

function hasResponse(error: unknown): boolean {
  return (error as ErrorLike | null)?.response !== undefined
}

function isHttpLike(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'HttpError'
}

export function errorKind(error: unknown): ErrorKind {
  if ((error as ErrorLike | null)?.offline) return 'offline'
  if (isHttpLike(error) && !hasResponse(error)) return isOffline() ? 'offline' : 'network'
  const status = errorStatus(error)
  if (status === undefined) return 'unknown'
  if (status === 401) return 'session'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'notFound'
  if (status === 409) return 'conflict'
  if (status === 413) return 'tooLarge'
  if (status === 429) return 'rateLimited'
  if (status >= 500) return 'server'
  if (status >= 400) return 'invalid'
  return 'unknown'
}

/** The sentence the server sent: `error`, or for a failed validation its first issue. */
function serverSentences(error: unknown): string[] {
  const data = (error as ErrorLike | null)?.response?.data as { error?: unknown; issues?: { message?: unknown }[] } | undefined
  if (!data || typeof data !== 'object') return []
  const sentences: string[] = []
  if (Array.isArray(data.issues)) {
    for (const issue of data.issues) if (typeof issue?.message === 'string') sentences.push(issue.message)
  }
  if (typeof data.error === 'string') sentences.push(data.error)
  return sentences
}

function plainServerSentence(sentence: string): string | null {
  if (SHOWN_AS_IS.has(sentence)) return sentence
  if (SHOWN_PATTERNS.some(({ pattern }) => pattern.test(sentence))) return sentence
  if (REWORDED[sentence]) return REWORDED[sentence]
  for (const { pattern, say } of REWORDED_PATTERNS) {
    const match = sentence.match(pattern)
    if (match) return say(match)
  }
  return null
}

/** A sentence for a person, never the raw server or network text. */
export function userMessage(error: unknown, context: MessageContext = {}): string {
  if ((error as ErrorLike | null)?.offline) return NOT_SENT_OFFLINE
  const kind = errorKind(error)
  if (kind === 'offline' || kind === 'network' || kind === 'server') return PLAIN[kind]

  for (const sentence of serverSentences(error)) {
    const plain = plainServerSentence(sentence)
    if (plain) return plain
  }

  if (kind === 'notFound') return context.notFound ?? PLAIN.notFound
  if (kind === 'invalid' || kind === 'conflict' || kind === 'forbidden' || kind === 'unknown') {
    return context.action ?? PLAIN[kind]
  }
  return PLAIN[kind]
}

/** The pickup was refused because the rent couldn't be collected: both people keep the item for now. */
export function isPickupPaymentFailure(error: unknown): boolean {
  return errorStatus(error) === 409 && serverSentences(error).includes(PICKUP_PAYMENT_FAILED)
}

/** A detail read that can't be shown to this person: gone, never theirs, or not an id the API knows. */
export function isUnavailable(error: unknown): boolean {
  const kind = errorKind(error)
  return kind === 'notFound' || kind === 'forbidden' || kind === 'invalid'
}

/** Exposed for the test that holds these to the backend's wording. */
export const serverSentencesForTest = {
  shownAsIs: [...SHOWN_AS_IS],
  reworded: Object.keys(REWORDED),
  patternSources: [...SHOWN_PATTERNS, ...REWORDED_PATTERNS].map(({ source }) => source),
}
