# Zoink Codebase Overview

This document explains the current Zoink repository so a new developer can understand what exists, how the pieces connect, and where to make changes. It is based on the code present in this repo at the time of writing

## 1. Project Overview

Zoink is a student-focused peer-to-peer rental marketplace where users can rent items from other verified students. The app supports university email + phone registration and OTP verification, listing creation with images and an owner-configured deposit, browse/search, booking requests, renter/owner messaging with real per-user read tracking, Stripe-based payment and payout flows, photo-backed pickup/return handoffs, reviews, push notifications, a role-based dispute-filing and admin-resolution flow (backend + frontend, though nothing yet grants the admin role itself), and a static marketing/waitlist landing page.

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
| Frontend gestures/animation | `react-native-gesture-handler`, `react-native-reanimated` + `react-native-worklets`, `react-native-zoom-toolkit` (pinch-to-zoom `PhotoViewerScreen`) — versions pinned exactly to Expo SDK 54's compatible set (`node_modules/expo/bundledNativeModules.json`); see README's "Native dependency versions" note before changing them |
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
| `backend/prisma/migrations/20260721000000_add_role_and_disputes/apply_to_test_db.sql` | Manually reordered version of the same migration (creates the `disputes` table before altering its `status` column) plus a manual `_prisma_migrations` insert so Prisma treats it as applied. | PostgreSQL. | **Obsolete/historical** — `migration.sql` itself is fixed now, so a fresh `prisma migrate deploy` no longer needs this workaround. Kept only for reference. |
| `backend/prisma/migrations/20260730000000_make_phone_required/migration.sql` | Backfills any `NULL` `users.phone` with an obviously-fake placeholder (`+10000000000`), then sets the column `NOT NULL`. | PostgreSQL. | Supports required phone number at registration (see `auth.schema.ts`). |
| `backend/prisma/migrations/20260802231040_add_conversation_read_state/migration.sql` | Adds nullable `conversations.renterLastReadAt` / `conversations.ownerLastReadAt` timestamp columns. | PostgreSQL. | Supports real per-participant "unread" tracking in `conversationService.ts` (previously unread was just "last sender ≠ me", which never cleared after reading). |
| `backend/prisma/migrations/20260802233912_add_listing_deposit_amount/migration.sql` | Adds `listings.depositAmount` (`DECIMAL(10,2) DEFAULT 0`). | PostgreSQL. | Supports owner-configured per-listing deposits, replacing the old auto-calculated 30%-of-total deposit. |

### Backend Entry, Middleware, Utils, and Test Helpers

| File | What It Does | Depends On | Used By / Notes |
|---|---|---|---|
| `backend/src/index.ts` | Express server entrypoint. Loads `.env` (skipped when `NODE_ENV=test`), configures CORS, the Stripe raw webhook endpoint (`/stripe/webhook`), JSON body parsing, health routes, Stripe Connect return pages, and mounts `auth`, `users`, `listings`, `bookings`, `conversations`, `reviews`, `disputes`, and `admin` routers. Registers `node-cron` jobs (stale-handoff cleanup + payout release every 15 min, Stripe reconciliation hourly) and skips both the cron registration and `app.listen()` when `NODE_ENV=test` so `supertest` can drive the exported `app` directly. | Express, route files, `stripeWebhook`, `requireAuth`, `getStripeConnectStatus`, `node-cron`, `cleanupJob`, `reconciliationJob`. | `nodemon` and production `dist/index.js`; also imported directly by integration tests via `setup.ts`. |
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
| `backend/src/routes/conversations.ts` | Open conversation, list my conversations, list messages, send message, mark conversation read (`POST /conversations/:id/read`). | `conversationController` | Router-level auth and verified middleware. |
| `backend/src/routes/reviews.ts` | `GET /reviews/pending`, `POST /reviews` | `reviewController` | Router-level auth and verified middleware. |
| `backend/src/routes/disputes.ts` | `POST /disputes`, `GET /disputes`, `GET /disputes/:id` | `disputeController` | Router-level auth and verified middleware. Validation: `CreateDisputeSchema`, `DisputeIdParamsSchema`. |
| `backend/src/routes/admin.ts` | `GET /admin/disputes`, `GET /admin/disputes/:id`, `PATCH /admin/disputes/:id/resolve` | `adminController` | Router-level `requireAuth` + `requireAdmin`. Validation: `AdminListDisputesQuerySchema`, `DisputeIdParamsSchema`, `ResolveDisputeSchema`. |

### Backend Controllers

