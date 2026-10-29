# Overnight launch-prep log (2026-10-29 → 30)

Branch: `launch-prep`, cut from `quality/hardening` at `3d25ae4`. Nothing pushed to `main` or `quality/hardening`, nothing deployed, no secrets touched.

> Summary at the top is written last (Task 9). Per-task detail below.

## Setup and baseline

- `graphify` is **not installed** in this container → skipped (per instructions, not installed).
- `npm ci` at the root (workspaces cover backend, frontend, packages/shared), `npm run build:shared`, `npx prisma generate`.
- Local Postgres 16 started in the container, `zoink_test` created, `npx prisma migrate deploy` applied every migration cleanly.
- A local, git-ignored `backend/.env.test` was written in the container (DATABASE_URL → local `zoink_test`, a dummy JWT secret, **no Stripe key**). Not committed.

| Check | Baseline |
| --- | --- |
| Backend typecheck | clean |
| Frontend typecheck | clean |
| Backend unit (`npm test`) | 232 / 232 pass |
| Frontend tests | 145 / 145 pass |
| Backend integration | see below |

Backend integration baseline (`npm run test:integration`, no Stripe keys, first run): **565 tests, 450 pass, 99 fail, 16 skipped** (14 min).

- ~85 failures need real Stripe test keys: `Neither apiKey nor config.authenticator provided` (39) and `DEV_STRIPE_ACCOUNT_ID is not set in .env.test` (40). Files: stripeWebhooks, bookingLifecycle (accept/pay/handoff), bookingCancellation, payoutRelease, disputeResolution, pickupCapture, paymentIntentReuse, reconciliationJob, bookingFullFlow, stateMachine and a few in authorization/handoffRace.
- ~12 failures were Cloudinary env (`CLOUDINARY_CLOUD_NAME` unset → "Handoff photos must be taken and uploaded in the Zoink app.", and the cloudinary-cleanup asserts). Adding dummy Cloudinary values to the **local, git-ignored** `.env.test` (no real credentials) makes handoffPhotoUrls, cloudinaryCleanup, listingSoftDelete etc. pass; all later runs use that.
- 2 files (unverifiedAccounts, userBlocking) failed only because I rebuilt `@zoink/shared` mid-run for Task 3; re-run on their own they pass.

## Task 1: chat inverted-list follow-up — **done** (`651502c`)

Static review of `3d25ae4`:

- Date separators: `buildRows` runs oldest-first, then the array is reversed, so each day pill lands after its messages in the data and therefore *above* them on screen. Correct.
- Sender grouping (`groupStart`/`groupEnd`, the tail + time on the last bubble) is computed in time order before the reverse, so it's unaffected. `marginTop` lives inside the (re-flipped) cell, so spacing is still on the visual top. Correct.
- "Payment needed" / Pay now / Approve rental / WaitingOnPaymentBadge live in the pinned card *above* the FlatList, not in the list, so inversion doesn't touch their order.
- `ListEmptyComponent`: RN applies the inversion style to it, so it isn't upside down; it sits at the bottom (near the composer) instead of the top. Cosmetic; left as is.
- No leftover refs or imports from the removed scroll bookkeeping (`isNearBottomRef`, `pinToEndRef`, `hasScrolledRef`, `userScrolledRef`, `scrollToEnd`, `requestAnimationFrame` all gone). One stale comment above `KeyboardAvoidingView` ("re-pins") reworded.
- **Fixed (small):** `loadOlder` was guarded only by the `loadingOlder` *state*, so two `onEndReached` calls before the re-render (possible when the footer spinner mounts and changes content length) could fetch the same page twice. Added an in-flight ref. Duplicates were already de-duped by id, so this only saves a request.
- Observation, not changed: on an inverted list, a new incoming message while you're reading history is inserted at offset 0. iOS keeps your scroll offset, so what you're reading shifts up by one message height rather than yanking you down. Added to the iOS test plan to judge by eye.
- Testable logic pulled into `frontend/src/utils/chatThread.ts` (pure functions, unchanged behaviour) with `chatThread.test.ts` (4 tests: newest-first order, separator placement, grouping, page de-dup).

## Task 3: flat 15% commission — **done** (`a35daea` code, copy commit below)

