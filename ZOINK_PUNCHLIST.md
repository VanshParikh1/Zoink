# Zoink — Outstanding Items Audit

For each item below: check the current codebase, determine if it is already fixed/done, still open, or partially done, and report status with file/line evidence. Do not assume the descriptions below are still accurate — they were written from README.md/CODEBASE_OVERVIEW.md as of 2026-07-28 and may already be stale. Where an item is confirmed fixed, update README.md and/or CODEBASE_OVERVIEW.md to remove/strike it and move it to a "Resolved" note (matching the existing pattern already used for other resolved items in CODEBASE_OVERVIEW.md's Gaps/TODOs/Risks section).

## Tier 1 — Fix now (cheap, high-risk-if-left)

1. **`.env.test` not gitignored** — `.gitignore` covers `backend/.env` and `frontend/.env` but not `backend/.env.test`. Check: is it now ignored? Has it ever been committed (check git history)? If committed, flag for key rotation.

2. **Payout permanently blocked after dispute resolution** — `cleanupJob.releaseDuePayouts` only selects bookings with `disputeStatus: 'NONE'`. Since `disputeService.resolveDispute` sets `disputeStatus` to `RESOLVED_REFUND`/`RESOLVED_NO_ACTION`/`DISMISSED` and never resets it to `NONE`, any booking that ever had a dispute (even a dismissed one) never becomes payout-eligible again. Check: has this been fixed (either resetting `disputeStatus` on resolution, or changing the release query to allow resolved-non-refund statuses)?

3. **Migration ordering bug** — `backend/prisma/migrations/20260721000000_add_role_and_disputes/migration.sql` alters `disputes.status` before `CREATE TABLE "disputes"` runs, so `prisma migrate deploy` fails on a fresh database. A manual workaround (`apply_to_test_db.sql`) exists for the test DB only. Check: has the actual migration SQL been reordered/fixed so a fresh `migrate deploy` succeeds without the workaround?

4. **Zoink It stale state after back-navigation** — `ActiveRentalScreen` uses a mount-only `useEffect` instead of `useFocusEffect` to load booking state, so adding photos, pressing back, and retrying hits a stale "invalid flow" error. `BookingDetailScreen.tsx` already uses the correct pattern. Check: has `ActiveRentalScreen` been updated to `useFocusEffect`? Are there other screens with the same mount-only anti-pattern that gate on booking status (grep for `useEffect` + booking-status screens)?

## Tier 2 — Needed before calling this launch-ready

5. **Frontend dispute-status type drift** — `frontend/src/types/index.ts` types `disputeStatus` as `'NONE' | 'OPEN' | 'RESOLVED'` but the backend `DisputeStatus` enum has six values (`NONE`, `OPEN`, `UNDER_REVIEW`, `RESOLVED_REFUND`, `RESOLVED_NO_ACTION`, `DISMISSED`). Check: has the frontend type been updated? Does any frontend code currently branch on this field incorrectly as a result?

6. **Admin/support UI missing** — Backend routes (`POST /disputes`, `GET /disputes`, `GET /disputes/:id`, `GET /admin/disputes`, `GET /admin/disputes/:id`, `PATCH /admin/disputes/:id/resolve`) are implemented and integration-tested, but no frontend screen calls any of them — users can't file a dispute in-app and there's no admin dashboard. There's also no UI/route to change a user's `Role`. Check: does any frontend screen or API wrapper now exist for disputes/admin? If none, this is still fully open.

7. **Security hardening** — No rate limiting, abuse reporting, or operational monitoring currently exists per the docs. Check: has any rate limiting middleware been added (e.g. on `/auth/*`, `/bookings`)? Any monitoring/alerting wired up?

8. **Duplicate webhook mount** — `/stripe/webhook` and `/api/stripe/webhook` both route to the same handler in `backend/src/index.ts`. Check: has this been consolidated to one path, or confirmed intentional (e.g. documented reason for both)?

9. **Production deployment / environment separation** — Per the build plan, Phase 12 (deployment, TestFlight, production readiness) is listed as upcoming. Check: does any deployment config, CI/CD, or hosting setup now exist for the backend? Any progress on Apple Developer Program enrollment (blocks iOS EAS builds)?

## Tier 3 — Can wait until post-launch (verify status but don't prioritize fixing)

10. **Integration test coverage gaps** — Handoff race conditions, review-obligation edge cases, and notification delivery are not covered by `backend/src/integration-tests/`. Check current test file list against this claim.

11. **Owner opt-in cancellation fee toggle** — Tiered fee logic exists in `bookingService.calculateCancellationFeeCents()` but is short-circuited to `return 0`; no `Listing`-level opt-in field/schema exists yet (planned to mirror `Listing.insuranceOptIn`). Check: any schema/field movement on this?

12. **After-pickup refund policy** — No automated refund path beyond dispute resolution. Check: any change?

13. **ID verification flow** — `User` has `idPhotoUrl`, `selfieUrl`, `idSubmittedAt`, `verificationId` fields but no submission/review flow. Explicitly deferred; just confirm still unimplemented.

---

## Output format requested

For each of the 13 items, report one of: **Fixed** (with file/line proof), **Partially fixed** (explain the gap), or **Still open** (confirm still accurate). Then apply doc updates to README.md / CODEBASE_OVERVIEW.md for anything confirmed Fixed, following the existing "~~Resolved~~" convention already used in CODEBASE_OVERVIEW.md's Gaps section.
