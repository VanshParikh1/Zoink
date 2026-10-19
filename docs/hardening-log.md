# Hardening log

Branch `quality/hardening`, cut from `design/mockup-reskin` @ `fe5cec3` on 2026-10-18. Every finding gets a severity, the fix or decision, and the commit. The summary for readers is `docs/hardening-report.md`; this file is the working record.

Severity: **S1** money, data loss or a security hole reachable in normal use · **S2** wrong behaviour a user can hit · **S3** robustness, performance or polish.

---

## Phase 0: baseline (before any change)

### Plan

Measure before touching anything: bundle size and composition, dependency counts, cold start and scroll on an iOS simulator release build, per-endpoint latency, DB round trips and payload size against a seeded local database, and the test-suite counts.

### Tooling added (`6cb34fe`)

- `backend/src/scripts/bench/`: `seed.ts` fills a dedicated `zoink_bench` database (about 200 users, 450 listings with 3 photos each, about 1,500 bookings across every status, 90 conversations including one with 500 messages, disputes, reports, review obligations, plus one fixture row per measured write). `run.ts` sends 50 sequential requests to every route and reports p50/p95, DB round trips (every statement the `pg` driver sends, BEGIN/COMMIT included) and response size. Stripe, SES, Cloudinary and Expo push are kept off the network (`benchEnv.ts`), so write timings exclude third-party calls. `serve.ts` serves the same seeded API on :3000 for on-device runs.
- `frontend/src/utils/perfMarks.ts`: `markStartup()` (milliseconds since the native process started, from React Native's `performance.rnStartupTiming`) and `useScrollPerfProbe()` (JS frames, dropped frames and JS FPS while a list moves). Both are silent unless the bundle was built with `EXPO_PUBLIC_PERF_LOG=1`.

### Tests

| Suite | Result |
|---|---|
| `npm run typecheck:backend` | pass |
| `npm run typecheck:frontend` | pass |
| `npm run test:backend` | 212 tests, 211 pass, **1 flaky failure** (`rateLimiter.test.ts`, socket hang up; fixed in `fbc50ac`, see below) |
| `backend npm run test:integration` | 292 tests, 289 pass, 3 skipped (the cancellation-fee tests, skipped on purpose), 0 fail, 535 s (real Stripe test mode) |
| `frontend npm test` | 3 tests, 3 pass (demo-mode gate only) |

### Bundle (production `expo export`, Hermes bytecode)

| | iOS | Android |
|---|---:|---:|
| JS bundle (`.hbc`) | 4.37 MB | 4.37 MB |
| Assets shipped with the bundle | 8.6 MB | 8.6 MB |
| Modules | 2,216 | 2,216 |

Largest packages by source size in the bundle (from the source map's `sourcesContent`, 8.4 MB of source in total):

| Package | Source | Share |
|---|---:|---:|
| react-native | 2,255 KB | 26.8% |
| react-native-reanimated | 783 KB | 9.3% |
| @sentry/core | 714 KB | 8.5% |
| @sentry/react-native | 673 KB | 8.0% |
| app source (`frontend/src`, `App.tsx`) | 491 KB | 5.8% |
| @stripe/stripe-react-native | 315 KB | 3.7% |
| @sentry/conventions | 295 KB | 3.5% |
| react-native-gesture-handler | 258 KB | 3.1% |
| react-native-svg | 245 KB | 2.9% |
| @react-navigation/core | 179 KB | 2.1% |
| @sentry/browser | 168 KB | 2.0% |
| axios | 139 KB | 1.7% |

**Assets finding:** 8.4 of the 8.6 MB of assets are fonts. `App.tsx` imports from the `@expo-google-fonts/fira-sans` and `fira-mono` package roots, which reference every weight, so all 18 Fira Sans and 3 Fira Mono files ship (and download with every OTA update) although the app uses four. Fixed in Phase 4.

### Dependencies

| | Direct | Dev | Installed (prod tree, `npm ls --omit=dev --all`) |
|---|---:|---:|---:|
| frontend | 31 | 3 | 784 |
| backend | 17 | 13 | 317 |

### Backend endpoints (local, seeded `zoink_bench`, 50 sequential requests each)

Every route, before any change. "DB queries" is the median number of statements per request. The main owner account carries every write fixture (about 680 bookings), which is why `GET /bookings/requests` is so large: it is the unpaginated worst case, not a typical user.

| Endpoint | Kind | p50 ms | p95 ms | DB queries | Payload | OK |
|---|---|---:|---:|---:|---:|---:|
| `GET /health` | read | 0.3 | 0.5 | 0 | 0.0 KB | 50/50 |
| `GET /auth/legal-version` | read | 0.2 | 0.3 | 0 | 0.0 KB | 50/50 |
| `POST /auth/register` | write | 270.9 | 303.1 | 3 | 0.6 KB | 50/50 |
| `POST /auth/login` | write | 71.7 | 86.3 | 1 | 0.6 KB | 50/50 |
| `POST /auth/verify-email` | write | 3.7 | 5.1 | 7 | 0.4 KB | 50/50 |
| `POST /auth/resend-otp` | write | 3.1 | 8.3 | 4 | 0.0 KB | 50/50 |
| `GET /users/me` | read | 1.3 | 2.0 | 2 | 0.6 KB | 50/50 |
| `GET /users/:id` | read | 1.9 | 3.0 | 4 | 0.2 KB | 50/50 |
| `GET /users/me/blocks` | read | 1.0 | 1.3 | 3 | 0.1 KB | 50/50 |
| `GET /users/me/stripe-connect/status` | read | 0.9 | 1.6 | 2 | 0.1 KB | 50/50 |
| `GET /stripe/connect/status` | read | 1.0 | 5.9 | 2 | 0.1 KB | 50/50 |
| `PATCH /users/me` | write | 1.9 | 4.2 | 2 | 0.2 KB | 50/50 |
| `PATCH /users/me/notification-prefs` | write | 1.4 | 2.4 | 2 | 0.1 KB | 50/50 |
| `PATCH /users/me/push-token` | write | 1.4 | 2.9 | 2 | 0.1 KB | 50/50 |
| `POST /users/me/accept-terms` | write | 1.3 | 2.4 | 2 | 0.5 KB | 50/50 |
| `POST /users/me/stripe-connect/onboard` | write | 1.0 | 1.6 | 2 | 0.0 KB | 50/50 |
| `POST /users/:id/block` | write | 1.3 | 2.5 | 7 | 0.0 KB | 50/50 |
| `DELETE /users/:id/block` | write | 0.6 | 0.7 | 2 | 0.0 KB | 50/50 |
| `DELETE /users/me` | write | 1.5 | 2.6 | 6 | 0.0 KB | 50/50 |
| `GET /listings?lat&lng` | read | 5.5 | 7.2 | 6 | 16.1 KB | 50/50 |
| `GET /listings?q` | read | 8.7 | 10.2 | 6 | 16.1 KB | 50/50 |
| `GET /listings?offset=40` | read | 7.4 | 9.5 | 6 | 16.1 KB | 50/50 |
| `GET /listings/categories` | read | 2.5 | 3.2 | 2 | 0.1 KB | 50/50 |
| `GET /listings/:id` | read | 2.0 | 2.6 | 5 | 1.1 KB | 50/50 |
| `GET /listings/me` | read | 3.4 | 4.3 | 5 | 46.7 KB | 50/50 |
| `POST /listings` | write | 2.2 | 3.1 | 7 | 0.6 KB | 50/50 |
| `PATCH /listings/:id` | write | 3.1 | 5.7 | 8 | 1.0 KB | 50/50 |
| `PATCH /listings/:id/availability` | write | 1.8 | 2.1 | 3 | 0.1 KB | 50/50 |
| `DELETE /listings/:id` | write | 1.9 | 2.5 | 3 | 0.0 KB | 50/50 |
| `GET /bookings/me` | read | 6.8 | 10.6 | 7 | 133.3 KB | 50/50 |
| `GET /bookings/requests` | read | 29.2 | 53.7 | 7 | 1244.0 KB | 50/50 |
| `GET /bookings/:id` | read | 2.2 | 3.4 | 7 | 1.9 KB | 50/50 |
| `GET /bookings/:id/photos` | read | 2.8 | 7.8 | 7 | 0.1 KB | 50/50 |
| `POST /bookings` | write | 6.5 | 14.8 | 20 | 2.0 KB | 50/50 |
| `PATCH /bookings/:id/accept` | write | 5.8 | 15.6 | 23 | 1.9 KB | 50/50 |
| `PATCH /bookings/:id/decline` | write | 2.5 | 3.7 | 19 | 1.9 KB | 50/50 |
| `PATCH /bookings/:id/cancel` | write | 2.8 | 3.2 | 20 | 1.9 KB | 50/50 |
| `POST /bookings/:id/payment-intent` | write | 2.4 | 3.6 | 17 | 2.0 KB | 50/50 |
| `PATCH /bookings/:id/confirm` | write | 2.9 | 3.4 | 22 | 2.0 KB | 50/50 |
| `POST /bookings/:id/pickup/initiate` | write | 3.2 | 8.4 | 20 | 2.2 KB | 50/50 |
| `POST /bookings/:id/zoink-tap` | write | 2.3 | 3.5 | 17 | 2.3 KB | 50/50 |
| `POST /bookings/:id/return/initiate` | write | 4.2 | 7.3 | 20 | 2.2 KB | 50/50 |
| `GET /conversations/me` | read | 8.8 | 12.4 | 9 | 41.0 KB | 50/50 |
| `GET /conversations/:id` | read | 2.9 | 3.5 | 9 | 1.4 KB | 50/50 |
| `GET /conversations/:id/messages` | read | 3.6 | 7.0 | 4 | 38.9 KB | 50/50 |
| `POST /conversations` | write | 5.5 | 6.7 | 14 | 1.2 KB | 50/50 |
| `POST /conversations/:id/messages` | write | 3.6 | 6.2 | 10 | 0.4 KB | 50/50 |
| `POST /conversations/:id/read` | write | 1.4 | 1.8 | 3 | 0.0 KB | 50/50 |
| `GET /reviews/pending` | read | 2.2 | 2.7 | 7 | 0.8 KB | 50/50 |
| `POST /reviews` | write | 8.9 | 14.9 | 19 | 0.6 KB | 50/50 |
| `GET /disputes` | read | 2.0 | 2.3 | 4 | 1.1 KB | 50/50 |
| `GET /disputes/:id` | read | 1.8 | 2.1 | 4 | 0.5 KB | 50/50 |
| `POST /disputes` | write | 4.8 | 10.0 | 6 | 0.4 KB | 50/50 |
| `POST /reports` | write | 1.5 | 2.4 | 3 | 0.3 KB | 50/50 |
| `GET /admin/disputes` | read | 3.9 | 6.7 | 4 | 64.2 KB | 50/50 |
| `GET /admin/disputes/:id` | read | 1.6 | 2.4 | 5 | 0.9 KB | 50/50 |
| `GET /admin/bookings/:id/events` | read | 1.4 | 1.7 | 3 | 0.0 KB | 50/50 |
| `GET /admin/reports` | read | 3.6 | 4.0 | 5 | 49.9 KB | 50/50 |
| `PATCH /admin/disputes/:id/resolve` | write | 6.0 | 8.1 | 11 | 0.5 KB | 50/50 |
| `PATCH /admin/reports/:id` | write | 2.3 | 2.9 | 3 | 0.4 KB | 50/50 |
| `POST /stripe/webhook` | write | 3.6 | 4.3 | 6 | 0.0 KB | 50/50 |

Reading it: every endpoint is already well under the targets (p95 < 150 ms reads, < 300 ms writes) on a local database. The two outliers are `POST /auth/register` (bcrypt cost 12, about 270 ms by design) and the unpaginated lists: `/bookings/requests` 1.2 MB, `/bookings/me` 133 KB, `/admin/disputes` 64 KB, `/listings/me` 47 KB, `/conversations/me` 41 KB, and a 500-message thread at 39 KB in one response. Booking state changes cost 17 to 23 round trips each.

### Cold start (iOS simulator, Release build)

iPhone 17 Pro simulator (iOS 26.5) on this Mac, `expo run:ios --configuration Release` with `EXPO_PUBLIC_PERF_LOG=1`, pointed at the bench API on localhost (Stripe mocked, real Cloudinary demo photos). Time is measured from the new process's first line in the device log to the app's `[perf] startup` line (React Native's own startup timer reported nothing in this build, so both ends come from the device log, one clock). `simctl terminate` then `simctl launch` each run, location permission pre-granted.

| Path | Mark | Runs | Median | Range |
|---|---|---:|---:|---|
| Signed out | Login screen mounted | 7 | **1,884 ms** | 1,168–2,896 |
| Signed in | Main app shell (tabs) mounted | 9 | **1,676 ms** | 1,094–2,059 |
| Signed in | Home listings on screen | 9 | **2,187 ms** | 1,432–2,586 |

Seen on the way: a blank white, then blank tan, screen between the native splash and the first JS screen.

### List scrolling (same build, JS frames)

Home shows only the first 20 listings (no pagination), so a 100+ item list isn't reachable in the shipped app. For this baseline the bench API's browse default was raised to 150 for the run only (uncommitted, reverted); the app code was unchanged. Each line is one fling sequence, measured by `useScrollPerfProbe` (frames > 1.5x a 60 Hz frame count as dropped).

| List | Items | Frames | Dropped | JS FPS |
|---|---:|---:|---:|---:|
| Home grid | 20 | 141 | 0 | 59.4 |
| Home grid (first pass, images loading) | 150 | 244 | 31 | 54.9 |
| Home grid | 150 | 142 | 49 | 44.6 |
| Home grid | 150 | 197 | 13 | 57.5 |
| Search list | 150 | 256 | 0 | 59.9 |

The grid (two large photos per row, plain `Image`, no recycling hints) drops JS frames as new rows mount; the one-column Search list with small thumbnails doesn't.

### Bench seed change

The seed now uses real public Cloudinary demo photos (one unique URL per listing) so on-device scrolling decodes real images.

---

## Phase 1: correctness and data integrity

### Plan

Pin every business invariant with tests (shared unit and property tests for the money math; HTTP integration tests for the state machine), then go through each concurrency path the brief names (double-tap Pay, double-tap Zoink It, accept vs. cancel, overlapping requests, webhook retries and ordering), Stripe idempotency, the payment jobs, and time handling (one shared date helper, DST tests, the rental-date display sweep). Anything that would change a business rule goes to "Needs product decision" instead of being changed.

**The run stopped at the end of this phase, at the owner's request.** The owner's decisions on the open items were applied on 2026-10-18 before Phase 2 (below).

### Findings

| # | Finding | How it happens in real use | Sev | Fix / decision | Commit |
|---|---|---|---|---|---|
| 1 | Two renters could both pay for the same dates | Two ACCEPTED requests overlap (accepting doesn't hold dates); both renters tap Pay at about the same time; both pass the overlap check before either writes | S1 | Accept and confirm take the listing's row lock and re-check overlap inside the transaction | `e18b41b` |
| 2 | PICKUP_PENDING and RETURN_PENDING didn't hold dates | Owner starts the pickup handoff; another renter's confirm (or the owner's accept) for those dates goes through | S1 | Overlap check counts CONFIRMED, PICKUP_PENDING, ACTIVE, RETURN_PENDING | `e18b41b` |
| 3 | Double-tapped Confirm could put two deposit holds on the card, or cancel the rent hold the booking was confirmed with | Deposit key included the booking version, which the deposit's own webhook bumps; two concurrent confirms raced on one key, Stripe rejected the second while the first was in flight, and that failure path cancelled the rent authorization | S1 | Pay and Confirm run under the booking's row lock; a repeat confirm returns the first result; deposit keyed on the rent PaymentIntent | `f50b559`, `e18b41b` |
| 4 | Cancelling a paid booking left money held | CONFIRMED: rent released, deposit held up to ~7 days. PICKUP_PENDING: nothing released at all | S1 | Both holds released on cancel; depositStatus RELEASED | `e18b41b` |
| 5 | A late `payment_intent.succeeded` stopped the owner's payout | Capture webhook arrives after the return completed the booking (or after PAYOUT_PENDING): status reset to CAPTURED, which `releaseDuePayouts` never selects | S1 | Rental webhooks only move forward; a capture landing after completion goes to PAYOUT_PENDING | `247e5ed` |
| 6 | Other out-of-order webhooks moved payment status backwards | Late `amount_capturable_updated` after capture (back to AUTHORIZED); late `payment_failed` from a first declined card after a good one (AUTHORIZED to FAILED); late authorization after a release | S2 | Same forward-only rules | `247e5ed` |
| 7 | Deposit released or owner paid while a dispute was being filed | Dispute filed in the last moments of the 24 h window while the 15-minute job runs: the job read "no dispute", the dispute committed, the job released anyway | S2 | Jobs re-check each booking under its row lock; `createDispute` takes the same lock | `1fee579` |
| 8 | Overlapping job runs could act twice on one booking | A slow run overlapping the next tick, or two instances | S2 | Same row-lock re-check (payout `payoutSentAt`, deposit `depositStatus`) | `1fee579` |
| 9 | Two disputes on one booking | Renter and owner (or a double tap) file at once; both pass the "no open dispute" check | S2 | `createDispute` runs in one transaction holding the booking lock | `1fee579` |
| 10 | An ACCEPTED booking could be overwritten to DECLINED | Owner accepts two overlapping requests at once; one accept's auto-decline overwrote the other after it committed ACCEPTED (an illegal transition; the renter got "accepted" then "declined") | S2 | Auto-decline only updates rows still PENDING, under the listing lock | `e18b41b` |
| 11 | Renter refused at confirm kept the rent hold | Dates taken by someone else between Pay and Confirm | S2 | Rent authorization released when confirm is refused for overlap | `e18b41b` |
| 12 | Illegal transitions answered 500 | Any stale action (accept an already-cancelled request, cancel a completed one): "Something went wrong." and a Sentry crash report | S2 | `InvalidBookingTransitionError`, 409 with a readable message | `28cf272` |
| 13 | Rental dates showed the wrong day after a handoff, "days left" was a day early every evening | startDate/endDate are overwritten with the real pickup/return time; formatting those in UTC showed the next day for evening handoffs. "Days left" counted milliseconds to midnight UTC (8 PM the evening before in Toronto). Zoink It's day count was off by one after pickup. Settings showed block/terms-acceptance instants in UTC | S2 | One shared helper (`@zoink/shared` `dates.ts`) and the sweep below | `9b30de2` |
| 14 | Request preview could differ from the charge by a cent | The request screen computed HST with `toFixed(2)` and kept its own copies of HST_RATE and MAX_RENTAL_DAYS | S3 | `quoteRental` in `@zoink/shared`, used by both | `d40bd4c` |
| 15 | Rate limiter unit test flaked | supertest bound a new port per request; under the parallel run one connection reset | S3 | One server per test app | `fbc50ac` |

### Checked and found sound (no change)

- Webhook signature verification fails closed outside tests; every event id is stored in `processed_stripe_events` in the same transaction as the booking update (redeliveries are no-ops).
- Double-tapped Zoink It is already covered by `handoffRace` (one transition, clean 409 for the loser).
- Every Stripe create/capture/cancel/refund/transfer call carries an idempotency key (account links excepted; they're single-use by design).
- OTP: attempt cap, expiry, constant-time compare (Phase 2 would re-verify).
- Money arithmetic: a property test over every daily price from $0.01 to $1,000 for 1 to 7 days (700,000 quotes) shows every line is whole cents, commission + payout = rental total, and the pickup charge = rent + HST. The float formula agrees with exact half-up rounding except on an exact half-cent tie, where it rounds down by a cent: 1,980 of the 700,000 quotes (see product decisions). The app and server now share one formula, so what's shown is what's charged.
- Cleanup jobs: stale-handoff cleanup and the retention sweeps are single statements (atomic, safe to repeat); deposit and payout jobs are per-booking transactions with stable Stripe keys, so a restart mid-run repeats the same calls and gets the same results back.

### Date sweep

`@zoink/shared` `dates.ts`: calendar-date values (midnight UTC, how the app sends a rental day) are read in UTC; real instants (including a startDate/endDate after the handoff overwrote them) are shown in America/Toronto. `rentalDayKey`, `torontoDayKey`, `daysBetween`, `rentalDayCount`, `formatRentalDate`, `formatDayOf`, `formatTimeOfDay`, `formatDateTime`, `isTodayInToronto`. Tests run in six device time zones and across both 2026 DST changes.

| Screen | Before | After |
|---|---|---|
| Request (BookingRequest) | Picked days from the device calendar, sent as midnight UTC | Unchanged (correct); price preview now `quoteRental` |
| Checkout (Pay) | `formatLongDate` (UTC) | `formatRentalDate(…, 'long')` |
| Rentals list (BookingHistory) and Requests | UTC formatting | `formatRentalDate` |
| Chat pinned card | Shows listing and daily price only, no rental dates | Nothing to change |
| Zoink It | Day count from milliseconds (off by one after pickup) | `rentalDayCount` |
| Booking detail | `calendarDate` (UTC) for rental days, device-local for moments | `formatRentalDate` / `formatDayOf` (Toronto) |
| Active rental | UTC dates; "days left" by milliseconds | `formatRentalDate`; calendar-day count in Toronto |
| Review prompt | `formatLongDate` (UTC) on dates that are post-handoff instants | `formatRentalDate(…, 'long')` |
| Settings | Block and terms-acceptance instants in UTC | `formatDayOf(…, 'long')` |

Left as they were: message and inbox timestamps and admin timestamps use the device's time zone (the same as Toronto for Ontario users). Moving them is a one-line change per call site if wanted.

### Needs product decision

Decided by the owner on 2026-10-18; see "Product decisions applied" below. 7 and 8 are still open.

1. **Commission: tiered vs flat (existing).** Code charges 15 / 12.5 / 10% by daily rate; the business plan says flat 15%. Pinned by tests as-is.
2. **Cancellation cutoff is 7 to 8 PM the evening before, not the rental day.** `transitionBookingStatus` refuses a cancel when `now >= startDate`, and startDate is midnight UTC, which is 8 PM (EDT) or 7 PM (EST) the previous evening in Toronto. Suggested: compare against the start of the rental day in Toronto (one line, but it changes when a booking can be cancelled, which terms.md §9 governs).
3. **Card authorization expiry vs. booking lead time.** Rent is authorized at Confirm and captured at pickup; deposit is authorized at Confirm and held until return + 24 h. Card authorizations typically lapse after about 7 days, and nothing limits how far ahead a booking can be paid. A booking paid more than about a week before pickup will likely fail to capture; a 7-day rental confirmed one day ahead holds its deposit about 9 days, so a dispute can find it expired. Options: cap the lead time, authorize closer to pickup, re-authorize the deposit at pickup, or Stripe extended authorizations.
4. **Failed capture at pickup has no path.** The booking goes ACTIVE with paymentStatus FAILED and an ERROR event; nothing retries, notifies, or blocks the handoff. Needs a decision (retry job, block the tap until captured, admin alert).
5. **Half-cent ties.** The float formula rounds an exact half cent down where exact half-up would round up: 1,980 of 700,000 quotes differ by 1¢ (commission or HST). Totals still add up. Switching to integer-cent half-up would change those amounts by a cent.
6. **Unreachable transitions in the state table.** `allowedTransitions` still lists CONFIRMED→ACTIVE and ACTIVE→COMPLETED (skipping the handoff steps). No route reaches them (pinned by the state-machine tests). Suggested: remove them.
7. **An ACCEPTED request whose dates were taken stays ACCEPTED.** After another renter confirms overlapping dates, the losing request can be paid again and will be refused again. Consider auto-declining it when the other booking confirms, like PENDING ones are on accept.
8. **Disputes on bookings in any status.** Only COMPLETED bookings have the 24 h window check; a dispute can be filed on a PENDING, DECLINED or CANCELLED booking.

### Found, not fixed (later phases)

- **Expired or dead sessions leave the app "signed in" and broken** (S2; moved into Phase 2 by the owner). A stored token is decoded without checking `exp`; when the server answers 401 (token past its 30 days, account deleted), `api.ts` drops the token but AuthContext keeps the user, so every screen shows raw "No token provided." until the user logs out by hand. Reproduced on the simulator.
- Raw server error strings reach the UI (Phase 5).
- Login email field has autocorrect on (suggested "Toronto" for "utoronto"); a validation message pushes the form down (Phase 5 forms).
- Blank white then tan screen between the native splash and the first JS screen (Phase 4 startup).
- The server accepts booking requests whose start date is already past (the app prevents it); Phase 2 validation.
- The verification email interpolates the user's first name into HTML unescaped (self-only injection; Phase 2).
- Unpaginated lists (`/bookings/requests` 1.2 MB in the bench), Home shows only 20 listings (Phase 3/4).

### Tests after Phase 1

| Suite | Before | After |
|---|---|---|
| `@zoink/shared` (new) | none | 13 (money, contract limits, 700,000-quote property test, dates incl. DST and six device zones) |
| backend unit | 212 (1 flaky) | 220, all pass |
| backend integration | 292 (289 pass, 3 skipped) | **331: 328 pass, 3 skipped (the cancellation-fee tests, still skipped on purpose), 0 fail**, 641 s. New suites: `stateMachine` (18: 9 statuses x 9 actions, skipped steps, roles, the state set), `bookingConcurrency` (8, Stripe test mode), `webhookOrdering` (7), `jobRaces` (5) |
| frontend unit | 3 | 3 |

After the owner's decisions (2026-10-18): shared 16 (was 13: cancellation cutoff, Toronto midnight across DST, half-up ties), backend unit 221, backend integration **345: 340 pass, 3 skipped (cancellation fees), 2 failed**, 668 s. Both failures were `bookingLifecycle` pickup tests that used a placeholder PaymentIntent and relied on a failed capture still activating the booking, which is exactly what decision 4 forbids. They now mock the capture, and the file re-ran 43/43. New suites: `pickupCapture` (5) and `cancelCutoff` (9). Backend typecheck passes.

The race tests were checked against the old code: 5 of 6 job/dispute race tests fail there. One run of the full suite hit an unrelated failure: a stray packet from the Cisco ISE posture agent on this Mac (the payload contains `ISEBlockUntrustedCerts`) landed on the test server's loopback port; the file passed on re-run.

Typecheck (backend, frontend) passes. The date sweep was checked on the iOS simulator Release build: an evening pickup reads as its Toronto day in Rentals, and Active rental counts calendar days left.

### Commits

`d40bd4c` `8b937ca` (shared pricing and money tests), `f50b559` `28cf272` `5201cd9` `e18b41b` `247e5ed` `1fee579` `9b30de2`. Nothing pushed.

### Product decisions applied (owner, 2026-10-18)

| # | Decision | What changed | Commit |
|---|---|---|---|
| 4 | Failed capture at pickup blocks the handoff | The second Zoink It tap captures the rent under the booking's row lock before writing ACTIVE. If Stripe refuses: still PICKUP_PENDING, the tap isn't recorded, paymentStatus is left to Stripe's webhooks, both phones get a 409 ("keep the item for now and try Zoink It again"), an ERROR event (`capture_payment`, `blockedHandoff: true`) and a Sentry report. The version is bumped so the retry gets a fresh capture key (Stripe replays a failed result for a key it has seen). A capture Stripe already completed (lost response) counts as captured. `pickupCapture.integration.test.ts` (5) | `d04a9c8` |
| 2 | Cancel cutoff is a time-zone bug | Cutoff is 00:00 America/Toronto on the rental day (`cancellationCutoff` / `startOfTorontoDay` in `@zoink/shared`). Shared tests in six device zones and both 2026 DST days; `cancelCutoff.integration.test.ts` (9, clock mocked) | `5c84ce2` |
| 6 | Remove the unreachable skip transitions | CONFIRMED→ACTIVE and ACTIVE→COMPLETED are gone from `allowedTransitions`. `transitionBookingStatus` only takes accept, decline, confirm and cancel, so its unreachable mark-complete branch went too | `7d28f4f` |
| 5 | Round half-up to the cent if trivial | It was: commission and HST are computed in integer cents with the rate in basis points. The 700,000-quote property test now requires exact half-up everywhere (the 1,980 ties round up). Stored amounts on existing bookings don't change | `5e3d6b7` |
| 1 | Keep tiered commission | No change. Flat 15% with a $2 minimum is logged as a next feature (not built) | — |
| 3 | Authorization expiry | Logged as a next feature, not built: renters pay no earlier than 1 day before pickup, and rentals with a deposit are capped at 3 days | — |

Still open (no decision yet): 7 (an ACCEPTED request whose dates were taken stays ACCEPTED) and 8 (disputes on bookings in any status).

### Migration check (Phase 1)

Phase 1 added **no migrations**: `git diff fe5cec3..cb13720 -- backend/prisma` and `git diff main...HEAD -- backend/prisma` are both empty. Every Phase 1 fix is code: row locks (`SELECT … FOR UPDATE`), re-checks inside transactions and forward-only webhook rules. Nothing can fail to apply on existing prod data.

What existing prod data can hold is rows left behind by the bugs Phase 1 fixed. These read-only queries find them (each ran clean against the local bench database; **not run against prod**). Queries 1 and 2 are also the pre-checks for any future overlap exclusion constraint or "one open dispute per booking" partial unique index.

```sql
-- 1. Overlapping date-holding bookings on one listing (findings 1, 2)
SELECT a.id AS booking_a, b.id AS booking_b, a."listingId", a.status AS status_a, b.status AS status_b,
       a."startDate"::date AS a_start, a."endDate"::date AS a_end, b."startDate"::date AS b_start, b."endDate"::date AS b_end
FROM bookings a
JOIN bookings b ON b."listingId" = a."listingId" AND a.id < b.id
WHERE a.status IN ('CONFIRMED', 'PICKUP_PENDING', 'ACTIVE', 'RETURN_PENDING')
  AND b.status IN ('CONFIRMED', 'PICKUP_PENDING', 'ACTIVE', 'RETURN_PENDING')
  AND a."startDate"::date <= b."endDate"::date
  AND b."startDate"::date <= a."endDate"::date;

-- 2. More than one open dispute on a booking (finding 9)
SELECT "bookingId", count(*) AS open_disputes
FROM disputes
WHERE status IN ('OPEN', 'UNDER_REVIEW')
GROUP BY "bookingId"
HAVING count(*) > 1;

-- 3. Rentals that went ahead after a failed pickup capture (decision 4, old path)
SELECT b.id, b.status, b."paymentStatus", b."startDate"
FROM bookings b
WHERE b.status IN ('ACTIVE', 'RETURN_PENDING', 'COMPLETED')
  AND (b."paymentStatus" = 'FAILED'
       OR EXISTS (SELECT 1 FROM booking_events e
                  WHERE e."bookingId" = b.id AND e.type = 'ERROR' AND e.metadata->>'action' = 'capture_payment'));

-- 4. Cancelled bookings still holding the renter's money (finding 4)
SELECT id, "paymentStatus", "depositStatus", "updatedAt"
FROM bookings
WHERE status = 'CANCELLED'
  AND ("paymentStatus" IN ('AUTHORIZED', 'CAPTURE_PENDING') OR "depositStatus" = 'AUTHORIZED');

-- 5. Completed rentals stuck at CAPTURED, never paid out (finding 5)
SELECT id, "completedAt", "paymentStatus"
FROM bookings
WHERE status = 'COMPLETED' AND "paymentStatus" = 'CAPTURED' AND "payoutSentAt" IS NULL;

-- 6. Deposit released or owner paid while a dispute is open (finding 7)
SELECT b.id, b."depositStatus", b."payoutSentAt", d.id AS dispute_id, d.status AS dispute_status, d."createdAt" AS disputed_at
FROM bookings b
JOIN disputes d ON d."bookingId" = b.id
WHERE d.status IN ('OPEN', 'UNDER_REVIEW')
  AND (b."depositStatus" = 'RELEASED' OR b."payoutSentAt" IS NOT NULL);
```

Any row from 3 to 6 is a real-money case for a person to settle in the Stripe dashboard; none of it is auto-repaired.

---

## Phase 2: security

### Plan

Started from the handoff notes (stash `stash@{0}`, popped by the owner on 2026-10-18). Order, per the owner: get the stashed work green (the stuck-session fix checked on the simulator, the authZ/IDOR matrix run), then push tokens, OTP limits, the unverified-accounts decision, then the rest of the brief's Phase 2 list (validation with unknown-field rejection, rate-limit gaps, secrets in the bundle, PII in logs and Sentry, Cloudinary ownership, npm audit without major jumps).

### Findings

| # | Finding | How it happens in real use | Sev | Fix / decision | Commit |
|---|---|---|---|---|---|
| 1 | **Credentials in public git history** | `backend/env` (no dot) was committed in `51d53af` (2026-06-01, "Webhook config") and deleted the same day in `761918a`. It holds `DATABASE_URL`, `JWT_SECRET`, an AWS access key pair, the Cloudinary API key and secret, a Stripe test secret key and a webhook signing secret. The GitHub repository is public (unauthenticated API read answered 200), so anyone can read them. Every value differs from today's local `.env` files except `STRIPE_WEBHOOK_SECRET`, which is still the local one (compared by SHA-256, nothing printed). Production values live in Railway and weren't read | S1 | **Resolved by owner, keys rotated.** The owner confirmed on 2026-10-19 that every key in that file was rotated long ago. No code change; `.env` files and Railway untouched | — |
| 2 | Expired or deleted sessions left the app "signed in" and broken (owner moved it into Phase 2) | A 401 dropped the stored token but AuthContext kept the user; a stored token was never checked for `exp` | S2 | Only a 401 for the token in use ends the session (not a login 401, not a late reply from before a fresh login, never a 503); AuthContext signs out to Login with one notice; an expired stored token is dropped at launch. Checked on the simulator (below) | `4faaa6e` |
| 3 | One phone's push token could sit on two accounts | A session ends without sign-out (expiry, or sign-out couldn't reach the server); the next person to sign in on that phone gets the previous account's notifications, message previews included | S2 | Registering a token takes it off every other account in the same transaction | `ca7096d` |
| 4 | A lapsed session kept notifying a signed-out phone | Sign-out cleared the token only if that request got through, and nothing cleared it when a session expired or was dropped at launch | S2 | `POST /users/me/push-token/release` clears the account's token only while it is still this phone's; it accepts a session token this server signed even after expiry (nothing else does). The app calls it on sign-out, on a session ended by the server, and when an expired session is dropped at launch | `ca7096d`, `8b0277e` |
| 5 | Booking responses carried the other party's Stripe ids (found by the IDOR matrix) | The owner saw the renter's PaymentIntent, deposit PaymentIntent and charge ids; the renter saw the owner's transfer id | S3 | Per viewer: the renter gets their payment ids, the owner their transfer id. The app reads none of them | `3ba635b` |
| 6 | No daily cap on verification codes per address (handoff b) | 5 guesses a code and a new code every 60 s: about even odds of verifying someone else's university email in two months | S2 | 10 codes per address in any 24 h, sign-ups and resends together, counted in `verification_email_sends` (so it survives a replaced sign-up and a restart) under a per-address advisory lock. Guessing is now capped at 50 a day | `1343f03` |
| 7 | No daily cap on sends per network | One client could send codes to any number of addresses | S3 | 50 a day per network address, counting only requests that sent one (campus networks put many students behind one address) | `1343f03` |
| 8 | Verify `code` unbounded (part of handoff g); the email said "15 minutes" whatever `OTP_EXPIRY_MINUTES` was | — | S3 | Six digits, checked before it counts as a guess; the email states the configured expiry | `1343f03` |
| 9 | Registering someone else's university email locked them out for good (handoff c) | Unverified accounts were never cleaned up and the address stayed taken | S2 | Owner decision, applied (below) | `5cab41c` |
| 10 | Unverified accounts could edit their profile, avatar, push token, notification settings and blocks | Only the student routes required verification | S3 | Before verification an account can only verify, read and delete itself, and release its push token. The earlier "an unverified account can still block someone harassing it" comment no longer held: nothing can reach an unverified account | `5cab41c` |
| 11 | The verification email put `firstName` into HTML unescaped (handoff f) | Markup typed as a name rendered in the recipient's inbox | S3 | Escaped in the HTML part; the text part is unchanged | `dacedda` |
| 12 | Unknown request fields were silently dropped | Zod's default strips unknown keys, so `role`, `ownerId`, `senderId` or a retired field went through with that part ignored | S3 | `validate()` answers 400 naming the unknown field(s), for the top level of every body and query its schema describes. App builds from before 2026-09-07 still send `insuranceOptIn` and would now get a 400 on booking requests (one old test did; fixed) | `e321b37` |
| 13 | The API accepted limits only the app kept (handoff d, e, g) | Booking requests starting yesterday; profile phone free text of any length; unbounded sign-up password and browse `q`/`category`/`city` | S3 | Start day must be today (Toronto) or later; profile phone uses the sign-up rule and storage (readable message from the service); sign-up password ≤ 128, login ≤ 1,024 (so an older long password still signs in); `q` 100, `category` 40, `city` 60 | `2142580` |
| 14 | Prisma validation errors put the call's arguments in logs, Sentry and booking ERROR events | A `PrismaClientValidationError` message prints the failed call with its arguments (email, password hash, name) in every `errorFormat` (checked: `minimal` too). Sentry only redacted the email | S2 | The call and the reason are kept, the arguments dropped, wherever errors are logged or stored | `b3cf28d` |
| 15 | SES and Expo errors put emails and push tokens in the logs | SES's "identities failed the check" names the recipient; Expo's push errors quote the device token | S3 | Redacted (`@zoink/shared` `redact.ts`: emails, push tokens, JWTs, bearer tokens, stored-format phone numbers) | `b3cf28d` |
| 16 | The app's Sentry setup had no scrubbing | Console breadcrumbs keep the logged arguments, which for a failed request is the axios error with its `Authorization` header. The SDK's default depth limit cut that off before sending, but nothing guaranteed it | S3 | Same rules as the server: console breadcrumbs keep only their message, breadcrumb data is scrubbed on a copy, events keep only the user id, `sendDefaultPii: false` | `787155a` |
| 17 | Deleted listings' photos stayed public on Cloudinary | privacy.md §7: "When you delete a listing, it and its photos are deleted immediately." Only the rows were deleted | S2 | The files are deleted too, best effort after the rows; only this app's own uploads are ever deleted (`ownPublicId`) | `a9cc821` |
| 18 | A deleted account's profile photo stayed public on Cloudinary | Deletion nulled `avatarUrl`; the file stayed at its URL | S3 | Deleted with the account, same way | `a9cc821` |
| 19 | No per-user cap on routes that call Stripe or post to everyone | Only the global 1,200/15 min applied to the Pay step, confirm, payout onboarding and status (each a Stripe call), new listings and opening conversations | S3 | Stripe calls 30/hour (shared), payout status 120/hour, new listings 20/day, opening conversations 60/hour | `168eff0` |
| 20 | `JWT_SECRET` length not checked at boot (handoff j) | A short secret can be brute-forced offline from any token | S3 | Production refuses to start under 32 characters. **Owner**: confirm the Railway value first (below) | `cff20e0` |
| 21 | npm audit: 2 critical and 38 high advisories in production dependencies | See below | — | Non-major fixes applied | `206fbe5` |

### Stashed work, checked

**Stuck session (finding 2), iOS simulator.** iPhone 17 Pro (iOS 26.5), `expo run:ios --configuration Release` against the bench API (`zoink_bench`, Stripe mocked) served by a scratch wrapper that signs 120-second tokens (no app or server code change). Driven with `idb` (installed via Homebrew `facebook/fb/idb-companion` plus `fb-idb` in a scratch venv) since desktop clicks weren't reliable.

| Case | Result |
|---|---|
| Token expires mid-use | The first poll after expiry got 401; Login with "Your session has ended. Please log in again."; no further requests |
| Token already expired at launch | Straight to Login, no notice, no request with the dead token |
| Account deleted (from another device) mid-use | Next poll 401; Login with the notice |
| Account deleted, then the app launched | Two requests 401 at once; one notice; Login; quiet afterwards |

**AuthZ/IDOR matrix** (`authorization.integration.test.ts`): 144 tests, all passed on the first run. Checked that it can fail: with the booking party check removed, `GET /bookings/:id` failed. It missed Stripe ids on bookings because the fixture's ids weren't in its list of secrets; with them added it failed, which is finding 5. Committed as written (`3b8d165`), then tightened with the fix.

**Push tokens on the simulator** (same setup): sign-out released the token (no account held it); with the token left on `renter1`, signing in as `owner2` moved it off `renter1`; a session lapsing mid-use released it with the expired token; an expired session dropped at launch released it.

### Owner decision applied: unverified accounts (2026-10-18)

| Rule | What changed | Commit |
|---|---|---|
| An account isn't active until its OTP is verified | Before verification: verify, resend, read and delete itself, release its push token. Everything else 403 (pinned in the authZ matrix) | `5cab41c` |
| A sign-up with the same email replaces any unverified record | Deleted and recreated with a **new id**, so a session from the earlier sign-up can never reach the account once its owner verifies (reusing the id would have been an account takeover). The per-address code cap carries over. A verified account still answers 409, and so does the loser of two sign-ups at once | `5cab41c` |
| A cleanup job deletes unverified accounts older than 24 h, idempotently | `purgeUnverifiedAccounts`, in the 15-minute job. Each delete re-checks every condition, so a repeat run (or two at once) deletes nothing more and an account verified a moment ago is kept | `5cab41c` |

Both paths only delete an account that never verified **and** has no activity at all (no listings, bookings, conversations, messages, reviews, disputes or reports), never an admin or a soft-deleted one, with its codes, blocks and notifications. Tests: `unverifiedAccounts.integration.test.ts` (12).

### Checked and found sound (no change)

- Role and verification come from the database on every request; HS256 pinned; webhook signature fails closed; dispute responses shaped per caller; handoff photo URLs must be the booking's own uploads; listing image uploads owner-checked before Cloudinary; `X-Real-IP` trusted only behind Railway's edge; login timing equalized; OTP attempt cap (5 per code, atomic), expiry and constant-time compare (expiry now has a test).
- **Secrets in the bundle**: the Release `main.jsbundle` was searched for Stripe secret and restricted keys, webhook secrets, AWS keys, Sentry auth tokens, private keys, database URLs, Google and GitHub keys: none. It carries only values that are public by design: the API URL, the Stripe publishable key (`pk_test_…` in this local build), the Sentry DSN, the MapTiler key and the EAS project id. No `sentry.properties` or env file is tracked.
- **Cloudinary ownership**: listing photo upload and delete are owner-checked, and a photo of another listing named through your own is 404. Handoff uploads check the booking's party before anything reaches Cloudinary, under a `booking_<id>_` public id. Avatars overwrite only `avatars/avatar_<own id>`. Upload parameters are built on the server, which keeps the `cloudinary` 1.x argument-injection advisory out of reach.
- Login lockout across IPs (handoff i) stays deliberate.

### Needs owner action

1. ~~**Rotate everything in `51d53af:backend/env`** (finding 1).~~ **Resolved by owner, keys rotated** (confirmed 2026-10-19: every key in that file was rotated long ago).
2. **Before deploying this branch**: confirm `JWT_SECRET` in Railway is at least 32 characters, or the new deploy refuses to start (Railway keeps the old one serving).
3. **On the first cleanup run after deploy**, unverified accounts older than 24 h with no activity are deleted. Preview the count (read-only):

```sql
SELECT count(*) FROM users u
WHERE u."verificationStatus" <> 'VERIFIED' AND u.role = 'USER' AND u."deletedAt" IS NULL
  AND u."createdAt" < now() - interval '24 hours'
  AND NOT EXISTS (SELECT 1 FROM listings l WHERE l."ownerId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b."renterId" = u.id OR b."ownerId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c."renterId" = u.id OR c."ownerId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m."senderId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r."reviewerId" = u.id OR r."revieweeId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d."raisedByUserId" = u.id OR d."resolvedByAdminId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM reports p WHERE p."reporterId" = u.id OR p."reviewedByAdminId" = u.id);
```

The App Review account (`reviewer@zoink.app`) is seeded VERIFIED and is never touched.

### Needs product decision

1. **A listing that anyone has messaged about or booked can't be deleted.** `Conversation.listing` and `Booking.listing` restrict deletion, so `DELETE /listings/:id` answers 500 and the app says "Could not delete listing." (reproduced against the test database). Bookings must be kept 7 years, and privacy.md §7 promises a deleted listing and its photos are deleted immediately. Options: soft-delete (hide it, delete its photos and address, keep the row for the records), or block deletion with a readable message and offer "unlist" instead. Either way privacy.md should match.
2. **Strict unknown fields vs. old app builds.** Builds from before 2026-09-07 send `insuranceOptIn` on booking requests and now get 400. If any such build is still in use, the field can be accepted and ignored.

### Found, not fixed (later)

- Tokens can't be revoked before their 30 days (handoff h). Proposed: a `tokenVersion` column (additive, default 0), checked per request, bumped on sign-out-everywhere and role change.
- Soft-deleted accounts are never purged; privacy.md §7 says within 30 days.
- `cloudinary` 1.41.3 → 2.x and the Expo/React Native/Metro tooling advisories need major upgrades (below).
- Phone numbers in free text are only redacted in the stored `+1XXXXXXXXXX` form.
- Rate limits are in memory per instance (documented in `rateLimiter.ts`); the per-address code cap is in the database.

### npm audit (production dependencies)

| | Before | After |
|---|---|---|
| critical | 2 (`proxy-addr`, `shell-quote`) | 0 |
| high | 38 | 27 |
| moderate | 21 | 16 |

`npm audit fix` (no `--force`), lockfile only: `axios` 1.18.1 → 1.20.0 (shipped in the app), `@react-navigation/core` 7.21.13 → 7.24.0 (drops the vulnerable `query-string`), `proxy-addr` 2.0.8, `qs` 6.16.1, `fast-uri` 3.1.8, `undici` 6.29.1, Prisma CLI 7.10.1 with `deepmerge-ts`/`mysql2`, `shell-quote`, `@xmldom/xmldom`, `brace-expansion`, `compression`, `source-map-js`, `ip-address`. What's left needs a major version: `cloudinary` 2.x (not reachable, see above), and everything in the Expo 54 / React Native 0.81 / Metro / Jest tool chain, where npm's suggested "fix" is a downgrade to Expo 44 or React Native 0.86. Those run at build time, not in the shipped app.

### Migration check (Phase 2)

One migration: `20261018120000_verification_email_sends`, a new table and index. Additive; touches no existing row, so it can't fail on production data. The data-changing step is the cleanup job's first run (see "Needs owner action" 3).

### Tests after Phase 2

| Suite | After Phase 1 | After Phase 2 |
|---|---|---|
| `@zoink/shared` | 16 | 19 (redaction) |
| backend unit | 221 | 232 |
| backend integration | 345 (340 pass, 3 skipped, 2 failed then fixed) | **555: 552 pass, 3 skipped (cancellation fees, on purpose), 0 fail**, 874 s, after the dependency updates |
| frontend unit | 3 (7 with the stash) | 10 (session token, Sentry scrubbing) |

New integration suites: `authorization` (155), `pushTokens` (12), `otpSendLimits` (11), `unverifiedAccounts` (12), `cloudinaryCleanup` (7); `inputValidation` now 14, `userRateLimits` 9, `emailNormalization` 6. Typecheck (backend, frontend) passes.

The first full run (before the dependency updates) had one failure: the lifecycle test still sending the retired `insuranceOptIn`, fixed in `e321b37`. Separately, `authorization` was run 38 more times; 2 runs failed one request each. The first one's output wasn't kept. The second was an `HPE_INVALID_CONSTANT` parse error whose raw reply was `{"type":"Tier1","version":"1.0"}`, not anything this API sends: another process on this Mac answered on the test server's loopback connection. The same class as Phase 1's Cisco ISE packet. An environment flake, not a product bug.

**Smoke test after the dependency updates** (Release build, iOS simulator, bench API): sign in, Home with photos, a listing, Message (opens the conversation through the new cap and unknown-field check), send a message, Profile with payouts, an invalid profile phone (the app shows "Enter a valid 10-digit Canadian phone number…" and nothing is saved), sign out.

### Commits

`3b8d165` `3ba635b` `ca7096d` `4faaa6e` `1343f03` `5cab41c` `dacedda` `8b0277e` `e321b37` `2142580` `b3cf28d` `787155a` `a9cc821` `168eff0` `cff20e0` `206fbe5`, plus these docs. Nothing pushed.

---

## Where to pick up (Phase 3 onward)

Phase 2 is done; its summary is in `hardening-report.md`. Before deploying, the owner actions above (`JWT_SECRET` length, the unverified-account preview; the key rotation is resolved).

Next phases, from the brief: backend performance (pagination, payload trimming: `/bookings/requests` is 1.2 MB in the bench), frontend performance (data layer, images, fonts: 8.4 MB of unused Fira weights is the cheapest big win), reliability/UX polish (raw server errors in the UI, the login email autocorrect, the splash flash), accessibility, and the `verify` script and E2E. The bench (`backend/src/scripts/bench/run.ts`) and the perf marks are in place to measure each step against the Phase 0 numbers.

Simulator tooling for later checks: `idb` (Homebrew `facebook/fb/idb-companion`, plus `pip install fb-idb` in a venv; this session's venv was in a scratch folder) drives taps and typing without the desktop; a Release build pointed at `http://localhost:3000` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DEMO_MODE=false`) against `PORT=3000 npx ts-node src/scripts/bench/serve.ts` (`.env.test` sets 3001).