- `packages/shared/src/commission.ts`: `COMMISSION_RATE = 0.15`, `COMMISSION_MIN_CENTS = 200`, `calculateCommissionCents(subtotalCents)` = `min(subtotal, max(200, round_half_up(15%)))`, plus dollar wrappers `calculateCommission(total)` / `calculateOwnerPayout(total)` and `commissionIsMinimum(total)` for labels. `COMMISSION_TIERS` and `getCommissionRate` deleted (no dead branch left).
- Everything uses it: `quoteRental` (the booking snapshot in `createBooking`), backend `paymentService` wrappers, the listing form's "What you'd keep" preview (now "Zoink takes 15% (minimum $2) per rental"), demo-mode mock bookings. The Stripe payout transfer pays the snapshotted `ownerPayout` (separate charges and transfers, no `application_fee_amount` anywhere), so it follows automatically.
- History: existing bookings keep their snapshotted `commissionAmount`/`ownerPayout`. Booking detail derives the % from the snapshot (old tiered bookings still show 12.5%/10%), and shows "minimum $2" when the minimum applied.
- **Edge case for Vansh:** a rental with a subtotal under $2.00 (e.g. a $1/day item for 1 day) is commissioned at the full subtotal, so the **owner gets $0**. Listing prices can go as low as $0.01/day. Consider a minimum daily price (e.g. $2) if you don't want owners to see "You keep $0.00".
- Rounding: 15% half-up in integer cents. The $13.33 boundary: 15% = 199.95¢ → 200¢, exactly the minimum. $13.29 → 199.35¢ → lifted to 200¢. $13.37 → 201¢.
- Tests: shared `money.test.ts` (rate/min, $13.33 boundary, tiny and large subtotals, the 700,000-quote property test now asserts the new formula), backend `paymentService.test.ts` + `bookingUtils.test.ts`, integration `bookingFullFlow` message.

## Task 2: backend Dependabot fixes — **done** (`64c0eb5`, `1d8f3ea`)

| Package | Before | After | Advisory |
| --- | --- | --- | --- |
| express | 5.2.1 | 5.3.0 | (carries body-parser) |
| body-parser | 2.3.0 | 2.4.0 | DoS: trailing bytes after a compressed body (high) |
| multer | 2.4.0 | 2.5.0 | DoS: pending async fileFilter after teardown (high) |
| zod | 4.4.3 | 4.6.7 | memory exhaustion on oversized constrained collections (high) |
| cloudinary | 1.41.3 | 2.11.0 | argument injection via `&` in params (high), major bump |

