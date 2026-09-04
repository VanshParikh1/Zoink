# Zoink Codebase Overview

This document explains the current Zoink repository so a new developer can understand what exists, how the pieces connect, and where to make changes. It reflects the code in this repo as of the booking-flow rework, the separately-authorized security deposit, 13% HST, tiered commission, abuse reports, rate limiting / Sentry, the review rework, the app-wide neobrutalist design system, and a security-hardening pass (fail-closed Stripe webhook verification, DB-backed `role`/`verificationStatus` resolution in `requireAuth`, and per-caller response shaping on the dispute and handoff endpoints).

## 1. Project Overview

Zoink is a student-focused peer-to-peer rental marketplace. Verified university students list items and rent from each other. The app covers university-email + phone registration with OTP verification, listing creation (images, item value, owner-configured security deposit, real GPS location), browse/search, booking requests, renter/owner messaging with real per-participant read tracking, a Stripe-based booking → pay → handoff → payout lifecycle with a separately-held security deposit, 13% Ontario HST and tiered platform commission, photo-verified synchronized pickup/return ("Zoink It"), reviews (including an item review), push notifications, a role-based dispute-filing and admin-resolution flow, abuse reporting for listings and users, rate limiting, error tracking, and a static marketing/waitlist landing page.

The repository has four areas:

| Area | Purpose |
|---|---|
| `frontend/` | Expo React Native mobile app (also web-capable). |
| `backend/` | Express API, Prisma DB access, auth, payments, bookings, messaging, reviews, disputes, reports, notifications, jobs, tests. |
| `packages/shared/` | Prisma-generated TypeScript interfaces + hand-written response DTOs, published to both sides as `@zoink/shared`. |
| `landing/` | Standalone static HTML/CSS/JS landing page for waitlist and marketing. |

## 2. Tech Stack