| File | What It Contains | Calls / Depends On | Used By |
|---|---|---|---|
| `backend/src/middleware/controllers/authController.ts` | `register` (now also takes/forwards `phone`), `login`, `verifyEmail`, `resendOTP`; delegates all structural validation to the Zod middleware layer; maps service errors to JSON responses. | `authService`. | `routes/auth.ts`. |
| `backend/src/middleware/controllers/userController.ts` | `getMe`, `getPublicProfile`, `updateMe`, `uploadAvatar`, `updatePushToken`, `onboardStripeConnect`, `getStripeConnectStatus`. | `userService`, `paymentService`, `uploadImage`. | `routes/users.ts`, `src/index.ts` for `/stripe/connect/status`. |
| `backend/src/middleware/controllers/listingController.ts` | Listing CRUD (create/update now also accept `depositAmount`), browse (receives pre-coerced query values), categories, availability, listing image upload/delete. Manual `parseNumber`/`parseBoolean` helpers removed — `BrowseListingsQuerySchema` owns coercion. | `listingService`, Cloudinary utils, Multer file data. | `routes/listings.ts`. |
| `backend/src/middleware/controllers/bookingController.ts` | Booking creation/detail/listing, owner actions, cancellation, legacy activate/complete, handoff photo/tap endpoints, upload handoff images. Inline required-field guards and `parsePhase` helper removed — validate middleware owns all input checks. | `bookingService`, `handoffService`, `uploadImage`. | `routes/bookings.ts`. |
| `backend/src/middleware/controllers/conversationController.ts` | Conversation creation, conversation list, message list, send message, `markConversationRead`. | `conversationService`. | `routes/conversations.ts`. |
| `backend/src/middleware/controllers/reviewController.ts` | Pending review list and review submission. | `reviewService`. | `routes/reviews.ts`. |
| `backend/src/middleware/controllers/disputeController.ts` | `createDispute` (renter/owner opens a dispute), `getDispute` (admin or booking participant only), `getMyDisputes`. | `disputeService`, Prisma. | `routes/disputes.ts`. |
| `backend/src/middleware/controllers/adminController.ts` | `listDisputes` (optional status filter), `getDisputeDetail`, `resolveDispute` (validates target status, delegates to `disputeService.resolveDispute`). | `disputeService`, Prisma. | `routes/admin.ts`. |
| `backend/src/middleware/controllers/stripeWebhookController.ts` | Constructs Stripe event, verifies signature when configured, records webhook event, updates booking payment status from payment intent events. Receives raw `Buffer` body — intentionally excluded from Zod body validation. | Prisma, Stripe env vars. | Raw webhook route in `src/index.ts` (`/stripe/webhook`). |
| `*.test.ts` controller files | Unit tests for controller behavior using mocked services/responses, including `adminController.test.ts` and `disputeController.test.ts`. `bookingController.test.ts` now exercises the `validate()` + `errorHandler` pipeline and asserts the `{ error, issues }` shape. New `authController.test.ts` runs `RegisterSchema` through `validate()` + `errorHandler` and asserts a missing/invalid phone number is flagged with `body.phone` in the issues list. | Node test runner, `httpMocks`, service modules. | `npm test`. |

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
| `backend/src/services/conversationService.ts` | Opens or finds a conversation for listing/renter, lists conversations (computing `unread` per-viewer from `lastMessage.createdAt` vs. that viewer's `renterLastReadAt`/`ownerLastReadAt`, not just who sent the last message), fetches messages, sends messages, `markConversationRead` (sets the caller's own last-read timestamp), sends direct push notifications. | Prisma, `notificationService`. | `conversationController`. |
| `backend/src/services/reviewService.ts` | Pending reviews, review submission, score validation, user reputation recomputation, notifications. | Prisma, `notificationService`. | `reviewController`. |
| `backend/src/services/disputeService.ts` | `createDispute` (validates the requester is a booking participant, blocks a second open dispute, writes a `DISPUTE_OPENED` `BookingEvent`, sets `Booking.disputeStatus = OPEN`); `resolveDispute` (refunds via Stripe on `RESOLVED_REFUND` — and now also sets `Booking.paymentStatus = REFUNDED` + `refundedAt` in the same transaction, instead of leaving `paymentStatus` stale — then transactionally updates the dispute, the booking's `disputeStatus`, and writes a `DISPUTE_RESOLVED` `BookingEvent`). | Prisma, `paymentService.refundPaymentIntent`. | `disputeController`, `adminController`. |
| `backend/src/services/notificationService.ts` | Creates DB notifications and sends Expo push notifications when a token exists. | Prisma, Expo push endpoint, `EXPO_ACCESS_TOKEN`. | Booking, conversation, review services. |
| `backend/src/services/cleanupJob.ts` | Helpers for stale handoff cleanup and releasing due payouts (`releaseDuePayouts` selects bookings with `disputeStatus: { in: ['NONE', 'RESOLVED_NO_ACTION', 'DISMISSED'] }` — `RESOLVED_REFUND` is excluded to avoid double-paying the owner on top of the Stripe refund already sent). | Prisma, payment/handoff env vars, `paymentService`. | Scheduled every 15 minutes via `node-cron` in `src/index.ts` (skipped when `NODE_ENV=test`); also importable directly. |
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
| `backend/src/integration-tests/disputeResolution.integration.test.ts` | `disputeService.createDispute`/`resolveDispute` at the service and HTTP layer; all three resolution outcomes; the admin-only resolve endpoint; `BookingEvent` audit trail. New: `RESOLVED_REFUND` against a real captured Stripe PaymentIntent (`pm_card_visa` test token) asserts `Booking.paymentStatus` becomes `REFUNDED` with `refundedAt` set — the fix for the previously-stale-`paymentStatus` bug. | `supertest`, `setup.ts`, `disputeService`, real Stripe test-mode payment intents. | `npm run test:integration`. |
| `backend/src/integration-tests/payoutRelease.integration.test.ts` | `cleanupJob.releaseDuePayouts()` against a real Stripe Connect test account: a `COMPLETED`/`PAYOUT_PENDING` booking past the hold window with `disputeStatus` `NONE`/`RESOLVED_NO_ACTION`/`DISMISSED` is released (`paymentStatus` → `PAID_OUT`); one with `RESOLVED_REFUND` is deliberately not (would double-pay the owner); `OPEN`/`UNDER_REVIEW` disputes also block release. | `supertest`, `setup.ts`, `cleanupJob`, real Stripe Connect test account (`DEV_STRIPE_ACCOUNT_ID`). | `npm run test:integration`. |
| `backend/src/integration-tests/stripeWebhooks.integration.test.ts` | Synthetic signed webhook events posted to `/stripe/webhook`; signature verification, unknown event types, replay idempotency. | `supertest`, `setup.ts`, Stripe webhook signing. | `npm run test:integration`. |

### Frontend Config and App Shell

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `frontend/package.json` | Defines Expo scripts: `start`, `android`, `ios`, `web`; lists React Native, Expo, Stripe, navigation, axios dependencies. | npm, Expo. | Frontend development. |
| `frontend/package-lock.json` | Frontend dependency lockfile. | npm. | Reproducible installs. |
| `frontend/tsconfig.json` | Extends Expo TypeScript config with strict mode. | Expo TypeScript base. | Type checking. |
| `frontend/app.json` | Expo app config: name, scheme `zoink`, icons/splash, iOS/Android IDs, plugins for secure store, notifications, image picker, Stripe, and (newly added) `expo-location` with a usage-description string. Before this plugin was added, location permission requests had no `NSLocationWhenInUseUsageDescription` in the generated iOS Info.plist and would silently fail — this affected `HomeScreen`/`SearchScreen`'s existing GPS usage too, not just the new `CreateListingScreen` flow. | Expo/EAS. | Expo runtime and builds; requires a native rebuild (not just reload) to take effect. |
| `frontend/eas.json` | EAS build profiles for development, preview, production. | EAS CLI. | Native development/release builds, especially Stripe native modules. |
| `frontend/.env` | Frontend public env vars for API URL, Stripe publishable key, demo mode. | Expo public env. | Frontend services/config. |
| `frontend/index.ts` | Registers `App` as Expo root component. | Expo, `App.tsx`. | Expo startup. |
| `frontend/App.tsx` | Wraps the app in `StripeProvider`, `AuthProvider`, and `Navigation`. | Stripe config, auth context, navigation. | Root frontend component. |
| `frontend/src/config/demoMode.ts` | Defines `DEMO_MODE`, `DEMO_TOKEN`, and `DEMO_USER`. | `EXPO_PUBLIC_DEMO_MODE`. | Auth and API service mock branches. |
| `frontend/src/config/stripe.ts` | Exposes `STRIPE_PUBLISHABLE_KEY` and `isStripePublishableKeyConfigured`. | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. | `App.tsx`, booking/payment screens. |
| `frontend/src/theme/colors.ts` | Shared color palette and theme tokens. | None. | Screens/components. |
| `frontend/src/types/index.ts` | Shared frontend TypeScript types for users, listings, bookings, conversations, reviews, etc. `DisputeStatus` and `Dispute` are now re-exported from `@zoink/shared` (previously a hand-rolled, drifted 3-value union). New `AdminDisputeListItem`/`AdminDisputeDetail` types model the raw-Prisma-row shape the admin endpoints return (distinct from the DTO-mapped shapes used elsewhere — e.g. `totalPrice` comes through as a string, not a number). | None. | Frontend services/screens/components. |

### Frontend Context and Navigation

| File | What It Does | Depends On | Used By |
|---|---|---|---|
| `frontend/src/context/AuthContext.tsx` | Holds `user` (now includes `role`, decoded from the JWT's `role` claim — previously dropped, which is why no frontend screen could gate on admin status before), `token`, loading state, `register` (now also takes `phone`), `login`, `logout`, `setVerified`; persists JWT with SecureStore/localStorage; sets axios auth header; syncs push token after verified login. | `api`, `demoMode`, `pushNotifications`, SecureStore. | `Navigation`, auth screens, many screens via `useAuth`. |
| `frontend/src/navigation/index.tsx` | Defines `RootStackParamList`; chooses auth stack, verification stack, or verified app stack; checks pending reviews on verified app startup. Now registers `FileDispute`, `AdminDisputes`, and `AdminDisputeDetail` screens/routes. | `useAuth`, screens, `getPendingReviews`, theme. | `App.tsx`. |

### Frontend API and Mock Services

| File | What It Does | Backend Routes Called / Depends On | Used By |
|---|---|---|---|
| `frontend/src/services/api.ts` | Shared axios instance with base URL, auth request interceptor, and 401 token cleanup. | `EXPO_PUBLIC_API_URL`, SecureStore/localStorage. | All real API service wrappers. |
| `frontend/src/services/uploadFormData.ts` | Builds React Native image upload parts from local URIs, preserving filename extensions where present and mapping common image MIME types including PNG, GIF, HEIC/HEIF, and JPEG fallback. | FormData-compatible `{ uri, name, type }` objects. | `listingsApi`, `bookingsApi`, `usersApi`. |
| `frontend/src/services/listingsApi.ts` | Browse/search, nearby listings, categories, CRUD (create/update payloads now include optional `depositAmount`), availability, image upload/delete; image uploads use `getImageUploadPart`; falls back to mocks in demo mode. | `/listings`, `/listings/me`, `/listings/categories`, `/listings/:id/images`. | Listing/search screens. |
| `frontend/src/services/bookingsApi.ts` | Create/list/detail bookings, accept/decline/cancel/activate/complete, handoff initiation/confirm, photo upload, completed photos; handoff photo uploads use `getImageUploadPart`. | `/bookings/*`. | Booking, active rental, handoff, Zoink It screens. |
| `frontend/src/services/conversationsApi.ts` | Open/list conversations, get messages, send messages, `markConversationRead` (calls `POST /conversations/:id/read`). | `/conversations/*`. | Inbox, listing detail, active rental, thread screens. |
| `frontend/src/services/adminApi.ts` | `listDisputes` (optional status filter), `getDisputeDetail`, `resolveDispute`. No demo-mode branch — admin screens require a real backend. | `/admin/disputes*`. | `AdminDisputesScreen`, `AdminDisputeDetailScreen`. |
| `frontend/src/services/disputesApi.ts` | `createDispute`, `getMyDisputes`, `getDispute`; falls back to `mockWeek6.ts`'s dispute mocks in demo mode. | `/disputes*`. | `FileDisputeScreen`, `BookingDetailScreen`. |
| `frontend/src/services/usersApi.ts` | My/public profile, profile update, avatar upload through `getImageUploadPart`, push token update, Stripe Connect onboarding/status. | `/users/*`, `/stripe/connect/status`. | Profile screens, push notification sync. |
| `frontend/src/services/reviewsApi.ts` | Pending reviews and review submission. | `/reviews/pending`, `/reviews`. | Navigation review gate, review prompt screen. |
| `frontend/src/services/pushNotifications.ts` | Requests notification permission, gets Expo push token, configures Android channel, syncs/clears token through `usersApi`. | Expo notifications/constants, `updateMyPushToken`. | `AuthContext`. |
| `frontend/src/services/mockListings.ts` | Demo-mode listing data and fake listing CRUD/image behavior. | Types. | `listingsApi`. |
| `frontend/src/services/mockProfiles.ts` | Demo-mode public/my profile data and profile/avatar updates. | Types. | `usersApi`. |
| `frontend/src/services/mockWeek6.ts` | Demo-mode bookings, conversations, messages, reviews, and (new) disputes behavior (`mockCreateDispute`, `mockGetMyDisputes`, `mockGetDispute`). `mockMarkConversationRead` flips a conversation's `unread` flag off, matching the real read-tracking fix. Deposit calculation now reads the listing's configured `depositAmount` instead of computing 30% of the total. | Types. | `bookingsApi`, `conversationsApi`, `disputesApi`, `reviewsApi`. |

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
| `frontend/src/components/DraggableLocationMap.tsx` | Draggable map for choosing a listing's location: fetches raw OpenStreetMap tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, no API key), renders a translucent green circle fixed at the container's center, and pans the tile layer under it via `PanResponder`/`Animated.ValueXY` as the user drags — the coordinate under the fixed circle is computed on release and passed to `onChange`. No map SDK dependency; see `frontend/src/utils/mapTiles.ts` for the slippy-map tile math (`toTileFloat`/`tileFloatToLatLon`/`buildTileGrid`). Fine for dev/demo traffic only — see the OSM tile usage gap in section 14. | `frontend/src/utils/mapTiles.ts`. | `CreateListingScreen`. |

### Frontend Screens

| File | What It Does | Key Dependencies |
|---|---|---|
| `frontend/src/screens/LoginScreen.tsx` | Login form; calls `useAuth().login`; links to register. | `AuthContext`, navigation, `ScreenBackground`, `ZoinkFullLogo`. |
| `frontend/src/screens/RegisterScreen.tsx` | Registration form (now including a required phone field); calls `useAuth().register`; navigates into verification flow through auth state. | `AuthContext`, navigation, `ScreenBackground`, `ZoinkFullLogo`. |
| `frontend/src/screens/VerificationGateScreen.tsx` | Explains verification requirement and links to OTP screen; supports logout. | `AuthContext`, navigation, `ZoinkFullLogo`. |
| `frontend/src/screens/VerifyEmailScreen.tsx` | Six-digit OTP entry, verify and resend calls; uses `setVerified` with returned token. | `api`, `AuthContext`, `ZoinkLogo`. |
| `frontend/src/screens/MainAppScreen.tsx` | Main verified app shell with custom bottom tabs for Home, Search, Inbox, MyProfile and center create-listing action. | `HomeScreen`, `SearchScreen`, `InboxScreen`, `MyProfileScreen`, navigation. |
| `frontend/src/screens/HomeScreen.tsx` | Home feed: requests GPS via `expo-location` (falling back to a default Toronto coordinate if permission is denied or the request fails), fetches nearby listings within `DEFAULT_RADIUS_KM` (now `5000`, was `50` — the old value silently hid every seeded/demo listing whenever the test device's real GPS position was more than 50km from where the data was seeded), pull-to-refresh. No longer has its own category-chip filter (removed as redundant with `SearchScreen`'s). | `expo-location`, `listingsApi.getNearbyListings`, navigation. |
| `frontend/src/screens/SearchScreen.tsx` | Browse/search UI with categories, nearby/browse API calls (same `50km` → `5000km` radius fix as `HomeScreen`, for the same reason), listing cards with text category-label fallback thumbnails (was a single emoji character), a proper empty-results state (`StateCard`), navigation to details. | `listingsApi`, `SearchBar`, `StateCard`, navigation. |
| `frontend/src/screens/ListingDetailScreen.tsx` | Listing details, image carousel, owner info, chat/request actions. | `getListing`, `openConversation`, navigation, `useAuth`. |
| `frontend/src/screens/CreateListingScreen.tsx` | Multi-step listing creation flow with category/details/pricing (including an optional owner-set deposit)/location/photos, image picker, listing API, image upload. The location step previously submitted a hardcoded Toronto coordinate for every listing regardless of the typed city/address — now it requests real device GPS (`expo-location`), lets the owner drag a pin on `DraggableLocationMap` or search a place name (`Location.geocodeAsync`) to set the exact submitted coordinate, and falls back gracefully (geocode the typed address, then the old Toronto default) if GPS was never available. | `listingsApi`, `expo-image-picker`, `expo-location`, `DraggableLocationMap`, `ZoinkButton`. |
| `frontend/src/screens/EditListingScreen.tsx` | Owner listing editing, category/price/deposit fields, add/remove photos, save. | `listingsApi`, `expo-image-picker`, navigation. |
| `frontend/src/screens/MyListingsScreen.tsx` | Owner listing list with active booking awareness and links to edit/active rentals. | `getMyListings`, `getIncomingRequests`. |
| `frontend/src/screens/BookingRequestScreen.tsx` | Renter booking request form, insurance/payment setup, Stripe PaymentSheet path, creates booking. Deposit shown is now the listing's configured `depositAmount`, not 30% of the rental total. | `bookingsApi`, Stripe React Native, `stripe` config. |
| `frontend/src/screens/BookingHistoryScreen.tsx` | Renter booking history with active rentals pinned. | `getMyBookings`, navigation. |
| `frontend/src/screens/BookingRequestsScreen.tsx` | Owner incoming booking requests; accept/decline actions. | `getIncomingRequests`, `acceptBooking`, `declineBooking`. |
| `frontend/src/screens/BookingDetailScreen.tsx` | Booking detail/actions for owner/renter, cancellation, photo viewing (navigates to `PhotoViewerScreen`), handoff navigation. Now shows a "Report a Problem" action (navigates to `FileDispute`) once the booking is `ACTIVE`/`PICKUP_PENDING`/`RETURN_PENDING`/`COMPLETED` with no active dispute, a banner while a dispute is `OPEN`/`UNDER_REVIEW`, and the outcome (with resolution notes, if the viewer raised it) once resolved. | `bookingsApi`, `disputesApi`, `useAuth`. |
| `frontend/src/screens/ActiveRentalScreen.tsx` | Live rental detail screen with item, dates, other party, deposit, chat, pickup/return actions. | `getBooking`, `openConversation`, `useAuth`. |
| `frontend/src/screens/ZoinkItScreen.tsx` | Combined handoff photo capture + synchronized confirmation screen (absorbed the former `HandoffPhotoScreen`, now removed). Requests media-library permission, requires 2-3 photos, uploads and calls `initiateHandoff`; photos can be re-picked/resubmitted (calls `initiateHandoff` again) any time before the phase is confirmed. Once photos exist, polls booking state and calls `confirmHandoff` for the synchronized tap, with success animation and timeout. | `uploadHandoffPhotoImage`, `initiateHandoff`, `confirmHandoff`, `getBooking`, image picker Expo APIs, `useAuth`. |
| `frontend/src/screens/PhotoViewerScreen.tsx` | Full-screen, swipeable, pinch-to-zoom photo viewer used for both listing photos and rental pickup/return photos. Takes `{ photos: string[], initialIndex: number }` route params; renders `react-native-zoom-toolkit`'s `Gallery`. Registered as a real navigator screen (`presentation: 'fullScreenModal'`), not React Native's `Modal` — `GestureDetector`-based components are unreliable inside an actual `Modal`'s separate native view hierarchy, especially on Android. | `react-native-zoom-toolkit` (`Gallery`, `fitContainer`). |
| `frontend/src/screens/InboxScreen.tsx` | Conversation inbox; highlights conversations where `unread` is true (now backed by real per-participant read state — see `conversationService.ts` — instead of never clearing after being read). | `conversationsApi`, navigation. |
| `frontend/src/screens/ConversationThreadScreen.tsx` | Message thread with polling and incremental message fetch; sends messages; now also calls `markConversationRead` on open and on every poll tick while the thread stays focused, so the inbox's unread badge actually clears (and stays cleared even if a new message arrives while the thread is open). | `getConversationMessages`, `sendMessage`, `markConversationRead`, `useAuth`. |
| `frontend/src/screens/MyProfileScreen.tsx` | Own profile display/edit, avatar upload, payout status, Stripe onboarding, profile prompt, logout. Shows an "Admin" quick-action panel linking to `AdminDisputes`, but only when `user.role === 'ADMIN'`. | `usersApi`, `AuthContext`, image picker, AppState. |
| `frontend/src/screens/FileDisputeScreen.tsx` | Dispute-filing form (reason picker + description, min 10 characters); calls `createDispute`, navigates back on success. | `disputesApi`, navigation. |
| `frontend/src/screens/AdminDisputesScreen.tsx` | Admin-only status-filterable list of disputes (All/Open/Under Review/Refunded/No Action/Dismissed); taps through to detail. | `adminApi.listDisputes`, navigation. |
| `frontend/src/screens/AdminDisputeDetailScreen.tsx` | Admin-only dispute detail: reason/description, booking context, pickup/return photos, and a resolve action (refund / no action / dismiss) requiring resolution notes; refetches after resolving since the resolve endpoint returns a bare dispute row without booking/user relations. | `adminApi.getDisputeDetail`/`resolveDispute`, navigation. |
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

1. `backend/src/index.ts` loads `.env` (skipped when `NODE_ENV=test`), creates an Express app, enables CORS, registers the raw Stripe webhook endpoint (`/stripe/webhook`) before JSON parsing, then enables `express.json()`. Local dev must run `stripe listen --forward-to localhost:3000/stripe/webhook` (not `/webhook`, which 404s on every event with no obvious failure signal) — see README's "Stripe Webhooks (local dev)". A misconfigured path here leaves `Booking.paymentStatus` stuck at `PENDING_AUTH` (see `stripeWebhookController.ts`'s `updateBookingFromEvent`), which then blocks owner acceptance via the `paymentStatus === AUTHORIZED || CAPTURED` check in `bookingService.ts`.
2. Health/root routes return simple JSON.
3. Stripe Connect return/refresh pages (`/stripe-return`, `/stripe-refresh`) serve small HTML responses that link back to `zoink://`. These page URLs — not the `zoink://` scheme itself — are what get passed to Stripe as `return_url`/`refresh_url` (via `STRIPE_CONNECT_RETURN_URL`/`STRIPE_CONNECT_REFRESH_URL`, required env vars); Stripe's account-link API only accepts `http(s)://` redirect URLs, so `paymentService.ts`'s `getStripeConnectRedirectUrl` fails fast with a config error if either var is unset rather than falling back to an invalid `zoink://` URI.
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
| `User` | Account, profile, verification, role, push token, Stripe customer/account IDs. `phone` is required (`NOT NULL`) as of the `20260730000000_make_phone_required` migration. | Owns listings; renter/owner bookings; renter/owner conversations; messages; reviews; reputation; notifications; verification tokens; raised disputes (`raisedDisputes`); disputes resolved as admin (`resolvedDisputes`). |
| `VerificationToken` | OTP codes for student email verification. | Belongs to `User`, cascade delete. |
| `Listing` | Rentable item with title, description, category, price, value, availability, location, and an owner-configured `depositAmount` (added by `20260802233912_add_listing_deposit_amount`, replaces the old auto-calculated 30%-of-total deposit). | Belongs to owner `User`; has images, bookings, conversations. |
| `ListingImage` | Image URL and display order for listings. | Belongs to `Listing`, cascade delete. |
| `Booking` | Rental request and lifecycle state, dates, pricing, payment, handoff photos/taps, dispute status. | Belongs to renter, owner, listing; has reviews, obligations, events, `Dispute` records. |
| `BookingEvent` | Immutable audit trail for booking/payment/handoff/dispute changes. | Belongs to `Booking`, cascade delete. |
| `Dispute` | A single dispute raised on a booking: reason, description, status, resolution notes, resolving admin. | Belongs to `Booking`; `raisedByUser` and optional `resolvedByAdmin` both reference `User`. |
| `Conversation` | Chat thread for one listing and renter/owner pair. Tracks each participant's last-read time (`renterLastReadAt`/`ownerLastReadAt`, added by `20260802231040_add_conversation_read_state`) so unread state reflects whether *that* participant has actually opened the thread, not just who sent the last message. | Unique by `listingId + renterId`; has messages. |
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

`CreateListingScreen` collects item details (title/category/description/price/optional deposit), creates a listing through `listingsApi.createListing`, uploads selected photos through `uploadListingImage`, and can set availability. Uploads share `getImageUploadPart` for URI filename/MIME handling. Backend path is `/listings` and `/listings/:id/images` -> `listingController` -> `listingService` -> Prisma `Listing`/`ListingImage` plus Cloudinary.

The location step requests device GPS via `expo-location` (requires the `expo-location` config plugin in `app.json` — previously missing, so this silently never worked), then shows a draggable map (`DraggableLocationMap`) with a translucent circle the owner can drag to the exact spot, or a text search box (`Location.geocodeAsync`) to jump to a named place. The submitted coordinate is whatever the owner ends up with — dragged/searched location if set, else the GPS reading, else a geocode of the typed city/address, else a hardcoded Toronto fallback as a last resort. Previously this step always silently submitted the Toronto fallback regardless of GPS or the typed address.

### Browsing / Searching Listings

`SearchScreen` calls `getNearbyListings` or `browseListings`. Backend `/listings` supports query/category/price/location/radius parameters in `listingController.browseListings`, then `listingService.browseListings`.

### Requesting a Rental

`BookingRequestScreen` creates a booking with dates, message, and optional insurance. Backend `bookingService.createBooking` calculates rental days and total price, reads the deposit directly from the listing's configured `depositAmount` (no longer computes 30% of the total — `calculateDepositAmount()`/`BOOKING_DEPOSIT_RATE` have been removed), calculates insurance/commission/owner payout, creates a PaymentIntent or mock authorization, stores booking, and notifies the owner.

### Owner Accept / Decline

`BookingRequestsScreen` or `BookingDetailScreen` calls accept/decline endpoints. `bookingService.transitionBookingStatus` enforces the state machine and payment/payout prerequisites.

### Pickup / Dropoff Photo Flow And Zoink It Confirmation

`ZoinkItScreen` handles both photo capture and confirmation in one screen (the former separate `HandoffPhotoScreen` has been removed). It requests media-library permission, collects 2-3 photos, uploads images to `/bookings/:id/photos/upload`, then calls the pickup/return initiate endpoint. `handoffService.initiateHandoff` distinguishes the *first* submission — which sets `PICKUP_PENDING`/`RETURN_PENDING`, stores photo URLs, writes a `STATUS_CHANGE` audit event, and notifies the other party — from a later *edit* (calling initiate again while already in the pending status, allowed up until the phase is confirmed), which only updates the stored photos and logs an `UPLOAD_PHOTOS` event marked `edited: true`; it does not re-transition status, re-notify, or reset any tap already registered.

Once photos exist, the same screen polls booking state and calls `confirmHandoff` for the synchronized tap. Backend `handoffService.confirmHandoff` records owner/renter tap timestamps. If both confirm within `ZOINK_TAP_WINDOW_MS`, pickup moves to `ACTIVE`; return moves to `COMPLETED`, triggers payment/payout/review updates. `ActiveRentalScreen`/`BookingDetailScreen` show a single "Zoink It" action once a phase is pending, for either party — not just whichever party didn't initiate it.

### Deposits and Payments

`paymentService` calculates commission, owner payout, and insurance (deposit now comes from `Listing.depositAmount` instead of being calculated here — see `bookingService.createBooking`). Booking creation creates a Stripe PaymentIntent when Stripe is configured or mock payment state when not. Capture happens around pickup confirmation. Payout helpers release funds after the configured hold and are scheduled via `node-cron` in `src/index.ts` (skipped when `NODE_ENV=test`).

### Messaging

`ListingDetailScreen` and `ActiveRentalScreen` can open a conversation. `InboxScreen` lists conversations, highlighting ones with `unread: true`. `ConversationThreadScreen` polls messages, sends new ones, and calls `markConversationRead` on open and on every poll tick while focused. Backend uses `Conversation` (with per-participant `renterLastReadAt`/`ownerLastReadAt`) and `Message` models; `conversationService.getMyConversations` computes `unread` per-viewer as "last message wasn't sent by me, and is newer than my own last-read timestamp" — previously it ignored read state entirely and a thread stayed marked unread until the reader sent their own reply. Sends push notifications on new messages.

### Reviews

After completed rentals, backend creates review obligations. `Navigation` checks pending reviews before loading the main app. `ReviewPromptScreen` submits scores/comments and loads the next pending review if any.

### Disputes

`FileDisputeScreen` (reached from `BookingDetailScreen`'s "Report a Problem" action, shown once the booking is `ACTIVE`/`PICKUP_PENDING`/`RETURN_PENDING`/`COMPLETED` and there's no already-open dispute) collects a reason and description, then `disputesApi.createDispute` -> `disputeController.createDispute` -> `disputeService.createDispute` (participant check, one-open-dispute-per-booking check, `DISPUTE_OPENED` `BookingEvent`, sets `Booking.disputeStatus = OPEN`) -> `POST /disputes`. Renter or owner can view their own disputes (`GET /disputes`) or a specific one they're party to (`GET /disputes/:id`); `BookingDetailScreen` shows an active-dispute banner or the resolution outcome once settled.

### Admin / Moderation

`User.role` (`USER`/`ADMIN`) is carried in the JWT (now also decoded into `AuthContext.user.role` on the frontend — it wasn't before) and enforced by `requireAdmin`. `MyProfileScreen` shows an "Admin" panel linking to `AdminDisputesScreen` only when `user.role === 'ADMIN'`. Admins list/filter disputes (`GET /admin/disputes`) via `AdminDisputesScreen`, inspect one (`GET /admin/disputes/:id`) via `AdminDisputeDetailScreen` (booking/photo context), and resolve it (`PATCH /admin/disputes/:id/resolve` -> `disputeService.resolveDispute`), which issues a Stripe refund and sets `Booking.paymentStatus = REFUNDED`/`refundedAt` on `RESOLVED_REFUND`, updates `Booking.disputeStatus`, and writes a `DISPUTE_RESOLVED` `BookingEvent`. There is still no admin route/screen to change a user's `role` — it must currently be set directly in the database or via `prisma/seed.ts`-style scripting, which means the new admin UI is unreachable for anyone without DB access.

## 10. How Files Interact

### Frontend to Backend Route Map

| Frontend File | Backend Route(s) |
|---|---|
| `AuthContext.tsx` | `/auth/register`, `/auth/login` |
| `VerifyEmailScreen.tsx` | `/auth/verify-email`, `/auth/resend-otp` |
| `listingsApi.ts` | `/listings`, `/listings/me`, `/listings/categories`, `/listings/:id`, `/listings/:id/availability`, `/listings/:id/images` |
| `bookingsApi.ts` | `/bookings`, `/bookings/me`, `/bookings/requests`, `/bookings/:id`, `/bookings/:id/*` |
| `conversationsApi.ts` | `/conversations`, `/conversations/me`, `/conversations/:id/messages`, `/conversations/:id/read` |
| `usersApi.ts` | `/users/me`, `/users/:id`, `/users/me/avatar`, `/users/me/push-token`, `/users/me/stripe-connect/onboard`, `/stripe/connect/status` |
| `reviewsApi.ts` | `/reviews/pending`, `/reviews` |
| `disputesApi.ts` | `/disputes`, `/disputes/:id` |
| `adminApi.ts` | `/admin/disputes`, `/admin/disputes/:id`, `/admin/disputes/:id/resolve` |

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

Do not commit real secret values. The repo contains `.env` files with sensitive-looking values; rotate any exposed keys if this repo has been shared. `.gitignore` now covers `backend/.env`, `backend/.env.test`, and `frontend/.env`.

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
| `STRIPE_CONNECT_RETURN_URL` | `paymentService.ts` | Required. Must be an `http://localhost` or `https://` URL pointing at the backend's `/stripe-return` page (e.g. `<ngrok-url>/stripe-return`) — not the `zoink://` scheme itself, which Stripe's account-link API rejects. Missing/invalid values throw immediately instead of falling back. When testing through ngrok, must be updated (and the backend restarted) every time the tunnel URL changes, same as `EXPO_PUBLIC_API_URL`. |
| `STRIPE_CONNECT_REFRESH_URL` | `paymentService.ts` | Required. Same rules as `STRIPE_CONNECT_RETURN_URL`, pointing at `/stripe-refresh`. |
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
| `EXPO_PUBLIC_API_URL` | `services/api.ts` | Backend base URL. When testing through ngrok, changes every tunnel session — see `STRIPE_CONNECT_RETURN_URL`/`REFRESH_URL` above, which must be updated in lockstep. |
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
| Secrets | `backend/.env`, `backend/.env.test`, and `frontend/.env` contain real-looking credentials/keys and are gitignored — rotate them if this repo has been shared. |
| `.env.test` not ignored | ~~Resolved~~ — `.gitignore` now lists `backend/.env.test` alongside `backend/.env`, `frontend/.env`, `.env.local`, `.env.production`. It was never committed to git history (confirmed via `git log --all --diff-filter=A -- '**/.env.test'`, no results). |
| Migration ordering bug | ~~Resolved~~ — `backend/prisma/migrations/20260721000000_add_role_and_disputes/migration.sql` no longer alters `disputes.status` before `CREATE TABLE "disputes"` runs (that line was unnecessary: `CREATE TABLE "disputes"` already declares `"status" "DisputeStatus"`, and by that point in the same migration `"DisputeStatus"` already refers to the renamed 6-value enum). A fresh `prisma migrate deploy` now succeeds. The file's first line also had a stray Prisma CLI banner (non-SQL text) baked in, which has been stripped. `apply_to_test_db.sql` is now obsolete/historical only. **Caveat:** any local `zoink_test` database that already recorded this migration via the old workaround has a `_prisma_migrations` row with a fabricated `manual_apply` checksum (and, in at least one observed case, a second failed row with the real pre-fix checksum and `finished_at = NULL`) — editing the migration file changes its checksum, so `prisma migrate status`/`deploy` against such an already-migrated database will report drift. This only affects databases migrated before this fix; a fresh database is unaffected. |
| Payout permanently blocked after dispute resolution | ~~Resolved~~ — `cleanupJob.releaseDuePayouts` now selects `disputeStatus: { in: ['NONE', 'RESOLVED_NO_ACTION', 'DISMISSED'] }` instead of only `'NONE'`, so bookings resolved with no refund become payout-eligible again. `RESOLVED_REFUND` is deliberately still excluded — `disputeService.resolveDispute` calls `refundPaymentIntent` on that path and (as of the follow-up below) also sets `Booking.paymentStatus = REFUNDED` + `refundedAt`, so it no longer matches the `PAYOUT_PENDING` filter at all. Covered by `backend/src/integration-tests/payoutRelease.integration.test.ts` (new). |
| Admin/disputes frontend | ~~Mostly resolved~~ — `FileDisputeScreen` (renter/owner, from `BookingDetailScreen`'s "Report a Problem"), `AdminDisputesScreen` + `AdminDisputeDetailScreen` (admin list/resolve, from `MyProfileScreen`'s "Admin" panel, gated on `user.role === 'ADMIN'`) now exist — see `frontend/src/services/disputesApi.ts` and `adminApi.ts`. **Still missing:** there is no route/screen to change a user's `Role`; it must be set directly in the database or via `prisma/seed.ts`-style scripting, which means the new admin UI is unreachable for anyone without DB access. |
| Grant/revoke admin role | New gap (see row above) — no API route or screen sets `User.role`. `requireAdmin.ts` and the JWT-embedded `role` claim work correctly once the column is set some other way. |
| Listing-location map uses raw OSM tiles | `frontend/src/components/DraggableLocationMap.tsx` (used by `CreateListingScreen`) fetches tiles directly from `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with no API key, via `frontend/src/utils/mapTiles.ts`'s hand-rolled slippy-map math. Fine for low-traffic dev/demo use, but OpenStreetMap's tile usage policy doesn't permit this at real app scale (no custom User-Agent, no rate limiting, no attribution beyond a small on-map label) — swap to a commercial static-tile provider before production traffic. |
| Native build/release changes unverified | `frontend/eas.json` gained a `submit.production.ios` block (App Store Connect app id) and `frontend/package.json`'s `ios`/`android` scripts moved from Expo Go (`expo start --ios`) to native dev-client builds (`expo run:ios`/`run:android`); `@stripe/stripe-react-native` was bumped `0.50.3` → `0.61.0`. None of this has been confirmed to actually produce a working build or TestFlight submission yet. |
| Frontend dispute type drift | ~~Resolved~~ — `frontend/src/types/index.ts` now imports `DisputeStatus` directly from `@zoink/shared` (generated from the Prisma enum), which has all six values (`NONE`, `OPEN`, `UNDER_REVIEW`, `RESOLVED_REFUND`, `RESOLVED_NO_ACTION`, `DISMISSED`) instead of a hand-rolled 3-value union. |
| ID verification | User fields for ID photo/selfie/manual review exist, but no current submission/review flow was found. |
| Validation | ~~Resolved~~ — Zod v4 schema layer added in Phase 5: `src/schemas/*.schema.ts` + `src/middleware/validate.ts`. |
| Error handling | ~~Resolved~~ — Centralized `errorHandler.ts` added in Phase 4; extended for `ZodError` in Phase 5. |
| Scheduled jobs | ~~Resolved~~ — `cleanupJob.ts` and `reconciliationJob.ts` are now registered with `node-cron` in `backend/src/index.ts` (skipped only when `NODE_ENV=test`). |
| Unmounted payments route | ~~Resolved~~ — `backend/src/routes/payments.ts`, `paymentController.ts`, `backend/app.json`, `backend/stripe.ts`, and `frontend/src/services/paymentsApi.ts` have all been removed. Stripe Connect flows exclusively through `/users/me/stripe-connect/*` and `/stripe/connect/status` now. |
| Tests | Unit tests cover services/middleware/controllers; integration tests (`backend/src/integration-tests/`) now cover booking lifecycle, cancellation, disputes, and Stripe webhooks end-to-end via `supertest` against a real Postgres test DB and Stripe test mode. `bookingLifecycle.integration.test.ts` now covers sequential-tap handoff confirmation, photo-resubmission-without-re-notifying, review-obligation creation, and notification-dedup assertions — narrower than originally noted here. Still not covered: true concurrent/simultaneous confirm requests (no test issues overlapping requests via e.g. `Promise.all`). Frontend test setup was not found. |
| Cancellation fees disabled for launch | `bookingService.calculateCancellationFeeCents()` is short-circuited to always `return 0` (product decision — no fee at launch). The original tiered clamp($5, $25, totalPrice × 5%) logic is retained but unreachable, for a planned owner opt-in "cancellation fee" feature (same pattern as `Listing.insuranceOptIn`, not yet implemented — there's no `Listing`-level toggle or schema field for it yet). `README.md`'s "Cancellation Rules" section reflects the current fee-free behavior; the tiered-fee integration tests are skipped (not deleted) with a reason pointing back here. |
| `req.query` fix (Express 5) | `validate.ts` previously did `req.query = data.query`, which throws on Express 5 since `req.query` is a getter-only accessor with no setter. Fixed via `Object.defineProperty`. Resolved, documented here as a note for anyone touching that middleware again. |
| Integration test Stripe account (resolved) | `giveOwnerStripeAccount()` in both `bookingLifecycle.integration.test.ts` and `bookingCancellation.integration.test.ts` used to fall back to the fake id `'acct_mock_test'`, which caused live `StripePermissionError`s (403) on every accept/pickup/cancellation test once a real `sk_test_...` key was present in `.env.test`. Both now read a real Connect account id from `DEV_STRIPE_ACCOUNT_ID` and throw immediately if it's unset. See the `DEV_STRIPE_ACCOUNT_ID` env var row above. |
| Type drift | Frontend types are separate from Prisma/backend response types, so API changes can drift silently (see the dispute-status drift above for a concrete current example). |
| Demo mode env casing | `DEMO_MODE` checks `EXPO_PUBLIC_DEMO_MODE === 'true'`; uppercase `TRUE` will not enable demo mode. |
| Duplicate webhook mount | ~~Resolved~~ — `backend/src/index.ts` mounted `stripeWebhook` at both `/stripe/webhook` and `/api/stripe/webhook`. The latter was removed and `/stripe/webhook` kept: it's the only path referenced anywhere in this repo (README's `stripe listen` instructions, `stripeWebhooks.integration.test.ts`), no other route uses an `/api` prefix, and checking the Stripe Dashboard (Developers → Webhooks) confirmed no webhook destination is configured there at all — the empty "+ Add destination" state. Pre-launch, so nothing in production depended on the removed path either. |
| Encoding | Some source comments/output show mojibake characters from earlier non-ASCII text. Worth cleaning for readability. |
| Messaging unread state never cleared | ~~Resolved~~ — `unread` was computed as `lastMessage.senderId !== currentUserId`, with no notion of having actually viewed the thread, so a conversation stayed "highlighted" indefinitely after being opened and read, clearing only once the reader sent their own reply. Fixed with `Conversation.renterLastReadAt`/`ownerLastReadAt` (new migration `20260802231040_add_conversation_read_state`), a `POST /conversations/:id/read` endpoint (`conversationService.markConversationRead`), and `ConversationThreadScreen` calling it on focus and on every 4s poll tick while the thread is open. |
| Location permission silently broken | ~~Resolved~~ — `frontend/app.json` had no `expo-location` config plugin at all, so there was no `NSLocationWhenInUseUsageDescription` in the generated iOS Info.plist — `Location.requestForegroundPermissionsAsync()` calls (in `HomeScreen`, `SearchScreen`, and the now-added `CreateListingScreen` GPS flow) would fail on-device with no obvious error. Fixed by adding the `expo-location` plugin with a usage-description string; requires a native rebuild (not just a JS reload) to take effect. Separately, `CreateListingScreen` was submitting a hardcoded Toronto coordinate for every listing regardless of GPS or the typed address — also fixed (see `DraggableLocationMap` row below and the Frontend Screens table). |
| Owner-configured deposits | ~~Feature added~~ — `Listing.depositAmount` (new migration `20260802233912_add_listing_deposit_amount`, `DECIMAL(10,2) DEFAULT 0`) replaces the old auto-calculated 30%-of-total deposit (`BOOKING_DEPOSIT_RATE`/`calculateDepositAmount()`, removed from `bookingUtils.ts`). Set by the owner in `CreateListingScreen`/`EditListingScreen`; `bookingService.createBooking` now reads `listing.depositAmount` directly. |
| Phone number required at registration | ~~Feature added~~ — `RegisterSchema` (`backend/src/schemas/auth.schema.ts`) requires a 10-digit Canadian/NANP phone number, normalized to `+1XXXXXXXXXX` before storage; `User.phone` is a required (`NOT NULL`) column, backfilled for pre-existing rows by migration `20260730000000_make_phone_required` with a placeholder value (`+10000000000`) that's deliberately obviously-fake. `RegisterScreen` collects it; `AuthContext.register`'s signature gained a `phone` parameter. |

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
| Auth/login/register | `AuthContext.tsx`, `LoginScreen.tsx`, `RegisterScreen.tsx` (now collects phone), `VerifyEmailScreen.tsx` | `routes/auth.ts`, `authController.ts`, `authService.ts`, `requireAuth.ts`, `schemas/auth.schema.ts` (Canadian/NANP phone validation + normalization) | `User` (`phone` now required), `VerificationToken` |
| Verification | `VerificationGateScreen.tsx`, `VerifyEmailScreen.tsx` | `authService.ts`, `requiredVerified.ts` | `VerificationStatus`, `VerificationToken` |
| Listings | `CreateListingScreen.tsx` (now real GPS + `DraggableLocationMap`, plus optional deposit), `EditListingScreen.tsx` (deposit field), `ListingDetailScreen.tsx`, `MyListingsScreen.tsx`, `SearchScreen.tsx`, `listingsApi.ts` | `routes/listings.ts`, `listingController.ts`, `listingService.ts`, `cloudinary.ts`, `schemas/listing.schema.ts` | `Listing` (now has `depositAmount`), `ListingImage` |
| Rentals/bookings | `BookingRequestScreen.tsx`, `BookingHistoryScreen.tsx`, `BookingRequestsScreen.tsx`, `BookingDetailScreen.tsx`, `ActiveRentalScreen.tsx`, `bookingsApi.ts` | `routes/bookings.ts`, `bookingController.ts`, `bookingService.ts`, `bookingStateMachine.ts`, `bookingUtils.ts`, `schemas/booking.schema.ts` | `Booking`, `BookingEvent` |
| Deposits/payments | `BookingRequestScreen.tsx`, `config/stripe.ts` | `paymentService.ts`, `stripeWebhookController.ts`, `cleanupJob.ts`, `reconciliationJob.ts`, `schemas/stripe.schema.ts` | `Booking.paymentStatus`, payment/deposit/payout fields |
| Handoff photos / Zoink It | `ZoinkItScreen.tsx`, `ActiveRentalScreen.tsx`, `bookingsApi.ts`, `uploadFormData.ts` | `handoffService.ts`, `bookingController.ts`, `cloudinary.ts`, `schemas/handoff.schema.ts` | `Booking.pickupPhotos`, `returnPhotos`, tap timestamps |
| Photo viewing (listings + handoff) | `PhotoViewerScreen.tsx`, `ListingDetailScreen.tsx`, `BookingDetailScreen.tsx` | N/A (frontend-only) | N/A |
| Input validation | N/A (handled server-side) | `src/middleware/validate.ts`, `src/schemas/*.schema.ts`, `src/middleware/errorHandler.ts` | N/A |
| Messaging | `InboxScreen.tsx`, `ConversationThreadScreen.tsx` (calls `markConversationRead`), `conversationsApi.ts` | `routes/conversations.ts` (`POST /conversations/:id/read`), `conversationController.ts`, `conversationService.ts` | `Conversation` (now has `renterLastReadAt`/`ownerLastReadAt`), `Message` |
| Reviews/reputation | `ReviewPromptScreen.tsx`, `ProfileCard.tsx`, `reviewsApi.ts` | `routes/reviews.ts`, `reviewController.ts`, `reviewService.ts`, `bookingService.ts` | `Review`, `ReviewObligation`, `UserReputation` |
| Disputes/admin | `FileDisputeScreen.tsx`, `BookingDetailScreen.tsx`, `disputesApi.ts` (filing/viewing); `AdminDisputesScreen.tsx`, `AdminDisputeDetailScreen.tsx`, `adminApi.ts` (admin review/resolve, gated on `user.role === 'ADMIN'` in `MyProfileScreen.tsx`) | `routes/disputes.ts`, `routes/admin.ts`, `disputeController.ts`, `adminController.ts`, `disputeService.ts`, `requireAdmin.ts`, `schemas/dispute.schema.ts` | `Dispute`, `Booking.disputeStatus`, `User.role` (still no route/screen to *set* a user's role — DB/script only) |
| Push notifications | `pushNotifications.ts`, `AuthContext.tsx` | `notificationService.ts`, `userService.ts`, relevant feature services | `Notification`, `User.expoPushToken` |
| UI theme | `theme/colors.ts`, shared components, screen styles | Not applicable | Not applicable |
| Landing page | `landing/index.html`, `landing/assets/*` | Not applicable | Not applicable |

Keep this document updated when routes, models, env vars, or major flows change.