`npm audit` (whole workspace): **before 45** (31 low, 7 moderate, 7 high) → after the first commit 42 (4 high) → **after 41** (31 low, 7 moderate, 3 high). Backend tree: 4 high → **0**. Every remaining alert is Expo/Metro build tooling in `frontend` (image-size, node-forge, postcss, fast-uri, uuid/xcode, @expo/*), left alone as instructed; no `audit fix --force`, no Expo downgrade.

- Side effect in the lockfile: npm dropped two stale nested `semver@7.7.2` copies under react-native-reanimated / react-native-worklets, which the root `"semver": "7.8.5"` override already covers. Frontend typecheck + tests pass; worth a glance in the next native build (it's only used by their build-time version checks).
- Cloudinary v2: the code only ever used `v2.uploader.upload_stream` and `v2.uploader.destroy`, unchanged in 2.x. The 2.0 breaking changes (secure URLs default, URL analytics default, Node 6/8 dropped) don't touch it: we store `result.secure_url` and build no URLs with the SDK. Typecheck, unit tests, and the upload/delete integration tests (which mock the network call) pass.
- **Real upload can't be tested here** (no Cloudinary credentials/network). Manual steps are in `docs/morning-test-plan.md` (upload a listing photo, an avatar and handoff photos; delete a photo and a listing; check the Cloudinary Media Library).

## Task 4: university email domains — **done** (commit below)

What I found: the list was already one-domain-per-school in `packages/shared/src/universities.ts` (a `University` enum key → one domain), used by backend `RegisterSchema` and the app's inline check. **`uoguelph.ca` is not in the code, docs or git history**, so there was nothing to keep; I did not add Guelph (not in the target list). Laurier (`mylaurier.ca`) and Waterloo (`uwaterloo.ca`) were present and are kept.

Change: `UNIVERSITY_EMAIL_DOMAINS: Record<University, string[]>` is now the single source of truth; `UNIVERSITY_DOMAINS` (first = student domain, for placeholders) is derived from it. `isUniversityEmail` / `universityForEmail` / `universityDomainsText` are shared and used by the backend schema, the app's inline validation and the profile's school badge. Backend and app now show the **same sentence**: "Please use your University of Toronto student email (@mail.utoronto.ca or @utoronto.ca)." No schema/migration change (no new schools).

Final list:

| School | Domains (first is the hint) |
| --- | --- |
| University of Toronto | `mail.utoronto.ca`, `utoronto.ca` (added) |
| Toronto Metropolitan University | `torontomu.ca`, `ryerson.ca` (added, legacy) |
| Wilfrid Laurier University | `mylaurier.ca` |
| York University | `my.yorku.ca`, `yorku.ca` (added) |
| Ontario Tech University | `ontariotechu.net`, `ontariotechu.ca` (added) |
| McMaster University | `mcmaster.ca` |
| University of Waterloo | `uwaterloo.ca` |

Domains I'm less sure of (from general knowledge, not verifiable here):
- `utoronto.ca`, `yorku.ca`, `ontariotechu.ca` are mostly **staff/faculty** addresses; students normally have `mail.utoronto.ca`, `my.yorku.ca`, `ontariotechu.net`. Added because you asked; it means staff can sign up too.
- `ryerson.ca`: TMU moved students to `torontomu.ca` in 2022–23; old addresses forwarded for a while. Possibly only alumni still have one. Harmless to keep, remove if you'd rather.
- `mcmaster.ca` is the student domain as far as I know (students are `macid@mcmaster.ca`).
- Matching is exact: `@cs.utoronto.ca` or any other subdomain is **not** accepted.
- Also: the landing page's campus strip and waitlist dropdown list six schools without Waterloo; PRODUCT.md said "five universities" and listed `wlu.ca` (code says `mylaurier.ca`). PRODUCT.md is updated; the landing page is a locked brand asset per PRODUCT.md, so I left it.
- README had a stale `ALLOWED_EMAIL_DOMAINS` example (including gmail.com/hotmail.com) for an env var nothing reads any more; removed.

Tests: shared `universities.test.ts` (the full list pinned, exact/subdomain/case matching), backend `src/schemas/auth.schema.test.ts` (added `src/schemas/*.test.ts` to the unit glob), frontend `formValidation.test.ts` and `userMessage.test.ts` (new message, still matched by its pattern).

## Task 5: no handoff without a successful payment — **done** (commit below)

How payment works today (found while doing this): the renter's Pay authorizes the rent PaymentIntent (manual capture); `confirmBookingPayment` (ACCEPTED → CONFIRMED) then creates the **deposit hold as a second, off-session PaymentIntent right away, at pay time**, and the rent is captured at the pickup Zoink It. Webhooks can later move `paymentStatus` / `depositStatus` (failed, cancelled, expired authorization).

- **Backend (source of truth):** `assertPickupPaymentReady` in `handoffService.ts` runs on every pickup step (start pickup / photo re-submit, and the Zoink It tap before the capture). It requires `paymentStatus` AUTHORIZED (or CAPTURED, for a retried capture) and, when `depositAmount > 0`, `depositStatus` AUTHORIZED. Otherwise **409 `{ "error": "Payment hasn't gone through. The renter needs to pay before pickup.", "code": "PICKUP_PAYMENT_REQUIRED" }`**. The rule itself is `isPickupPaymentReady` in `@zoink/shared`, so the app uses the same one.
- `errorHandler` now adds `code` to the JSON for errors that carry one (this one, and the existing `PICKUP_PAYMENT_FAILED`, which had a code that was never sent).
- **App:** Booking detail, Active rental and the Zoink It screen hide the handoff (Zoink It shows a disabled "Waiting for payment") and show a warning-yellow notice with that sentence while the booking is CONFIRMED/PICKUP_PENDING and payment isn't ready.
- **Two real payment bugs fixed on the way (please review):**
  1. A listing **without a deposit** still created a `$0` deposit PaymentIntent at pay time. With real Stripe that call is refused (`amount_too_small`), so paying for any no-deposit booking would fail with "Could not authorize the deposit". Now a no-deposit booking confirms on the rent alone (no deposit PI, `depositStatus` null). The integration fixtures default to a $0 deposit, which suggests this path hasn't been exercised against real Stripe recently. Please run a no-deposit booking end to end with test keys.
  2. The deposit PI was marked AUTHORIZED whatever Stripe returned. Off-session confirmation can return `requires_action` (3-D Secure) or fail; now anything other than `requires_capture` fails the confirm and releases both holds, so a booking can't become CONFIRMED without a real deposit hold.
- Not handled (product question): if the rent authorization fails or expires *after* CONFIRMED, the renter has no "pay again" path in the app; the handoff is now blocked, so the booking would have to be cancelled. Logged for you.
- Tests: `backend/src/services/handoffPayment.test.ts` (unit, every status), `backend/src/integration-tests/pickupPaymentGuard.integration.test.ts` (5 tests over HTTP and the service against the local DB: refused + unchanged for PENDING_AUTH/FAILED, deposit hold released, paid with/without deposit, tap after a failed payment, no-deposit confirm). Payment status is set on the fixture rows, so no Stripe keys are needed.

## Task 6: deposit rules — **done** (commit below)

**Investigation first.** The deposit hold is created **at pay time**: when the renter pays, `confirmBookingPayment` authorizes the rent PaymentIntent and immediately creates the deposit as a second, off-session, manual-capture PaymentIntent. It's captured or cancelled after the return (dispute resolution, or `releaseDueDeposits` 24h after completion). Before tonight a renter could pay as soon as the owner accepted, possibly weeks ahead, and rentals could be 7 days, so the hold (valid ~7 days, ~5 for some Visa transactions) could expire before the return + dispute window.

**Timing decision (enforced, not just logged).** It didn't need a payment-flow rework: it's one check on the two pay endpoints. Deposit bookings can be paid from **00:00 Toronto time the day before the rental starts** (start = 00:00 Toronto on the first day, the same instant `cancellationCutoff` uses). Worst case: paid 00:00 day −1, 3-day rental, returned end of day 3, released 24h later = **about 5 days of hold**. That fits the 7-day window but sits right at Visa's 5-day edge. Worth watching in Stripe (`charge.payment_method_details.card.capture_before` shows each hold's exact expiry).

What's enforced (backend + app, constants in `packages/shared/src/deposits.ts`):

| Rule | Backend | App |
| --- | --- | --- |
| Item value ≤ $1,000 | `listing.schema.ts` create + update (`itemValue cannot exceed 1000.`) | form validation "At most $1,000.", placeholder "Up to $1,000" |
| Deposit is none, or ≥ $1 and ≤ item value | schema (`depositAmount must be at least 1, or 0 for no deposit.`; the existing ≤ item value rule kept) | "At least $1, or leave it empty." |
| Deposit suggested at 30% of item value, whole dollars, editable | — | New **No deposit / Hold a deposit** chips on create + edit. Turning it on fills `round(0.3 × item value)`, which follows the item value until the owner types their own amount |
| Deposit rentals ≤ 3 days | `createBooking` → 400 "Rentals with a deposit can be at most 3 days." | Booking calendar caps the range at 3 days for deposit listings ("Your dates (up to 3 days)", the same message) |
| Pay only within 24h of the start (deposit bookings) | `POST /bookings/:id/payment-intent` and the confirm → 409 "You can pay from Nov 9, 12:00 AM." | Pay button disabled with "You can pay from {date, time}" on the Pay screen and Booking detail |
| Failed payment = no handoff | Task 5 | Task 5 |
| "Deposit-backed" label | — | Lime badge (existing `Badge` variant) on grid cards and list rows (replaces "$50 held"; the amount stays in the screen-reader label) and on listing detail next to "$50 held" |

Decisions / things to check:
- **$1 minimum deposit** is my addition: Stripe can't hold less than $0.50, so a $0.30 deposit would have failed at pay time.
- The ≤ 3-day and pay-window checks live in `bookingUtils.ts`. Three older Stripe-backed flow test files (`bookingFullFlow`, `bookingLifecycle`, `bookingConcurrency`) book deposit listings 2–7 days ahead and for 5 days, so they **mock those two checks to no-ops** in `beforeEach`, with a comment. The rules themselves are covered by `depositRules.integration.test.ts` (5 tests, run here) and `bookingUtils.test.ts`. Those three files can't run here (no Stripe keys); please run them with test keys.
- **Not changed:** a booking *without* a deposit can still be paid any time after acceptance, so its **rent** authorization can still expire before pickup if paid more than ~7 days ahead (the capture at pickup would then fail with the existing "payment couldn't be collected" message). Consider applying the same 24h window to all bookings.
- Existing listings with an item value over $1,000 (or a deposit under $1) stay as they are, but saving an edit will ask the owner to fix them. The App Review seed listing (Canon kit, $1,100) is now $1,000.
- `terms.md` §5/§10.2/§11 updated to say this (see the legal list in the summary).
- Tests: shared `deposits.test.ts` (4), backend `bookingUtils.test.ts` (+2), `depositRules.integration.test.ts` (5: item cap, deposit min/max, 3-day limit, pay window refused and open, no-deposit any time), frontend `formValidation.test.ts` (+2), `userMessage.test.ts` (the new server sentences are shown as sent).

## Task 7: orphaned mock Stripe data — **done** (commit below)

Cause: integration tests truncate in `beforeEach`, never at the end, so the last test's rows stayed in `zoink_test`, including `bookingLifecycle`'s `pi_mock_confirmed_<timestamp>` bookings (AUTHORIZED, so in the reconciliation query). A server whose `DATABASE_URL` pointed at that database (dev/bench, or the same Postgres) then asked Stripe about them every hour → `resource_missing` each time.

- **Test cleanup:** `setup.ts` (imported first by every integration file) registers a root-level `after()` that truncates all tables. node:test runs it at the end of every file, **pass or fail**. `bookingLifecycle` also truncates in its own `after()`. Verified: after a run, `zoink_test` has 0 bookings and 0 users.
- **Reconciliation job (defense in depth, no id-prefix hacks):** on a Stripe `resource_missing` it logs one `console.warn`, writes one `RECONCILIATION_MISMATCH` event with `reason: payment_intent_missing` on the booking (visible in the admin timeline), and the job's query **excludes bookings that carry that event**, so it's never retried. No ERROR row, no Sentry report for it. Other Stripe errors (rate limit, network) still record an ERROR and are retried next hour. One booking's failure never stops the run, and an audit-write failure is caught too. The job result now includes `missing`. No schema change (it uses the existing event table).
- Tests (`reconciliationJob.integration.test.ts`, Stripe mocked): resource_missing logged once, recorded, skipped on the 2nd and 3rd runs, booking untouched; other errors retried and never stop the job. The existing test there used to skip itself without a key; a placeholder `sk_test_...` is now set **only in-process for the duration of those mocked tests** (no request is made, nothing in any env file). Also fixed that file restoring `STRIPE_SECRET_KEY` to the string "undefined".
- **For Vansh:** check for leftovers (SQL in `docs/launch-checklist.md`).

## Task 8: store-listing and compliance docs — **done** (commit below)

- `docs/store/play-listing.md`: app details, short description (76 chars), full description (~2,300 chars), category Shopping, contact zoinksupport@gmail.com / zoinkit.app, 18+ audience, IARC answers with reasons.
- `docs/store/play-data-safety.md`: every data type, collected/shared/required/purposes, derived from the schema, services, permissions and Sentry setup. Name, photos, messages, approximate location (listing point offset 200–500 m) and the paid renter's pickup address are marked **shared** (user-to-user); service providers are not "sharing". ⚠ items listed at the end.
- `docs/store/testflight-info.md`: beta description, feedback email, What to Test, App Review notes, and the reviewer-access recommendation.
- `landing/delete-account.html`: public page in `terms.html`'s styling (same head/CSS, nav and footer), describing in-app deletion and what's removed vs. kept, from `userService.deleteMe` and privacy.md §7–8.
- **Reviewer access decision:** use the existing seeded, pre-verified reviewer account (`seedReviewerAccount.ts`). Sign-in is email + password; the OTP only verifies a new address, so no auth change is needed. `EXPO_PUBLIC_DEMO_MODE` can't serve reviewers (dev builds only). No backdoor added.
- **Seed fix (code):** the reviewer's "ready to pay" booking started in 7 days with a deposit, which Task 6's pay window would block. It now starts **tomorrow**. Run the seed on the day you submit (Toronto daytime).
- **Apple's earlier rejection: no record found** in the repo (docs, legal, commit history). `testflight-info.md` maps the usual guidelines (2.1, 1.2 UGC, 5.1.1(v), 5.1.1, 3.1.1) to where they're covered, so you can tick off the real feedback from Resolution Center.
- No App Store metadata draft existed; a suggested subtitle/promo/keywords set is at the end of `testflight-info.md`, consistent with the 15% (min $2) model.
- ⚠ **Mismatch found (not fixed, needs your call):** privacy.md §7/§8 promise a 30-day purge after deletion and "an open booking or dispute must be resolved before we can delete your account". The code anonymises immediately, only *hides* the user's listings (their photos stay on Cloudinary), doesn't block deletion during an open booking/dispute, and has no 30-day purge job. Details in `play-data-safety.md` "Things to fix".
- ⚠ The reviewer notes say reports are reviewed within 24 hours (what Apple 1.2 expects); make sure that's true in practice.
