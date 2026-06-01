# Zoink

### A peer-to-peer rental marketplace for students

Zoink helps university students rent useful things from nearby students instead of buying items they only need temporarily. Think cameras, speakers, tools, sports gear, and event equipment, with verification, messaging, payments, and handoff protection built into the rental flow.

The project is in active MVP development. The core marketplace, booking, messaging, reviews, push notifications, backend payment lifecycle, optional checkout insurance, photo-verified synchronized handoff flow, Stripe Connect onboarding wiring, and PaymentSheet booking flow are implemented. The remaining major work is end-to-end Stripe sandbox testing on a development build, webhook validation with real Stripe CLI secrets, production hardening, and deployment.

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
  - Pickup photos.
  - Return photos.
  - Owner/renter synchronized `Zoink It` taps within a configurable 5-second window.
  - Pickup transition to `ACTIVE`.
  - Return transition to `COMPLETED`.
- Backend-only Week 7 smoke test for payment and handoff flows without needing two devices.
- Week 10 Stripe integration wiring:
  - Stripe Connect account-link onboarding uses `zoink://stripe-return` and `zoink://stripe-refresh` deep links.
  - Profile payout status refreshes when the app returns active after Stripe onboarding.
  - Owner acceptance requires `payoutsEnabled`, not only a saved Stripe account id.
  - PaymentSheet is wired in the renter booking flow with inline error display, loading protection, and billing details.
  - `frontend/eas.json` includes a development build profile for testing Stripe native modules outside Expo Go.

Still in progress:

- Full Stripe sandbox end-to-end testing with real test cards, webhooks, and connected accounts.
- Installing/running an EAS iOS development build after Expo account login.
- Admin/support tooling for disputes, after-pickup refunds, and manual intervention.
- Production deployment and release builds.

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
PENDING -> ACCEPTED -> ACTIVE -> COMPLETED
PENDING -> DECLINED
PENDING / ACCEPTED -> CANCELLED
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

Dispute states:

```text
NONE
OPEN
RESOLVED
```

---

## Week 7 Payments And Handoff

### Implemented Backend Behavior

- `Booking.version` is used for optimistic locking.
- Booking mutations and handoff taps run through Prisma transactions.
- Owner acceptance requires a Stripe account with payouts enabled.
- Local beta/dev can bypass full onboarding with `DEV_STRIPE_ACCOUNT_ID`.
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
  - `POST /bookings/:id/photos`
  - `POST /bookings/:id/zoink-tap`
  - `GET /stripe/connect/status`
  - `POST /stripe/webhook`

### Week 10 Stripe Connect And PaymentSheet

- Stripe Connect onboarding is started from the profile screen and returns through the app deep-link scheme `zoink://`.
- Connect account status exposes `connected`, `chargesEnabled`, `detailsSubmitted`, and `payoutsEnabled`.
- The profile screen shows not connected, under review/incomplete, and ready-to-accept-bookings payout states.
- Booking request submission creates the backend booking and PaymentIntent, initializes Stripe PaymentSheet with the returned `paymentClientSecret`, presents the sheet, and navigates to booking detail after success.
- PaymentSheet errors are shown inline and via alerts, and the submit action is disabled while payment setup or presentation is running.
- PaymentSheet must be tested in an EAS development build, not Expo Go.

```bash
cd frontend
npx eas-cli login
npx eas-cli build --profile development --platform ios
```

Use Stripe test card `4242 4242 4242 4242` with any future expiry and any 3-digit CVC.

### Cancellation Rules

- Before owner acceptance: authorization hold is released, no charge.
- After acceptance but before pickup: 5% cancellation fee, minimum `$5.00`, capped at `$25.00`.
- After pickup: no automatic refund. Admin/support intervention required.

### Payout Rules

- Owner payout is held in `PAYOUT_PENDING` for `PAYOUT_HOLD_HOURS`.
- Default hold is 24 hours.
- Payout is blocked if a dispute is open.
- Once released, the backend creates a Stripe Transfer and marks the booking `PAID_OUT`.

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
ZOINK_TAP_WINDOW_MS=5000
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
```

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
| 10 | Stripe Connect onboarding and real payment UX | Wired; sandbox/device validation next |
| 11 | Admin/disputes, testing, security hardening | Upcoming |
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

---

## Near-Term Roadmap

1. Install and run the EAS iOS development build after Expo account login.
2. Test PaymentSheet on device with Stripe test cards.
3. Test complete Stripe sandbox flow with webhooks and connected accounts.
4. Add admin/support dispute tooling.
5. Expand automated integration tests for Week 7 race conditions.
6. Prepare production deployment and TestFlight builds.

---

Built as a student MVP. Users are verified through university email today; stronger ID verification and support workflows can be layered in as the platform matures.
