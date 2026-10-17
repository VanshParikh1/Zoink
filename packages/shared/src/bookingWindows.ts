// Contract terms shared by the backend (which enforces them) and the app (which
// quotes them in copy). See backend/src/config/bookingWindows.ts for why these
// are fixed values, not env vars, and what changing one requires.

// How long after a booking completes before its deposit auto-releases with
// no dispute filed (see backend cleanupJob.releaseDueDeposits).
export const DEPOSIT_HOLD_HOURS = 24

// How long a one-sided handoff tap (pickup or return) waits for the other
// party's tap before it no longer counts (see backend handoffService and
// cleanupJob.cleanupStaleHandoffs).
export const ZOINK_TAP_WINDOW_MS = 5 * 60 * 1000

// How many handoff photos the uploader must submit at pickup and at return
// (enforced by backend schemas/handoff.schema.ts).
export const HANDOFF_PHOTOS_MIN = 2
export const HANDOFF_PHOTOS_MAX = 3
