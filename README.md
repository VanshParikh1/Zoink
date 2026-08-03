# Zoink

### A peer-to-peer rental marketplace for students

Zoink helps university students rent useful things from nearby students instead of buying items they only need temporarily. Think cameras, speakers, tools, sports gear, and event equipment, with verification, messaging, payments, and handoff protection built into the rental flow.

The project is in active MVP development. The core marketplace, booking, messaging (with real per-user read tracking), reviews, push notifications, backend payment lifecycle, optional checkout insurance, photo-verified synchronized handoff flow, Stripe Connect onboarding, PaymentSheet booking flow, active rental UX, owner-configured deposits, and a full dispute-filing/resolution flow (backend API + frontend for both renters/owners and admins) are implemented. The remaining major work is a way to actually grant the admin role, broader automated testing coverage, security hardening, production deployment, and release-build readiness.

---

## Current Status

Completed:

- Authentication with JWT-protected routes.
- University email OTP verification and verified-only app access.
- User profiles, public profile surfaces, avatars, reputation, and review summaries.
- Listings with photos, categories, daily pricing, location, owner management, and availability.
- Browse/search with geo distance, category filtering, price filtering, and availability filtering.
- Conversations and in-app messaging.
- Booking requests with strict backend state transitions.
- Reviews and required post-rental review obligations.
- Push notification token registration and backend notification dispatch.
- Week 7 backend payment lifecycle:
  - Stripe PaymentIntent creation with mandatory idempotency keys.
  - Mock Stripe fallback for local development when `STRIPE_SECRET_KEY` is empty.
  - Optional checkout insurance fee calculation and storage.
  - Deposit, commission, and owner payout calculation.
  - Webhook-first final payment states.
  - Cancellation policy handling.
  - 24-hour configurable payout hold.
  - Audit log events through `BookingEvent`.
  - Optimistic locking with `Booking.version`.
- Photo-verified synchronized handoff:
  - Owner-documented pickup photos.
  - Renter-documented return photos.
  - `PICKUP_PENDING` and `RETURN_PENDING` handoff states.
  - Owner/renter synchronized `Zoink It` confirmations within a configurable 5-minute window.
  - Pickup confirmation transition to `ACTIVE`.
  - Return confirmation transition to `COMPLETED`.
  - Completed rental photo viewing for both pickup and return sets.
- Backend-only Week 7 smoke test for payment and handoff flows without needing two devices.
- Week 10 Stripe integration and active rental UX:
  - Stripe Connect account-link onboarding uses `zoink://stripe-return` and `zoink://stripe-refresh` deep links.
  - Profile payout status refreshes when the app returns active after Stripe onboarding.
  - Owner acceptance requires `payoutsEnabled`, not only a saved Stripe account id.
  - PaymentSheet is implemented in the renter booking flow with inline error display, loading protection, and billing details.
  - `frontend/eas.json` includes a development build profile for testing Stripe native modules outside Expo Go.
  - Active rentals are pinned to the top of the bookings screen.
  - Owners can reach active rentals from My Listings.
  - Active Rental screen shows item, dates, other party, deposit, chat, and context-aware handoff/return actions.
  - Zoink It screen includes the updated outside-ring animation and success ripple.
  - Handoff photo capture and the Zoink It confirmation tap are now one screen (`ZoinkItScreen`) instead of a separate photo-upload screen followed by a navigation hop — `HandoffPhotoScreen` has been removed. Photos can be added, previewed, and edited (re-submitted) at any point before the synchronized confirmation tap; `backend/src/services/handoffService.ts`'s `initiateHandoff` distinguishes the first submission (which transitions booking status, writes the audit event, and notifies the other party) from a later edit (which only updates the stored photos) so re-editing doesn't spam a second notification or a misleading status-change event.
  - `ActiveRentalScreen`/`BookingDetailScreen` show a single "Zoink It" action once a handoff phase is pending, for either party (not just the one waiting on the other) — closes a gap where the person who initiated the phase had no way back into the confirmation screen if they navigated away before tapping.
  - Listing photos and rental pickup/return photos open in a full-screen, swipeable, pinch-to-zoom photo viewer (`PhotoViewerScreen`, `react-native-zoom-toolkit` + `react-native-gesture-handler` + `react-native-reanimated`) instead of a static crop. It's a real navigator screen (`presentation: 'fullScreenModal'`), not React Native's `Modal` component — gesture-handler's `GestureDetector`-based components are unreliable inside an actual `Modal` (a separate native view hierarchy), especially on Android.
