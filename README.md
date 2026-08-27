# Zoink

### A peer-to-peer rental marketplace for students

Zoink helps university students rent useful things from nearby students instead of buying items they only need temporarily — cameras, speakers, tools, sports gear, event equipment — with verification, messaging, payments, deposit protection, and a photo-verified handoff built into the rental flow.

The project is in active MVP development. The marketplace, the full booking → pay → handoff → payout lifecycle, messaging with real per-user read tracking, reviews, push notifications, Stripe Connect onboarding, a separately-authorized security deposit, 13% HST, tiered commission, a dispute-filing/resolution flow (renter/owner + admin), abuse reporting (listings and users), rate limiting, error tracking, and a neobrutalist app-wide design system are all implemented. Remaining major work: broader automated test coverage, production deployment, and TestFlight/release readiness.

---

## Current Status

### Completed

**Accounts & verification**

- JWT-protected routes; bcrypt password hashing.
- University email OTP verification and verified-only marketplace access.
- Phone number required at registration — 10-digit Canadian/NANP, accepts common formats (`(416) 555-0192`), normalized to `+1XXXXXXXXXX` before storage. `User.phone` is `NOT NULL`.
- User profiles, public profile surfaces, avatars, reputation, and review summaries.

**Listings & discovery**

- Listings with photos, categories, daily pricing, item value, an owner-configured security deposit, and real device-GPS location.
- `depositAmount` is owner-set per listing (optional, defaults to `0`). If a deposit is set, `itemValue` is required and the deposit cannot exceed it.
- Location step uses `expo-location` GPS with a draggable/pinch-zoom map (`LocationMapPreview` → `LocationMapModal`), tiles from MapTiler (`EXPO_PUBLIC_MAPTILER_API_KEY`) with a raw-OSM fallback for local dev only. `MapAttribution` switches its label to match whichever provider is serving.
- Browse/search with geo-distance, category, price, and availability filtering. The browse endpoint returns an `{ items, meta: { total, offset, limit, hasMore } }` envelope.

**Messaging**

- In-app conversations with real per-participant read tracking (`Conversation.renterLastReadAt` / `ownerLastReadAt`), cleared via `POST /conversations/:id/read` on thread open and on every poll tick while focused — not inferred from who sent the last message.
- The optional message on a booking request is posted as the first `Message` in that listing/renter conversation. `Booking.message` no longer exists as a column.

**Booking → payment → handoff → payout**

- Booking states: `PENDING → ACCEPTED → CONFIRMED → PICKUP_PENDING → ACTIVE → RETURN_PENDING → COMPLETED` (plus `DECLINED` / `CANCELLED`). See "Booking Lifecycle" below.
- **Accepting no longer takes payment.** The owner just needs Stripe payouts enabled, and the dates must not overlap a `CONFIRMED`/`ACTIVE` booking. Accepting a request auto-declines any other still-`PENDING` request on the same listing that overlaps those dates; auto-declined requests do not revive if the accepted one is later cancelled.
- **Payment happens at `ACCEPTED → CONFIRMED`**, on the `Pay` screen: the renter creates the rental PaymentIntent (`POST /bookings/:id/payment-intent`), pays through Stripe PaymentSheet, then confirms (`PATCH /bookings/:id/confirm`). On confirm the backend authorizes the **security deposit as its own off-session PaymentIntent**, reusing the card just saved. If the deposit authorization fails, the rental PaymentIntent is cancelled and the booking stays `ACCEPTED` so the renter can retry — a booking never becomes `CONFIRMED` with only the rental secured.
- While a booking sits `ACCEPTED`-unpaid, the renter sees a "payment needed" badge in the inbox row and a banner in the conversation thread (`Conversation.acceptedUnpaidBookingId`), both linking straight to `Pay`.
- Rentals are capped at **7 days** (`MAX_RENTAL_DAYS`) — card-network authorization holds are only reliably valid for about a week.
- Photo-verified synchronized handoff ("Zoink It"): pickup is initiated by the owner from `CONFIRMED`, return by the renter from `ACTIVE`; each phase needs 2–3 photos and both parties tapping within `ZOINK_TAP_WINDOW_MS`. Synchronized pickup → `ACTIVE` and captures the rental PaymentIntent; synchronized return → `COMPLETED` → `PAYOUT_PENDING` and creates review obligations. Re-submitting photos before the phase confirms does not re-notify or re-transition. Listing and handoff photos open in a full-screen pinch-zoom viewer (`PhotoViewerScreen`).
- Owner payout is held in `PAYOUT_PENDING` for `PAYOUT_HOLD_HOURS` (default 24), then released as a Stripe Transfer by the cleanup job — unless the booking has an unresolved dispute or was resolved `RESOLVED_REFUND` (see "Payout Rules").
- The cleanup/reconciliation jobs run on `node-cron`: stale-handoff cleanup + payout release + deposit release every 15 minutes, Stripe reconciliation hourly (all skipped when `NODE_ENV=test`).

