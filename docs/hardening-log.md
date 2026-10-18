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

**The run stopped at the end of this phase, at the owner's request.** Phases 2 to 7 weren't started.

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

1. **Commission: tiered vs flat (existing).** Code charges 15 / 12.5 / 10% by daily rate; the business plan says flat 15%. Pinned by tests as-is.
2. **Cancellation cutoff is 7 to 8 PM the evening before, not the rental day.** `transitionBookingStatus` refuses a cancel when `now >= startDate`, and startDate is midnight UTC, which is 8 PM (EDT) or 7 PM (EST) the previous evening in Toronto. Suggested: compare against the start of the rental day in Toronto (one line, but it changes when a booking can be cancelled, which terms.md §9 governs).
3. **Card authorization expiry vs. booking lead time.** Rent is authorized at Confirm and captured at pickup; deposit is authorized at Confirm and held until return + 24 h. Card authorizations typically lapse after about 7 days, and nothing limits how far ahead a booking can be paid. A booking paid more than about a week before pickup will likely fail to capture; a 7-day rental confirmed one day ahead holds its deposit about 9 days, so a dispute can find it expired. Options: cap the lead time, authorize closer to pickup, re-authorize the deposit at pickup, or Stripe extended authorizations.
4. **Failed capture at pickup has no path.** The booking goes ACTIVE with paymentStatus FAILED and an ERROR event; nothing retries, notifies, or blocks the handoff. Needs a decision (retry job, block the tap until captured, admin alert).
5. **Half-cent ties.** The float formula rounds an exact half cent down where exact half-up would round up: 1,980 of 700,000 quotes differ by 1¢ (commission or HST). Totals still add up. Switching to integer-cent half-up would change those amounts by a cent.
6. **Unreachable transitions in the state table.** `allowedTransitions` still lists CONFIRMED→ACTIVE and ACTIVE→COMPLETED (skipping the handoff steps). No route reaches them (pinned by the state-machine tests). Suggested: remove them.
7. **An ACCEPTED request whose dates were taken stays ACCEPTED.** After another renter confirms overlapping dates, the losing request can be paid again and will be refused again. Consider auto-declining it when the other booking confirms, like PENDING ones are on accept.
8. **Disputes on bookings in any status.** Only COMPLETED bookings have the 24 h window check; a dispute can be filed on a PENDING, DECLINED or CANCELLED booking.

### Found, not fixed (later phases)

- **Expired or dead sessions leave the app "signed in" and broken** (S2, Phase 5). A stored token is decoded without checking `exp`; when the server answers 401 (token past its 30 days, account deleted), `api.ts` drops the token but AuthContext keeps the user, so every screen shows raw "No token provided." until the user logs out by hand. Reproduced on the simulator.
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

The race tests were checked against the old code: 5 of 6 job/dispute race tests fail there. One run of the full suite hit an unrelated failure: a stray packet from the Cisco ISE posture agent on this Mac (the payload contains `ISEBlockUntrustedCerts`) landed on the test server's loopback port; the file passed on re-run.

Typecheck (backend, frontend) passes. The date sweep was checked on the iOS simulator Release build: an evening pickup reads as its Toronto day in Rentals, and Active rental counts calendar days left.

### Commits

`d40bd4c` `8b937ca` (shared pricing and money tests), `f50b559` `28cf272` `5201cd9` `e18b41b` `247e5ed` `1fee579` `9b30de2`. Nothing pushed.

### Where to pick up (Phase 2 onward, not started)

Security pass (authZ/IDOR tests per resource, strict validation, rate-limit gaps, OTP/JWT review, secrets and PII scrub, upload ownership, npm audit), then backend performance (pagination, payload trimming), frontend performance (data layer, images, fonts: 8.4 MB of unused Fira weights is the cheapest big win), reliability/UX polish (session-expiry bug above), accessibility, and the `verify` script and E2E. The bench (`backend/src/scripts/bench/run.ts`) and the perf marks are in place to measure each step against the Phase 0 numbers.