| Concern | Tools Used |
|---|---|
| Frontend app | React Native 0.81, Expo SDK 54, TypeScript, React 19 |
| Frontend navigation | `@react-navigation/native`, `@react-navigation/native-stack` |
| Frontend HTTP | `axios` with a shared interceptor in `frontend/src/services/api.ts` |
| Frontend auth storage | `expo-secure-store` on native, `localStorage` on web |
| Frontend images | `expo-image-picker`; shared upload-part helper in `frontend/src/services/uploadFormData.ts` |
| Frontend location / maps | `expo-location`; hand-rolled slippy-map tile math in `frontend/src/utils/mapTiles.ts` over MapTiler raster tiles (OSM fallback). No map SDK. |
| Frontend notifications | `expo-notifications` |
| Frontend payments | `@stripe/stripe-react-native` (pinned `0.62.0`), Stripe PaymentSheet |
| Frontend styling | React Native `StyleSheet` + a shared neobrutalist theme in `frontend/src/theme/colors.ts` (type scale, radius scale, hard "block" shadow), `expo-linear-gradient`, `expo-blur` |
| Frontend gestures/animation | `react-native-gesture-handler`, `react-native-reanimated` + `react-native-worklets`, `react-native-zoom-toolkit` — versions pinned to Expo SDK 54's compatible set; see README "Native dependency versions" |
| Frontend error tracking | `@sentry/react-native`, initialized in `App.tsx` (DSN-only) |
| Backend API | Node.js, Express 5, TypeScript |
| Backend auth | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`) |
| Backend hardening | `helmet`, `express-rate-limit`, `app.set('trust proxy', 1)` |
| Backend upload handling | `multer` memory storage → Cloudinary |
| Backend email | AWS SES |
| Backend payments | Stripe SDK (rental + separate deposit PaymentIntents, Connect transfers) |
| Backend error tracking | `@sentry/node` (`backend/src/instrument.ts`, sensitive keys scrubbed, skipped in test) |
| Database | PostgreSQL |
| ORM | Prisma 7 with `@prisma/adapter-pg` and `pg` |
| Shared types | `prisma-generator-typescript-interfaces` → `packages/shared/generated/prisma-models.ts`; DTOs in `packages/shared/src/dto.ts` |
| Validation | Zod v4 schemas in `src/schemas/*.schema.ts` + `src/middleware/validate.ts`; `ZodError` → centralized error handler |
| Testing | Node built-in test runner with `ts-node/register` (unit); `supertest` + real Postgres test DB + Stripe test mode (`backend/src/integration-tests/`) |
| Scheduled jobs | `node-cron`, registered in `backend/src/index.ts` (skipped when `NODE_ENV=test`) |
| Authorization roles | `Role` enum (`USER`/`ADMIN`) on `User`. The JWT carries a `role` claim, but `requireAuth` re-reads `role` + `verificationStatus` from the DB per request; `requireAdmin` / `requireVerified` enforce that live value |
| Landing page | Static HTML, Tailwind CDN, Lucide CDN, inline CSS/JS |

## 3. Folder Structure

```text
Zoink/
  .gitignore  README.md  CODEBASE_OVERVIEW.md  PRODUCT.md  ZOINK_PUNCHLIST.md
  package.json           # npm workspaces: backend, frontend, packages/shared
  backend/
    prisma/
      schema.prisma  seed.ts  migrations/
    src/
      index.ts  instrument.ts
      middleware/
        requireAuth.ts  requireAdmin.ts  requiredVerified.ts
        errorHandler.ts  validate.ts  rateLimiter.ts
        bookingStateMachine.ts
        *.test.ts
        controllers/
      routes/
      schemas/          # auth, booking, conversation, dispute, handoff,
                        # listing, report, review, stripe, user
      scripts/          # week7SmokeFlow.ts, manageAdminRole.ts(+test)
      services/
      integration-tests/
      testUtils/
      utils/            # asyncHandler, cloudinary, errors, prisma
  frontend/
    App.tsx  app.json  eas.json  metro.config.js  index.ts
    src/
      components/  config/  context/  navigation/
      screens/  services/  theme/  types/  utils/
  packages/shared/
    generated/prisma-models.ts   # generated from schema.prisma
    src/dto.ts  src/index.ts      # response DTOs → @zoink/shared
  landing/
    index.html  assets/
```

Generated/dependency folders (`node_modules`, `dist`, `.expo`, `packages/shared/generated` output) are not documented file-by-file.

## 4. File-by-File Explanation

### Root Files

| File | What It Does |
|---|---|
| `.gitignore` | Ignores `node_modules`, `dist/`, `build/`, `packages/shared/generated/`, `.expo/`, and env files: `backend/.env`, `backend/.env.test`, `frontend/.env`, `.env.local`, `.env.production`. Also `.claude/launch.json` and `backend/prisma/migrations/migration_lock.toml`. |
| `README.md` | Product status, setup, booking lifecycle, payments/handoff/disputes, env vars, roadmap. |
| `CODEBASE_OVERVIEW.md` | This document. |
| `PRODUCT.md` | Product narrative / positioning. |
| `ZOINK_PUNCHLIST.md` | Running punchlist of pre-launch items. |
| `package.json` | npm workspaces (`backend`, `frontend`, `packages/shared`); `overrides` pin `react-native`, `expo`, and `semver 7.8.5` (monorepo hoisting fix). Scripts: `dev:backend`, `dev:frontend`, `build:backend`, `test:backend`, `typecheck:backend`, `typecheck:frontend`, `generate`. |

### `packages/shared`

| File | What It Does |
|---|---|
| `packages/shared/generated/prisma-models.ts` | Generated by the `typescriptInterfaces` generator in `schema.prisma` — plain TS interfaces + enums for every Prisma model, `dateType: 'string'`, `decimalType: 'string'`. Git-ignored; produced by `prisma generate`. |
| `packages/shared/src/dto.ts` | Hand-written API response DTOs built on the generated enums: `UserSummary`, `ListingResponse`, `ListingBrowseItem`, `BookingResponse`, `BookingListingSnapshot`, `PendingReviewResponse`, `ReviewResponse`, `ConversationResponse` (`unread`, `acceptedUnpaidBookingId`), `UserReputationResponse`, `PublicProfileResponse`, `MyProfileResponse`, dispute/report shapes, etc. |
| `packages/shared/src/index.ts` | Re-exports `dto.ts` and the generated enums as `@zoink/shared`. |
| `packages/shared/package.json` | Declares the `@zoink/shared` package name and its `main`/`types`. |

### Backend Config Files

| File | What It Does |
|---|---|
| `backend/package.json` | Backend deps and scripts: `dev`, `build`, `start`, `test`, `test:integration`, `smoke:week7`, `admin:grant`, `admin:revoke`. Runtime deps now include `helmet`, `express-rate-limit`, `@sentry/node`, `node-cron`; dev deps include `supertest`, `prisma-generator-typescript-interfaces`. `test:integration` sets `NODE_ENV=test` and relies on `backend/.env.test` for `DATABASE_URL` (`setup.ts` aborts if it isn't a `zoink_test` URL). Configures the Prisma seed. |
| `backend/tsconfig.json` | TS config, strict, CommonJS, outputs to `dist/`. |
| `backend/nodemon.json` | Watches `src`, runs `ts-node src/index.ts`. |
| `backend/prisma.config.ts` | Loads `.env`, points Prisma at `backend/prisma/schema.prisma`, configures datasource URL and seed. |
| `backend/.env` / `backend/.env.test` | Runtime config; both gitignored. `.env.test` points at a separate `zoink_test` DB with `sk_test_...` keys and a real `DEV_STRIPE_ACCOUNT_ID`. |

### Backend Prisma

| File | What It Does |
|---|---|
| `backend/prisma/schema.prisma` | Source of truth for the DB. Two generators: `prisma-client-js` and `typescriptInterfaces` (→ `packages/shared/generated/prisma-models.ts`). See section 7. |
| `backend/prisma/seed.ts` | Upserts one verified test user and two Toronto listings if none exist. Uses `DEV_STRIPE_ACCOUNT_ID` for the user's `stripeAccountId`. |
| `backend/prisma/migrations/*` | See the migration list below. |

**Migrations (chronological):**

| Migration | Adds |
|---|---|
| `20260428151800_init` | Core enums + tables: users, listings/images, bookings/events, conversations, messages, reviews, obligations, reputations, notifications, verification tokens. |
| `20260524000000_week7_payments_handoff` | Payment/dispute statuses, booking event types, `Listing.itemValue`, booking payment/deposit/insurance/handoff/dispute columns, `booking_events`. |
| `20260602000000_zoink_it_handoff` | `PICKUP_PENDING`/`RETURN_PENDING` statuses + handoff-initiation timestamps. |
| `20260721000000_add_role_and_disputes` | `Role` enum, `User.role`, 6-value `DisputeStatus`, `DisputeReason`, `disputes` table. (Historical: had an enum-alter-before-create-table ordering bug, since fixed in the file; `apply_to_test_db.sql` is obsolete.) |
| `20260730000000_make_phone_required` | Backfills `NULL` `users.phone` with `+10000000000`, then `NOT NULL`. |
| `20260802231040_add_conversation_read_state` | `conversations.renterLastReadAt` / `ownerLastReadAt`. |
| `20260802233912_add_listing_deposit_amount` | `listings.depositAmount DECIMAL(10,2) DEFAULT 0`. |
| `20260803185737_add_dispute_refund_amount` | `disputes.refundAmountCents INTEGER` (cents actually refunded on `RESOLVED_REFUND`). |
| `20260803233651_add_report` | `ReportTargetType` / `ReportReason` / `ReportStatus` enums + `reports` table (FK-less polymorphic `targetId`). |
| `20260803233745_add_report_admin_notes` | `reports.adminNotes`. |
| `20260822183636_add_item_review_remove_person_notes` | Drops `reviews.comment`; adds `reviews.itemRating` + `itemNotes`. |
| `20260822193008_add_review_person_notes` | Adds `reviews.personNotes`. |
| `20260822201926_booking_flow_rework` | `BookingStatus.CONFIRMED`; drops `bookings.message`; adds `bookings.conversationId` (FK → conversations, `ON DELETE SET NULL`). |
| `20260825185736_add_deposit_payment_intent_tracking` | `DepositStatus` enum; `bookings.depositStatus` + `stripeDepositPaymentIntentId`. |
| `20260825212850_add_booking_hst_amount` | `bookings.hstAmount DECIMAL(10,2) NOT NULL DEFAULT 0`. |
| `20260827000000_add_booking_refunded_amount_cents` | `bookings.refundedAmountCents INTEGER` (cumulative renter refund; drives the proportional payout math). |
| `20260831212304_add_listing_rating_aggregates` | `listings` item-rating aggregate columns (count + average), shown on listing cards. |
| `20260831213825_add_notification_prefs_and_types` | `NotificationType` gains `MESSAGE_RECEIVED` + `DEPOSIT_RELEASED`; `users` gains per-category toggle columns `notifyMessages` / `notifyBookingActivity` / `notifyPaymentsPayouts` / `notifyDepositUpdates` / `notifyReviews` (all `DEFAULT true`). |
| `20260831214548_add_user_deleted_at` | `users.deletedAt DateTime?` — soft-delete / anonymize; `requireAuth` and `loginUser` reject a row with `deletedAt` set. |

### Backend Entry, Instrument, Middleware, Utils, Test Helpers

| File | What It Does |
|---|---|
| `backend/src/index.ts` | Express entrypoint. Loads `.env` (skipped when `NODE_ENV=test`), imports `./instrument` first (Sentry), applies `helmet()` + `cors()` + `trust proxy 1`, mounts the raw `/stripe/webhook` **before** `express.json()` and the `globalLimiter`, serves `/`, `/health`, and the `/stripe-return` / `/stripe-refresh` HTML redirect pages, exposes `GET /stripe/connect/status`, and mounts routers: `auth`, `users`, `listings`, `bookings`, `conversations`, `reviews`, `disputes`, `reports`, `admin`. Registers `node-cron` jobs (stale-handoff cleanup + payout release + deposit release every 15 min; reconciliation hourly) and calls `app.listen()` — both skipped when `NODE_ENV=test`. Exports `app`. |
| `backend/src/instrument.ts` | Initializes `@sentry/node` when `SENTRY_DSN` is set and `NODE_ENV !== 'test'`. `beforeSend` scrubs any header/body/cookie/extra key matching `/password|token|secret|key|authorization/i`. Exports `Sentry`. |
| `backend/src/middleware/requireAuth.ts` | Verifies the `Bearer` JWT with `JWT_SECRET`, then does one `User` lookup per request selecting `deletedAt`, `role`, `verificationStatus`. Rejects a deleted/missing user (401); attaches `userId` (from the token) plus `role` (DB value, defaults `USER`) and `verificationStatus` (DB value) — **not** the JWT claims, so a role/verification change in the DB is enforced on the next request rather than at token expiry. |
| `backend/src/middleware/requireAdmin.ts` | 403 unless `req.role === 'ADMIN'` (the DB-sourced value set by `requireAuth`). Runs after `requireAuth`. |
| `backend/src/middleware/requiredVerified.ts` | Blocks unless `req.verificationStatus === 'VERIFIED'` (DB-sourced by `requireAuth`). |
| `backend/src/middleware/rateLimiter.ts` | `express-rate-limit` factory. `keyByIpAndUser` combines `req.ip` with the token's `userId` when present. `authLimiter` = 10 / 15 min (mounted on `/auth`); `globalLimiter` = 300 / 15 min (mounted app-wide, after the webhook). In-memory store — noted as needing a shared store if scaled to multiple instances. |
| `backend/src/middleware/bookingStateMachine.ts` | `allowedTransitions` map + `assertBookingTransition`. Current graph: `PENDING→{ACCEPTED,DECLINED,CANCELLED}`, `ACCEPTED→{CONFIRMED,CANCELLED}`, `CONFIRMED→{PICKUP_PENDING,ACTIVE,CANCELLED}`, `PICKUP_PENDING→{ACTIVE,CANCELLED}`, `ACTIVE→{RETURN_PENDING,COMPLETED}`, `RETURN_PENDING→{COMPLETED}`. |
| `backend/src/middleware/errorHandler.ts` | 4-arg handler: `ZodError` → `400 { error, issues[] }`; `AppError` subclasses → mapped status + `{ error }`; else `500`. Mounted last. |
| `backend/src/middleware/validate.ts` | `validate(schema)` factory — `safeParse` of `{ body?, params?, query? }`, replaces `req.*` with coerced values, or `next(ZodError)`. Redefines `req.query` via `Object.defineProperty` (Express 5's `req.query` has no setter). |
| `backend/src/utils/errors.ts` | `AppError` base + `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `TooManyRequestsError` (429), `InternalServerError` (500). |
| `backend/src/utils/asyncHandler.ts` | Wraps async handlers so throws reach `next()`. |
| `backend/src/utils/prisma.ts` | Builds the `pg` pool, Prisma adapter, and singleton Prisma client from `DATABASE_URL`. |
| `backend/src/utils/cloudinary.ts` | Configures Cloudinary; exports `uploadImage`, `deleteImage`, `extractPublicId` with avatar/listing transforms. |
| `backend/src/testUtils/httpMocks.ts` | `createMockResponse()` for controller unit tests. |

### Backend Routes

| File | Routes | Notes |
|---|---|---|
| `routes/auth.ts` | `POST /auth/register`, `/login`, `/verify-email`, `/resend-otp` | `authLimiter` on the whole router. `RegisterSchema` (Canadian/NANP phone, normalized), `LoginSchema`, `VerifyEmailSchema`. `verify-email` / `resend-otp` require auth, not verified. |
| `routes/users.ts` | `GET/PATCH /users/me`, `PATCH /users/me/push-token`, `POST /users/me/avatar`, `POST /users/me/stripe-connect/onboard`, `GET /users/me/stripe-connect/status`, `GET /users/:id` | `/me/*` need auth only; `GET /users/:id` needs verified. `UpdateMeSchema`. Avatar via Multer (5 MB). |
| `routes/listings.ts` | browse, categories, get, `me`, create, update, availability, delete, image upload/delete | All require auth + verified. Schemas: `BrowseListingsQuerySchema` (coerced, superRefine on lat/lng/radius/price pairs), `CreateListingSchema` / `UpdateListingSchema` (deposit ≤ itemValue, itemValue required when deposit set), `ToggleAvailabilitySchema`, `ListingIdParamsSchema`, `ListingImageParamsSchema`. Image upload via Multer (10 MB). |
| `routes/bookings.ts` | create, `me`, `requests`, `:id`, `:id/accept`, `:id/payment-intent`, `:id/confirm`, `:id/decline`, `:id/cancel`, `:id/activate`, `:id/complete`, pickup/return `initiate`/`confirm`, `:id/photos`, `:id/photos/upload`, `:id/zoink-tap` | Router-level auth + verified. `CreateBookingSchema`, `BookingIdParamsSchema`, and the handoff schemas. Photo upload via Multer (10 MB). |
| `routes/conversations.ts` | `POST /conversations`, `GET /conversations/me`, `GET /:id/messages`, `POST /:id/messages`, `POST /:id/read` | Router-level auth + verified. `SendMessageSchema`. |
| `routes/reviews.ts` | `GET /reviews/pending`, `POST /reviews` | Router-level auth + verified. `SubmitReviewSchema` (role-conditional item vs person fields). |
| `routes/disputes.ts` | `POST /disputes`, `GET /disputes`, `GET /disputes/:id` | Router-level auth + verified. `CreateDisputeSchema`, `DisputeIdParamsSchema`. |
| `routes/reports.ts` | `POST /reports` | Router-level auth + verified. `CreateReportSchema`. |
| `routes/admin.ts` | `GET /admin/disputes`, `GET /admin/disputes/:id`, `PATCH /admin/disputes/:id/resolve`, `GET /admin/bookings/:id/events`, `GET /admin/reports`, `PATCH /admin/reports/:id` | Router-level `requireAuth` + `requireAdmin`. `AdminListDisputesQuerySchema`, `ResolveDisputeSchema` (optional `refundAmountCents`), `AdminListReportsQuerySchema`, `ResolveReportSchema`, `BookingIdParamsSchema`, `ReportIdParamsSchema`, `DisputeIdParamsSchema`. |

### Backend Controllers (`backend/src/middleware/controllers/`)

| File | What It Contains |
|---|---|
| `authController.ts` | `register` (forwards `phone`), `login`, `verifyEmail`, `resendOTP`. Delegates structural validation to Zod. |
| `userController.ts` | `getMe`, `getPublicProfile`, `updateMe`, `uploadAvatar`, `updatePushToken`, `onboardStripeConnect`, `getStripeConnectStatus`. |
| `listingController.ts` | Listing CRUD (create/update accept `itemValue` + `depositAmount`), browse (pre-coerced query), categories, availability, image upload/delete. |
| `bookingController.ts` | `createBooking`, `getBooking`, `getMyBookings`, `getIncomingRequests`, `acceptBooking`, `createBookingPaymentIntent`, `confirmBookingPayment`, `declineBooking`, `cancelBooking`, legacy `activateBooking` / `completeBooking`, handoff `initiatePickup`/`confirmPickup`/`initiateReturn`/`confirmReturn`, `uploadHandoffPhotos`, `uploadHandoffPhotoImage`, `zoinkTap`. |
| `conversationController.ts` | `openConversation`, `getMyConversations`, `getConversationMessages`, `sendMessage`, `markConversationRead`. |
| `reviewController.ts` | `getPendingReviews`, `submitReview`. |
| `disputeController.ts` | `createDispute`; `getDispute` (admin or booking participant) and `getMyDisputes` — both project the row through `toDisputeResponse(row, callerId, role)` instead of returning it raw: `resolvedByAdminId` is admin-only, the raiser's `description` is withheld from the counterparty, and the embedded booking is narrowed to `id`/`status`/`startDate`/`endDate`/`listing.title` (`renterId`/`ownerId` are selected only to run the authz check, then stripped). `toDisputeResponse` is exported for unit testing. |
| `reportController.ts` | `createReport` (201). |
| `adminController.ts` | `listDisputes` (raw Prisma rows — admin-only, unlike the shaped user-facing `getDispute`), `getDisputeDetail`, `resolveDispute` (validates status, delegates to `disputeService`), `getBookingEvents`, `listReports` (+ `attachTargetLabels`), `resolveReport`. |
| `stripeWebhookController.ts` | `stripeWebhook` — `constructEvent` **fails closed**: it verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET` and, when it can't (header absent or secret unset), throws `BadRequestError` → `400 { error: 'Invalid Stripe webhook signature.' }` and does not process the body. The unsigned `JSON.parse` fallback survives only when `NODE_ENV === 'test'` **and** no secret is configured (the synthetic-event fixtures). Then `updateBookingFromEvent`: `amount_capturable_updated` → `AUTHORIZED`; `succeeded` → `CAPTURED` + `paidAt` + `stripeChargeId`; `payment_failed`/`canceled` → `FAILED`/`REFUNDED` (+ `refundedAt`); `charge.refunded`/`refund.succeeded` compare `amount_refunded` to the full charge (partial → `refundedAmountCents` + `refundedAt` only; full → `REFUNDED`). Writes a `WEBHOOK_RECEIVED` event. No `event.id` de-dupe yet (replay guard is a known gap — see §14). |
| `*.test.ts` | Unit tests for every controller, plus `rateLimiter.test.ts`, `bookingStateMachine.test.ts`. `bookingController.test.ts` / `authController.test.ts` run the `validate()` + `errorHandler` pipeline and assert the `{ error, issues }` shape. |

### Backend Services (`backend/src/services/`)

| File | What It Contains |
|---|---|
| `authService.ts` | Email-domain allowlist, OTP generation, JWT signing (payload: `userId`, `verificationStatus`, `email`, `firstName`, `role` — but `role`/`verificationStatus` in the token are informational only; `requireAuth` authorizes off the DB), registration, login, OTP verify/resend, SES email. |
| `userService.ts` | Profile reads/updates, avatar URL, push token, Stripe account id getters/setters, public-profile/reputation formatting. |
| `listingService.ts` | Listing CRUD, image add/delete, availability, category list, browse/search with raw-SQL distance filtering. Returns an `{ items, meta: { total, offset, limit, hasMore } }` envelope. |
| `bookingService.ts` | `createBooking` (validates dates ≤ `MAX_RENTAL_DAYS`, upserts the listing/renter `Conversation`, snapshots `totalPrice` / `depositAmount` (from `listing.depositAmount`) / `commissionAmount` / `ownerPayout` / `insuranceFee` / `hstAmount`, posts the optional message into the conversation, notifies the owner); `createPaymentIntentForBooking` (renter-only, `ACCEPTED` only — ensures a Stripe Customer, creates the rental PaymentIntent with `setup_future_usage`); `getBookingById` / `getMyBookings` (`updatedAt desc`) / `getIncomingRequests` (`[status asc, updatedAt desc]` — PENDING pinned); `transitionBookingStatus` (state-machine + per-status authorization; `ACCEPTED` re-checks overlap + owner payouts; `CONFIRMED` re-checks overlap, requires `AUTHORIZED`/`CAPTURED` rental payment, then authorizes the **deposit** as its own off-session PaymentIntent and rolls back to `ACCEPTED` on failure; `ACCEPTED` auto-declines overlapping `PENDING` requests; `COMPLETED` sets `completedAt`, flips `CAPTURED → PAYOUT_PENDING`, creates review obligations); `handleCancellationPayment` (`PENDING`/`ACCEPTED` → no Stripe call; `CONFIRMED` → full release, fee path retained but unreachable); `calculateCancellationFeeCents` → `return 0`. `toBookingResponse(booking, userId?)` builds the `BookingResponse` DTO — `renter`/`owner` mapped through `toUserSummary` (id/firstName/lastName/avatarUrl/verificationStatus only). Exports `bookingSelect`, `createBookingEvent`, `createReviewObligationsForCompletedBooking`, `toBookingResponse` for `handoffService`. |
| `bookingUtils.ts` | `MAX_RENTAL_DAYS = 7`, `roundCurrency`, `getRentalDays` (UTC, inclusive), `ensureValidBookingDates` (NaN / order / max-days). Deposit calculation was removed. |
| `bookingEventService.ts` | `getBookingEvents(bookingId)` (for the admin endpoint) and a `createBookingEvent` helper (tx-aware). |
| `handoffService.ts` | `initiateHandoff` (2–3 photos; pickup starts from `CONFIRMED` and is owner-only, return from `ACTIVE` and renter-only; first submission transitions to `PICKUP_PENDING`/`RETURN_PENDING` + `UPLOAD_PHOTOS`/`STATUS_CHANGE` events + notifies the other party; later edits only update photos with `edited: true`); `confirmHandoff` (records the actor's tap; if both taps land within `ZOINK_TAP_WINDOW_MS`, pickup → `ACTIVE` + `startDate = now` + captures the rental PaymentIntent, return → `COMPLETED` + `completedAt` + `PAYOUT_PENDING` + review obligations); `getCompletedHandoffPhotos`; legacy `uploadHandoffPhotos` / `registerTap` aliases. The three response producers return `bookingService.toBookingResponse(updated, actorId)` (the shared scrubbed serializer) — there is no local raw-spread serializer anymore — so `renter`/`owner` are `UserSummary` and `renter.stripeCustomerId` / `renter.email` / `owner.stripeAccountId` never reach the counterparty. `capturePaymentIntent` is still handed the raw Prisma row, not the DTO. |
| `paymentService.ts` | Mock-vs-real Stripe (`STRIPE_SECRET_KEY` empty → mock). `calculateInsuranceFee`; `calculateHst` (`HST_RATE = 0.13`, hardcoded); `getCommissionRate` / `calculateCommission` / `calculateOwnerPayout` (`COMMISSION_TIERS` keyed on daily rate: ≤20 → 15%, ≤50 → 12.5%, else 10%); `getRentalAuthorizationAmount` (rental + insurance + HST); `getOrCreateStripeCustomer`; `createPaymentIntent` (manual capture, `setup_future_usage: 'off_session'`); `createDepositPaymentIntent` (separate PI, `off_session`, `confirm: true`, reusing the saved payment method); `getPaymentIntentPaymentMethod`; `capturePaymentIntent` / `cancelPaymentIntent` / `refundPaymentIntent` (idempotency salt = dispute id, so sequential different-amount refunds are allowed); `transferPayout` (commission already netted out); `transferDepositCompensation` (full amount, no commission, keyed on dispute id); `createConnectAccountLink` / `getConnectAccountStatus`; `getStripeConnectRedirectUrl` (requires `http://localhost` or `https://`). |
| `conversationService.ts` | `openConversation` (upsert by `listingId+renterId`, rejects your own listing), `getMyConversations` (computes `unread` per viewer from `lastMessage.createdAt` vs that viewer's `renterLastReadAt`/`ownerLastReadAt`, and `acceptedUnpaidBookingId` from any `ACCEPTED` booking on the conversation), `getConversationMessages`, `sendMessage` (+ push), `markConversationRead` (sets the caller's own last-read). |
| `reviewService.ts` | `scoreLabelsForRole` (`RENTER` → accuracy/condition/**pickupExperience**; `LENDER` → reliability/care/communication), `getPendingReviews`, `submitReview` (1–5 score guards; `resolveReviewFields` derives item-vs-person fields strictly from the obligation's real `reviewerRole`; recomputes `UserReputation`; returns `pendingRemaining`; notifies the reviewee). |
| `disputeService.ts` | `DISPUTE_WINDOW_HOURS = 24`. `createDispute` (participant check; on a `COMPLETED` booking rejects if past the window or if `depositStatus` already `CAPTURED`/`RELEASED`; one unresolved dispute per booking; `DISPUTE_OPENED` event; `Booking.disputeStatus = OPEN`). `resolveDispute` — one `$transaction` holding `SELECT … FOR UPDATE` on the booking: **COMPLETED + `RESOLVED_REFUND`** → acts on the deposit PI (must be `AUTHORIZED`); a charge → `capturePaymentIntent` + `transferDepositCompensation` to the owner (full, no commission) + `depositStatus = CAPTURED`; no charge → `cancelPaymentIntent` + `depositStatus = RELEASED`. **Pre-completion `RESOLVED_REFUND`** → over-refund guard against the *remaining* refundable balance (total − prior refunds); if `paidAt` set → partial/full `refundPaymentIntent`; else → full-only `cancelPaymentIntent`; records the cumulative renter refund in `Booking.refundedAmountCents` + `refundedAt`, and only moves `Booking.paymentStatus = REFUNDED` when the refund covers the whole charge (a partial refund leaves it `CAPTURED`/`PAYOUT_PENDING`). Always updates the dispute (+ `refundAmountCents`), `Booking.disputeStatus`, and writes `DISPUTE_RESOLVED`. |
| `reportService.ts` | `createReport` (rejects self / own listing; polymorphic `targetId`), `resolveReport` (only from `OPEN`), `attachTargetLabels` (batched lookup of user/listing names for the admin list; `[deleted user]` / `[deleted listing]` fallback). |
| `notificationService.ts` | Creates `Notification` rows and attempts Expo push when a token exists (`EXPO_ACCESS_TOKEN` optional). |
| `cleanupJob.ts` | `cleanupStaleHandoffs` (clears one-sided taps older than `ZOINK_TAP_WINDOW_MS`); `releaseDuePayouts` (`COMPLETED` + past `PAYOUT_HOLD_HOURS` + `payoutSentAt` null; `PAYOUT_PENDING` with `disputeStatus ∈ {NONE, RESOLVED_NO_ACTION, DISMISSED, RESOLVED_REFUND}`, or `REFUNDED` + `RESOLVED_REFUND`. Pays the owner's proportional remaining share — `(total − refundedAmountCents) × ownerPayout ÷ total` — via Stripe Transfer + `PAID_OUT`; a fully-refunded booking gets `payoutSentAt` stamped with no transfer; `OPEN`/`UNDER_REVIEW` excluded); `releaseDueDeposits` (`COMPLETED` + `depositStatus AUTHORIZED` + past `DEPOSIT_HOLD_HOURS` + no `OPEN`/`UNDER_REVIEW` dispute → cancel the deposit PI + `depositStatus = RELEASED`). |
| `reconciliationJob.ts` | Reconciles Stripe payment state against local bookings (hourly). |
| `authService`/`paymentService`/`bookingUtils`/`reportService` `*.test.ts` | Unit tests (commission/HST/payout math, report rules, booking-date utils, etc.). |

### Backend Scripts

| File | What It Does |
|---|---|
| `scripts/week7SmokeFlow.ts` | Backend-only users → listing → booking → handoff smoke flow in forced mock-Stripe mode. Walks the current path (`accept → payment-intent → confirm/CONFIRMED → pickup → active → return → complete`); a quick wiring check, with the integration suite as the authoritative coverage. |
| `scripts/manageAdminRole.ts` (+ `.test.ts`) | `admin:grant` / `admin:revoke` CLI. Looks up by email (case-insensitive), never creates a user, refuses to revoke the last admin, prints the role transition. `db` is an injectable param, so the core logic is unit-tested against a mocked db. |

### Backend Integration Tests (`backend/src/integration-tests/`)

| File | What It Tests |
|---|---|
| `README.md` | Setup (`zoink_test` DB, `.env.test`, Stripe network), truncate-and-reseed isolation, why not transaction-per-test. (Its file table lags the current set below.) |
| `setup.ts` | `truncateAllTables`, `createTestUser`, `createTestListing`, `futureDates`, `buildSignedWebhookPayload`, `signTestJwt`, `checkStripeConnectivity`, `getApp` (imports the real `app`). |
| `bookingLifecycle.integration.test.ts` | Happy path over HTTP (older accept→handoff shape), validations, overlap, access control. |
| `bookingFullFlow.integration.test.ts` | The **new** flow: request → accept → `payment-intent` → `confirm` (deposit authorized) → handoff → `COMPLETED` → `PAYOUT_PENDING`. |
| `bookingCancellation.integration.test.ts` | Cancellation at each stage; fee assertions skipped (fees disabled for launch); `$0`-fee behavior asserted. |
| `bookingListingSortOrder.integration.test.ts` | `getMyBookings` / `getIncomingRequests` / listings ordering (most-recent activity; PENDING pinned). |
| `disputeResolution.integration.test.ts` | `createDispute` / `resolveDispute` at service + HTTP; all three outcomes; deposit-vs-rental resolution; over-refund guard; `paymentStatus` / `refundedAt`; audit trail. |
| `payoutRelease.integration.test.ts` | `releaseDuePayouts` against a real Connect test account — full payout for `NONE`/`RESOLVED_NO_ACTION`/`DISMISSED` and for `RESOLVED_REFUND` with no rental refund; proportional remainder after a partial rental refund; nothing (but closed out) when fully refunded; blocked for `OPEN`/`UNDER_REVIEW`. |
| `handoffRace.integration.test.ts` | Two concurrent handoff-confirm calls (`Promise.all`) for the same phase — exactly one transition, one `ZOINK_TAP`, no duplicate `STATUS_CHANGE`, clean 409 for the loser. Return phase (→ `COMPLETED`) and pickup phase (→ `ACTIVE`, Stripe-gated). |
| `reportFlow.integration.test.ts` | `POST /reports`, self/own-listing rejection, admin list + `attachTargetLabels`, `PATCH /admin/reports/:id`. |
| `stripeWebhooks.integration.test.ts` | Synthetic events to `/stripe/webhook`: signed events with a secret configured (verified via `constructEvent`); malformed-signature → 400; the fail-open exception path (`NODE_ENV=test`, no secret → unsigned parse still accepted); unknown type; replay idempotency; deposit-vs-rental routing. |

### Frontend Config & App Shell

| File | What It Does |
|---|---|
| `frontend/package.json` | Expo scripts: `start` (`expo start`), `android`/`ios` (native dev-client `expo run:*`), `web`. `@stripe/stripe-react-native` pinned `0.62.0`; `@sentry/react-native`, `expo-camera`, `expo-haptics`, `expo-dev-client`, `expo-build-properties` present. |
| `frontend/tsconfig.json` | Extends Expo's base, strict. |
| `frontend/app.json` | Expo config: scheme `zoink`, bundle ids `com.zoink.app`, light UI, plugins for secure store, notifications, image picker, **`expo-location`** (with usage-description strings), Stripe (`merchantIdentifier`, Google Pay), and `expo-font`. Android `RECORD_AUDIO` permission (camera). EAS `projectId`, owner `zoinkit`. Requires a native rebuild to take effect. |
| `frontend/eas.json` | Build profiles `development` / `preview` / `production`; `submit.production.ios.ascAppId`. |
| `frontend/metro.config.js` | `resolver.disableHierarchicalLookup = true` + flat `nodeModulesPaths` (monorepo hygiene — see README's native-deps note). |
| `frontend/index.ts` | Registers `App` as the Expo root. |
| `frontend/App.tsx` | Initializes Sentry (`EXPO_PUBLIC_SENTRY_DSN`), wraps the tree in `GestureHandlerRootView` → `SafeAreaProvider` → `StripeProvider` (`urlScheme: "zoink"`) → `AuthProvider` → `Navigation`. |
| `frontend/src/config/demoMode.ts` | `DEMO_MODE = EXPO_PUBLIC_DEMO_MODE?.toLowerCase() === 'true'` (case-insensitive now), `DEMO_TOKEN`, `DEMO_USER` (includes `role: 'USER'`). |
| `frontend/src/config/stripe.ts` | `STRIPE_PUBLISHABLE_KEY`, `isStripePublishableKeyConfigured`. |
| `frontend/src/theme/colors.ts` | The design system: `colors` (logo grass-green ramp), semantic `theme` tokens, `radius` scale (`sm`/`md`/`lg`/`pill`), three elevation shadow presets, the **`hard`** neobrutalist system (`ink`, border weights, `offset` sm/md/lg for the block shadow), `backgroundGradient` + `textureColor`, one `type` scale (`screenTitle`/`sectionTitle`/`body`/`label`/`caption`/`eyebrow`), and shared `header` rhythm values. |
| `frontend/src/types/index.ts` | Re-exports enums + response DTOs from `@zoink/shared` (aliasing `BookingResponse as Booking`, etc.). Adds demo-only decoration types (`PublicProfile`/`MyProfile` spotlight/highlight fields), `BrowseListingsResult`, and the raw-Prisma-row admin shapes `AdminDisputeListItem` / `AdminDisputeDetail` / `AdminReportListItem` (string `totalPrice`, etc.). |

### Frontend Context & Navigation

| File | What It Does |
|---|---|
| `context/AuthContext.tsx` | `user` (`id`, `email`, `firstName`, `verificationStatus`, `role` — `parseJWT` maps `role` to `'ADMIN'`/`'USER'`), `token`, `isLoading`, `register(email, password, firstName, lastName, phone)`, `login`, `logout`, `setVerified`. Persists the JWT with SecureStore/localStorage, sets the axios auth header, syncs the push token after a verified non-demo login. |
| `navigation/index.tsx` | `RootStackParamList` + three stacks (auth / verification / verified). The verified stack checks `getPendingReviews()` and starts at `ReviewPrompt` if any. Registered screens include `Pay`, `FileDispute`, `AdminDisputes`, `AdminDisputeDetail`, `FileReport`, `AdminReports`, `PhotoViewer` (`fullScreenModal`), `PublicProfile` (`modal`). |

### Frontend API & Mock Services

| File | Backend Routes / Behavior |
|---|---|
| `services/api.ts` | Shared axios instance: base URL, auth request interceptor, 401 token cleanup. |
| `services/uploadFormData.ts` | `getImageUploadPart(uri, name?)` — builds RN `{ uri, name, type }` parts, preserving extensions, mapping PNG/GIF/HEIC/HEIF/JPEG. |
| `services/listingsApi.ts` | `/listings*` — browse/nearby (reads the `{ items, meta }` envelope), categories, CRUD (`itemValue` + `depositAmount` in payloads), availability, image upload/delete. Demo → `mockListings`. |
| `services/bookingsApi.ts` | `/bookings*` — create, list, detail, accept, **`createBookingPaymentIntent` (`POST /:id/payment-intent`)**, **`confirmBookingPayment` (`PATCH /:id/confirm`)**, decline/cancel/activate/complete, handoff initiate/confirm, `zoinkTap`, photo upload, completed photos. Demo → `mockWeek6`. |
| `services/conversationsApi.ts` | `/conversations*` — open, list, messages (`after` cursor), `markConversationRead` (`POST /:id/read`), send. Demo → `mockWeek6`. |
| `services/disputesApi.ts` | `/disputes*` — `createDispute`, `getMyDisputes`, `getDispute`. Demo → `mockWeek6` dispute mocks. |
| `services/reportsApi.ts` | `POST /reports` — `createReport`. No demo branch. |
| `services/adminApi.ts` | `/admin/*` — `listDisputes`, `getDisputeDetail`, `resolveDispute` (optional `refundAmountCents`), `getBookingEvents` (`GET /admin/bookings/:id/events`), `listReports`, `resolveReport`. No demo branch. |
| `services/usersApi.ts` | `/users/*` + `/stripe/connect/status` — `getMyProfile` (merges `/users/me` with `/users/:id`), public profile, update, avatar, push token, Connect onboard/status. Demo → `mockProfiles`. |
| `services/reviewsApi.ts` | `/reviews/pending`, `POST /reviews`. |
| `services/pushNotifications.ts` | Permission, Expo push token, Android channel, sync/clear via `usersApi`. |
| `services/mockListings.ts` / `mockProfiles.ts` | Demo-mode listing / profile data + fake CRUD. |
| `services/mockWeek6.ts` | Demo-mode bookings, conversations, messages, reviews, disputes. Deposit read from the listing's `depositAmount`; `hstAmount` computed at 13%; `mockCreateBookingPaymentIntent` / `mockConfirmBookingPayment` back the demo Pay flow; `mockMarkConversationRead` clears `unread`. |

### Frontend Components

| File | What It Does |
|---|---|
| `ZoinkLogo.tsx` / `ZoinkFullLogo.tsx` | Compact / full logo assets. |
| `ZoinkButton.tsx` | Shared styled button with loading/disabled + async press handling. |
| `HardBlock.tsx` | Neobrutalist "block shadow" primitive — an ink backing plate behind a bordered panel (two stacked Views, since RN's native shadow renders soft). Props: `radius`, `offset`, colors, `contentStyle`. |
| `ScreenBackground.tsx` | Shared screen wrapper: a horizontal `LinearGradient` (`theme.backgroundGradient`) plus a generated alternating-triangle texture built from small rotated Views, sized from `useWindowDimensions`. |
| `DismissKeyboardView.tsx` | Plain View with a passive `onTouchStart={Keyboard.dismiss}` (doesn't fight ScrollView gestures). |
| `PaymentNeededBadge.tsx` | "Payment needed" pill linking a conversation to its `ACCEPTED`-unpaid booking's `Pay` screen; stays visible regardless of read state. |
| `StateCard.tsx` | Reusable empty/error/info card. |
| `SearchBar.tsx` | Search input. |
| `ProfileCard.tsx` | Rich profile display: avatar, badges, ratings, reputation bars, review highlights. |
| `LogoPlaceholder.tsx` | Logo + optional label placeholder for missing images. |
| `LocationMapPreview.tsx` | Small static map preview — fetches tiles via `mapTiles.ts`, draws a translucent green circle at the chosen point, tappable to open `LocationMapModal`. Includes `MapAttribution`. |
| `LocationMapModal.tsx` | Full-screen map editor — `react-native-zoom-toolkit`'s `ResumableZoom` over the raster tile layer with a fixed center pin; "Set location" commits, closing discards. Replaces the removed `DraggableLocationMap`. |
| `MapAttribution.tsx` | Tappable "© MapTiler © OpenStreetMap contributors" (or OSM-only when no MapTiler key), linking to the relevant copyright page. Reads `usingMapTiler` from `mapTiles.ts`. |

### Frontend Screens (`frontend/src/screens/`)

| File | What It Does |
|---|---|
| `LoginScreen.tsx` | Login form → `useAuth().login`. |
| `RegisterScreen.tsx` | Registration form incl. a required **phone** field → `useAuth().register`. |
| `VerificationGateScreen.tsx` | Explains verification, links to OTP, supports logout. |
| `VerifyEmailScreen.tsx` | 6-digit OTP entry, verify/resend, `setVerified` with the returned token. |
| `MainAppScreen.tsx` | Verified app shell — custom bottom tabs **Home / Search / Inbox / MyProfile** with a center create-listing action and a sliding highlight + haptics. |
| `HomeScreen.tsx` | Nearby feed via `expo-location` GPS (Toronto fallback) → `getNearbyListings`, pull-to-refresh. No category chips (moved to Search). |
| `SearchScreen.tsx` | Browse/search UI — categories, nearby/browse, listing cards with category-label thumbnail fallback, empty-results `StateCard`. |
| `ListingDetailScreen.tsx` | Listing details, image carousel (tap → `PhotoViewer`), owner info, `LocationMapPreview`, chat/request actions, a "Report" link → `FileReport`. |
| `CreateListingScreen.tsx` | Multi-step create flow: category / details / pricing (incl. optional deposit; deposit needs `itemValue`) / location (real GPS + `LocationMapPreview`/`LocationMapModal` or `Location.geocodeAsync`) / photos. |
| `EditListingScreen.tsx` | Owner edit — category / price / `itemValue` / `depositAmount`, add/remove photos, save. |
| `MyListingsScreen.tsx` | Owner listing list with active-booking awareness; links to edit and `ActiveRental`. |
| `BookingRequestScreen.tsx` | Renter request form — calendar (≤ 7 days), optional insurance, client-side price/deposit/HST preview. **Creates the request only** (no payment) → `nav.replace('BookingDetail')`. |
| `PayScreen.tsx` | The `ACCEPTED → CONFIRMED` payment step — price breakdown (rental + deposit hold + insurance + 13% HST), `createBookingPaymentIntent` → Stripe PaymentSheet → `confirmBookingPayment` → `nav.replace('BookingDetail')`. Uses `HardBlock`. |
| `BookingHistoryScreen.tsx` | Renter bookings — live/confirmed rentals pinned above the rest (`isLiveBooking`, `sortBookings.ts`); the rest sorted by rental date. |
| `BookingRequestsScreen.tsx` | Owner incoming requests — accept/decline; ordered live-first (`sortBookingsLiveFirst`); each card shows the gross total and "You net $X" (`ownerPayout`). |
| `BookingDetailScreen.tsx` | Booking detail/actions for both parties — dates (long-form via `formatDate.ts`), price breakdown incl. HST + total, an owner-only payout card (rental price, commission %, net payout, payout-status badge, security-deposit status line with `CAPTURED` → "Released to you (damage compensation)"), a renter-facing deposit-status line, cancellation, photo viewing (→ `PhotoViewer`), handoff navigation, and the dispute surface ("Report a Problem" → `FileDispute` while `ACTIVE`/`PICKUP_PENDING`/`RETURN_PENDING`/`COMPLETED` with no active dispute; in-progress banner; resolved outcome). |
| `ActiveRentalScreen.tsx` | Live rental detail — item, dates, other party, deposit, chat, context-aware pickup/return actions. |
| `ZoinkItScreen.tsx` | Combined handoff photo capture + synchronized confirmation. Media-library permission, 2–3 photos, `initiateHandoff` (re-submittable before the phase confirms), then polls state and calls `confirmHandoff`, with success animation + timeout. |
| `PhotoViewerScreen.tsx` | Full-screen swipeable pinch-zoom viewer (`react-native-zoom-toolkit` `Gallery`). Registered as a real screen (`presentation: 'fullScreenModal'`), not RN `Modal`. |
| `InboxScreen.tsx` | Conversation inbox — unread highlight (real per-participant state) + a `PaymentNeededBadge` on any `ACCEPTED`-unpaid conversation for the renter. |
| `ConversationThreadScreen.tsx` | Message thread — polling + incremental fetch, `markConversationRead` on open and every poll tick while focused, auto-scroll to newest, a "pay for this booking" banner (`acceptedUnpaidBookingId`) → `Pay`. |
| `MyProfileScreen.tsx` | Own profile display/edit, avatar, payout status, Stripe onboarding, logout. Shows an **Admin** panel (→ `AdminDisputes`, `AdminReports`) only when `user.role === 'ADMIN'`. |
| `PublicProfileScreen.tsx` | Modal public profile view; "Report this user" → `FileReport`. |
| `FileDisputeScreen.tsx` | Dispute-filing form (reason picker + description) → `createDispute`. |
| `FileReportScreen.tsx` | Abuse-report form (reason picker + optional description) for a listing or user → `createReport`. |
| `AdminDisputesScreen.tsx` | Admin status-filterable dispute list → detail. |
| `AdminDisputeDetailScreen.tsx` | Admin dispute detail — reason/description, booking context, pickup/return photos, resolve (refund / no action / dismiss) with required notes and an amount capped against `depositAmount` for a `COMPLETED` booking; refetches after resolving. |
| `AdminReportsScreen.tsx` | Admin status-filterable report list with inline resolve (`REVIEWED` / `DISMISSED` + notes). |
| `ReviewPromptScreen.tsx` | Required post-rental review — three 1–5 scores, plus an item rating + notes (borrower) or free-text person notes (lender); chains to the next pending review. |

### Frontend Utils

| File | What It Does |
|---|---|
| `utils/mapTiles.ts` | Slippy-map tile math (`toTileFloat` / `tileFloatToLatLon` / `buildTileGrid`), the tile URL builder (MapTiler when `EXPO_PUBLIC_MAPTILER_API_KEY` is set, else raw OSM), and `usingMapTiler`. Production builds must set a key. |
| `utils/formatDate.ts` | `formatLongDate(iso)` → `"August 28 2026"` (UTC-read; falls back to the raw string on an unparseable value). Used wherever a full booking date is shown. |
| `utils/sortBookings.ts` | `isLiveBooking(status)` (`CONFIRMED` / `PICKUP_PENDING` / `ACTIVE` / `RETURN_PENDING`) and `sortBookingsLiveFirst(bookings)` — live bookings first (soonest rental first), then the rest by most recent rental date. Used by the owner requests list and the renter booking history. |

### Frontend Assets & Landing

| Item | What It Does |
|---|---|
| `frontend/assets/*` | Logos, Expo icon/splash/favicon, Android adaptive-icon layers. |
| `landing/index.html` | Standalone marketing/waitlist page (Tally form or mailto fallback), Tailwind + Lucide CDN. |
| `landing/assets/*` | Branding images mirrored from the frontend. |

## 5. Frontend Flow

1. `frontend/index.ts` registers `App`.
2. `App.tsx` initializes Sentry, then wraps the tree: `GestureHandlerRootView` → `SafeAreaProvider` → `StripeProvider` → `AuthProvider` → `Navigation`.
3. `AuthProvider` loads `zoink_jwt` from SecureStore/localStorage, decodes it locally (`parseJWT`, including `role`), and sets the axios `Authorization` header.
4. `Navigation` picks a stack: no user → `Login`/`Register`; logged-in but not `VERIFIED` → `VerificationGate`/`VerifyEmail`; verified → the app stack.
5. The verified stack calls `getPendingReviews()`; if any, it starts at `ReviewPrompt`, else `MainApp`.
6. `MainAppScreen` renders the Home / Search / Inbox / MyProfile tabs with a center create-listing action.
7. API calls go through `services/api.ts` (JWT header, 401 cleanup). Demo mode short-circuits each wrapper to mock data.
8. Image uploads use `FormData` + `getImageUploadPart`; listing/avatar images hit Multer endpoints then Cloudinary; handoff photos upload to `/bookings/:id/photos/upload` then attach at initiation.
9. **Booking → pay:** `BookingRequestScreen` creates a request; once the owner accepts, the renter is prompted (inbox badge / thread banner) to open `PayScreen`, which creates the rental PaymentIntent, presents PaymentSheet, and confirms — the backend then authorizes the deposit and the booking becomes `CONFIRMED`.
10. Push token sync runs after a verified non-demo session is active.

## 6. Backend Flow

1. `index.ts` loads `.env` (unless `NODE_ENV=test`), imports `./instrument`, applies `helmet` + `cors` + `trust proxy 1`, mounts the raw `/stripe/webhook` before JSON parsing and the `globalLimiter`, then `express.json()`.
2. `/`, `/health` return JSON. `/stripe-return` / `/stripe-refresh` serve HTML that deep-links to `zoink://` (these page URLs — not the scheme — are the `return_url`/`refresh_url` Stripe gets).
3. Routers mount at `/auth`, `/users`, `/listings`, `/bookings`, `/conversations`, `/reviews`, `/disputes`, `/reports`, `/admin`.
4. `requireAuth` → `requireVerified` (marketplace/dispute/report routes) or `requireAdmin` (`/admin/*`).
5. `validate(schema)` coerces/guards `req.body/params/query`, or `next(ZodError)`.
6. Controllers call services; services hold business logic + Prisma access via the shared client.
7. Booking / payment / handoff / dispute flows also write `BookingEvent` audit rows and send notifications.
8. Stripe webhooks: `constructEvent` verifies the signature (400 on failure / missing secret, except `NODE_ENV=test` with no secret), then `updateBookingFromEvent` updates booking payment/deposit status and writes `WEBHOOK_RECEIVED`.
9. Outside test mode, `node-cron` runs stale-handoff cleanup + payout release + deposit release every 15 min, and reconciliation hourly.

Responses are plain JSON. `AppError` → `{ "error": "…" }`. `ZodError` → `{ "error": "Validation failed.", "issues": [{ "path": "body.startDate", "message": "…" }] }`.

## 7. Database / Prisma

`backend/prisma/schema.prisma` is the source of truth. Two generators run: the Prisma client and `typescriptInterfaces` (→ `packages/shared/generated/prisma-models.ts`).

### Enums

| Enum | Values |
|---|---|
| `Role` | `USER`, `ADMIN` |
| `VerificationStatus` | `PENDING`, `SUBMITTED`, `VERIFIED`, `FAILED` |
| `BookingStatus` | `PENDING`, `ACCEPTED`, `CONFIRMED`, `PICKUP_PENDING`, `DECLINED`, `ACTIVE`, `RETURN_PENDING`, `COMPLETED`, `CANCELLED` |
| `PaymentStatus` | `PENDING_AUTH`, `AUTHORIZED`, `CAPTURE_PENDING`, `CAPTURED`, `REFUND_PENDING`, `REFUNDED`, `PAYOUT_PENDING`, `PAID_OUT`, `FAILED` |
| `DepositStatus` | `AUTHORIZED`, `CAPTURED`, `RELEASED` (the security deposit's own PaymentIntent) |
| `DisputeStatus` | `NONE`, `OPEN`, `UNDER_REVIEW`, `RESOLVED_REFUND`, `RESOLVED_NO_ACTION`, `DISMISSED` (both `Booking.disputeStatus` and `Dispute.status`) |
| `DisputeReason` | `ITEM_DAMAGED`, `ITEM_NOT_RETURNED`, `ITEM_NOT_AS_DESCRIBED`, `PAYMENT_ISSUE`, `OTHER` |
| `ReportTargetType` | `USER`, `LISTING` |
| `ReportReason` | `SPAM`, `SCAM`, `INAPPROPRIATE`, `HARASSMENT`, `OTHER` |
| `ReportStatus` | `OPEN`, `REVIEWED`, `DISMISSED` |
| `BookingEventType` | `STATUS_CHANGE`, `PAYMENT_INTENT_CREATED`, `PAYMENT_CAPTURED`, `PAYMENT_REFUNDED`, `PAYOUT_TRIGGERED`, `ZOINK_TAP`, `UPLOAD_PHOTOS`, `DISPUTE_OPENED`, `DISPUTE_RESOLVED`, `WEBHOOK_RECEIVED`, `RECONCILIATION_MATCH`, `RECONCILIATION_MISMATCH`, `ERROR` |
| `NotificationType` | `BOOKING_REQUEST`, `BOOKING_ACCEPTED`, `BOOKING_DECLINED`, `BOOKING_CANCELLED`, `PAYMENT_RECEIVED`, `PAYOUT_SENT`, `REVIEW_RECEIVED`, `VERIFICATION_APPROVED`, `VERIFICATION_FAILED`, `MESSAGE_RECEIVED`, `DEPOSIT_RELEASED` |
| `ReviewRole` | `RENTER`, `LENDER` |
| `ReviewObligationStatus` | `PENDING`, `SUBMITTED` |

### Models

| Model | Purpose | Key Relationships |
|---|---|---|
| `User` | Account, profile, verification, `role`, push token, Stripe customer/account ids. `phone` is `NOT NULL`. `deletedAt` (nullable) — soft-delete/anonymize; a set value invalidates the account (`requireAuth` + `loginUser` reject it). Per-category notification toggles `notifyMessages` / `notifyBookingActivity` / `notifyPaymentsPayouts` / `notifyDepositUpdates` / `notifyReviews` (default `true`; verification notices ignore them). ID fields (`idPhotoUrl`, `selfieUrl`, `idSubmittedAt`, `verificationId`) exist but have no submission flow. | Owns listings; renter/owner bookings; renter/owner conversations; messages; reviews; reputation; notifications; verification tokens; `raisedDisputes` / `resolvedDisputes`; `filedReports` / `reviewedReports`. |
| `Listing` | Rentable item: title, description, category, `dailyPrice`, `itemValue`, owner-configured `depositAmount`, availability, `latitude`/`longitude`/`city`, optional `address`. | Belongs to owner `User`; has images, bookings, conversations. |
| `ListingImage` | URL + display order. | Belongs to `Listing` (cascade). |
| `Booking` | Rental request + lifecycle. Money fields (`totalPrice`, `depositAmount`, `commissionAmount`, `ownerPayout`, `insuranceFee`, `hstAmount`) snapshotted at creation. Rental PI (`stripePaymentIntentId`) + separate deposit PI (`stripeDepositPaymentIntentId`, `depositStatus`). `paidAt`/`refundedAt`/`payoutSentAt`/`completedAt`. Handoff photo arrays + per-party tap timestamps. `disputeStatus`/`disputedAt`/`disputeReason`. `conversationId` (FK, `SET NULL`). No `message` column. | Belongs to renter, owner, listing, optional conversation; has events, reviews, obligations, `Dispute` records. |
| `BookingEvent` | Immutable audit row (`type` + JSON `metadata`, optional `actorId`). | Belongs to `Booking` (cascade). |
| `Conversation` | One listing + renter/owner pair. `renterLastReadAt` / `ownerLastReadAt` drive per-participant unread. | Unique `[listingId, renterId]`; has messages and bookings. |
| `Message` | Body + sender. | Belongs to conversation + sender. |
| `Review` | Post-rental scores by one user for another. `scoreA/B/C` (person-directed, both roles). `itemRating` + `itemNotes` (borrower reviewer only). `personNotes` (lender reviewer only). `comment` was removed. | Unique `[bookingId, reviewerId]`; linked to an obligation. |
| `ReviewObligation` | Required review task after completion. | Unique `[bookingId, userId]`; can link the submitted review. |
| `UserReputation` | Aggregated per-side rating averages + counts. | 1:1 with `User`. |
| `Notification` | Stored notification. | Belongs to `User`. |
| `VerificationToken` | OTP codes. | Belongs to `User` (cascade). |
| `Dispute` | One dispute on a booking: `reason`, `description`, `status`, `resolutionNotes`, `resolvedByAdminId`, `refundAmountCents` (cents actually refunded on `RESOLVED_REFUND`; may be partial), `resolvedAt`. | Belongs to `Booking`; `raisedByUser` + optional `resolvedByAdmin`. |
| `Report` | Abuse report on a listing or user — `targetType` + polymorphic FK-less `targetId`, `reason`, optional `description`, `status`, `adminNotes`, `reviewedByAdminId`, `reviewedAt`. Can outlive its target; multiple reports per target allowed. | `reporter` + optional `reviewedByAdmin` reference `User`. |

## 8. Authentication Flow

1. `RegisterScreen` → `AuthContext.register(…, phone)` → `POST /auth/register` (unless demo).
2. `authController.register` → `authService.registerUser`: allowlist check, bcrypt hash, create `User` (phone normalized to `+1XXXXXXXXXX` by `RegisterSchema`), create OTP `VerificationToken`, send SES email, return a JWT + user.
3. The JWT payload carries `userId`, `verificationStatus`, `email`, `firstName`, `role`. On every request `requireAuth` looks the user up and takes `role` (defaulting to `USER`) and `verificationStatus` from the DB row, not the token — the token claims are only a hint for the frontend UI. A deleted/anonymized row (`deletedAt` set) is rejected with 401.
4. The frontend stores the token as `zoink_jwt` and routes unverified users to the verification stack.
5. `VerifyEmailScreen` → `POST /auth/verify-email` → `authService.verifyOTP` validates ownership/expiry/used, marks the user verified, returns a fresh `VERIFIED` JWT.
6. `AuthContext.setVerified` swaps the token, updates the user, sets the axios header.
7. Login → `POST /auth/login` → `authService.loginUser` → stored token.

ID-document verification fields exist on `User` but there is no route or screen for submission.

## 9. Main User Flows

### Creating a listing

`CreateListingScreen` collects details (incl. optional `itemValue` + `depositAmount`) and a real GPS/map coordinate (`LocationMapPreview` → `LocationMapModal`, or `Location.geocodeAsync`, with a Toronto fallback) → `listingsApi.createListing` + `uploadListingImage` → `/listings` (+ `/listings/:id/images`) → `listingController` → `listingService` → Prisma + Cloudinary.

### Requesting a rental

`BookingRequestScreen` (calendar ≤ 7 days, optional insurance, price/deposit/HST preview) → `createBooking` → `bookingService.createBooking`: computes `totalPrice` from `dailyPrice × rentalDays`, reads `depositAmount` from the listing, computes tiered `commissionAmount` / `ownerPayout`, `insuranceFee`, and `hstAmount`, upserts the listing/renter `Conversation` and posts the optional message into it, and notifies the owner. **No payment yet.**

### Owner accept / decline

`BookingRequestsScreen` / `BookingDetailScreen` → `PATCH /bookings/:id/accept`. `transitionBookingStatus` checks the state machine, re-checks date overlap against `CONFIRMED`/`ACTIVE` bookings, and requires the owner's Stripe account to have payouts enabled — **it does not take payment**. Accepting auto-declines any other overlapping `PENDING` request (these don't revive on a later cancel).

### Renter payment (`ACCEPTED → CONFIRMED`)

Prompted by an inbox badge / thread banner (`acceptedUnpaidBookingId`), the renter opens `PayScreen` → `POST /bookings/:id/payment-intent` (`createPaymentIntentForBooking` — ensures a Stripe Customer, creates the rental PaymentIntent with `setup_future_usage`) → Stripe PaymentSheet → `PATCH /bookings/:id/confirm`. On confirm, `transitionBookingStatus` re-checks overlap, requires the rental payment to be `AUTHORIZED`/`CAPTURED`, then **authorizes the security deposit as its own off-session PaymentIntent** (`createDepositPaymentIntent`, reusing the saved card) and sets `stripeDepositPaymentIntentId` + `depositStatus = AUTHORIZED`. If the deposit auth fails, the rental PI is cancelled and the booking stays `ACCEPTED`.

### Pickup / return handoff ("Zoink It")

`ZoinkItScreen` handles photos + confirmation. `handoffService.initiateHandoff` — pickup starts from `CONFIRMED` (owner-only), return from `ACTIVE` (renter-only); the first submission transitions to `PICKUP_PENDING`/`RETURN_PENDING`, writes `UPLOAD_PHOTOS` + `STATUS_CHANGE`, and notifies the other party; later edits only replace the photos (`edited: true`). `confirmHandoff` records each party's tap; both within `ZOINK_TAP_WINDOW_MS` → pickup becomes `ACTIVE` and captures the rental PaymentIntent; return becomes `COMPLETED`, sets `completedAt`, flips `CAPTURED → PAYOUT_PENDING`, and creates review obligations.

### Deposits & payouts

- **Deposit** is held from `CONFIRMED` as its own PI. `cleanupJob.releaseDueDeposits` cancels it (→ `RELEASED`) 24h (`DEPOSIT_HOLD_HOURS`) after completion if no dispute is open.
- **Payout** sits in `PAYOUT_PENDING` for `PAYOUT_HOLD_HOURS` (24). `cleanupJob.releaseDuePayouts` transfers the owner's share (commission already netted out) and marks `PAID_OUT`. `RESOLVED_REFUND` is included: it pays the proportional remainder after any renter refund — `(total − Booking.refundedAmountCents) × ownerPayout ÷ total` — and pays nothing (just stamps `payoutSentAt`) when the rental was fully refunded. `OPEN`/`UNDER_REVIEW` stay excluded.

### Messaging

`ListingDetailScreen` / `ActiveRentalScreen` open a conversation. `InboxScreen` lists them (unread highlight + `PaymentNeededBadge`). `ConversationThreadScreen` polls, sends, calls `markConversationRead` on open and every tick while focused, and shows a "pay for this booking" banner when applicable. `conversationService.getMyConversations` computes `unread` per viewer from `lastMessage.createdAt` vs that viewer's last-read timestamp.

### Reviews

After completion both parties get an obligation. `Navigation` gates on pending reviews. `ReviewPromptScreen` submits three 1–5 scores plus an item rating + notes (borrower) or free-text person notes (lender). `reviewService.submitReview` derives the valid fields from the obligation's real role, recomputes `UserReputation`, and chains to the next obligation.

### Disputes

`FileDisputeScreen` (from `BookingDetailScreen`, shown while `ACTIVE`/`PICKUP_PENDING`/`RETURN_PENDING`/`COMPLETED` with no open dispute) → `createDispute`: participant check; on a `COMPLETED` booking rejects if past `DISPUTE_WINDOW_HOURS` or if the deposit was already resolved; one unresolved dispute per booking; `DISPUTE_OPENED` event; `Booking.disputeStatus = OPEN`. `BookingDetailScreen` then shows an in-progress banner or the resolved outcome (from `getMyDisputes`, whose `resolutionNotes` is the outcome text; `resolvedByAdminId` and the counterparty's `description` are not exposed to participants).

### Admin / moderation

`user.role === 'ADMIN'` (the frontend decodes the JWT claim into `AuthContext.user`) reveals `MyProfileScreen`'s Admin panel → `AdminDisputesScreen` / `AdminReportsScreen`. Backend `/admin/*` access is enforced separately by `requireAdmin` against the **DB** `role`, so a revoked admin loses server access immediately even while a stale token still shows the panel.

- **Disputes:** `GET /admin/disputes` (list, `?status`), `GET /admin/disputes/:id` (booking + photo context), `PATCH /admin/disputes/:id/resolve` → `disputeService.resolveDispute` (one transaction with `SELECT … FOR UPDATE` on the booking). For a `COMPLETED` booking it resolves against the **deposit** PI (capture + full transfer to the owner, or cancel); pre-completion it refunds/cancels the rental PI against the *remaining* refundable balance and sets `paymentStatus = REFUNDED`. `GET /admin/bookings/:id/events` exposes the audit trail.
- **Reports:** `GET /admin/reports` (list with resolved target labels), `PATCH /admin/reports/:id` → `REVIEWED` / `DISMISSED` + `adminNotes`.
- **Granting the `ADMIN` role** is still CLI-only (`npm run admin:grant/revoke -- --email=…`). No route or screen sets `User.role`. A revoke is now effective on the target's next request (previously their unexpired JWT kept admin access for up to 30 days).

## 10. How Files Interact

### Frontend → Backend route map

| Frontend | Backend |
|---|---|
| `AuthContext.tsx` | `/auth/register`, `/auth/login` |
| `VerifyEmailScreen.tsx` | `/auth/verify-email`, `/auth/resend-otp` |
| `listingsApi.ts` | `/listings`, `/listings/me`, `/listings/categories`, `/listings/:id`, `/listings/:id/availability`, `/listings/:id/images` |
| `bookingsApi.ts` | `/bookings`, `/bookings/me`, `/bookings/requests`, `/bookings/:id`, `/bookings/:id/payment-intent`, `/bookings/:id/confirm`, `/bookings/:id/*` |
| `conversationsApi.ts` | `/conversations`, `/conversations/me`, `/conversations/:id/messages`, `/conversations/:id/read` |
| `usersApi.ts` | `/users/me`, `/users/:id`, `/users/me/avatar`, `/users/me/push-token`, `/users/me/stripe-connect/*`, `/stripe/connect/status` |
| `reviewsApi.ts` | `/reviews/pending`, `/reviews` |
| `disputesApi.ts` | `/disputes`, `/disputes/:id` |
| `reportsApi.ts` | `/reports` |
| `adminApi.ts` | `/admin/disputes`, `/admin/disputes/:id`, `/admin/disputes/:id/resolve`, `/admin/bookings/:id/events`, `/admin/reports`, `/admin/reports/:id` |

### Backend layering

```text
routes/*.ts
  -> authLimiter/globalLimiter (rate limit)
  -> requireAuth -> requireVerified | requireAdmin
  -> validate(schema)                # Zod: coerce + guard
  -> middleware/controllers/*.ts     # clean req.*
    -> services/*.ts
      -> utils/prisma.ts -> schema.prisma
      -> paymentService / cloudinary / notificationService / SES as needed
  -> middleware/errorHandler.ts      # ZodError + AppError + unknown
```

### Reused frontend components

| Component | Reused by |
|---|---|
| `ScreenBackground` | Most screens (gradient + texture). |
| `HardBlock` | Cards/buttons across the neobrutalist screens (Pay, requests, etc.). |
| `ZoinkLogo` / `ZoinkFullLogo` | Auth, profile, listing, brand UI. |
| `ZoinkButton` | Form-heavy screens. |
| `StateCard` | Empty/error/loading states. |
| `ProfileCard` | Own + public profile. |
| `DismissKeyboardView` | Form screens with scroll. |
| `LocationMapPreview` / `LocationMapModal` / `MapAttribution` | Create/edit listing, listing detail. |

### Global config impact

| Config | Affects |
|---|---|
| `frontend/app.json` | Scheme, assets, native plugins (incl. `expo-location`), permissions. |
| `frontend/src/theme/colors.ts` | Every screen's typography, radius, shadow, and background. |
| `frontend/src/services/api.ts` | Every API call + auth header. |
| `frontend/src/config/demoMode.ts` | Real backend vs mock services. |
| `backend/src/index.ts` | Which routers, middleware, and cron jobs are active. |
| `backend/prisma/schema.prisma` | Generated client + `@zoink/shared` interfaces, DB shape. |
| `backend/src/middleware/bookingStateMachine.ts` | Legal booking transitions. |
| `backend/src/services/paymentService.ts` | HST rate, commission tiers, insurance clamp, all Stripe behavior. |

## 11. Environment Variables

Keep real secrets out of git — `.gitignore` covers `backend/.env`, `backend/.env.test`, `frontend/.env`, `.env.local`, `.env.production`.

### Backend

| Variable | Used In | Purpose |
|---|---|---|
| `DATABASE_URL` | `prisma.config.ts`, `utils/prisma.ts` | Postgres connection string. |
| `JWT_SECRET` | `requireAuth.ts`, `authService.ts`, `rateLimiter.ts` | Signs/verifies auth JWTs. |
| `PORT` | `index.ts` | Listen port. |
| `ALLOWED_EMAIL_DOMAINS` | `authService.ts` | Comma-separated student email allowlist. |
| `OTP_EXPIRY_MINUTES` | `authService.ts` | OTP lifetime. |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `SES_FROM_EMAIL` | `authService.ts` | SES for OTP email. |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | `utils/cloudinary.ts` | Image storage. |
| `STRIPE_SECRET_KEY` | `paymentService.ts`, `stripeWebhookController.ts`, `reconciliationJob.ts` | Stripe server key; empty → mock mode. In `.env.test` must start with `sk_test_`. |
| `STRIPE_WEBHOOK_SECRET` | `stripeWebhookController.ts` | Webhook signature verification. **Required outside tests** — if unset (or a request has no `stripe-signature` header), `constructEvent` throws and the webhook returns 400 without processing. Only `NODE_ENV=test` + no secret still accepts unsigned synthetic events. |
| `STRIPE_CURRENCY` | `paymentService.ts` | PaymentIntent/transfer currency (default `cad`). |
| `DEV_STRIPE_ACCOUNT_ID` | `bookingService.ts`, seed, smoke, integration tests | Dev/beta owner-payout account override (never in `production`). In `.env.test` must be a real, fully-onboarded (`payouts_enabled: true`) Express test-mode Connect account. |
| `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL` | `paymentService.ts` | **Required.** `http://localhost…` or `https://…` pointing at `/stripe-return` / `/stripe-refresh`. Missing/invalid → hard error. Move in lockstep with `EXPO_PUBLIC_API_URL` under ngrok. |
| `PAYOUT_HOLD_HOURS` | `cleanupJob.ts` | Delay before releasing owner payouts (default 24). |
| `DEPOSIT_HOLD_HOURS` | `cleanupJob.ts` | Delay before auto-releasing an undisputed deposit (default 24). |
| `ZOINK_TAP_WINDOW_MS` | `handoffService.ts`, `cleanupJob.ts` | Synchronized-tap window / stale-handoff threshold (default 300000). |
| `INSURANCE_RATE` / `MIN_INSURANCE_FEE` / `MAX_INSURANCE_FEE` | `paymentService.ts` | Optional insurance fee rate + clamp. |
| `SENTRY_DSN` | `instrument.ts` | Backend error tracking; blank or `NODE_ENV=test` → skipped. |
| `EXPO_ACCESS_TOKEN` | `notificationService.ts` | Optional Expo push access token. |
| `NODE_ENV` | `index.ts`, `bookingService.ts`, `instrument.ts`, `utils/prisma.ts` | `test` skips `dotenv`, cron, `app.listen()`, and Sentry. |

`HST_RATE` (`0.13`) and `COMMISSION_TIERS` are **hardcoded constants in `paymentService.ts`**, not env vars. `PLATFORM_COMMISSION_RATE` is no longer read.

### Frontend

| Variable | Used In | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `services/api.ts` | Backend base URL. Changes every ngrok session. |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `config/stripe.ts`, Pay flow | Stripe publishable key. |
| `EXPO_PUBLIC_MAPTILER_API_KEY` | `utils/mapTiles.ts` | Tile provider; blank → raw OSM (dev only). |
| `EXPO_PUBLIC_SENTRY_DSN` | `App.tsx` | Frontend crash tracking. |
| `EXPO_PUBLIC_DEMO_MODE` | `config/demoMode.ts` | `true` (case-insensitive) → mock data. |

## 12. Scripts and Commands

### Backend

| Command | Meaning |
|---|---|
| `npm run dev` | nodemon + ts-node. |
| `npm run build` / `npm start` | Compile to `dist/` / run it. |
| `npm test` | Unit tests: `src/services/*.test.ts`, `src/middleware/*.test.ts`, `src/middleware/controllers/*.test.ts`, `src/scripts/*.test.ts` (not `integration-tests/`). |
| `npm run test:integration` | `src/integration-tests/*.integration.test.ts` against `zoink_test` + Stripe test mode, `--test-concurrency=1`. Needs `backend/.env.test` + applied migrations. |
| `npm run smoke:week7` | Backend-only payment/handoff smoke, current flow, forced mock-Stripe. |
| `npm run admin:grant -- --email=…` / `admin:revoke -- --email=…` | Grant/revoke the `ADMIN` role. |
| `npx prisma migrate dev` / `generate` / `validate` / `db seed` | Prisma. |

### Frontend

| Command | Meaning |
|---|---|
| `npm start` | `expo start`. |
| `npm run android` / `ios` | `expo run:android` / `expo run:ios` (native dev-client). |
| `npm run web` | `expo start --web`. |
| `npx tsc --noEmit` | Type-check. |
| `npx eas-cli build --profile development --platform ios` | Native dev client for Stripe modules. |

### Root

`npm run dev:backend`, `dev:frontend`, `build:backend`, `test:backend`, `typecheck:backend`, `typecheck:frontend`, `generate`.

No lint/format scripts are configured.

## 13. Important Patterns

| Pattern | Implementation |
|---|---|
| Backend layering | Thin routes, HTTP-translating controllers, business logic + Prisma in services. |
| Auth protection | `requireAuth` (JWT verify + per-request `User` lookup; `role` / `verificationStatus` / `deletedAt` come from that row, not the token) → `requireVerified` (marketplace) or `requireAdmin` (`/admin/*`). |
| Rate limiting | `express-rate-limit`, keyed by IP + userId; tight on `/auth`, blanket elsewhere; webhook exempt. |
| Error handling | Centralized `errorHandler.ts` — `ZodError` → 400, `AppError` → mapped, unknown → 500. Controllers use `asyncHandler`. |
| Validation | Zod v4 schemas + `validate(schema)`; coerces `req.body/params/query`. |
| Price snapshotting | `totalPrice`, `depositAmount`, `commissionAmount`, `ownerPayout`, `hstAmount`, `insuranceFee` are computed once at booking creation and stored on the row. |
| Two PaymentIntents | Rental PI (manual capture at pickup) + a separate deposit PI (off-session, held through the rental, resolved at return or by dispute). |
| Booking state | `bookingStateMachine.ts` + `version`-guarded transactional `updateMany`. |
| Dispute safety | One transaction with `SELECT … FOR UPDATE` on the booking; over-refund guard against the remaining balance; refund idempotency keyed on dispute id. |
| Payments source of truth | Backend + Stripe webhooks; mock mode when `STRIPE_SECRET_KEY` is empty. |
| Notifications | Services call `notifyUser`/`sendDirectPush`; a `Notification` row is stored and Expo push attempted. |
| Frontend API | One axios client + feature wrappers; demo mode inside each wrapper. |
| Shared types | `@zoink/shared` (Prisma-generated interfaces + DTOs); the frontend re-exports rather than hand-maintaining a parallel set. |
| Jobs | `node-cron` in `index.ts`, skipped in test; every job function is also importable directly. |
| Design system | One theme module (`theme/colors.ts`): type scale, radius scale, hard "block" shadow via `HardBlock`, gradient + texture via `ScreenBackground`. |

## 14. Current Gaps / TODOs / Risks

| Area | Observation |
|---|---|
| Grant/revoke admin role | Still CLI-only (`manageAdminRole.ts`). No API route or screen sets `User.role`; the admin UI is unreachable without CLI/DB access. |
| Integration test coverage | Review-obligation and notification-delivery paths are only partially covered. `backend/src/integration-tests/README.md`'s file table lags the current file set. No frontend test setup. |
| ID verification | `User` has ID-photo/selfie/manual-review fields but no submission or review flow. |
| Listing-location tiles | `mapTiles.ts` falls back to raw `tile.openstreetmap.org` when `EXPO_PUBLIC_MAPTILER_API_KEY` is unset — fine for dev, not for production traffic (OSM tile-usage policy). Set a real key before launch. |
| Rate-limit store | `express-rate-limit`'s in-memory store only enforces per-process; multi-instance deployment needs a shared store (e.g. `rate-limit-redis`). |
| `trust proxy 1` | Correct for exactly one proxy hop; revisit when the deployment topology (CDN + LB chains) is chosen. |
| Sentry source maps | DSN-only crash capture on both sides; source-map upload is not configured. |
| Native build / release | Production EAS builds verified on iOS + Android; TestFlight submission not yet confirmed. `@stripe/stripe-react-native` pinned at `0.62.0` for the Expo SDK 54 Kotlin ceiling — see README. |
| Cancellation fees | `calculateCancellationFeeCents()` short-circuits to `return 0` (launch decision); the tiered logic is retained but unreachable, for a future owner opt-in toggle that has no schema field yet. Integration fee assertions are skipped, not deleted. |
| HST scope | Applied to every booking — there is no per-listing jurisdiction field. |
| Cross-side type drift | Mitigated by `@zoink/shared` (generated from Prisma), but the admin endpoints return raw Prisma rows typed by hand in `frontend/src/types/index.ts` (`AdminDisputeListItem` etc.), which can still drift. Separately, the user-facing dispute reads now return an ad-hoc `toDisputeResponse` shape (conditional `description` / `resolvedByAdminId`, narrowed `booking`) that no longer matches the bare `Dispute` model `disputesApi` types it as; the app only reads `bookingId` + `resolutionNotes`, so it works, but the shape isn't in `@zoink/shared` yet. |
| Stripe webhook replay | `constructEvent` now fails closed on bad/absent signatures, but `updateBookingFromEvent` still has no `event.id` de-dupe, so a validly-signed event that Stripe re-delivers (or an attacker resubmits) is re-applied. Monetary fields like `refundedAmountCents` are assigned, not `max`'d, so an out-of-order delivery can move them backwards. A uniquely-constrained processed-event table is the fix. |

### Resolved since earlier revisions

- **Validation / error handling** — Zod schema layer + centralized `errorHandler.ts`.
- **Scheduled jobs** — `cleanupJob` + `reconciliationJob` run on `node-cron`; `releaseDueDeposits` added.
- **Messaging unread state** — real per-participant `renterLastReadAt`/`ownerLastReadAt` + `POST /conversations/:id/read`.
- **Location permission** — `expo-location` config plugin added; GPS + `LocationMapPreview`/`LocationMapModal` replace the removed `DraggableLocationMap` and the old hardcoded Toronto submit.
- **Owner-configured deposits** — `Listing.depositAmount`; `bookingService.createBooking` reads it directly.
- **Phone at registration** — required, Canadian/NANP, normalized; `User.phone` `NOT NULL`.
- **Dispute payout block** — `releaseDuePayouts` accepts `RESOLVED_NO_ACTION`/`DISMISSED`; `RESOLVED_REFUND` sets `paymentStatus = REFUNDED`.
- **Partial-refund owner payout** — `releaseDuePayouts` now includes `RESOLVED_REFUND` and pays the owner's proportional remaining share from `Booking.refundedAmountCents` (0 for the common case ⇒ full payout), or nothing (with `payoutSentAt` stamped) when fully refunded.
- **Webhook partial-refund handling** — `stripeWebhookController.ts` compares `amount_refunded` to the full charge; a partial refund records `Booking.refundedAmountCents` + `refundedAt` without stamping `REFUNDED`; deposit-PI events are routed to `depositStatus` and never the rental fields.
- **`week7SmokeFlow.ts`** — rewritten to the current `accept → payment-intent → confirm/CONFIRMED → pickup → active → return → complete` path.
- **`test:integration` DB URL** — no longer hardcoded in `backend/package.json`; loaded from `backend/.env.test`, with `setup.ts` aborting if it isn't a `zoink_test` URL and `truncateAllTables()` double-checking before any `TRUNCATE`.
- **Concurrent handoff-confirm test** — `handoffRace.integration.test.ts` covers simultaneous `Promise.all` confirms (one transition, one `ZOINK_TAP`, no duplicate `STATUS_CHANGE`, clean 409).
- **Duplicate webhook mount / unmounted payments route / `.env.test` gitignore / migration ordering bug** — all resolved.
- **Demo-mode env casing** — `EXPO_PUBLIC_DEMO_MODE` comparison is now case-insensitive.
- **Booking-flow rework** — `CONFIRMED` status + `Pay` screen; accept no longer takes payment; overlapping `PENDING` requests auto-decline on accept; request-time message moved into the `Conversation` (`Booking.message` dropped).
- **Separate deposit PaymentIntent** — `stripeDepositPaymentIntentId` + `depositStatus`; held through the rental, auto-released or resolved via dispute.
- **13% HST + tiered commission** — `Booking.hstAmount`; commission keyed on the listing's daily rate.
- **Abuse reports** — `Report` model + `/reports` and `/admin/reports*` + `FileReportScreen` / `AdminReportsScreen`.
- **Review rework** — borrower item rating/notes + lender person notes (`reviews.comment` dropped); lender's third category renamed "Pickup Experience".
- **Hardening** — `helmet`, `express-rate-limit`, Sentry (both sides), Stripe client secrets no longer persisted in the audit trail.
- **Security-hardening pass** —
  - `stripeWebhookController.constructEvent` fails closed: no `stripe-signature` header or no `STRIPE_WEBHOOK_SECRET` → 400, never an unverified `JSON.parse`; the unsigned path is confined to `NODE_ENV=test` with no secret.
  - `requireAuth` resolves `role` and `verificationStatus` from the `User` row per request instead of trusting the 30-day JWT claim, so a demoted admin / de-verified user is enforced on the next request — closing the stale-token window (`requireAdmin` / `requireVerified` / `disputeController` all consume the DB value).
  - `disputeController.getDispute` / `getMyDisputes` project through `toDisputeResponse` — `resolvedByAdminId` admin-only, raiser `description` withheld from the counterparty, `booking` narrowed — instead of `res.json`-ing the raw row.
  - `handoffService` reuses `bookingService.toBookingResponse` (deleting its local raw-spread serializer), so pickup/return/tap responses no longer leak `renter.stripeCustomerId` / `renter.email` / `owner.stripeAccountId` to the counterparty.

## 15. Developer Onboarding Guide

1. `cd backend && npm install`, then `cd ../frontend && npm install` (or just `npm install` at the root — it's a workspace).
2. Create `backend/.env` and `frontend/.env` from the tables in §11.
3. Start Postgres and create the `zoink` database from `DATABASE_URL`.
4. `cd backend && npx prisma migrate dev && npx prisma generate` (generates the Prisma client **and** `packages/shared/generated/prisma-models.ts`).
5. Optional: `npx prisma db seed`.
6. `npm run dev` (health: `http://localhost:3000/health`). For real Stripe events: `stripe listen --forward-to localhost:3000/stripe/webhook`.
7. `cd ../frontend && npm start`. Stripe PaymentSheet needs an EAS dev/release build, not Expo Go.
8. Integration tests: `createdb zoink_test`, `DATABASE_URL=…zoink_test npx prisma migrate deploy`, create `backend/.env.test` (`sk_test_…` + a real `DEV_STRIPE_ACCOUNT_ID`), then `npm run test:integration`.

### Where to edit common features

| Feature | Frontend | Backend | Database |
|---|---|---|---|
| Auth / register / login | `AuthContext.tsx`, `LoginScreen.tsx`, `RegisterScreen.tsx` (phone), `VerifyEmailScreen.tsx` | `routes/auth.ts`, `authController.ts`, `authService.ts`, `requireAuth.ts`, `rateLimiter.ts`, `schemas/auth.schema.ts` | `User` (`phone` required), `VerificationToken` |
| Listings | `CreateListingScreen.tsx`, `EditListingScreen.tsx`, `ListingDetailScreen.tsx`, `SearchScreen.tsx`, `LocationMap*`, `mapTiles.ts`, `listingsApi.ts` | `routes/listings.ts`, `listingController.ts`, `listingService.ts`, `cloudinary.ts`, `schemas/listing.schema.ts` | `Listing` (`itemValue`, `depositAmount`), `ListingImage` |
| Booking request | `BookingRequestScreen.tsx`, `bookingsApi.ts` | `routes/bookings.ts`, `bookingController.ts`, `bookingService.ts`, `bookingUtils.ts`, `bookingStateMachine.ts`, `schemas/booking.schema.ts` | `Booking`, `BookingEvent`, `Conversation` |
| Payment (`ACCEPTED → CONFIRMED`) | `PayScreen.tsx`, `PaymentNeededBadge.tsx`, `bookingsApi.ts` | `bookingService.createPaymentIntentForBooking` / `transitionBookingStatus`, `paymentService.ts`, `stripeWebhookController.ts` | `Booking.paymentStatus` / `stripePaymentIntentId` / `stripeDepositPaymentIntentId` / `depositStatus` |
| Deposit lifecycle | `BookingDetailScreen.tsx` (status lines) | `paymentService.createDepositPaymentIntent`, `cleanupJob.releaseDueDeposits`, `disputeService.resolveDispute` | `Booking.depositStatus` |
| Handoff / Zoink It | `ZoinkItScreen.tsx`, `ActiveRentalScreen.tsx`, `PhotoViewerScreen.tsx`, `bookingsApi.ts`, `uploadFormData.ts` | `handoffService.ts`, `bookingController.ts`, `cloudinary.ts`, `schemas/handoff.schema.ts` | `Booking` photo arrays + tap timestamps |
| Pricing (HST / commission / insurance) | `BookingRequestScreen.tsx` + `PayScreen.tsx` previews | `paymentService.ts` (`HST_RATE`, `COMMISSION_TIERS`, insurance clamp) | `Booking.hstAmount` / `commissionAmount` / `ownerPayout` / `insuranceFee` |
| Payouts | `BookingDetailScreen.tsx` payout card | `cleanupJob.releaseDuePayouts`, `paymentService.transferPayout` | `Booking.paymentStatus` / `payoutSentAt` / `stripeTransferId` |
| Messaging | `InboxScreen.tsx`, `ConversationThreadScreen.tsx`, `conversationsApi.ts` | `routes/conversations.ts`, `conversationController.ts`, `conversationService.ts`, `schemas/conversation.schema.ts` | `Conversation` (`renterLastReadAt`/`ownerLastReadAt`), `Message` |
| Reviews / reputation | `ReviewPromptScreen.tsx`, `ProfileCard.tsx`, `reviewsApi.ts` | `routes/reviews.ts`, `reviewController.ts`, `reviewService.ts`, `schemas/review.schema.ts` | `Review` (`itemRating`/`itemNotes`/`personNotes`), `ReviewObligation`, `UserReputation` |
| Disputes | `FileDisputeScreen.tsx`, `BookingDetailScreen.tsx`, `AdminDisputes*Screen.tsx`, `disputesApi.ts`, `adminApi.ts` | `routes/disputes.ts`, `routes/admin.ts`, `disputeController.ts`, `adminController.ts`, `disputeService.ts`, `schemas/dispute.schema.ts` | `Dispute`, `Booking.disputeStatus` |
| Abuse reports | `FileReportScreen.tsx`, `AdminReportsScreen.tsx`, `reportsApi.ts`, `adminApi.ts` | `routes/reports.ts`, `routes/admin.ts`, `reportController.ts`, `adminController.ts`, `reportService.ts`, `schemas/report.schema.ts` | `Report` |
| Admin role | `MyProfileScreen.tsx` (panel gate) | `requireAuth.ts` (DB-sourced `role`), `requireAdmin.ts`, `scripts/manageAdminRole.ts` | `User.role` (CLI only) |
| Push notifications | `pushNotifications.ts`, `AuthContext.tsx` | `notificationService.ts`, `userService.ts` | `Notification`, `User.expoPushToken` |
| UI theme / design system | `theme/colors.ts`, `HardBlock.tsx`, `ScreenBackground.tsx`, shared components | — | — |
| Landing page | `landing/index.html`, `landing/assets/*` | — | — |

Keep this document updated when routes, models, env vars, or major flows change.
