// Contract terms, not runtime config — deliberately not env vars, same
// reasoning as config/legal.ts. terms.md §10.4 and §11 now state these as
// fixed numbers ("24-hour", "5 minute"); an env misconfiguration (or a
// future tuning of these values) must never be able to silently change a
// term a user contractually agreed to. See legal/OPEN-ITEMS.md, section C.
//
// Changing any of these requires updating terms.md's stated windows first,
// with the same version-bump + re-acceptance flow as config/legal.ts.

// How long after a booking completes before its deposit auto-releases with
// no dispute filed (see cleanupJob.releaseDueDeposits, disputeService's
// DISPUTE_WINDOW_HOURS). Defined in @zoink/shared so the app's copy quotes
// the same number.
export { DEPOSIT_HOLD_HOURS } from '@zoink/shared'

// How long after a booking completes before the owner's payout is released
// (see cleanupJob.releaseDuePayouts).
export { PAYOUT_HOLD_HOURS } from '@zoink/shared'

// How long a one-sided handoff tap (pickup or return) is held before it's
// cleared as stale (see cleanupJob.cleanupStaleHandoffs). Defined in
// @zoink/shared so the app's countdown uses the same number.
export { ZOINK_TAP_WINDOW_MS } from '@zoink/shared'
