// How often screens re-fetch while they're on screen and the app is in the
// foreground. Push notifications cover real-time delivery; these keep open
// screens reasonably fresh without spending the per-user rate limit.

// Inbox list and the unread dot on the Inbox tab (one shared fetch).
export const INBOX_POLL_MS = 15_000

// An open chat: new messages, and the header / payment banner state.
export const THREAD_MESSAGES_POLL_MS = 5_000
export const THREAD_DETAILS_POLL_MS = 30_000

// Zoink It: each phone watches for the other's tap (a 5-minute window), while
// that screen is the one showing.
export const HANDOFF_POLL_MS = 3_000

// Profile's payout status (a live Stripe call on the server): how long a
// routine reload reuses the last answer. Explicit refreshes always refetch.
export const PAYOUT_STATUS_MAX_AGE_MS = 5 * 60_000
