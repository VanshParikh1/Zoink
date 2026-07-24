# Zoink Codebase Overview

This document explains the current Zoink repository so a new developer can understand what exists, how the pieces connect, and where to make changes. It is based on the code present in this repo at the time of writing

## 1. Project Overview

Zoink is a student-focused peer-to-peer rental marketplace where users can rent items from other verified students. The app supports university email registration and OTP verification, listing creation with images, browse/search, booking requests, renter/owner messaging, Stripe-based payment and payout flows, photo-backed pickup/return handoffs, reviews, push notifications, a backend admin/dispute-resolution API (role-based, no frontend yet), and a static marketing/waitlist landing page.

The repository has three main areas:

| Area | Purpose |
|---|---|
| `frontend/` | Expo React Native mobile app and web-capable Expo frontend. |
| `backend/` | Express API, Prisma database access, auth, payments, bookings, messaging, reviews, notifications, and tests. |
| `landing/` | Standalone static HTML/CSS/JS landing page for waitlist and marketing. |

## 2. Tech Stack

| Concern | Tools Used |
|---|---|
| Frontend app | React Native, Expo, TypeScript, React 19 |
| Frontend navigation | `@react-navigation/native`, `@react-navigation/native-stack` |
| Frontend HTTP | `axios` with a shared interceptor in `frontend/src/services/api.ts` |
| Frontend auth storage | `expo-secure-store` on native, `localStorage` on web |
| Frontend images | `expo-image-picker`; shared upload part helper in `frontend/src/services/uploadFormData.ts`; assets under `frontend/assets/` |
| Frontend location | `expo-location` |
| Frontend notifications | `expo-notifications` |
| Frontend payments | `@stripe/stripe-react-native`, Stripe PaymentSheet |
| Frontend styling | React Native `StyleSheet`, shared colors in `frontend/src/theme/colors.ts`, Expo linear gradients/blur |
| Backend API | Node.js, Express 5, TypeScript |
| Backend auth | JWT via `jsonwebtoken`, password hashing via `bcryptjs` |
| Backend upload handling | `multer` memory storage |
| Backend image storage | Cloudinary |
| Backend email | AWS SES |
| Backend payments | Stripe SDK |
| Database | PostgreSQL |
| ORM | Prisma 7 with `@prisma/adapter-pg` and `pg` |
| Validation style | Zod v4 schema validation via `src/middleware/validate.ts` and `src/schemas/*.schema.ts`; `ZodError` flows to the centralized error handler |
| Testing | Node built-in test runner with `ts-node/register` (unit tests); `supertest` + a real Postgres test DB + Stripe test mode (integration tests in `backend/src/integration-tests/`) |
| Scheduled jobs | `node-cron`, registered in `backend/src/index.ts` (skipped when `NODE_ENV=test`) |
| Authorization roles | `Role` enum (`USER`/`ADMIN`) on `User`, embedded in the JWT, enforced by `requireAdmin` middleware |
| Landing page | Static HTML, Tailwind CDN, Lucide CDN, inline CSS/JS |

## 3. Folder Structure

```text
Zoink/
  .gitignore
  README.md
  package.json
  package-lock.json
  CODEBASE_OVERVIEW.md
  backend/
    .env
    .env.test
    nodemon.json
    package.json
    prisma.config.ts
    tsconfig.json
    prisma/
      schema.prisma
      seed.ts
      migrations/
    src/
      index.ts
      middleware/
        requireAuth.ts
        requireAdmin.ts
        requiredVerified.ts
        errorHandler.ts
        validate.ts
        bookingStateMachine.ts
        *.test.ts
        controllers/
      routes/
      schemas/
        auth.schema.ts
        booking.schema.ts
        dispute.schema.ts
        handoff.schema.ts
        listing.schema.ts
        stripe.schema.ts
      scripts/
      services/
      integration-tests/
      testUtils/
      utils/
  frontend/
    .env
    App.tsx
    app.json
    eas.json
    index.ts
    package.json
    tsconfig.json
    assets/
    src/
      components/
      config/
      context/
      navigation/
      screens/
      services/
      theme/
      types/
  landing/
    index.html
    assets/
```

Generated/dependency folders such as `node_modules`, `dist`, build outputs, `.expo`, and lockfile internals are not documented file-by-file.

## 4. File-by-File Explanation

### Root Files

| File | What It Does | Depends On | Used By / Notes |
|---|---|---|---|
| `.gitignore` | Defines ignored development files. Ignores `backend/.env` and `frontend/.env`, but not `backend/.env.test`. | None. | Git only. `backend/.env.test` currently shows as untracked rather than ignored — see risks section. |
| `README.md` | High-level product status, setup commands, flows, and roadmap. | None. | Developer-facing overview. |
| `package.json` | Root convenience scripts (`dev:backend`, `dev:frontend`, `build:backend`, `test:backend`, `typecheck:backend`, `typecheck:frontend`) that shell out into `backend/` and `frontend/`. No dependencies of its own. | npm. | Root-level `npm run <script>` from either sub-project. |
| `package-lock.json` | Root npm lockfile for the root `package.json` (no dependencies to lock). | npm. | npm install bookkeeping. |
| `CODEBASE_OVERVIEW.md` | This living codebase documentation. | Repository scan. | Developers. |

### Backend Config Files

| File | What It Does | Depends On | Used By / Notes |
|---|---|---|---|
| `backend/package.json` | Defines backend dependencies and scripts: `dev`, `build`, `start`, `test`, `test:integration`, `smoke:week7`; configures Prisma seed. Adds `node-cron` (runtime) and `supertest`/`@types/supertest` (dev, integration tests). | npm, TypeScript, Prisma, Express. | Backend development and CI-style commands. |
| `backend/package-lock.json` | Backend dependency lockfile. | npm. | Important for reproducible installs, but internals are generated. |
| `backend/tsconfig.json` | TypeScript config targeting ES2020 CommonJS, outputting to `dist/`, strict mode enabled. | TypeScript. | `npm run build`. |
| `backend/nodemon.json` | Watches `src`, ignores `dist`, `node_modules`, and tests, runs `ts-node src/index.ts`. | nodemon, ts-node. | `npm run dev`. |
| `backend/prisma.config.ts` | Loads `.env`, points Prisma to `backend/prisma/schema.prisma`, configures datasource URL and seed command. | `dotenv`, `@prisma/config`, `DATABASE_URL`. | Prisma CLI. |
| `backend/.env` | Backend environment variables for database, JWT, email, Cloudinary, Stripe, payout settings. | Runtime config. | Do not commit real secrets. See risks section. |
| `backend/.env.test` | Backend environment variables for the integration test run, pointed at a separate `zoink_test` database and Stripe test-mode keys. | Runtime config. | `npm run test:integration`. Currently **not** covered by `.gitignore` — see risks section. |

### Backend Prisma Files

| File | What It Does | Depends On | Used By / Notes |
|---|---|---|---|
| `backend/prisma/schema.prisma` | Defines all enums and models: users, verification tokens, listings/images, bookings/events, conversations/messages, reviews/obligations, reputations, notifications. | PostgreSQL, Prisma client generator. | Source of truth for DB shape. Services import generated Prisma types. |
| `backend/prisma/seed.ts` | Seeds database data. It imports `prisma`, `VerificationStatus`, `bcrypt`, and uses `DEV_STRIPE_ACCOUNT_ID`. | Prisma, bcrypt, `.env`. | Run through Prisma seed command. Exact seeded records should be reviewed before relying on it. |
| `backend/prisma/migrations/20260428151800_init/migration.sql` | Initial schema migration: core enums, users, listings, bookings, conversations, messages, reviews, reputations, notifications, verification tokens. | PostgreSQL. | Applied by Prisma migrations. |
| `backend/prisma/migrations/20260524000000_week7_payments_handoff/migration.sql` | Adds payment statuses, dispute statuses, booking event types, listing `itemValue`, booking payment/deposit/insurance/handoff/dispute columns, and `booking_events`. | PostgreSQL. | Supports payment lifecycle and audit logs. |
| `backend/prisma/migrations/20260602000000_zoink_it_handoff/migration.sql` | Adds `PICKUP_PENDING` and `RETURN_PENDING` booking statuses plus handoff initiation timestamps. | PostgreSQL. | Supports synchronized Zoink It handoff states. |
| `backend/prisma/migrations/20260721000000_add_role_and_disputes/migration.sql` | Adds `Role` enum, `User.role`, expands `DisputeStatus` to 6 values, adds `DisputeReason` enum and the `disputes` table with FKs to `bookings`/`users`. | PostgreSQL. | Supports the admin/dispute feature. **Bug:** the generated SQL runs `ALTER TABLE "disputes" ALTER COLUMN "status" ...` (inside the `DisputeStatus` `AlterEnum` block) before the later `CREATE TABLE "disputes"` statement, so `prisma migrate deploy` fails on a database that doesn't already have a `disputes` table. |
| `backend/prisma/migrations/20260721000000_add_role_and_disputes/apply_to_test_db.sql` | Manually reordered version of the same migration (creates the `disputes` table before altering its `status` column) plus a manual `_prisma_migrations` insert so Prisma treats it as applied. | PostgreSQL. | Workaround used to seed the `zoink_test` database for integration tests until the migration itself is fixed. Not a Prisma-generated migration file. |

