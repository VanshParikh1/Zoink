# Zoink

### A peer-to-peer rental marketplace for students

Zoink helps university students rent useful things from nearby students instead of buying items they only need temporarily. Think cameras, speakers, tools, sports gear, and event equipment, with verification, messaging, payments, and handoff protection built into the rental flow.

The project is in active MVP development. The core marketplace, booking, messaging, reviews, push notifications, backend payment lifecycle, optional checkout insurance, photo-verified synchronized handoff flow, Stripe Connect onboarding, PaymentSheet booking flow, active rental UX, and a backend admin/dispute API are implemented through Week 10. The remaining major work is an admin/support UI, broader automated testing coverage, security hardening, production deployment, and release-build readiness.

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
- Backend admin/dispute system:
  - `Role` (`USER` / `ADMIN`) added to `User`, carried in the JWT, and enforced by `requireAdmin`.
  - Renter or owner can open a dispute on a booking (`POST /disputes`) with a reason and description; one open dispute per booking at a time.
  - Admins list, inspect, and resolve disputes (`GET /admin/disputes`, `GET /admin/disputes/:id`, `PATCH /admin/disputes/:id/resolve`).
  - Resolving with `RESOLVED_REFUND` triggers a Stripe refund of the booking automatically; all resolutions are transactional and logged as `BookingEvent`s.
  - Cleanup and reconciliation jobs are now actually scheduled with `node-cron` (cleanup every 15 minutes, reconciliation hourly) — no longer manual-only.
- Backend integration test suite (`backend/src/integration-tests/`) using `supertest` against a real Postgres test database and Stripe test mode, covering booking lifecycle, cancellation, disputes, and Stripe webhooks — now running against a real Stripe Connect test account (`DEV_STRIPE_ACCOUNT_ID`) instead of a fake account id, and with cancellation payment handling fully awaited (no longer fire-and-forget) so the audit-log write always completes before the request returns.
- Cancellation fees disabled for launch as a product decision — cancelling an accepted booking now fully releases the payment hold with no fee, instead of the previous tiered 5%/$5–$25 fee. See Cancellation Rules below.

To do next:

- Admin/support UI (no frontend dispute-filing or admin dashboard screens exist yet; the backend API is implemented — see above).
- After-pickup refund policy beyond the dispute-resolution refund path.
- Broader automated integration tests around handoff race conditions, reviews, and notifications (payments/cancellation/disputes/webhooks are now covered).
- Security hardening, rate limiting, abuse reporting, and operational monitoring.
- Production deployment, TestFlight/release builds, and launch readiness.

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
  - `POST /stripe/webhook` (also mounted at `POST /api/stripe/webhook`)

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
- No frontend screens exist yet for filing or resolving disputes — this is currently a backend-only, API-level feature.

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

### Frontend

```bash
cd frontend
npm install
npx expo start
```

Scan the QR code with Expo Go, or run on simulator/device from Expo.

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
STRIPE_CURRENCY=usd
DEV_STRIPE_ACCOUNT_ID=""

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

For frontend demo mode:

```env
EXPO_PUBLIC_DEMO_MODE=true
```

For backend integration tests, create a separate `zoink_test` Postgres database and a `backend/.env.test` pointed at it (see `backend/src/integration-tests/README.md`). **`backend/.env.test` is not currently listed in `.gitignore`** (only `backend/.env` and `frontend/.env` are) — treat any keys in it as exposed and avoid putting live Stripe keys there; use `sk_test_...` values only. `DEV_STRIPE_ACCOUNT_ID` in `.env.test` must be a real, fully-onboarded (`payouts_enabled: true`) Stripe Express test-mode Connect account id — the accept-flow and cancellation integration tests make live Stripe Connect API calls against it and fail immediately with a clear error if it's missing.

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

`test:integration` requires a running `zoink_test` Postgres database with migrations applied and a `backend/.env.test` file (see `backend/src/integration-tests/README.md`). Note the `20260721000000_add_role_and_disputes` migration's generated `migration.sql` alters the `disputes` table's `status` column before that table is created, so it fails on a fresh database with `prisma migrate deploy`; `backend/prisma/migrations/20260721000000_add_role_and_disputes/apply_to_test_db.sql` is a manually reordered version used to seed the test DB until the migration itself is fixed.

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
| 11 | Admin/disputes backend, integration testing, security hardening | Backend admin/disputes and integration tests done; admin/support UI and security hardening upcoming |
| 12 | Deployment, TestFlight, production readiness | Upcoming |

---

## Key Architecture Decisions

- Backend is the source of truth for booking state, pricing, payment status, and handoff state.
- Payment API calls are made synchronously, but final payment state is webhook-driven.
- All critical booking transitions use transaction checks against `Booking.version`.
- `BookingEvent` provides immutable audit logs for payment, handoff, webhook, reconciliation, dispute, and error events.
- Local development can run in mock Stripe mode by leaving `STRIPE_SECRET_KEY` empty.
- Real beta/prod requires Stripe Connect onboarding with payouts enabled before owners can accept bookings.
- Stripe native payment collection requires an EAS development or release build; it will not work in Expo Go.
- Messaging currently uses polling, which is simpler for MVP and can be upgraded later.
- Authorization is role-based (`User.role`, `USER` / `ADMIN`), read from the JWT and enforced with `requireAdmin`; there is no admin frontend yet, so admin actions currently require calling the API directly.
- Disputes are modeled as their own `Dispute` records (not just a status flag) so a booking has an auditable history of who raised what and how it was resolved.

---

## Near-Term Roadmap

1. Build an admin/support UI on top of the existing dispute API, and extend the dispute-resolution refund path to broader after-pickup refund/intervention cases.
2. Expand automated integration tests for handoff timing, review obligations, and notification delivery (payment lifecycle, cancellation, disputes, and webhooks now have integration coverage).
3. Add security hardening: rate limits, abuse reporting, stronger validation, audit review tools, and operational monitoring.
4. Prepare production deployment infrastructure and environment separation.
5. Build TestFlight/release builds and complete production readiness checks.

---

Built as a student MVP. Users are verified through university email today; stronger ID verification and support workflows can be layered in as the platform matures.
