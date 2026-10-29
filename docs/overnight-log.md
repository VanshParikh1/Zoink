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