**Pricing**

- **13% Ontario HST** on the rental price only — not the deposit (a hold, not a sale) and not insurance. Charged on top of what the renter pays; never subtracted before commission/payout, so it has no effect on owner earnings. Snapshotted as `Booking.hstAmount` at request time. There is no per-listing jurisdiction field yet, so it applies to every booking. (`HST_RATE` is a hardcoded constant in `paymentService.ts`, not an env var.)
- **Tiered platform commission** keyed on the listing's **daily** rate: ≤ $20/day → 15%, ≤ $50/day → 12.5%, otherwise 10%. Looked up once at request time and applied to the full rental total; never recomputed per day. `ownerPayout = totalPrice − commission`. (`COMMISSION_TIERS` is hardcoded in `paymentService.ts`; `PLATFORM_COMMISSION_RATE` is no longer used.)
- Optional per-listing checkout insurance fee, derived from `itemValue` and clamped by `INSURANCE_RATE` / `MIN_INSURANCE_FEE` / `MAX_INSURANCE_FEE`.

**Security deposit lifecycle** (`Booking.depositStatus`: `AUTHORIZED` / `CAPTURED` / `RELEASED`)

- Authorized at `CONFIRMED` as its own manual-capture, off-session PaymentIntent (`stripeDepositPaymentIntentId`), so it stays held through the whole rental rather than being released as a side effect of the rental capture at pickup.
- Auto-**released** 24 hours after completion (`DEPOSIT_HOLD_HOURS`, `cleanupJob.releaseDueDeposits`) if no dispute is open.
- A dispute filed against a `COMPLETED` booking resolves **against the deposit**: `RESOLVED_REFUND` with a charge captures part or all of the hold (damage found) and transfers it to the owner **in full, no commission cut** (`transferDepositCompensation`); `RESOLVED_REFUND` with no charge cancels the hold (no damage). A manual-capture PaymentIntent can only be captured once, so only the first dispute can resolve the deposit.

**Disputes** (renter/owner + admin)

