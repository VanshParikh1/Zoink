// Contract terms shared by the backend (which enforces them) and the app (which
// quotes them in copy). See backend/src/config/bookingWindows.ts for why these
// are fixed values, not env vars, and what changing one requires.

// How long after a booking completes before its deposit auto-releases with
// no dispute filed (see backend cleanupJob.releaseDueDeposits).
export const DEPOSIT_HOLD_HOURS = 24