### Backend Entry, Middleware, Utils, and Test Helpers

| File | What It Does | Depends On | Used By / Notes |
|---|---|---|---|
| `backend/src/index.ts` | Express server entrypoint. Loads `.env` (skipped when `NODE_ENV=test`), configures CORS, Stripe raw webhooks (mounted at both `/stripe/webhook` and `/api/stripe/webhook`), JSON body parsing, health routes, Stripe Connect return pages, and mounts `auth`, `users`, `listings`, `bookings`, `conversations`, `reviews`, `disputes`, and `admin` routers. Registers `node-cron` jobs (stale-handoff cleanup + payout release every 15 min, Stripe reconciliation hourly) and skips both the cron registration and `app.listen()` when `NODE_ENV=test` so `supertest` can drive the exported `app` directly. | Express, route files, `stripeWebhook`, `requireAuth`, `getStripeConnectStatus`, `node-cron`, `cleanupJob`, `reconciliationJob`. | `nodemon` and production `dist/index.js`; also imported directly by integration tests via `setup.ts`. |
| `backend/src/middleware/requireAuth.ts` | Reads `Authorization: Bearer <token>`, verifies JWT with `JWT_SECRET`, attaches `userId`, `verificationStatus`, and `role` (defaults to `USER` if absent from the token) to `req`. | `jsonwebtoken`, `JWT_SECRET`. | Protected routes. |
| `backend/src/middleware/requireAdmin.ts` | Rejects the request with a `ForbiddenError` (403) unless `req.role === 'ADMIN'`. Must run after `requireAuth`. | `requireAuth`, `utils/errors.ts`. | `routes/admin.ts`. |
| `backend/src/middleware/requiredVerified.ts` | Blocks requests unless JWT payload verification status is `VERIFIED`. | `requireAuth` must run first. | Marketplace, bookings, conversations, reviews, disputes, public profile routes. |
| `backend/src/middleware/bookingStateMachine.ts` | Defines allowed booking status transitions and exports `assertBookingTransition`. | Prisma `BookingStatus`. | `bookingService`; tested by `bookingStateMachine.test.ts`. |
| `backend/src/middleware/bookingStateMachine.test.ts` | Unit tests allowed/blocked booking transitions. | Node test runner, state machine. | `npm test`. |
| `backend/src/middleware/errorHandler.ts` | Centralized Express error handler (4-arg signature). Handles `ZodError` first (→ `400 { error, issues[] }`), then `AppError` subclasses (→ mapped status + `{ error }`), then falls back to `500`. Mounted as the last middleware in `src/index.ts`. | `zod`, `AppError` hierarchy in `utils/errors.ts`. | All routes via Express error propagation. |
| `backend/src/middleware/validate.ts` | Generic `validate(schema)` middleware factory. Accepts a Zod schema shaped as `{ body?, params?, query? }`, runs `safeParse`, replaces `req.body/params/query` with coerced values on success, or calls `next(ZodError)` on failure. On Express 5, `req.query` is a getter-only accessor with no setter, so direct assignment throws; the `query` branch instead uses `Object.defineProperty(req, 'query', { value, writable: true, configurable: true, enumerable: true })` to redefine it as an own writable property. `req.body`/`req.params` are plain properties (set by body-parser/the router) and don't need this. | `zod`. | All route files that need input validation. |
| `backend/src/utils/errors.ts` | `AppError` base class and typed subclasses: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `TooManyRequestsError` (429), `InternalServerError` (500). | None. | Services, controllers, `errorHandler`. |
| `backend/src/utils/asyncHandler.ts` | Wraps async route handlers so thrown errors propagate to `next()` without try/catch boilerplate. | None. | All controllers. |
| `backend/src/utils/prisma.ts` | Creates a PostgreSQL pool, Prisma adapter, and Prisma client. | `DATABASE_URL`, `pg`, `@prisma/adapter-pg`, `@prisma/client`. | All backend services. |
| `backend/src/utils/cloudinary.ts` | Configures Cloudinary and exports `uploadImage`, `deleteImage`, `extractPublicId`. Applies avatar/listing transformations. | Cloudinary env vars. | Listing and user controllers. |
| `backend/src/testUtils/httpMocks.ts` | Provides `createMockResponse()` for controller tests. | None. | Controller test files. |

### Backend Routes

| File | Routes | Controllers | Notes |
|---|---|---|---|
| `backend/src/routes/auth.ts` | `POST /auth/register`, `POST /auth/login`, `POST /auth/verify-email`, `POST /auth/resend-otp` | `authController` | Validation: `RegisterSchema`, `LoginSchema`, `VerifyEmailSchema`. Verification routes require auth but not verified status. |
| `backend/src/routes/users.ts` | `GET/PATCH /users/me`, `PATCH /users/me/push-token`, `POST /users/me/avatar`, `POST /users/me/stripe-connect/onboard`, `GET /users/me/stripe-connect/status`, `GET /users/:id` | `userController` | Public profile route requires verified user. Avatar upload uses Multer memory storage. |
| `backend/src/routes/listings.ts` | Browse, categories, get by id, own listings, create, update, availability, delete, image upload/delete. | `listingController` | All routes require auth and verified status. Validation: `BrowseListingsQuerySchema` (with `z.coerce` for numeric params), `CreateListingSchema`, `UpdateListingSchema`, `ToggleAvailabilitySchema`, `ListingIdParamsSchema`, `ListingImageParamsSchema`. |
| `backend/src/routes/bookings.ts` | Create, my bookings, incoming requests, detail, accept/decline/cancel/activate/complete, pickup/return initiate/confirm, handoff photos, photo upload, `zoink-tap`. | `bookingController` | Router-level auth and verified middleware. Validation: `CreateBookingSchema`, `InitiateHandoffSchema` (photos 2–3 URLs), `ZoinkTapSchema` (strict phase enum), `UploadHandoffPhotosSchema`, `BookingIdParamsSchema`. |
| `backend/src/routes/conversations.ts` | Open conversation, list my conversations, list messages, send message. | `conversationController` | Router-level auth and verified middleware. |
| `backend/src/routes/reviews.ts` | `GET /reviews/pending`, `POST /reviews` | `reviewController` | Router-level auth and verified middleware. |
| `backend/src/routes/disputes.ts` | `POST /disputes`, `GET /disputes`, `GET /disputes/:id` | `disputeController` | Router-level auth and verified middleware. Validation: `CreateDisputeSchema`, `DisputeIdParamsSchema`. |
| `backend/src/routes/admin.ts` | `GET /admin/disputes`, `GET /admin/disputes/:id`, `PATCH /admin/disputes/:id/resolve` | `adminController` | Router-level `requireAuth` + `requireAdmin`. Validation: `AdminListDisputesQuerySchema`, `DisputeIdParamsSchema`, `ResolveDisputeSchema`. |

### Backend Controllers

| File | What It Contains | Calls / Depends On | Used By |
|---|---|---|---|
| `backend/src/middleware/controllers/authController.ts` | `register`, `login`, `verifyEmail`, `resendOTP`; delegates all structural validation to the Zod middleware layer; maps service errors to JSON responses. | `authService`. | `routes/auth.ts`. |
| `backend/src/middleware/controllers/userController.ts` | `getMe`, `getPublicProfile`, `updateMe`, `uploadAvatar`, `updatePushToken`, `onboardStripeConnect`, `getStripeConnectStatus`. | `userService`, `paymentService`, `uploadImage`. | `routes/users.ts`, `src/index.ts` for `/stripe/connect/status`. |
| `backend/src/middleware/controllers/listingController.ts` | Listing CRUD, browse (receives pre-coerced query values), categories, availability, listing image upload/delete. Manual `parseNumber`/`parseBoolean` helpers removed — `BrowseListingsQuerySchema` owns coercion. | `listingService`, Cloudinary utils, Multer file data. | `routes/listings.ts`. |
| `backend/src/middleware/controllers/bookingController.ts` | Booking creation/detail/listing, owner actions, cancellation, legacy activate/complete, handoff photo/tap endpoints, upload handoff images. Inline required-field guards and `parsePhase` helper removed — validate middleware owns all input checks. | `bookingService`, `handoffService`, `uploadImage`. | `routes/bookings.ts`. |
| `backend/src/middleware/controllers/conversationController.ts` | Conversation creation, conversation list, message list, send message. | `conversationService`. | `routes/conversations.ts`. |
| `backend/src/middleware/controllers/reviewController.ts` | Pending review list and review submission. | `reviewService`. | `routes/reviews.ts`. |
| `backend/src/middleware/controllers/disputeController.ts` | `createDispute` (renter/owner opens a dispute), `getDispute` (admin or booking participant only), `getMyDisputes`. | `disputeService`, Prisma. | `routes/disputes.ts`. |
| `backend/src/middleware/controllers/adminController.ts` | `listDisputes` (optional status filter), `getDisputeDetail`, `resolveDispute` (validates target status, delegates to `disputeService.resolveDispute`). | `disputeService`, Prisma. | `routes/admin.ts`. |
| `backend/src/middleware/controllers/stripeWebhookController.ts` | Constructs Stripe event, verifies signature when configured, records webhook event, updates booking payment status from payment intent events. Receives raw `Buffer` body — intentionally excluded from Zod body validation. | Prisma, Stripe env vars. | Raw webhook routes in `src/index.ts` (`/stripe/webhook` and `/api/stripe/webhook`). |
| `*.test.ts` controller files | Unit tests for controller behavior using mocked services/responses, including `adminController.test.ts` and `disputeController.test.ts`. `bookingController.test.ts` now exercises the `validate()` + `errorHandler` pipeline and asserts the `{ error, issues }` shape. | Node test runner, `httpMocks`, service modules. | `npm test`. |

