// Deep links and notification taps, as places in the app.
//
//   zoink://listing/<id>   ListingDetail
//   zoink://booking/<id>   BookingDetail
//   zoink://chat/<id>      ConversationThread
//
// A link is opened on top of whatever is showing, so Back returns there (or
// to the main tabs on a cold start). One that arrives before the signed-in app
// is up (cold start, signed out, verifying email, accepting new terms) waits
// here and opens once it is. Anything else under zoink:// opens the "link not
// found" screen. No native imports, so this is unit-tested
// (deepLinks.test.ts); useDeepLinks.ts feeds it.

export type DeepLinkTarget =
  | { screen: 'ListingDetail'; params: { listingId: string } }
  | { screen: 'BookingDetail'; params: { bookingId: string } }
  | { screen: 'ConversationThread'; params: { conversationId: string } }
  | { screen: 'LinkNotFound'; params?: undefined }

export type QaAction = { qa: 'offline'; mode: 'on' | 'off' | 'device' }

const SCHEME = 'zoink://'

// Links that belong to someone else under our scheme: Stripe's return from a
// bank's 3-D Secure page (handled by the Stripe SDK on the Pay screen) and
// the Expo dev client's own links.
const NOT_OURS = new Set(['stripe-redirect', 'expo-development-client'])

// Ids are UUIDs today; anything with only these characters is passed to the
// screen, which asks the server (a wrong one shows "no longer available").
const ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * What a URL opens: a screen, a QA action (QA builds only), or null when the
 * URL isn't one of ours or just opens the app.
 */
export function parseDeepLink(url: string, { qa = false } = {}): DeepLinkTarget | QaAction | null {
  if (!url.toLowerCase().startsWith(SCHEME)) return null
  const path = url.slice(SCHEME.length).split(/[?#]/)[0]
  const segments = path.split('/').filter(Boolean).map(safeDecode)
  if (segments.length === 0) return null
  const [first, id, ...rest] = segments
  const kind = first.toLowerCase()
  if (NOT_OURS.has(kind)) return null

  if (kind === 'qa' && qa && id === 'offline' && (rest[0] === 'on' || rest[0] === 'off' || rest[0] === 'device')) {
    return { qa: 'offline', mode: rest[0] }
  }

  if (id && ID.test(id) && rest.length === 0) {
    if (kind === 'listing') return { screen: 'ListingDetail', params: { listingId: id } }
    if (kind === 'booking') return { screen: 'BookingDetail', params: { bookingId: id } }
    if (kind === 'chat') return { screen: 'ConversationThread', params: { conversationId: id } }
  }
  return { screen: 'LinkNotFound' }
}

function safeDecode(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Where a tapped notification opens, from the `data` the server sends with it
 * (backend notificationService callers): a message opens its chat, anything
 * about a booking opens the booking.
 */
export function targetForNotification(data: unknown): DeepLinkTarget | null {
  if (!data || typeof data !== 'object') return null
  const { conversationId, bookingId, listingId } = data as Record<string, unknown>
  const valid = (value: unknown): value is string => typeof value === 'string' && ID.test(value)
  if (valid(conversationId)) return { screen: 'ConversationThread', params: { conversationId } }
  if (valid(bookingId)) return { screen: 'BookingDetail', params: { bookingId } }
  if (valid(listingId)) return { screen: 'ListingDetail', params: { listingId } }
  return null
}

type Opener = (target: DeepLinkTarget) => void

let opener: Opener | null = null
let pending: DeepLinkTarget | null = null

/** A link or notification tap: opened now if the signed-in app is up, otherwise held until it is. */
export function routeDeepLink(target: DeepLinkTarget) {
  if (opener) opener(target)
  else pending = target // the latest one wins
}

/**
 * The signed-in app stack registers how to open a target while it's mounted
 * (null when it unmounts: signed out, session ended). A held link opens as
 * soon as one is registered.
 */
export function setDeepLinkOpener(next: Opener | null) {
  opener = next
  if (next && pending) {
    const target = pending
    pending = null
    next(target)
  }
}

export function pendingDeepLink(): DeepLinkTarget | null {
  return pending
}