- `POST /disputes` — renter or owner opens a dispute with `reason` + `description` (10–1000 chars); one unresolved dispute per booking. On a `COMPLETED` booking the dispute must be filed within `DISPUTE_WINDOW_HOURS` (24) of completion, and is rejected if the deposit was already resolved by a prior dispute.
- `GET /disputes` (own) and `GET /disputes/:id` (admin or booking participant).
- Admin: `GET /admin/disputes` (optional `status` filter), `GET /admin/disputes/:id`, `PATCH /admin/disputes/:id/resolve` → `RESOLVED_REFUND` / `RESOLVED_NO_ACTION` / `DISMISSED`, with an optional `refundAmountCents`. Also `GET /admin/bookings/:id/events` for the audit trail.
- `resolveDispute` runs as one transaction holding `SELECT … FOR UPDATE` on the booking. The over-refund guard checks the **remaining refundable balance** (booking total minus prior refunds), not the raw total, so sequential partial refunds are safe. Post-capture a partial refund is allowed; pre-capture only a full refund (cancels the authorization). Refund idempotency is keyed on the dispute id. A pre-completion `RESOLVED_REFUND` also sets `Booking.paymentStatus = REFUNDED` + `refundedAt`.
- Frontend: `FileDisputeScreen` (from `BookingDetailScreen`'s "Report a Problem", shown while the booking is `ACTIVE`/`PICKUP_PENDING`/`RETURN_PENDING`/`COMPLETED` with no active dispute), an in-progress banner, and the resolved outcome. `AdminDisputesScreen` + `AdminDisputeDetailScreen` (booking/photo context, refund/no-action/dismiss with required notes, refund amount capped against `depositAmount` for a `COMPLETED` booking) from `MyProfileScreen`'s "Admin" panel.

**Abuse reports** (listings and users — distinct from disputes, which are booking-specific)

- `POST /reports` — `targetType` (`USER` / `LISTING`), `targetId`, `reason` (`SPAM` / `SCAM` / `INAPPROPRIATE` / `HARASSMENT` / `OTHER`), optional `description`. You can't report yourself or your own listing. `targetId` is a polymorphic pointer with no FK, so a report can outlive its target.
- Admin: `GET /admin/reports` (optional `status`), `PATCH /admin/reports/:id` → `REVIEWED` / `DISMISSED` + `adminNotes`. The list resolves each `targetId` to a human-readable label (`[deleted listing]` / `[deleted user]` when gone).
- Frontend: `FileReportScreen` (from `ListingDetailScreen`'s "Report" link and `PublicProfileScreen`'s "Report this user"); `AdminReportsScreen` from `MyProfileScreen`'s "Admin" panel.

**Reviews & reputation**

- After a completed rental, both parties get a review obligation; the app gates on pending reviews at launch.
- Three 1–5 person-directed scores per side. The borrower reviewer (`RENTER`) additionally rates the **item itself** (`itemRating` 1–5 + optional `itemNotes`); the lender reviewer (`LENDER`) leaves free-text `personNotes` about the renter instead. The two are mutually exclusive and enforced from the obligation's real role, not client input. The lender's third score category is labelled "Pickup Experience". (`reviews.comment` was dropped.)

**Platform hardening**

- `helmet`, `cors`, and `trust proxy 1` on the Express app.
- Rate limiting (`express-rate-limit`, in-memory): a tight limiter on `/auth/*` (10 requests / 15 min) and a blanket limiter everywhere else (300 / 15 min), keyed by IP **and** user id so one authenticated abuser can't burn a shared campus-WiFi IP's quota. `/stripe/webhook` is exempt.
- Error tracking: Sentry on the backend (`backend/src/instrument.ts`, sensitive keys scrubbed, skipped in test) and the frontend (`@sentry/react-native` in `App.tsx`). DSN-only; source-map upload not configured yet.
- Zod v4 request validation on every route with a body/params/query; a centralized error handler maps `ZodError` → 400 `{ error, issues[] }` and `AppError` subclasses → their status.
- Stripe client secrets are no longer persisted in the `BookingEvent` audit trail.

**Admin role**

- `User.role` (`USER` / `ADMIN`) is embedded in the JWT and enforced by `requireAdmin`. The frontend decodes `role` into `AuthContext.user` and shows the "Admin" panel only for admins.
- Granting/revoking the role is **CLI-only** — `npm run admin:grant -- --email=…` / `npm run admin:revoke -- --email=…` (see "Managing the Admin Role"). There is still no in-app UI for it.

**Design system**

- App-wide neobrutalist / flat-card language matched to the landing page: one type scale, a radius scale, a solid offset "block" shadow (`HardBlock`, since RN's native shadow always renders soft), a green gradient + triangle-texture screen background (`ScreenBackground`), all in `frontend/src/theme/colors.ts`. New shared components: `HardBlock`, `DismissKeyboardView`, `PaymentNeededBadge`, `LocationMapPreview`, `LocationMapModal`, `MapAttribution`. `DraggableLocationMap` was removed.

**Tests**

- Unit tests across services, middleware, controllers, and scripts (`npm test`).
- Integration tests (`npm run test:integration`) against a real `zoink_test` Postgres DB + Stripe test mode: `bookingLifecycle`, `bookingCancellation`, `bookingFullFlow` (the new accept → pay → confirm → handoff flow), `bookingListingSortOrder`, `disputeResolution`, `payoutRelease`, `reportFlow`, `stripeWebhooks`.
- `packages/shared` holds Prisma-generated TypeScript interfaces (`packages/shared/generated/prisma-models.ts`) and hand-written response DTOs (`packages/shared/src/dto.ts`); the frontend's `src/types/index.ts` re-exports from `@zoink/shared` so API shapes can't silently drift.

### To do next

- Give admins an in-app (or at least internal-tool) way to grant/revoke the `ADMIN` role — still CLI-only.
- Automatic handling of the owner's remaining payout after a **partial** dispute refund (currently a manual admin action; `Dispute.refundAmountCents` records what went back to the renter).
- Broader integration coverage: handoff race conditions (true concurrent confirms), review obligations, notification delivery.
- `backend/src/scripts/week7SmokeFlow.ts` still walks the pre-rework path (`ACCEPTED` straight into pickup) and needs updating for the `CONFIRMED` step.
- Production deployment infra, environment separation, operational monitoring.
- Confirm a working TestFlight build, then finish release readiness.

---

## Booking Lifecycle

```text
Renter:
Search → Message → Request booking (optional insurance) → [owner accepts]
  → Pay (rental PaymentIntent + PaymentSheet + deposit authorized) → CONFIRMED
  → Pickup photos → Zoink It → use item → Return photos → Zoink It → Review

Owner:
List item → Message renter → Accept request (no payment) → [renter pays] → CONFIRMED
  → Pickup photos → Zoink It → rental ACTIVE → Return photos → Zoink It
  → payout held → payout released → Review
```

Booking states (`BookingStatus`):

```text
PENDING → ACCEPTED → CONFIRMED → PICKUP_PENDING → ACTIVE → RETURN_PENDING → COMPLETED
PENDING → DECLINED           (also: overlap auto-decline on accept)
PENDING / ACCEPTED / CONFIRMED / PICKUP_PENDING → CANCELLED
```

Payment states (`PaymentStatus`):

```text
PENDING_AUTH → AUTHORIZED → CAPTURE_PENDING → CAPTURED → PAYOUT_PENDING → PAID_OUT
REFUND_PENDING → REFUNDED
FAILED
```

Deposit states (`Booking.depositStatus` — the deposit's own PaymentIntent):

```text
AUTHORIZED → CAPTURED   (dispute found damage; transferred to owner in full)
AUTHORIZED → RELEASED   (auto-release 24h after completion, or dispute found no damage)
```

Dispute states (`Booking.disputeStatus` and `Dispute.status`):

```text
NONE → OPEN → UNDER_REVIEW → RESOLVED_REFUND | RESOLVED_NO_ACTION | DISMISSED
```

Report states (`Report.status`): `OPEN → REVIEWED | DISMISSED`

User roles (`User.role`, carried in the JWT): `USER`, `ADMIN`

---

## Payments, Handoff & Disputes

### Backend behavior

- `Booking.version` drives optimistic locking; booking mutations and handoff taps run inside Prisma transactions with a `version`-guarded `updateMany`.
- Owner acceptance requires a Stripe account with **payouts enabled** (`DEV_STRIPE_ACCOUNT_ID` bypasses full onboarding in dev/beta; never in `production`).
- Payment services: `backend/src/services/paymentService.ts` (rental + deposit PaymentIntents, capture/cancel/refund, transfers, commission/HST/insurance math, Connect onboarding/status).
- Handoff: `backend/src/services/handoffService.ts`.
- Disputes: `backend/src/services/disputeService.ts`. Reports: `backend/src/services/reportService.ts`.
- Stripe webhooks: `backend/src/middleware/controllers/stripeWebhookController.ts`.
- Jobs: `backend/src/services/cleanupJob.ts` (`cleanupStaleHandoffs`, `releaseDuePayouts`, `releaseDueDeposits`), `backend/src/services/reconciliationJob.ts`.
- Audit trail: `booking_events` (`BookingEvent`), plus `GET /admin/bookings/:id/events`.

### Booking & handoff routes

```text
POST   /bookings
GET    /bookings/me
GET    /bookings/requests
GET    /bookings/:id
PATCH  /bookings/:id/accept
POST   /bookings/:id/payment-intent      # renter: create rental PaymentIntent
PATCH  /bookings/:id/confirm             # renter: confirm payment → CONFIRMED (+ deposit auth)
PATCH  /bookings/:id/decline
PATCH  /bookings/:id/cancel
PATCH  /bookings/:id/activate            # legacy-compatible
PATCH  /bookings/:id/complete            # legacy-compatible
POST   /bookings/:id/pickup/initiate
POST   /bookings/:id/pickup/confirm
POST   /bookings/:id/return/initiate
POST   /bookings/:id/return/confirm
GET    /bookings/:id/photos
POST   /bookings/:id/photos              # legacy-compatible handoff photos
POST   /bookings/:id/photos/upload       # multipart image → Cloudinary URL
POST   /bookings/:id/zoink-tap           # legacy-compatible handoff confirmation
GET    /stripe/connect/status
POST   /stripe/webhook                   # see "Stripe Webhooks (local dev)"
```

### Dispute & report routes

```text
POST   /disputes
GET    /disputes
GET    /disputes/:id
POST   /reports

GET    /admin/disputes            ?status=
GET    /admin/disputes/:id
PATCH  /admin/disputes/:id/resolve
GET    /admin/bookings/:id/events
GET    /admin/reports             ?status=
PATCH  /admin/reports/:id
```

Admin routes are gated by `requireAuth` + `requireAdmin`.

### Cancellation rules

- Before acceptance, or after acceptance but before payment (`PENDING` / `ACCEPTED`): no PaymentIntent exists yet, so nothing is charged or released — the Stripe call is skipped entirely.
- After payment (`CONFIRMED`), before pickup: **no cancellation fee** — the rental authorization hold is fully released. This is a launch product decision, not a limitation: `bookingService.calculateCancellationFeeCents()` still contains the tiered logic (5% of total, min $5, max $25) behind an unconditional `return 0`, retained for a planned owner opt-in "cancellation fee" toggle.
- After pickup: no automatic refund — admin/dispute intervention.

### Payout rules

- Held in `PAYOUT_PENDING` for `PAYOUT_HOLD_HOURS` (default 24) after `completedAt`.
- `releaseDuePayouts` pays out when `disputeStatus` is `NONE`, `RESOLVED_NO_ACTION`, or `DISMISSED`. `RESOLVED_REFUND` is excluded — including partial refunds; the job never recomputes `ownerPayout`, so any remaining owner share after a partial refund is a manual admin action (use `Dispute.refundAmountCents`). `OPEN` / `UNDER_REVIEW` stay blocked until resolved.
- Once released, a Stripe Transfer is created and the booking is marked `PAID_OUT`.

### Local smoke test

```bash
cd backend
npm run smoke:week7
```

Runs a backend-only users → listing → booking → handoff flow in forced mock-Stripe mode. **Note:** this script has not been updated for the `ACCEPTED → CONFIRMED` payment step and currently walks the older path — see "To do next".

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile frontend | React Native 0.81 + Expo SDK 54 + TypeScript, React 19 |
| Navigation | `@react-navigation/native` + `native-stack` |
| Backend API | Node.js + Express 5 + TypeScript |
| Database | PostgreSQL + Prisma 7 (`@prisma/adapter-pg` + `pg`) |
| Shared types | `packages/shared` — Prisma-generated interfaces + response DTOs, consumed as `@zoink/shared` |
| Validation | Zod v4 (`src/schemas/*.schema.ts` + `src/middleware/validate.ts`) |
| Image storage | Cloudinary (via `multer` memory storage) |
| Email | AWS SES |
| Payments | Stripe (rental + separate deposit PaymentIntents, Connect transfers) |
| Push notifications | Expo Push Notifications |
| Maps | Hand-rolled slippy-map tiles (`src/utils/mapTiles.ts`) over MapTiler raster tiles, OSM fallback; no map SDK |
| Gestures/animation | `react-native-gesture-handler`, `react-native-reanimated` + `react-native-worklets`, `react-native-zoom-toolkit` — versions pinned to Expo SDK 54's set (see "Native dependency versions") |
| Scheduled jobs | `node-cron` (cleanup/payout/deposit every 15 min, reconciliation hourly) |
| Hardening | `helmet`, `express-rate-limit` |
| Error tracking | Sentry (`@sentry/node` backend, `@sentry/react-native` frontend) |
| Testing | Node's built-in test runner (unit) + `supertest` against a real Postgres test DB and Stripe test mode (integration) |
| Landing page | Static HTML + Tailwind/Lucide CDN |

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

Health check: `http://localhost:3000/health`

### Stripe Webhooks (local dev)

```bash
stripe listen --forward-to localhost:3000/stripe/webhook
```

The path must be `/stripe/webhook`, **not** `/webhook` — the backend mounts nothing at `/webhook`, so events forwarded there `404` with no obvious signal, `Booking.paymentStatus` never advances past `PENDING_AUTH`, and confirming payment fails with `'Payment authorization is not ready yet.'`. Fix the `--forward-to` path and use `stripe events resend <event_id>` to redeliver missed events.

### Frontend

```bash
cd frontend
npm install
npx expo start
```

Stripe PaymentSheet requires an **EAS development or release build**, not Expo Go:

```bash
cd frontend
npx eas-cli build --profile development --platform ios
```

Test card `4242 4242 4242 4242`, any future expiry, any CVC.

### Native dependency versions (frontend)

This is an npm workspace (root `package.json` → `backend`, `frontend`, `packages/shared`), and `frontend/metro.config.js` sets `resolver.disableHierarchicalLookup = true` with a flat `nodeModulesPaths` (`frontend/node_modules`, root `node_modules`). Metro can only see those two paths, never a package's private nested `node_modules`. If npm ever gives a package a private nested copy of a dependency instead of hoisting it, Metro can't resolve it even though Node could. This project hit that once with `semver` (`@babel/core` wants `^6`, everything else wants `7.x`) — fixed by adding `"semver": "7.8.5"` to the root `overrides`.

`@stripe/stripe-react-native` is pinned to `0.62.0`, not latest. `0.60.0` / `0.61.0` bundle a `stripe-android` SDK compiled with Kotlin metadata 2.3.0, unreadable by Expo SDK 54's Kotlin/KSP ceiling (2.2.20) — Android release builds fail with `compiled with an incompatible version of Kotlin`. `expo-build-properties`'s `android.kotlinVersion` does not reliably fix it ([expo/expo#36461](https://github.com/expo/expo/issues/36461)). `0.62.0` fixes it upstream ([stripe/stripe-react-native#2354](https://github.com/stripe/stripe-react-native/issues/2354)). Don't bump past `0.62.0` without checking for the same regression.

Practical guidance:

- Always run `npm install` from the **repo root**, never `npm install --workspace=frontend <pkg>` — the latter can nest a package under `frontend/node_modules` and bake that into `package-lock.json`.
- After a native dep change, check `ls frontend/node_modules` is empty/near-empty — anything there is the hoisting bug.
- Use `npx expo install <package>` to pick SDK-compatible versions, but note it only pins the named package; unbounded transitive deps (e.g. `expo-font`) can still need an explicit pin.
- If `npm install` "won't take" a fix mid-change: `rm -rf node_modules */node_modules packages/shared/node_modules package-lock.json && npm install` from the root.

---

## Environment Variables

Keep real secrets out of git. `.gitignore` covers `backend/.env`, `backend/.env.test`, `frontend/.env`, `.env.local`, `.env.production`.

### `backend/.env`

```env
DATABASE_URL="postgresql://youruser@localhost:5432/zoink"
JWT_SECRET="your-secret-key"
PORT=3000

ALLOWED_EMAIL_DOMAINS="utoronto.ca,mail.utoronto.ca,torontomu.ca,wlu.ca,yorku.ca,mcmaster.ca,ontariotechu.ca,gmail.com,hotmail.com"
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
DEPOSIT_HOLD_HOURS=24
ZOINK_TAP_WINDOW_MS=300000
INSURANCE_RATE=0.03
MIN_INSURANCE_FEE=1
MAX_INSURANCE_FEE=50

SENTRY_DSN=
```

- `STRIPE_SECRET_KEY` empty → mock Stripe mode (no real charges). In `.env.test` it must start with `sk_test_`.
- `DEV_STRIPE_ACCOUNT_ID` — dev/beta owner-payout account override. In `.env.test` it must be a real, fully-onboarded (`payouts_enabled: true`) Stripe Express test-mode Connect account id; the accept/payout integration tests call the live Connect API against it and fail fast if it's unset.
- `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL` — **required**. Must be `http://localhost…` or `https://…` pointing at the backend's `/stripe-return` / `/stripe-refresh` pages (e.g. `<ngrok-url>/stripe-return`), not the `zoink://` scheme (Stripe rejects it). Missing/invalid → hard error, no fallback.
- `DEPOSIT_HOLD_HOURS` — delay before an undisputed deposit is auto-released (`releaseDueDeposits`).
- `HST_RATE` (0.13) and the commission tiers are **hardcoded in `paymentService.ts`**, not env vars. `PLATFORM_COMMISSION_RATE` is no longer read.
- `SENTRY_DSN` — backend error tracking (`instrument.ts`); blank or `NODE_ENV=test` skips Sentry entirely.
- `EXPO_ACCESS_TOKEN` — optional Expo push access token.

### `frontend/.env`

```env
EXPO_PUBLIC_API_URL="http://your-local-ip:3000"
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
EXPO_PUBLIC_MAPTILER_API_KEY=""
EXPO_PUBLIC_SENTRY_DSN=""
EXPO_PUBLIC_DEMO_MODE=false
```

- `EXPO_PUBLIC_MAPTILER_API_KEY` — tile provider for `LocationMapPreview` / `LocationMapModal`; blank falls back to raw `tile.openstreetmap.org` (dev only, logs one warning). Get a free key at [maptiler.com](https://www.maptiler.com/).
- `EXPO_PUBLIC_SENTRY_DSN` — frontend crash tracking (`@sentry/react-native`), tagged `development` / `production` via `__DEV__`.
- `EXPO_PUBLIC_DEMO_MODE` — exactly `true` enables mock data (lowercase string comparison).

### ngrok drift

Testing on a real device through ngrok means **three** values move together every tunnel session (and the backend must restart): `EXPO_PUBLIC_API_URL`, `STRIPE_CONNECT_RETURN_URL` → `<ngrok-url>/stripe-return`, `STRIPE_CONNECT_REFRESH_URL` → `<ngrok-url>/stripe-refresh`. If the two Connect URLs are unset, Stripe Connect onboarding fails outright.

### Backend integration tests

Create a separate `zoink_test` Postgres database and a `backend/.env.test` pointed at it (see `backend/src/integration-tests/README.md`), including a real `DEV_STRIPE_ACCOUNT_ID`. `.env.test` is gitignored and was never committed.

### Managing the Admin Role

No in-app UI. Use the `backend/src/scripts/manageAdminRole.ts` CLI:

```bash
cd backend
npm run admin:grant -- --email=someone@mail.utoronto.ca
npm run admin:revoke -- --email=someone@mail.utoronto.ca
```

- Looks the user up by email (case-insensitive); never creates a user.
- `admin:grant` → `role = ADMIN` (no-op message if already admin).
- `admin:revoke` → `role = USER`, but refuses if the target is the last remaining admin.
- Prints the id, email, and role transition. Core logic is unit-tested against a mocked db (`manageAdminRole.test.ts`).

---

## Project Structure

```text
Zoink/
  backend/
    prisma/
      migrations/
      schema.prisma
      seed.ts
    src/
      index.ts
      instrument.ts
      middleware/
        controllers/
        rateLimiter.ts  errorHandler.ts  validate.ts
        requireAuth.ts  requireAdmin.ts  requiredVerified.ts
        bookingStateMachine.ts
      routes/
      schemas/
      scripts/
      services/
      integration-tests/
      testUtils/
      utils/
  frontend/
    App.tsx  app.json  eas.json  metro.config.js
    src/
      components/  config/  context/  navigation/
      screens/  services/  theme/  types/  utils/
  packages/
    shared/
      generated/prisma-models.ts   # Prisma-generated TS interfaces
      src/dto.ts  src/index.ts      # response DTOs, exported as @zoink/shared
  landing/
    index.html  assets/
```

---

## Verification Commands

Backend:

```bash
cd backend
npm run build
npm test
npx prisma validate
npm run test:integration   # needs zoink_test DB + backend/.env.test
```

Frontend:

```bash
cd frontend
npx tsc --noEmit
```

From the repo root: `npm run typecheck:backend`, `npm run typecheck:frontend`, `npm run test:backend`, `npm run generate`.

No lint/format scripts are configured.

---

## Build Plan Status

| Phase | Focus | Status |
|---|---|---|
| 1 | Project setup, backend structure, navigation shell | Done |
| 2 | Auth and protected routes | Done |
| 3 | Profiles and verification (email + phone) | Done |
| 4 | Listings and photo uploads | Done |
| 5 | Browse/search/filtering | Done |
| 6 | Booking requests and messaging | Done |
| 7 | Payments, insurance, audit logs, synchronized handoff | Done |
| 8 | Reviews and reputation (incl. item review) | Done |
| 9 | Push notifications and UI polish | Done |
| 10 | Stripe Connect onboarding, real payment UX, active rentals | Done |
| 11 | Admin/disputes + abuse reports (backend + frontend), integration tests, hardening | Done — rate limiting, helmet, Sentry, Zod validation in place; admin-role grant still CLI-only |
| 12 | Booking-flow rework (`CONFIRMED` + Pay screen), separate deposit PaymentIntent, HST, tiered commission | Done |
| 13 | App-wide neobrutalist design system | Done |
| 14 | Deployment, TestFlight, production readiness | In progress — production EAS builds verified on iOS + Android; TestFlight not yet confirmed |

---

## Key Architecture Decisions

- The backend is the source of truth for booking state, pricing, payment status, deposit status, and handoff state. All prices (`totalPrice`, `commissionAmount`, `ownerPayout`, `hstAmount`, `insuranceFee`, `depositAmount`) are snapshotted onto the `Booking` at request time.
- Payment API calls are synchronous; final payment state is webhook-driven (`stripeWebhookController.ts`).
- The rental and the security deposit are **two independent PaymentIntents**. The deposit is authorized off-session at `CONFIRMED` and resolved at return handoff or by dispute — never released as a side effect of the pickup capture.
- Every critical booking transition is a `version`-guarded transactional `updateMany`. `BookingEvent` is an immutable audit log for payment, handoff, webhook, reconciliation, dispute, and error events.
- Dispute resolution holds a `SELECT … FOR UPDATE` row lock on the booking across validation, the Stripe call, and the write, so sequential partial refunds can't collectively exceed the remaining balance.
- Local dev runs mock Stripe with `STRIPE_SECRET_KEY` empty; real beta/prod needs Connect onboarding with payouts enabled before an owner can accept. Stripe native payment collection needs an EAS build, not Expo Go.
- Messaging is polling-based. Read state is per participant (`renterLastReadAt` / `ownerLastReadAt`), set via `POST /conversations/:id/read`.
- Authorization is role-based (`User.role`), read from the JWT and enforced with `requireAdmin`. Granting the role is CLI-only.
- Disputes are their own `Dispute` records (auditable who/what/how-resolved); abuse reports are a separate `Report` model with a polymorphic, FK-less `targetId` so a report can outlive its target.
- Frontend API shapes come from `@zoink/shared` (generated from Prisma) rather than a hand-maintained parallel type set.

---

Built as a student MVP. Users are verified through university email today; stronger ID verification and support workflows can be layered in as the platform matures.