### Backend Services

| File | What It Contains | Calls / Depends On | Used By |
|---|---|---|---|
| `backend/src/services/authService.ts` | Email domain allowlist, OTP generation, JWT signing, registration, login, OTP verification/resend, SES email sending. | Prisma, bcrypt, JWT, crypto, AWS SES, auth env vars. | `authController`. |
| `backend/src/services/userService.ts` | Profile reads/updates, avatar URL update, Expo push token update, Stripe account ID getters/setters, public profile/reputation formatting. | Prisma. | `userController`. |
| `backend/src/services/listingService.ts` | Listing create/read/update/delete, image add/delete, availability, category list, browse/search with location/distance filtering. | Prisma, raw SQL for distance. | `listingController`. |
| `backend/src/services/bookingService.ts` | Booking creation, totals/deposits, payment intent setup, owner request handling, state transitions, cancellation handling, review obligation creation, response formatting. `calculateCancellationFeeCents()` currently short-circuits to `return 0` — cancellation fees are disabled for launch (product decision); the original tiered clamp($5, $25, totalPrice × 5%) logic is retained below the early return, unreachable, for a planned owner opt-in "cancellation fee" feature (same pattern as `Listing.insuranceOptIn`). `handleCancellationPayment()` is awaited end-to-end by `transitionBookingStatus` (not fire-and-forget); when the fee is 0 it calls `cancelPaymentIntent` (full release) instead of `capturePaymentIntent` with a zero amount, since Stripe rejects `amount_to_capture: 0`. A failure to write the `cancel_payment` audit `BookingEvent` is caught separately and logged, not thrown, since the booking's `CANCELLED` status has already committed by that point. | Prisma, `bookingStateMachine`, `bookingUtils`, `paymentService`, `notificationService`, `bookingEventService`. | `bookingController`, `handoffService`. |
| `backend/src/services/bookingUtils.ts` | Currency rounding, rental day count, date validation, deposit calculation. | None. | `bookingService`; tested by `bookingUtils.test.ts`. |
| `backend/src/services/bookingEventService.ts` | Creates immutable booking audit events. | Prisma, Prisma JSON types. | Booking/payment/handoff flows. |
| `backend/src/services/handoffService.ts` | Pickup/return photo initiation, synchronized confirmations, tap registration, completed photo retrieval. Enforces participant checks and confirmation windows. | Prisma, `bookingService`, `paymentService`, `notificationService`. | `bookingController`. |
| `backend/src/services/paymentService.ts` | Stripe/mocked payment behavior, cents/decimal helpers, commission, insurance, owner payout calculations, PaymentIntent auth/capture/cancel/refund, transfers, Connect onboarding/status. | Stripe SDK, payment env vars. | `bookingService`, `handoffService`, `userController`, jobs. |
| `backend/src/services/conversationService.ts` | Opens or finds a conversation for listing/renter, lists conversations, fetches messages, sends messages, sends direct push notifications. | Prisma, `notificationService`. | `conversationController`. |
| `backend/src/services/reviewService.ts` | Pending reviews, review submission, score validation, user reputation recomputation, notifications. | Prisma, `notificationService`. | `reviewController`. |
| `backend/src/services/disputeService.ts` | `createDispute` (validates the requester is a booking participant, blocks a second open dispute, writes a `DISPUTE_OPENED` `BookingEvent`, sets `Booking.disputeStatus = OPEN`); `resolveDispute` (refunds via Stripe on `RESOLVED_REFUND`, then transactionally updates the dispute, the booking's `disputeStatus`, and writes a `DISPUTE_RESOLVED` `BookingEvent`). | Prisma, `paymentService.refundPaymentIntent`. | `disputeController`, `adminController`. |
| `backend/src/services/notificationService.ts` | Creates DB notifications and sends Expo push notifications when a token exists. | Prisma, Expo push endpoint, `EXPO_ACCESS_TOKEN`. | Booking, conversation, review services. |
| `backend/src/services/cleanupJob.ts` | Helpers for stale handoff cleanup and releasing due payouts (`releaseDuePayouts` only selects bookings with `disputeStatus: 'NONE'`). | Prisma, payment/handoff env vars, `paymentService`. | Scheduled every 15 minutes via `node-cron` in `src/index.ts` (skipped when `NODE_ENV=test`); also importable directly. |
| `backend/src/services/reconciliationJob.ts` | Reconciles Stripe payment state against local bookings. | Prisma, Stripe env vars. | Scheduled hourly via `node-cron` in `src/index.ts` (skipped when `NODE_ENV=test`); also importable directly. |
| `backend/src/services/*.test.ts` | Unit tests, currently including booking utility tests. | Node test runner. | `npm test`. |

### Backend Script Files

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `backend/src/scripts/week7SmokeFlow.ts` | Runs a backend-only smoke flow for users, listing, booking, payment authorization, pickup/return photos, synchronized taps, and final state checks. | Prisma/services/env. | `npm run smoke:week7`. |

### Backend Integration Tests

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `backend/src/integration-tests/README.md` | Explains setup (`zoink_test` DB, `.env.test`, Stripe test-mode network access), the truncate-and-reseed test isolation strategy, and why transaction-per-test isn't used (the `pg` pool can hand the test setup and the code under test different connections). | None. | Developers running `npm run test:integration`. |
| `backend/src/integration-tests/setup.ts` | Shared test utilities: `truncateAllTables`, `createTestUser`, `createTestListing`, `futureDates`, `buildSignedWebhookPayload`, `signTestJwt`, `checkStripeConnectivity`, `getApp` (imports the real `app` from `src/index.ts`). | Prisma, `jsonwebtoken`, Stripe, `src/index.ts`. | All `*.integration.test.ts` files. |
| `backend/src/integration-tests/bookingLifecycle.integration.test.ts` | Full happy path over real HTTP via `supertest`: create → accept → pickup handoff → `ACTIVE` → return handoff → `COMPLETED` → review obligations → `PAYOUT_PENDING`. Plus validation, overlap detection, and access-control checks. `giveOwnerStripeAccount()` reads a real account id from `process.env.DEV_STRIPE_ACCOUNT_ID` (a fully-onboarded, `payouts_enabled: true` Stripe Express test-mode Connect account) and throws immediately if it's unset — accept-flow tests make a real `stripe.accounts.retrieve` call that a fake id would fail. | `supertest`, `setup.ts`, real Postgres + Stripe test mode. | `npm run test:integration`. |
| `backend/src/integration-tests/bookingCancellation.integration.test.ts` | Cancellation behavior at each booking stage (`PENDING`/`ACCEPTED`/`PICKUP_PENDING`), invalid-cancellation rejections, and HTTP status codes. Same `DEV_STRIPE_ACCOUNT_ID` requirement/fail-fast as `bookingLifecycle.integration.test.ts` for `giveOwnerStripeAccount()`. Since cancellation fees are disabled for launch (see `bookingService.ts`), the original tiered-fee assertions (`cancellation fee is clamped to $5 minimum`, `...$25 maximum`, `...5% for a mid-range rental`) are kept but marked `{ skip: '...' }` with a reason pointing back to `calculateCancellationFeeCents()`, ready to re-enable if the opt-in feature ships; a new `cancel from ACCEPTED status — fees disabled for launch` describe block asserts the current $0-fee behavior (full payment-intent release, same as the `PENDING` branch) across cheap/expensive/mid-range rentals. | `supertest`, `setup.ts`. | `npm run test:integration`. |
| `backend/src/integration-tests/disputeResolution.integration.test.ts` | `disputeService.createDispute`/`resolveDispute` at the service and HTTP layer; all three resolution outcomes; the admin-only resolve endpoint; `BookingEvent` audit trail. | `supertest`, `setup.ts`, `disputeService`. | `npm run test:integration`. |
| `backend/src/integration-tests/stripeWebhooks.integration.test.ts` | Synthetic signed webhook events posted to `/stripe/webhook`; signature verification, unknown event types, replay idempotency. | `supertest`, `setup.ts`, Stripe webhook signing. | `npm run test:integration`. |

### Frontend Config and App Shell

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `frontend/package.json` | Defines Expo scripts: `start`, `android`, `ios`, `web`; lists React Native, Expo, Stripe, navigation, axios dependencies. | npm, Expo. | Frontend development. |
| `frontend/package-lock.json` | Frontend dependency lockfile. | npm. | Reproducible installs. |
| `frontend/tsconfig.json` | Extends Expo TypeScript config with strict mode. | Expo TypeScript base. | Type checking. |
| `frontend/app.json` | Expo app config: name, scheme `zoink`, icons/splash, iOS/Android IDs, plugins for secure store, notifications, image picker, Stripe. | Expo/EAS. | Expo runtime and builds. |
| `frontend/eas.json` | EAS build profiles for development, preview, production. | EAS CLI. | Native development/release builds, especially Stripe native modules. |
| `frontend/.env` | Frontend public env vars for API URL, Stripe publishable key, demo mode. | Expo public env. | Frontend services/config. |
| `frontend/index.ts` | Registers `App` as Expo root component. | Expo, `App.tsx`. | Expo startup. |
| `frontend/App.tsx` | Wraps the app in `StripeProvider`, `AuthProvider`, and `Navigation`. | Stripe config, auth context, navigation. | Root frontend component. |
| `frontend/src/config/demoMode.ts` | Defines `DEMO_MODE`, `DEMO_TOKEN`, and `DEMO_USER`. | `EXPO_PUBLIC_DEMO_MODE`. | Auth and API service mock branches. |
| `frontend/src/config/stripe.ts` | Exposes `STRIPE_PUBLISHABLE_KEY` and `isStripePublishableKeyConfigured`. | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. | `App.tsx`, booking/payment screens. |
| `frontend/src/theme/colors.ts` | Shared color palette and theme tokens. | None. | Screens/components. |
| `frontend/src/types/index.ts` | Shared frontend TypeScript types for users, listings, bookings, conversations, reviews, etc. | None. | Frontend services/screens/components. |

### Frontend Context and Navigation

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `frontend/src/context/AuthContext.tsx` | Holds `user`, `token`, loading state, `register`, `login`, `logout`, `setVerified`; persists JWT with SecureStore/localStorage; sets axios auth header; syncs push token after verified login. | `api`, `demoMode`, `pushNotifications`, SecureStore. | `Navigation`, auth screens, many screens via `useAuth`. |
| `frontend/src/navigation/index.tsx` | Defines `RootStackParamList`; chooses auth stack, verification stack, or verified app stack; checks pending reviews on verified app startup. | `useAuth`, screens, `getPendingReviews`, theme. | `App.tsx`. |

### Frontend API and Mock Services

| File | What It Does | Backend Routes Called / Depends On | Used By |
|---|---|---|---|
| `frontend/src/services/api.ts` | Shared axios instance with base URL, auth request interceptor, and 401 token cleanup. | `EXPO_PUBLIC_API_URL`, SecureStore/localStorage. | All real API service wrappers. |
| `frontend/src/services/uploadFormData.ts` | Builds React Native image upload parts from local URIs, preserving filename extensions where present and mapping common image MIME types including PNG, GIF, HEIC/HEIF, and JPEG fallback. | FormData-compatible `{ uri, name, type }` objects. | `listingsApi`, `bookingsApi`, `usersApi`. |
| `frontend/src/services/listingsApi.ts` | Browse/search, nearby listings, categories, CRUD, availability, image upload/delete; image uploads use `getImageUploadPart`; falls back to mocks in demo mode. | `/listings`, `/listings/me`, `/listings/categories`, `/listings/:id/images`. | Listing/search screens. |
| `frontend/src/services/bookingsApi.ts` | Create/list/detail bookings, accept/decline/cancel/activate/complete, handoff initiation/confirm, photo upload, completed photos; handoff photo uploads use `getImageUploadPart`. | `/bookings/*`. | Booking, active rental, handoff, Zoink It screens. |
| `frontend/src/services/conversationsApi.ts` | Open/list conversations, get messages, send messages. | `/conversations/*`. | Inbox, listing detail, active rental, thread screens. |
| `frontend/src/services/usersApi.ts` | My/public profile, profile update, avatar upload through `getImageUploadPart`, push token update, Stripe Connect onboarding/status. | `/users/*`, `/stripe/connect/status`. | Profile screens, push notification sync. |
| `frontend/src/services/reviewsApi.ts` | Pending reviews and review submission. | `/reviews/pending`, `/reviews`. | Navigation review gate, review prompt screen. |
| `frontend/src/services/pushNotifications.ts` | Requests notification permission, gets Expo push token, configures Android channel, syncs/clears token through `usersApi`. | Expo notifications/constants, `updateMyPushToken`. | `AuthContext`. |
| `frontend/src/services/mockListings.ts` | Demo-mode listing data and fake listing CRUD/image behavior. | Types. | `listingsApi`. |
| `frontend/src/services/mockProfiles.ts` | Demo-mode public/my profile data and profile/avatar updates. | Types. | `usersApi`. |
| `frontend/src/services/mockWeek6.ts` | Demo-mode bookings, conversations, messages, reviews behavior. | Types. | `bookingsApi`, `conversationsApi`, `reviewsApi`. |

### Frontend Components

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `frontend/src/components/ZoinkLogo.tsx` | Renders the transparent Zoink logo asset at a configurable size. | `frontend/assets/ZoinkTransparent.png`. | Screens/components needing compact logo. |
| `frontend/src/components/ZoinkFullLogo.tsx` | Renders the full Zoink logo asset. | `frontend/assets/ZoinkFullLogo.jpeg`. | Login/register/profile/listing screens. |
| `frontend/src/components/ZoinkButton.tsx` | Shared styled button with loading/disabled state and async press handling. | Theme, React Native components. | Create listing/profile and other form screens. |
| `frontend/src/components/StateCard.tsx` | Reusable empty/error/info state card. | Theme. | Booking/history/message/listing screens. |
| `frontend/src/components/SearchBar.tsx` | Search input component. | React Native. | `SearchScreen`. |
| `frontend/src/components/ScreenBackground.tsx` | Shared screen wrapper/background. | React Native styles/theme. | Most screens. |
| `frontend/src/components/ProfileCard.tsx` | Rich public/my profile display with avatar, badges, ratings, reputation bars, review highlights. | `types`, `theme`, `expo-blur`. | `MyProfileScreen`, `PublicProfileScreen`. |
| `frontend/src/components/LogoPlaceholder.tsx` | Placeholder using logo and optional label when an image is missing. | `ZoinkLogo`. | Listing/profile UI where images may be absent. |

### Frontend Screens

| File | What It Does | Key Dependencies |
|---|---|---|
| `frontend/src/screens/LoginScreen.tsx` | Login form; calls `useAuth().login`; links to register. | `AuthContext`, navigation, `ScreenBackground`, `ZoinkFullLogo`. |
| `frontend/src/screens/RegisterScreen.tsx` | Registration form; calls `useAuth().register`; navigates into verification flow through auth state. | `AuthContext`, navigation, `ScreenBackground`, `ZoinkFullLogo`. |
| `frontend/src/screens/VerificationGateScreen.tsx` | Explains verification requirement and links to OTP screen; supports logout. | `AuthContext`, navigation, `ZoinkFullLogo`. |
| `frontend/src/screens/VerifyEmailScreen.tsx` | Six-digit OTP entry, verify and resend calls; uses `setVerified` with returned token. | `api`, `AuthContext`, `ZoinkLogo`. |
| `frontend/src/screens/MainAppScreen.tsx` | Main verified app shell with custom bottom tabs for Home, Search, Inbox, MyProfile and center create-listing action. | `HomeScreen`, `SearchScreen`, `InboxScreen`, `MyProfileScreen`, navigation. |
| `frontend/src/screens/HomeScreen.tsx` | Home dashboard/entry screen. | Unclear in detail from current scan; imported by `MainAppScreen`. |
| `frontend/src/screens/SearchScreen.tsx` | Browse/search UI with categories, nearby/browse API calls, listing cards, navigation to details. | `listingsApi`, `SearchBar`, navigation. |
| `frontend/src/screens/ListingDetailScreen.tsx` | Listing details, image carousel, owner info, chat/request actions. | `getListing`, `openConversation`, navigation, `useAuth`. |
| `frontend/src/screens/CreateListingScreen.tsx` | Multi-step listing creation flow with category/details/pricing/location/photos, image picker, listing API, image upload. | `listingsApi`, `expo-image-picker`, `ZoinkButton`. |
| `frontend/src/screens/EditListingScreen.tsx` | Owner listing editing, category/price fields, add/remove photos, save. | `listingsApi`, `expo-image-picker`, navigation. |
| `frontend/src/screens/MyListingsScreen.tsx` | Owner listing list with active booking awareness and links to edit/active rentals. | `getMyListings`, `getIncomingRequests`. |
| `frontend/src/screens/BookingRequestScreen.tsx` | Renter booking request form, insurance/payment setup, Stripe PaymentSheet path, creates booking. | `bookingsApi`, Stripe React Native, `stripe` config. |
| `frontend/src/screens/BookingHistoryScreen.tsx` | Renter booking history with active rentals pinned. | `getMyBookings`, navigation. |
| `frontend/src/screens/BookingRequestsScreen.tsx` | Owner incoming booking requests; accept/decline actions. | `getIncomingRequests`, `acceptBooking`, `declineBooking`. |
| `frontend/src/screens/BookingDetailScreen.tsx` | Booking detail/actions for owner/renter, cancellation, photo viewing, handoff navigation. | `bookingsApi`, `useAuth`. |
| `frontend/src/screens/ActiveRentalScreen.tsx` | Live rental detail screen with item, dates, other party, deposit, chat, pickup/return actions. | `getBooking`, `openConversation`, `useAuth`. |
| `frontend/src/screens/HandoffPhotoScreen.tsx` | Requests media-library permission, requires 2-3 pickup/return photos, uploads each image, handles picker errors, then initiates handoff. | `uploadHandoffPhotoImage`, `initiateHandoff`, image picker Expo APIs. |
| `frontend/src/screens/ZoinkItScreen.tsx` | Synchronized confirmation screen. Polls booking state, calls `confirmHandoff`, handles success animation and timeout. | `confirmHandoff`, `getBooking`, `useAuth`. |
| `frontend/src/screens/InboxScreen.tsx` | Conversation inbox. | `conversationsApi`, navigation. |
| `frontend/src/screens/ConversationThreadScreen.tsx` | Message thread with polling and incremental message fetch; sends messages. | `getConversationMessages`, `sendMessage`, `useAuth`. |
| `frontend/src/screens/MyProfileScreen.tsx` | Own profile display/edit, avatar upload, payout status, Stripe onboarding, profile prompt, logout. | `usersApi`, `AuthContext`, image picker, AppState. |
| `frontend/src/screens/PublicProfileScreen.tsx` | Modal public profile view. | `getPublicProfile`, `ProfileCard`. |
| `frontend/src/screens/ReviewPromptScreen.tsx` | Required post-rental review form; submits scores/comment and chains to next pending review if present. | `reviewsApi`, navigation. |

### Frontend Assets

| Folder / File | What It Does |
|---|---|
| `frontend/assets/ZoinkTransparent.png` | Main transparent logo used in app splash/components. |
| `frontend/assets/ZoinkFullLogo.jpeg` | Full logo used in auth/profile/listing UI. |
| `frontend/assets/logo.png`, `icon.png`, `splash-icon.png`, `favicon.png` | Expo icon, splash, favicon assets. |
| `frontend/assets/android-icon-*` | Android adaptive icon foreground/background/monochrome assets. |

### Landing Files

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `landing/index.html` | Standalone marketing/waitlist page with sections for hero, how it works, trust, campuses, waitlist. Loads Tailwind CDN and Lucide CDN, embeds a Tally form if configured, otherwise mailto fallback. | `landing/assets/*`, CDN scripts. | Static hosting. |
| `landing/assets/*` | Branding and app icon images mirrored from frontend assets. | None. | `landing/index.html`. |

## 5. Frontend Flow

1. Expo starts at `frontend/index.ts`, which registers `App`.
2. `App.tsx` wraps the UI with `StripeProvider`, then `AuthProvider`, then `Navigation`.
3. `AuthProvider` loads `zoink_jwt` from SecureStore or localStorage. If present, it decodes the JWT payload locally and sets the axios `Authorization` header.
4. `Navigation` chooses one of three stacks:
   - No user: `Login` / `Register`.
   - Logged in but not `VERIFIED`: `VerificationGate` / `VerifyEmail`.
   - Verified: main app stack.
5. The verified stack checks `getPendingReviews()` first. If there is a required review, it starts at `ReviewPrompt`; otherwise it starts at `MainApp`.
6. `MainAppScreen` provides the main tabs: Home, Search, Inbox, MyProfile, with a central create-listing action.
7. API calls go through `frontend/src/services/api.ts`, which adds the stored JWT to requests and clears the token on 401 responses.
8. Demo mode is controlled by `EXPO_PUBLIC_DEMO_MODE`. Service wrappers short-circuit to mock data when enabled.
9. Image uploads use `FormData` plus `getImageUploadPart` for consistent filename/MIME metadata. Listing images and avatars are sent to backend Multer endpoints, then uploaded to Cloudinary server-side. Handoff photos are uploaded to `/bookings/:id/photos/upload` and then attached to pickup/return initiation. The API wrappers let axios/React Native set the multipart boundary instead of forcing a manual `Content-Type`.
10. PaymentSheet is initialized in the booking request flow using Stripe React Native and the backend-created PaymentIntent client secret.
11. Push token sync runs after a verified non-demo session is active.

## 6. Backend Flow

1. `backend/src/index.ts` loads `.env` (skipped when `NODE_ENV=test`), creates an Express app, enables CORS, registers raw Stripe webhook endpoints (`/stripe/webhook` and `/api/stripe/webhook`) before JSON parsing, then enables `express.json()`.
2. Health/root routes return simple JSON.
3. Stripe Connect return/refresh pages serve small HTML responses that link back to `zoink://`.
4. Main routers are mounted at `/auth`, `/users`, `/listings`, `/bookings`, `/conversations`, `/reviews`, `/disputes`, and `/admin`.
5. `requireAuth` validates JWTs and attaches `userId`/`verificationStatus`/`role`.
6. `requireVerified` blocks marketplace/dispute routes unless the JWT says the user is verified; `requireAdmin` blocks `/admin/*` routes unless the JWT role is `ADMIN`.
7. `validate(schema)` middleware runs next for routes with request schemas; on Zod failure it calls `next(ZodError)` directly to the error handler.
8. Route files call controller functions.
9. Controllers receive pre-validated, type-coerced input from `req.body/params/query` and call services.
10. Services contain business logic and database access through the shared Prisma client.
11. Booking/payment/handoff/dispute flows also create `BookingEvent` audit records and send notifications where applicable.
12. Stripe webhooks update booking payment status and create audit events.
13. Outside of test mode (`NODE_ENV=test`), `node-cron` jobs run stale-handoff cleanup + payout release every 15 minutes and Stripe reconciliation hourly.

Response format is generally plain JSON objects or arrays. Successful error responses from `AppError` subclasses look like:

```json
{ "error": "Human-readable message." }
```

Zod validation failures (400) include a structured issue list:

```json
{
  "error": "Validation failed.",
  "issues": [
    { "path": "body.startDate", "message": "startDate must be a valid ISO-8601 datetime string." }
  ]
}
```

## 7. Database / Prisma

`backend/prisma/schema.prisma` is the source of truth.

### Enums

| Enum | Values / Purpose |
|---|---|
| `VerificationStatus` | `PENDING`, `SUBMITTED`, `VERIFIED`, `FAILED`. |
| `Role` | `USER`, `ADMIN`. Drives `requireAdmin` authorization. |
| `BookingStatus` | `PENDING`, `ACCEPTED`, `DECLINED`, `PICKUP_PENDING`, `ACTIVE`, `RETURN_PENDING`, `COMPLETED`, `CANCELLED`. |
| `PaymentStatus` | Payment authorization, capture, refund, payout, and failure states. |
| `DisputeStatus` | `NONE`, `OPEN`, `UNDER_REVIEW`, `RESOLVED_REFUND`, `RESOLVED_NO_ACTION`, `DISMISSED`. Used by both `Booking.disputeStatus` and `Dispute.status`. |
| `DisputeReason` | `ITEM_DAMAGED`, `ITEM_NOT_RETURNED`, `ITEM_NOT_AS_DESCRIBED`, `PAYMENT_ISSUE`, `OTHER`. |
| `BookingEventType` | Audit event categories for status, payment, payout, handoff, disputes (`DISPUTE_OPENED`, `DISPUTE_RESOLVED`), webhooks, reconciliation, errors. |
| `NotificationType` | Booking/payment/review/verification notification categories. |
| `ReviewRole` | `RENTER` or `LENDER`. |
| `ReviewObligationStatus` | `PENDING` or `SUBMITTED`. |

### Models

| Model | Purpose | Important Relationships |
|---|---|---|
| `User` | Account, profile, verification, role, push token, Stripe customer/account IDs. | Owns listings; renter/owner bookings; renter/owner conversations; messages; reviews; reputation; notifications; verification tokens; raised disputes (`raisedDisputes`); disputes resolved as admin (`resolvedDisputes`). |
| `VerificationToken` | OTP codes for student email verification. | Belongs to `User`, cascade delete. |
| `Listing` | Rentable item with title, description, category, price, value, availability, location. | Belongs to owner `User`; has images, bookings, conversations. |
| `ListingImage` | Image URL and display order for listings. | Belongs to `Listing`, cascade delete. |
| `Booking` | Rental request and lifecycle state, dates, pricing, payment, handoff photos/taps, dispute status. | Belongs to renter, owner, listing; has reviews, obligations, events, `Dispute` records. |
| `BookingEvent` | Immutable audit trail for booking/payment/handoff/dispute changes. | Belongs to `Booking`, cascade delete. |
| `Dispute` | A single dispute raised on a booking: reason, description, status, resolution notes, resolving admin. | Belongs to `Booking`; `raisedByUser` and optional `resolvedByAdmin` both reference `User`. |
| `Conversation` | Chat thread for one listing and renter/owner pair. | Unique by `listingId + renterId`; has messages. |
| `Message` | Chat message body and sender. | Belongs to conversation and sender. |
| `Review` | Post-rental score/comment by one user for another. | Unique by `bookingId + reviewerId`; tied to obligation. |
| `ReviewObligation` | Required review task generated after completed rentals. | Unique by `bookingId + userId`; can link to submitted review. |
| `UserReputation` | Aggregated review/reputation metrics. | One-to-one with `User`. |
| `Notification` | Stored notification record. | Belongs to `User`. |

## 8. Authentication Flow

1. Registration starts in `RegisterScreen`, which calls `AuthContext.register`.
2. `AuthContext.register` posts to `/auth/register` unless demo mode is enabled.
3. `authController.register` calls `authService.registerUser`.
4. `authService.registerUser` checks allowed email domain, hashes the password, creates a user, creates an OTP verification token, sends an email through SES, and returns a JWT plus user data.
5. The JWT includes `userId`, `verificationStatus`, `email`, `firstName`, and `role` (`USER` or `ADMIN`) based on the frontend parser and service signing function; `requireAuth` defaults `role` to `USER` if a token predates this field.
6. The frontend stores the token under `zoink_jwt` and routes unverified users to the verification stack.
7. `VerifyEmailScreen` posts the six-digit code to `/auth/verify-email`.
8. `authService.verifyOTP` validates token ownership, expiry, and used status, marks the user verified, and returns a new `VERIFIED` JWT.
9. `AuthContext.setVerified` swaps the token, updates the user, and sets the axios header.
10. Login posts to `/auth/login`, validates password, and stores a returned token.
11. Protected backend routes use `requireAuth`; marketplace routes also use `requireVerified`.

Unclear from current codebase: stronger ID verification fields exist on `User` (`idPhotoUrl`, `selfieUrl`, `idSubmittedAt`, `verificationId`), but no current route/screen flow for ID document submission was found.

## 9. Main User Flows

### Account Creation

`RegisterScreen` -> `AuthContext.register` -> `POST /auth/register` -> `authController.register` -> `authService.registerUser` -> Prisma `User` and `VerificationToken`.

### Student Verification

`VerificationGateScreen` -> `VerifyEmailScreen` -> `POST /auth/verify-email` or `/auth/resend-otp` -> `authService.verifyOTP` / `resendOTP` -> verified JWT -> verified app stack.

### Logging In

`LoginScreen` -> `AuthContext.login` -> `POST /auth/login` -> `authService.loginUser` -> stored JWT -> route based on verification status.

### Creating a Listing

`CreateListingScreen` collects item details, creates a listing through `listingsApi.createListing`, uploads selected photos through `uploadListingImage`, and can set availability. Uploads share `getImageUploadPart` for URI filename/MIME handling. Backend path is `/listings` and `/listings/:id/images` -> `listingController` -> `listingService` -> Prisma `Listing`/`ListingImage` plus Cloudinary.

### Browsing / Searching Listings

`SearchScreen` calls `getNearbyListings` or `browseListings`. Backend `/listings` supports query/category/price/location/radius parameters in `listingController.browseListings`, then `listingService.browseListings`.

### Requesting a Rental

`BookingRequestScreen` creates a booking with dates, message, and optional insurance. Backend `bookingService.createBooking` calculates rental days, total price, deposit, insurance, commission, owner payout, creates a PaymentIntent or mock authorization, stores booking, and notifies the owner.

### Owner Accept / Decline

`BookingRequestsScreen` or `BookingDetailScreen` calls accept/decline endpoints. `bookingService.transitionBookingStatus` enforces the state machine and payment/payout prerequisites.

### Pickup / Dropoff Photo Flow

`HandoffPhotoScreen` requests media-library permission, collects 2-3 photos, uploads images to `/bookings/:id/photos/upload`, then calls pickup/return initiate endpoints. `handoffService.initiateHandoff` sets `PICKUP_PENDING` or `RETURN_PENDING`, stores photo URLs, and notifies the other party.

### Zoink It Confirmation

`ZoinkItScreen` polls booking state and calls `confirmHandoff`. Backend `handoffService.confirmHandoff` records owner/renter tap timestamps. If both confirm within `ZOINK_TAP_WINDOW_MS`, pickup moves to `ACTIVE`; return moves to `COMPLETED`, triggers payment/payout/review updates.

### Deposits and Payments

`paymentService` calculates deposit, commission, owner payout, and insurance. Booking creation creates a Stripe PaymentIntent when Stripe is configured or mock payment state when not. Capture happens around pickup confirmation. Payout helpers release funds after the configured hold, but job scheduling is not wired in `src/index.ts`.

### Messaging

`ListingDetailScreen` and `ActiveRentalScreen` can open a conversation. `InboxScreen` lists conversations. `ConversationThreadScreen` polls messages and sends new ones. Backend uses `Conversation` and `Message` models and sends push notifications on messages.

### Reviews

After completed rentals, backend creates review obligations. `Navigation` checks pending reviews before loading the main app. `ReviewPromptScreen` submits scores/comments and loads the next pending review if any.

### Disputes

`disputeController.createDispute` -> `disputeService.createDispute` (participant check, one-open-dispute-per-booking check, `DISPUTE_OPENED` `BookingEvent`, sets `Booking.disputeStatus = OPEN`) -> `POST /disputes`. Renter or owner can view their own disputes (`GET /disputes`) or a specific one they're party to (`GET /disputes/:id`). No frontend screen currently calls these routes.

### Admin / Moderation

Backend-implemented, no frontend UI. `User.role` (`USER`/`ADMIN`) is carried in the JWT and enforced by `requireAdmin`. Admins list/inspect disputes (`GET /admin/disputes`, `GET /admin/disputes/:id`) and resolve them (`PATCH /admin/disputes/:id/resolve` -> `disputeService.resolveDispute`), which issues a Stripe refund on `RESOLVED_REFUND`, updates `Booking.disputeStatus`, and writes a `DISPUTE_RESOLVED` `BookingEvent`. There is no admin route/screen to change a user's `role` — it must currently be set directly in the database or via `prisma/seed.ts`-style scripting.

## 10. How Files Interact

### Frontend to Backend Route Map

| Frontend File | Backend Route(s) |
|---|---|
| `AuthContext.tsx` | `/auth/register`, `/auth/login` |
| `VerifyEmailScreen.tsx` | `/auth/verify-email`, `/auth/resend-otp` |
| `listingsApi.ts` | `/listings`, `/listings/me`, `/listings/categories`, `/listings/:id`, `/listings/:id/availability`, `/listings/:id/images` |
| `bookingsApi.ts` | `/bookings`, `/bookings/me`, `/bookings/requests`, `/bookings/:id`, `/bookings/:id/*` |
| `conversationsApi.ts` | `/conversations`, `/conversations/me`, `/conversations/:id/messages` |
| `usersApi.ts` | `/users/me`, `/users/:id`, `/users/me/avatar`, `/users/me/push-token`, `/users/me/stripe-connect/onboard`, `/stripe/connect/status` |
| `reviewsApi.ts` | `/reviews/pending`, `/reviews` |
| *(none)* | `/disputes`, `/disputes/:id`, `/admin/disputes`, `/admin/disputes/:id`, `/admin/disputes/:id/resolve` — implemented backend routes with no frontend caller yet. |

### Backend Layering Pattern

```text
routes/*.ts
  -> validate(schema)           # Zod middleware — coerces + guards input
  -> middleware/controllers/*.ts # receives clean req.body/params/query
    -> services/*.ts
      -> utils/prisma.ts
      -> Prisma models in schema.prisma
      -> payment/email/cloudinary/notification utilities as needed
  -> middleware/errorHandler.ts  # catches ZodError + AppError + unknown
```

### Reused Frontend Components

| Component | Reused By |
|---|---|
| `ScreenBackground` | Most screens for consistent background. |
| `ZoinkLogo` / `ZoinkFullLogo` | Auth, profile, listing, handoff/brand UI. |
| `ZoinkButton` | Form/action-heavy screens. |
| `StateCard` | Empty/error/loading state presentation. |
| `ProfileCard` | Own and public profile views. |
| `SearchBar` | Search screen. |

### Global Config Impact

| Config | Affects |
|---|---|
| `frontend/app.json` | Expo scheme, assets, native plugins, notification/image/Stripe permissions. |
| `frontend/src/services/api.ts` | Every frontend API call and auth header behavior. |
| `frontend/src/config/demoMode.ts` | Whether frontend uses real backend or mock services. |
| `backend/src/index.ts` | Which backend route files are reachable. |
| `backend/prisma/schema.prisma` | Generated Prisma client, DB shape, service model fields. |
| `backend/src/middleware/bookingStateMachine.ts` | Legal booking transitions. |

## 11. Environment Variables

Do not commit real secret values. The repo contains `.env` files with sensitive-looking values; rotate any exposed keys if this repo has been shared. `.gitignore` covers `backend/.env` and `frontend/.env` but **not** `backend/.env.test`, which is currently untracked rather than ignored — see the Gaps section.

### Backend

| Variable | Used In | Purpose |
|---|---|---|
| `DATABASE_URL` | `prisma.config.ts`, `utils/prisma.ts` | PostgreSQL connection string. |
| `JWT_SECRET` | `requireAuth.ts`, `authService.ts` | Signs/verifies auth JWTs. |
| `PORT` | `src/index.ts` | API listen port. |
| `ALLOWED_EMAIL_DOMAINS` | `authService.ts` | Comma-separated student email allowlist. |
| `OTP_EXPIRY_MINUTES` | `authService.ts` | Email verification OTP lifetime. |
| `AWS_REGION` | `authService.ts` | SES region. |
| `AWS_ACCESS_KEY_ID` | `authService.ts` | SES credentials. |
| `AWS_SECRET_ACCESS_KEY` | `authService.ts` | SES credentials. |
| `SES_FROM_EMAIL` | `authService.ts` | Sender address for OTP email. |
| `CLOUDINARY_CLOUD_NAME` | `utils/cloudinary.ts` | Cloudinary account. |
| `CLOUDINARY_API_KEY` | `utils/cloudinary.ts` | Cloudinary credential. |
| `CLOUDINARY_API_SECRET` | `utils/cloudinary.ts` | Cloudinary credential. |
| `STRIPE_SECRET_KEY` | `paymentService.ts`, `stripeWebhookController.ts`, `reconciliationJob.ts`, `disputeService.ts` | Stripe server API key; empty can trigger mock mode in payment service. In `.env.test`, must start with `sk_test_` (enforced by `integration-tests/setup.ts`). |
| `STRIPE_WEBHOOK_SECRET` | `stripeWebhookController.ts` | Webhook signature verification. |
| `STRIPE_CURRENCY` | `paymentService.ts` | PaymentIntent/Stripe currency. |
| `DEV_STRIPE_ACCOUNT_ID` | `bookingService.ts`, seed/smoke script, `integration-tests/bookingLifecycle.integration.test.ts`, `integration-tests/bookingCancellation.integration.test.ts` | Local/dev owner payout account override. In `.env.test`, must be a real, fully-onboarded (`payouts_enabled: true`) Stripe Express test-mode Connect account id — the accept-flow and cancellation integration tests call the live Stripe Connect API (`accounts.retrieve`) against it, and the test helpers now throw immediately if it's unset rather than falling back to a fake id like `acct_mock_test`. |
| `STRIPE_CONNECT_RETURN_URL` | `paymentService.ts` | Stripe Connect return URL. |
| `STRIPE_CONNECT_REFRESH_URL` | `paymentService.ts` | Stripe Connect refresh URL. |
| `PAYOUT_HOLD_HOURS` | `cleanupJob.ts` | Delay before releasing owner payouts. |
| `ZOINK_TAP_WINDOW_MS` | `handoffService.ts`, `cleanupJob.ts` | Confirmation window for synchronized taps/stale handoff cleanup. |
| `PLATFORM_COMMISSION_RATE` | `paymentService.ts` | Platform commission calculation. |
| `INSURANCE_RATE` | `paymentService.ts` | Optional insurance fee rate. |
| `MIN_INSURANCE_FEE` | `paymentService.ts` | Minimum insurance fee. |
| `MAX_INSURANCE_FEE` | `paymentService.ts` | Maximum insurance fee. |
| `EXPO_ACCESS_TOKEN` | `notificationService.ts` | Optional Expo push service access token. |
| `NODE_ENV` | `bookingService.ts`, `src/index.ts`, `utils/prisma.ts` | Development/production conditional behavior. When `test`, `src/index.ts` skips `dotenv.config()`, skips cron job registration, and skips `app.listen()` (so `supertest` can drive the exported `app`). |

### Frontend

| Variable | Used In | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `services/api.ts` | Backend base URL. |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `config/stripe.ts`, booking request flow | Stripe frontend publishable key. |
| `EXPO_PUBLIC_DEMO_MODE` | `config/demoMode.ts` | Enables mock frontend data when exactly `true`. Note: current code checks lowercase string equality. |

## 12. Scripts and Commands

### Backend

| Command | Meaning |
|---|---|
| `cd backend && npm install` | Install backend dependencies. |
| `npm run dev` | Start backend with nodemon and ts-node. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run compiled backend from `dist/index.js`. Requires build first. |
| `npm test` | Run Node unit tests for services, middleware, and controllers (`src/integration-tests/` is excluded). |
| `npm run test:integration` | Run `src/integration-tests/*.integration.test.ts` against a real `zoink_test` Postgres DB and Stripe test mode; requires `backend/.env.test` and applied migrations. Runs with `--test-concurrency=1` since tests truncate shared tables. |
| `npm run smoke:week7` | Run payment/handoff smoke flow. |
| `npx prisma migrate dev` | Apply migrations locally and generate Prisma client. |
| `npx prisma generate` | Generate Prisma client. |
| `npx prisma validate` | Validate Prisma schema. |
| `npx prisma db seed` | Run configured seed script. |

### Frontend

| Command | Meaning |
|---|---|
| `cd frontend && npm install` | Install frontend dependencies. |
| `npm start` | Run `expo start`. |
| `npm run android` | Start Expo for Android. |
| `npm run ios` | Start Expo for iOS. |
| `npm run web` | Start Expo web. |
| `npx tsc --noEmit` | Type-check frontend. |
| `npx eas-cli build --profile development --platform ios` | Build native dev client for Stripe native module testing. |

No linting or formatting scripts were found in `package.json` files.

## 13. Important Patterns

| Pattern | Current Implementation |
|---|---|
| Backend layering | Routes are thin, controllers translate HTTP, services hold business logic and Prisma access. |
| Auth protection | `requireAuth` first, then `requireVerified` for marketplace/dispute routes, or `requireAdmin` for `/admin/*` routes. |
| Error handling | Centralized `errorHandler.ts` (Phase 4) handles `ZodError` → 400, `AppError` subclasses → mapped status, unknown → 500. All controllers use `asyncHandler` to propagate errors to it. |
| Validation | Zod v4 schemas in `src/schemas/*.schema.ts`; `validate(schema)` middleware in `src/middleware/validate.ts` coerces and validates `req.body/params/query` before controllers run. `ZodError` flows to the centralized error handler. |
| File upload | Frontend `getImageUploadPart` -> `FormData` -> Multer memory storage -> controller -> Cloudinary upload helper -> URL saved in DB. |
| Booking state | `bookingStateMachine.ts` and service transaction checks enforce transitions. |
| Payments | Backend is source of truth for pricing/payment states. Stripe webhooks update final states; mock mode exists. |
| Notifications | Services call `notifyUser`/`sendDirectPush`; notification records are stored and Expo push is attempted. |
| Frontend API | One axios client plus feature-specific API wrappers. Demo mode lives inside wrappers. |
| Frontend navigation | Root navigation switches by auth and verification status; verified stack gates pending reviews. |
| Component organization | Shared components under `src/components`; screens under `src/screens`; API wrappers under `src/services`. |
| Types | Frontend has its own manually maintained types in `src/types/index.ts`; backend uses Prisma types. |

## 14. Current Gaps / TODOs / Risks

| Area | Observation |
|---|---|
| Secrets | `backend/.env` and `frontend/.env` contain real-looking credentials/keys and are gitignored — rotate them if this repo has been shared. `backend/.env.test` is **not** gitignored (see next row). |
| `.env.test` not ignored | `.gitignore` only lists `backend/.env`, `frontend/.env`, `.env.local`, `.env.production`. `backend/.env.test` shows as untracked in `git status`, meaning it will be committed if staged with a broad `git add`. Add it to `.gitignore` and rotate any keys already exposed; only `sk_test_...` Stripe keys should ever live there. |
| Migration ordering bug | `backend/prisma/migrations/20260721000000_add_role_and_disputes/migration.sql` alters the `disputes.status` column before `CREATE TABLE "disputes"` runs, so `prisma migrate deploy` fails on a fresh database. `apply_to_test_db.sql` is a manually reordered workaround used only for the test DB; production/new-dev databases would need the same fix or a corrected migration. |
| Payout permanently blocked after dispute resolution | `cleanupJob.releaseDuePayouts` only selects bookings with `disputeStatus: 'NONE'`. Since `disputeService.resolveDispute` sets `disputeStatus` to `RESOLVED_REFUND`/`RESOLVED_NO_ACTION`/`DISMISSED` (never back to `NONE`), a booking that ever had a dispute — even a dismissed one — never becomes eligible for automatic payout release again. |
| Admin/disputes frontend | Backend dispute-filing (`/disputes`) and admin resolution (`/admin/disputes/*`) routes are fully implemented and covered by integration tests, but no frontend screen calls them yet — renters/owners can't file a dispute from the app, and there's no admin UI. There's also no route/screen to change a user's `Role`. |
| Frontend dispute type drift | `frontend/src/types/index.ts` still types `disputeStatus` as `'NONE' \| 'OPEN' \| 'RESOLVED'`, but the backend `DisputeStatus` enum now has six values (`NONE`, `OPEN`, `UNDER_REVIEW`, `RESOLVED_REFUND`, `RESOLVED_NO_ACTION`, `DISMISSED`). Any frontend code branching on this field needs updating before disputes are surfaced in the app. |
| ID verification | User fields for ID photo/selfie/manual review exist, but no current submission/review flow was found. |
| Validation | ~~Resolved~~ — Zod v4 schema layer added in Phase 5: `src/schemas/*.schema.ts` + `src/middleware/validate.ts`. |
| Error handling | ~~Resolved~~ — Centralized `errorHandler.ts` added in Phase 4; extended for `ZodError` in Phase 5. |
| Scheduled jobs | ~~Resolved~~ — `cleanupJob.ts` and `reconciliationJob.ts` are now registered with `node-cron` in `backend/src/index.ts` (skipped only when `NODE_ENV=test`). |
| Unmounted payments route | ~~Resolved~~ — `backend/src/routes/payments.ts`, `paymentController.ts`, `backend/app.json`, `backend/stripe.ts`, and `frontend/src/services/paymentsApi.ts` have all been removed. Stripe Connect flows exclusively through `/users/me/stripe-connect/*` and `/stripe/connect/status` now. |
| Tests | Unit tests cover services/middleware/controllers; integration tests (`backend/src/integration-tests/`) now cover booking lifecycle, cancellation, disputes, and Stripe webhooks end-to-end via `supertest` against a real Postgres test DB and Stripe test mode. Handoff race conditions, review-obligation edge cases, and notification delivery are still not covered by integration tests. Frontend test setup was not found. |
| Cancellation fees disabled for launch | `bookingService.calculateCancellationFeeCents()` is short-circuited to always `return 0` (product decision — no fee at launch). The original tiered clamp($5, $25, totalPrice × 5%) logic is retained but unreachable, for a planned owner opt-in "cancellation fee" feature (same pattern as `Listing.insuranceOptIn`, not yet implemented — there's no `Listing`-level toggle or schema field for it yet). `README.md`'s "Cancellation Rules" section reflects the current fee-free behavior; the tiered-fee integration tests are skipped (not deleted) with a reason pointing back here. |
| `req.query` fix (Express 5) | `validate.ts` previously did `req.query = data.query`, which throws on Express 5 since `req.query` is a getter-only accessor with no setter. Fixed via `Object.defineProperty`. Resolved, documented here as a note for anyone touching that middleware again. |
| Integration test Stripe account (resolved) | `giveOwnerStripeAccount()` in both `bookingLifecycle.integration.test.ts` and `bookingCancellation.integration.test.ts` used to fall back to the fake id `'acct_mock_test'`, which caused live `StripePermissionError`s (403) on every accept/pickup/cancellation test once a real `sk_test_...` key was present in `.env.test`. Both now read a real Connect account id from `DEV_STRIPE_ACCOUNT_ID` and throw immediately if it's unset. See the `DEV_STRIPE_ACCOUNT_ID` env var row above. |
| Type drift | Frontend types are separate from Prisma/backend response types, so API changes can drift silently (see the dispute-status drift above for a concrete current example). |
| Demo mode env casing | `DEMO_MODE` checks `EXPO_PUBLIC_DEMO_MODE === 'true'`; uppercase `TRUE` will not enable demo mode. |
| Duplicate webhook mount | `/stripe/webhook` and `/api/stripe/webhook` both route to the same `stripeWebhook` handler in `backend/src/index.ts`; confirm which path the live Stripe webhook endpoint is configured against, since only one is likely intentional. |
| Encoding | Some source comments/output show mojibake characters from earlier non-ASCII text. Worth cleaning for readability. |

## 15. Developer Onboarding Guide

### Start Working on Zoink

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Install frontend dependencies:

```bash
cd ../frontend
npm install
```

3. Create local env files:

```text
backend/.env
frontend/.env
```

Use the variable tables above. Keep real secrets out of git.

4. Start PostgreSQL and create the `zoink` database that matches `DATABASE_URL`.

5. Run backend migrations and generate Prisma:

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

6. Optionally seed:

```bash
npx prisma db seed
```

7. Start backend:

```bash
npm run dev
```

Backend health check:

```text
http://localhost:3000/health
```

8. Start frontend:

```bash
cd ../frontend
npm start
```

For Stripe PaymentSheet, use an EAS development or release build rather than Expo Go.

9. Optional — set up integration tests:

```bash
createdb zoink_test
DATABASE_URL="postgresql://<user>:<pass>@localhost:5432/zoink_test" npx prisma migrate deploy
```

Create `backend/.env.test` pointed at `zoink_test` with `sk_test_...` Stripe keys (see `backend/src/integration-tests/README.md`), **and set `DEV_STRIPE_ACCOUNT_ID` to a real, fully-onboarded (`payouts_enabled: true`) Stripe Express test-mode Connect account id** — accept-flow and cancellation tests call the live Stripe Connect API against it and now fail fast with a clear error if it's missing, then:

```bash
npm run test:integration
```

Note the migration ordering bug above — `migrate deploy` on a fresh `zoink_test` DB may fail on the `20260721000000_add_role_and_disputes` migration; apply `apply_to_test_db.sql` manually if so.

### Where to Edit Common Features

| Feature | Frontend Files | Backend Files | Database |
|---|---|---|---|
| Auth/login/register | `AuthContext.tsx`, `LoginScreen.tsx`, `RegisterScreen.tsx`, `VerifyEmailScreen.tsx` | `routes/auth.ts`, `authController.ts`, `authService.ts`, `requireAuth.ts`, `schemas/auth.schema.ts` | `User`, `VerificationToken` |
| Verification | `VerificationGateScreen.tsx`, `VerifyEmailScreen.tsx` | `authService.ts`, `requiredVerified.ts` | `VerificationStatus`, `VerificationToken` |
| Listings | `CreateListingScreen.tsx`, `EditListingScreen.tsx`, `ListingDetailScreen.tsx`, `MyListingsScreen.tsx`, `SearchScreen.tsx`, `listingsApi.ts` | `routes/listings.ts`, `listingController.ts`, `listingService.ts`, `cloudinary.ts`, `schemas/listing.schema.ts` | `Listing`, `ListingImage` |
| Rentals/bookings | `BookingRequestScreen.tsx`, `BookingHistoryScreen.tsx`, `BookingRequestsScreen.tsx`, `BookingDetailScreen.tsx`, `ActiveRentalScreen.tsx`, `bookingsApi.ts` | `routes/bookings.ts`, `bookingController.ts`, `bookingService.ts`, `bookingStateMachine.ts`, `bookingUtils.ts`, `schemas/booking.schema.ts` | `Booking`, `BookingEvent` |
| Deposits/payments | `BookingRequestScreen.tsx`, `config/stripe.ts` | `paymentService.ts`, `stripeWebhookController.ts`, `cleanupJob.ts`, `reconciliationJob.ts`, `schemas/stripe.schema.ts` | `Booking.paymentStatus`, payment/deposit/payout fields |
| Handoff photos / Zoink It | `HandoffPhotoScreen.tsx`, `ZoinkItScreen.tsx`, `ActiveRentalScreen.tsx`, `bookingsApi.ts`, `uploadFormData.ts` | `handoffService.ts`, `bookingController.ts`, `cloudinary.ts`, `schemas/handoff.schema.ts` | `Booking.pickupPhotos`, `returnPhotos`, tap timestamps |
| Input validation | N/A (handled server-side) | `src/middleware/validate.ts`, `src/schemas/*.schema.ts`, `src/middleware/errorHandler.ts` | N/A |
| Messaging | `InboxScreen.tsx`, `ConversationThreadScreen.tsx`, `conversationsApi.ts` | `routes/conversations.ts`, `conversationController.ts`, `conversationService.ts` | `Conversation`, `Message` |
| Reviews/reputation | `ReviewPromptScreen.tsx`, `ProfileCard.tsx`, `reviewsApi.ts` | `routes/reviews.ts`, `reviewController.ts`, `reviewService.ts`, `bookingService.ts` | `Review`, `ReviewObligation`, `UserReputation` |
| Disputes/admin | None yet — no frontend screens or API wrapper exist | `routes/disputes.ts`, `routes/admin.ts`, `disputeController.ts`, `adminController.ts`, `disputeService.ts`, `requireAdmin.ts`, `schemas/dispute.schema.ts` | `Dispute`, `Booking.disputeStatus`, `User.role` |
| Push notifications | `pushNotifications.ts`, `AuthContext.tsx` | `notificationService.ts`, `userService.ts`, relevant feature services | `Notification`, `User.expoPushToken` |
| UI theme | `theme/colors.ts`, shared components, screen styles | Not applicable | Not applicable |
| Landing page | `landing/index.html`, `landing/assets/*` | Not applicable | Not applicable |

Keep this document updated when routes, models, env vars, or major flows change.
