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

