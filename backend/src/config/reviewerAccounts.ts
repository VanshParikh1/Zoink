// The App Review demo accounts that scripts/seedReviewerAccount.ts seeds.
// Kept here so the booking jobs can leave those demo bookings alone.

export const DEFAULT_REVIEWER_EMAIL = 'reviewer@zoink.app'
export const DEFAULT_DELETION_REVIEWER_EMAIL = 'reviewer-delete@zoink.app'
export const OWNER_EMAIL = 'reviewer-owner@zoink.app'
// A second, disposable counterparty so the reviewer can demo Report / Block
// without hiding the main owner's listings and threads.
export const SECOND_USER_EMAIL = 'reviewer-neighbour@zoink.app'
// A separate cast for the App Review screen recording (--recording): its own
// owner, neighbour and listings, so seeding, paying or deleting one cast never
// touches the other's bookings, listings or chats.
export const RECORDING_EMAIL = 'recording@zoink.app'
export const RECORDING_DELETE_EMAIL = 'recording-delete@zoink.app'
export const RECORDING_OWNER_EMAIL = 'recording-owner@zoink.app'
export const RECORDING_SECOND_USER_EMAIL = 'recording-neighbour@zoink.app'

/** Every seeded demo account's email, resolved as the seed resolves them
 *  (REVIEWER_EMAIL / DELETION_REVIEWER_EMAIL override the defaults). */
export function reviewerDemoEmails(): string[] {
  return [
    process.env.REVIEWER_EMAIL?.trim() || DEFAULT_REVIEWER_EMAIL,
    process.env.DELETION_REVIEWER_EMAIL?.trim() || DEFAULT_DELETION_REVIEWER_EMAIL,
    OWNER_EMAIL,
    SECOND_USER_EMAIL,
    RECORDING_EMAIL,
    RECORDING_DELETE_EMAIL,
    RECORDING_OWNER_EMAIL,
    RECORDING_SECOND_USER_EMAIL,
  ]
}

/** Prisma filter: the booking involves none of the demo accounts. The App Review
 *  demo bookings must not be auto-cancelled or expired while the review is open. */
export function excludingReviewerDemoBookings() {
  const emails = reviewerDemoEmails()
  return { NOT: [{ renter: { email: { in: emails } } }, { owner: { email: { in: emails } } }] }
}