- Backend admin/dispute system:
  - `Role` (`USER` / `ADMIN`) added to `User`, carried in the JWT, and enforced by `requireAdmin`.
  - Renter or owner can open a dispute on a booking (`POST /disputes`) with a reason and description; one open dispute per booking at a time.
  - Admins list, inspect, and resolve disputes (`GET /admin/disputes`, `GET /admin/disputes/:id`, `PATCH /admin/disputes/:id/resolve`).
  - Resolving with `RESOLVED_REFUND` triggers a Stripe refund of the booking automatically; all resolutions are transactional and logged as `BookingEvent`s.
  - Cleanup and reconciliation jobs are now actually scheduled with `node-cron` (cleanup every 15 minutes, reconciliation hourly) — no longer manual-only.
- Backend integration test suite (`backend/src/integration-tests/`) using `supertest` against a real Postgres test database and Stripe test mode, covering booking lifecycle, cancellation, disputes, and Stripe webhooks — now running against a real Stripe Connect test account (`DEV_STRIPE_ACCOUNT_ID`) instead of a fake account id, and with cancellation payment handling fully awaited (no longer fire-and-forget) so the audit-log write always completes before the request returns. A new `payoutRelease.integration.test.ts` covers `releaseDuePayouts()` directly against a real Stripe Connect test account.
- Cancellation fees disabled for launch as a product decision — cancelling an accepted booking now fully releases the payment hold with no fee, instead of the previous tiered 5%/$5–$25 fee. See Cancellation Rules below.
- **Admin/dispute frontend** — previously backend-only (see "Disputes And Admin" below): `FileDisputeScreen` lets a renter or owner report a problem on a booking (`BookingDetailScreen` shows a "Report a Problem" action once the booking is `ACTIVE`/`PICKUP_PENDING`/`RETURN_PENDING`/`COMPLETED` and there's no active dispute already, plus a banner while one is open/under review and the outcome once resolved). `AdminDisputesScreen` (filterable list) and `AdminDisputeDetailScreen` (booking/photo context + refund / no-action / dismiss resolution) give admins a UI on top of the existing `/admin/disputes*` API. `MyProfileScreen` shows an "Admin" quick-action linking to `AdminDisputes` only when `user.role === 'ADMIN'` — the JWT's `role` claim is now decoded into `AuthContext.user` (it wasn't before). **There is still no UI to grant a user the `ADMIN` role itself** — that remains DB/script-only.
- **Owner-configured listing deposits**: `Listing.depositAmount` is now a real column, set by the owner in `CreateListingScreen`/`EditListingScreen` (optional, defaults to `0`). Booking creation (`bookingService.createBooking`) now uses the listing's configured deposit instead of auto-calculating 30% of the rental total — `BOOKING_DEPOSIT_RATE`/`calculateDepositAmount()` have been removed from `bookingUtils.ts`. `BookingRequestScreen`'s deposit display was updated to match.
- **Phone number required at registration**: `RegisterSchema` now requires and validates a 10-digit Canadian/NANP phone number (accepts common formats like `(416) 555-0192`, normalizes to `+1XXXXXXXXXX` before storing), and `User.phone` is a required column (backfilled by the `20260730000000_make_phone_required` migration for any pre-existing rows). `RegisterScreen` collects it.
- **Messaging unread state actually clears now.** It previously never did: "unread" was computed purely as "the last message wasn't sent by me," with no concept of having viewed the thread, so a conversation stayed highlighted after you opened and read it — it would only stop once you sent a reply yourself. Fixed with real per-participant read tracking: `Conversation.renterLastReadAt` / `ownerLastReadAt`, a new `POST /conversations/:id/read` endpoint, and `ConversationThreadScreen` calling it on open and on every poll tick while the thread stays focused.
- **Listing location now uses real device GPS and a draggable map**, replacing a bug where `CreateListingScreen` silently submitted a hardcoded Toronto coordinate for every listing regardless of the typed city/address. `frontend/app.json` was also missing the `expo-location` config plugin entirely, meaning there was no `NSLocationWhenInUseUsageDescription` in iOS's Info.plist — location permission prompts were likely failing silently on-device for this *and* the pre-existing `HomeScreen`/`SearchScreen` GPS usage. Now: the location step requests GPS, falls back to a place-name search (`Location.geocodeAsync`) or manual placement if permission is denied, and shows a draggable OpenStreetMap tile view (`DraggableLocationMap`, `frontend/src/utils/mapTiles.ts` — hand-rolled slippy-map tile math, no map SDK/API key) with a translucent green circle marking the chosen spot; dragging it (or searching a place name, e.g. "University of Toronto") sets the exact coordinate submitted with the listing. Uses raw `tile.openstreetmap.org` tiles directly, which is fine for low-traffic dev/demo use but is against OSM's tile usage policy at real production scale — swap to a commercial tile provider before that matters.
- `HomeScreen`/`SearchScreen` "nearby listings" radius bug fixed: it was `50`km, which silently hid every seeded/demo listing whenever the test device's real GPS position was more than 50km from where the data was seeded. Now `5000`km on both screens. `HomeScreen` also dropped its own category-chip filter (redundant with `SearchScreen`'s), and `SearchScreen` gained a proper "no results" empty state and category-label thumbnail fallback.
- Misc backend fixes: `STRIPE_CURRENCY` default corrected from `usd` to `cad` (was silently mismatched with the documented example); the duplicate `/api/stripe/webhook` mount was removed (only `/stripe/webhook` is used anywhere, and Stripe's dashboard had nothing configured against the other path); `disputeService.resolveDispute` now sets `Booking.paymentStatus` to `REFUNDED` (+ `refundedAt`) on `RESOLVED_REFUND` instead of leaving it stale at `CAPTURED`/`PAYOUT_PENDING` — this was a known follow-up from the payout-eligibility fix below.
- Build/release prep: `@stripe/stripe-react-native` bumped `0.50.3` → `0.61.0`; `frontend/eas.json` gained a `submit.production.ios` block with an App Store Connect app id; `frontend/package.json`'s `ios`/`android` scripts switched from Expo Go (`expo start --ios`) to native dev-client builds (`expo run:ios`/`expo run:android`) — none of this has been verified end-to-end (no TestFlight submission or fresh device build confirmed yet).

To do next:

- Give admins a way to grant the `ADMIN` role to a user — currently DB/script-only, which blocks anyone from actually reaching the new admin dispute UI without direct database access.
- After-pickup refund policy beyond the dispute-resolution refund path.
- Broader automated integration tests around handoff race conditions, reviews, and notifications (payments/cancellation/disputes/webhooks/payout-release are now covered).
- Security hardening, rate limiting, abuse reporting, and operational monitoring.
- Verify the native build/release changes above actually produce a working TestFlight build, then complete production deployment and launch readiness.
- Swap the listing-location map off raw `tile.openstreetmap.org` tiles before real-world traffic (see location note above).

---

## Core User Flow

```text
Renter:
Search -> Message -> Request booking -> Optional insurance -> Payment authorization -> Pickup photos -> Zoink It -> Use item -> Return photos -> Zoink It -> Review

Owner:
List item -> Message renter -> Accept request -> Pickup photos -> Zoink It -> Rental active -> Return photos -> Zoink It -> Payout pending -> Review
```

Booking states:

```text
PENDING -> ACCEPTED -> PICKUP_PENDING -> ACTIVE -> RETURN_PENDING -> COMPLETED
PENDING -> DECLINED
PENDING / ACCEPTED / PICKUP_PENDING -> CANCELLED
```

Payment states:

```text
PENDING_AUTH
AUTHORIZED
CAPTURE_PENDING
CAPTURED
REFUND_PENDING
REFUNDED
PAYOUT_PENDING
PAID_OUT
FAILED
```

Dispute states (`Booking.disputeStatus` and `Dispute.status`):

```text
NONE
OPEN
UNDER_REVIEW
RESOLVED_REFUND
RESOLVED_NO_ACTION
DISMISSED
```

User roles (`User.role`, carried in the JWT):

```text
USER
ADMIN
```

---

## Week 7 Payments And Handoff

### Implemented Backend Behavior

- `Booking.version` is used for optimistic locking.
- Booking mutations and handoff taps run through Prisma transactions.
- Owner acceptance requires a Stripe account with payouts enabled.
- Local beta/dev can bypass full onboarding with `DEV_STRIPE_ACCOUNT_ID`. For `backend/.env.test`, this must be a real, fully-onboarded (`payouts_enabled: true`) Stripe Express test-mode Connect account — the accept-flow and cancellation integration tests call the live Stripe Connect API against it and fail fast with a clear error if it's unset, rather than silently falling back to a fake account id.
- Payment operations live in `backend/src/services/paymentService.ts`.
- Synchronized handoff logic lives in `backend/src/services/handoffService.ts`.
- Stripe webhook handling lives in `backend/src/middleware/controllers/stripeWebhookController.ts`.
- Reconciliation and cleanup/payout job helpers exist in:
  - `backend/src/services/reconciliationJob.ts`
  - `backend/src/services/cleanupJob.ts`
- Audit logs are stored in `booking_events`.
- The backend exposes:
  - `POST /bookings`
  - `GET /bookings/me`
  - `GET /bookings/requests`
  - `GET /bookings/:id`
  - `PATCH /bookings/:id/accept`
  - `PATCH /bookings/:id/decline`
  - `PATCH /bookings/:id/cancel`
  - `POST /bookings/:id/pickup/initiate`
  - `POST /bookings/:id/pickup/confirm`
  - `POST /bookings/:id/return/initiate`
  - `POST /bookings/:id/return/confirm`
  - `GET /bookings/:id/photos`
  - `POST /bookings/:id/photos` legacy-compatible handoff photo endpoint
  - `POST /bookings/:id/zoink-tap` legacy-compatible handoff confirmation endpoint
  - `GET /stripe/connect/status`
  - `POST /stripe/webhook` — see "Stripe Webhooks (local dev)" under Getting Started for the `stripe listen` command; forwarding to `/webhook` instead of `/stripe/webhook` is a common mistake and fails silently (every event 404s, but the CLI doesn't treat that as fatal).

### Disputes And Admin

- `Role` enum (`USER` / `ADMIN`) lives on `User` and is embedded in the signed JWT; `requireAdmin` middleware rejects non-admins with 403.
- User-facing dispute routes (auth + verified required):
  - `POST /disputes` — renter or owner opens a dispute (`reason`, `description`); rejected if an unresolved dispute already exists for that booking.
  - `GET /disputes` — the caller's own disputes.
  - `GET /disputes/:id` — dispute detail; admins or the booking's renter/owner only.
- Admin-only routes (auth + `requireAdmin` required):
  - `GET /admin/disputes` — list, optional `status` filter.
  - `GET /admin/disputes/:id` — detail with booking and user context.
  - `PATCH /admin/disputes/:id/resolve` — sets `RESOLVED_REFUND`, `RESOLVED_NO_ACTION`, or `DISMISSED`. `RESOLVED_REFUND` also issues a Stripe refund for the booking's total price. Every resolution runs in a transaction and writes a `DISPUTE_RESOLVED` `BookingEvent`.
- Dispute service logic lives in `backend/src/services/disputeService.ts`; routes/controllers in `backend/src/routes/disputes.ts` + `admin.ts` and `backend/src/middleware/controllers/disputeController.ts` + `adminController.ts`.
- Frontend now exists for both sides:
  - `FileDisputeScreen` (reason picker + description, min 10 characters) — reached from `BookingDetailScreen`'s "Report a Problem" action, `frontend/src/services/disputesApi.ts`.
  - `AdminDisputesScreen` (status-filterable list) and `AdminDisputeDetailScreen` (booking/photo context, refund/no-action/dismiss with required resolution notes) — reached from `MyProfileScreen`'s "Admin" panel, shown only when `user.role === 'ADMIN'`, `frontend/src/services/adminApi.ts`.
  - There's still no in-app way to make someone an admin in the first place — `User.role` has to be set directly in the database or via `prisma/seed.ts`-style scripting.

### Week 10 Stripe Connect, PaymentSheet, And Active Rentals

- Stripe Connect onboarding is started from the profile screen and returns through the app deep-link scheme `zoink://`.
- Connect account status exposes `connected`, `chargesEnabled`, `detailsSubmitted`, and `payoutsEnabled`.
- The profile screen shows not connected, under review/incomplete, and ready-to-accept-bookings payout states.
- Booking request submission creates the backend booking and PaymentIntent, initializes Stripe PaymentSheet with the returned `paymentClientSecret`, presents the sheet, and navigates to booking detail after success.
- PaymentSheet errors are shown inline and via alerts, and the submit action is disabled while payment setup or presentation is running.
- Active rentals are surfaced prominently for renters in bookings and for owners in My Listings.
- The Active Rental screen centralizes the live rental details, chat entry point, deposit information, and handoff/return actions.
- The Zoink It screen uses an outside-only pulse/ripple animation so the logo remains stable.
- PaymentSheet must be used in an EAS development or release build, not Expo Go.

```bash
cd frontend
npx eas-cli login
npx eas-cli build --profile development --platform ios
```

Use Stripe test card `4242 4242 4242 4242` with any future expiry and any 3-digit CVC.

### Cancellation Rules

- Before owner acceptance: authorization hold is released, no charge.
- After acceptance but before pickup: **no cancellation fee** — the authorization hold is fully released, same as pre-acceptance cancellation. This is a launch product decision, not a technical limitation: the original tiered fee logic (5% of total, minimum `$5.00`, capped at `$25.00`) is still implemented in `bookingService.calculateCancellationFeeCents()` but is currently unreachable behind an unconditional `return 0`, retained for a planned owner opt-in "cancellation fee" feature (following the same pattern as the existing per-listing `insuranceOptIn` toggle).
- After pickup: no automatic refund. Admin/support intervention required.

### Payout Rules

- Owner payout is held in `PAYOUT_PENDING` for `PAYOUT_HOLD_HOURS`.
- Default hold is 24 hours.
- Payout is blocked unless `Booking.disputeStatus` is `NONE` — note that this means a booking whose dispute was resolved (`RESOLVED_REFUND` / `RESOLVED_NO_ACTION` / `DISMISSED`) still won't release automatically, since `disputeStatus` isn't reset back to `NONE` after resolution.
- Once released, the backend creates a Stripe Transfer and marks the booking `PAID_OUT`.
- The release job (`releaseDuePayouts` in `cleanupJob.ts`) and stale-handoff cleanup now run automatically via `node-cron` inside `backend/src/index.ts` (cleanup every 15 minutes, payouts checked in the same job), and `reconciliationJob.ts` runs hourly — none of these require manual invocation outside of tests (`NODE_ENV=test` skips the cron registration).

### Local Smoke Test

You can test the whole Week 7 flow without the mobile app or two devices:

```bash
cd backend
npm.cmd run smoke:week7
```

The smoke test creates synthetic users, a listing, a booking, acceptance, pickup photos, synchronized pickup taps, return photos, synchronized return taps, and verifies the booking reaches:

```text
ACCEPTED -> ACTIVE -> COMPLETED
AUTHORIZED -> CAPTURE_PENDING -> PAYOUT_PENDING
```

It forces mock Stripe mode, so it does not charge a real card.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile frontend | React Native + Expo + TypeScript |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Image storage | Cloudinary |
| Email | AWS SES |
| Payments | Stripe |
| Push notifications | Expo Push Notifications |
| Gestures/animation | `react-native-gesture-handler`, `react-native-reanimated` + `react-native-worklets`, `react-native-zoom-toolkit` (pinch-to-zoom photo viewer) — versions pinned exactly to Expo SDK 54's compatible set; see "Native dependency versions" below before touching them |
| Scheduled jobs | `node-cron` (cleanup/payout release every 15 min, Stripe reconciliation hourly) |
| Integration testing | `supertest` + Node's built-in test runner against a real Postgres test DB and Stripe test mode |

---

## Getting Started

### Backend

```bash
cd backend
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
```

Backend health check:

```text
http://localhost:3000/health
```

### Stripe Webhooks (local dev)

```bash
stripe listen --forward-to localhost:3000/stripe/webhook
```

The path must be `/stripe/webhook`, **not** `/webhook` — the backend doesn't mount anything at `/webhook`, so events forwarded there get a `404` from every single event with no obvious error on the app side. This is easy to get wrong since Stripe's own docs/examples often default to `/webhook`. Symptoms of hitting the wrong path: `Booking.paymentStatus` stays stuck at `PENDING_AUTH` forever (the `payment_intent.amount_capturable_updated` event that flips it to `AUTHORIZED` never arrives), which then blocks owner acceptance with `'Payment authorization is not ready yet.'` even though Stripe shows the charge as succeeded. If this happens, fix the `--forward-to` path and use `stripe events resend <event_id>` (event IDs are visible in the `stripe listen` terminal output) to redeliver the missed events instead of re-doing the whole booking/payment flow.

### Frontend

```bash
cd frontend
npm install
npx expo start
```

Scan the QR code with Expo Go, or run on simulator/device from Expo.

### Native dependency versions (frontend)

This is an npm workspace (root `package.json` → `backend`, `frontend`, `packages/shared`), and `frontend/metro.config.js` sets `resolver.disableHierarchicalLookup = true` with a flat `nodeModulesPaths` (`frontend/node_modules`, root `node_modules`) — a deliberate choice for monorepo hygiene, but it means Metro can **only** see those two paths and never a package's own private nested `node_modules`. If npm ever gives a package (e.g. `react-native-reanimated`) a private nested copy of a dependency instead of hoisting it to the workspace root — which happens whenever two packages need incompatible versions of the same dependency — Metro cannot resolve it, even though Node itself could. This produced a real, hard-to-diagnose `NoSuchMethodError` this project hit once (`semver`: `@babel/core` wants `^6.x`, virtually everything else including `react-native-reanimated` wants `7.x`; resolved by adding `"semver": "7.8.5"` to the root `package.json`'s `overrides` block, unifying everyone onto one root-level copy).

Practical guidance when touching frontend native dependencies:
- Always run `npm install` from the **repo root**, not `npm install --workspace=frontend <pkg>` — the latter can leave a package nested under `frontend/node_modules` instead of hoisted to root, and that nested placement gets "baked into" `package-lock.json` and silently reproduced by every future `npm install` until the lockfile is regenerated from scratch.
- After any native dependency change, sanity-check: `ls frontend/node_modules` should not exist (or should be empty/near-empty) — anything showing up there is a sign of the hoisting problem above.
- Use `npx expo install <package>` (not plain `npm install`) to pick versions compatible with the current Expo SDK — but note it only pins the package you name; transitive dependencies with no explicit version (like `expo-font`, pulled in by `@expo/vector-icons` with an unbounded `>=` peer range) can still drift to an incompatible version and need an explicit pin of their own.
- If something goes wrong mid-dependency-change and `npm install` seems to "not take" a fix, don't fight it incrementally — `rm -rf node_modules frontend/node_modules backend/node_modules packages/shared/node_modules package-lock.json && npm install` from the root forces a fully fresh resolution rather than npm trying to preserve a possibly-corrupted existing lockfile structure.

---

## Environment Variables

Create `backend/.env`:

```env
DATABASE_URL="postgresql://youruser@localhost:5432/zoink"
JWT_SECRET="your-secret-key"
PORT=3000

ALLOWED_EMAIL_DOMAINS="utoronto.ca,mail.utoronto.ca,gmail.com,hotmail.com,uoguelph.ca"
OTP_EXPIRY_MINUTES=15

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
SES_FROM_EMAIL=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_CURRENCY=cad
DEV_STRIPE_ACCOUNT_ID=""
STRIPE_CONNECT_RETURN_URL=""
STRIPE_CONNECT_REFRESH_URL=""

PAYOUT_HOLD_HOURS=24
ZOINK_TAP_WINDOW_MS=300000
PLATFORM_COMMISSION_RATE=0.15
INSURANCE_RATE=0.03
MIN_INSURANCE_FEE=1
MAX_INSURANCE_FEE=50
```

For local frontend API access, create `frontend/.env`:

```env
EXPO_PUBLIC_API_URL="http://your-local-ip:3000"
```

**ngrok drift:** if you're testing on a real device through ngrok instead of a local IP, `EXPO_PUBLIC_API_URL` must point at the current ngrok tunnel and `backend/.env`'s `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL` must point at `<ngrok-url>/stripe-return` and `<ngrok-url>/stripe-refresh` respectively (these serve the HTML pages in `backend/src/index.ts` that redirect into the `zoink://` deep link — see `paymentService.ts`'s `getStripeConnectRedirectUrl`). ngrok issues a new URL every session, so **all three** of these need updating (and the backend restarted) each time the tunnel restarts — not just `EXPO_PUBLIC_API_URL`. If `STRIPE_CONNECT_RETURN_URL`/`REFRESH_URL` are left unset, Stripe Connect onboarding (`POST /users/me/stripe-connect/onboard`) fails outright rather than degrading gracefully, since Stripe's API rejects the code's fallback `zoink://` URI scheme as an invalid `return_url`/`refresh_url`.

For frontend demo mode:

```env
EXPO_PUBLIC_DEMO_MODE=true
```

For backend integration tests, create a separate `zoink_test` Postgres database and a `backend/.env.test` pointed at it (see `backend/src/integration-tests/README.md`). `backend/.env.test` is listed in `.gitignore` alongside `backend/.env` and `frontend/.env` — still, only `sk_test_...` Stripe keys should ever live there. `DEV_STRIPE_ACCOUNT_ID` in `.env.test` must be a real, fully-onboarded (`payouts_enabled: true`) Stripe Express test-mode Connect account id — the accept-flow and cancellation integration tests make live Stripe Connect API calls against it and fail immediately with a clear error if it's missing.

---

## Project Structure

```text
Zoink/
  backend/
    prisma/
      migrations/
      schema.prisma
    src/
      middleware/
        controllers/
      routes/
      scripts/
      services/
      utils/
  frontend/
    src/
      components/
      config/
      context/
      navigation/
      screens/
      services/
      theme/
      types/
```

---

## Verification Commands

Backend:

```bash
cd backend
npm.cmd run build
npm.cmd test
npx.cmd prisma validate
npm.cmd run smoke:week7
npm.cmd run test:integration
```

`test:integration` requires a running `zoink_test` Postgres database with migrations applied and a `backend/.env.test` file (see `backend/src/integration-tests/README.md`). The `20260721000000_add_role_and_disputes` migration's ordering bug (an `ALTER TABLE "disputes"` that ran before `CREATE TABLE "disputes"`, failing `prisma migrate deploy` on a fresh database) is now fixed directly in `migration.sql`; the old `apply_to_test_db.sql` workaround is obsolete and kept only for historical reference.

Frontend:

```bash
cd frontend
npx.cmd tsc --noEmit
```

---

## Build Plan Status

| Phase | Focus | Status |
|---|---|---|
| 1 | Project setup, backend structure, frontend navigation shell | Done |
| 2 | Authentication and protected routes | Done |
| 3 | Profiles and verification | Done |
| 4 | Listings and photo uploads | Done |
| 5 | Browse/search/filtering | Done |
| 6 | Booking requests and messaging | Done |
| 7 | Payments, insurance, audit logs, synchronized handoff | Done |
| 8 | Reviews and reputation | Done |
| 9 | Push notifications and UI polish | Done |
| 10 | Stripe Connect onboarding, real payment UX, active rentals | Done |
| 11 | Admin/disputes backend + frontend, integration testing, security hardening | Backend and frontend admin/disputes done (no UI to grant the admin role yet); integration tests expanded (payout release now covered); security hardening upcoming |
| 12 | Deployment, TestFlight, production readiness | In progress — EAS submit config and native (non-Expo-Go) build scripts added, not yet verified end-to-end |

---

## Key Architecture Decisions

- Backend is the source of truth for booking state, pricing, payment status, and handoff state.
- Payment API calls are made synchronously, but final payment state is webhook-driven.
- All critical booking transitions use transaction checks against `Booking.version`.
- `BookingEvent` provides immutable audit logs for payment, handoff, webhook, reconciliation, dispute, and error events.
- Local development can run in mock Stripe mode by leaving `STRIPE_SECRET_KEY` empty.
- Real beta/prod requires Stripe Connect onboarding with payouts enabled before owners can accept bookings.
- Stripe native payment collection requires an EAS development or release build; it will not work in Expo Go.
- Messaging currently uses polling, which is simpler for MVP and can be upgraded later. Read state is tracked per participant (`Conversation.renterLastReadAt`/`ownerLastReadAt`), set via `POST /conversations/:id/read`, rather than inferring "unread" from who sent the last message.
- Authorization is role-based (`User.role`, `USER` / `ADMIN`), read from the JWT and enforced with `requireAdmin`; the admin frontend now exists (dispute review/resolution), but granting the role itself still requires calling the database or seed script directly.
- Disputes are modeled as their own `Dispute` records (not just a status flag) so a booking has an auditable history of who raised what and how it was resolved.

---

## Near-Term Roadmap

1. Add a way to grant/revoke the `ADMIN` role from within the app (or at least an internal tool), and extend the dispute-resolution refund path to broader after-pickup refund/intervention cases.
2. Expand automated integration tests for handoff timing, review obligations, and notification delivery (payment lifecycle, cancellation, disputes, webhooks, and payout release now have integration coverage).
3. Add security hardening: rate limits, abuse reporting, stronger validation, audit review tools, and operational monitoring.
4. Prepare production deployment infrastructure and environment separation.
5. Verify the in-progress native build changes (EAS submit config, `expo run:ios`/`run:android` scripts, Stripe SDK bump) actually produce a working build, then complete TestFlight/release readiness checks.
6. Move the listing-location map off raw OpenStreetMap tiles onto a provider suitable for production traffic before launch.

---

Built as a student MVP. Users are verified through university email today; stronger ID verification and support workflows can be layered in as the platform matures.
