# Zoink

### A peer-to-peer rental marketplace for students

Zoink helps university students rent useful things from nearby students instead of buying items they only need temporarily — cameras, speakers, tools, sports gear, event equipment — with verification, messaging, payments, deposit protection, and a photo-verified handoff built into the rental flow.

The project is in pre-launch. The marketplace, the full booking → pay → handoff → payout lifecycle, messaging with real per-user read tracking, reviews, push notifications, Stripe Connect onboarding, an optional separately-authorized security deposit with pilot deposit rules, 13% HST, flat 15% commission ($2 minimum), a dispute-filing/resolution flow (renter/owner + admin), abuse reporting and user blocking, rate limiting, error tracking, and a neobrutalist app-wide design system are all implemented. A six-phase quality pass (correctness, security, backend and frontend performance, reliability/UX) and a launch-prep pass (commission, deposit rules, payment gate on pickup, store docs) have landed on `main`. Remaining work: the device/Stripe test-key checks in [`docs/morning-test-plan.md`](docs/morning-test-plan.md), the owner-only steps in [`docs/launch-checklist.md`](docs/launch-checklist.md), production deployment, and store submission.

### Docs

| Doc | What it's for |
|---|---|
| [`docs/launch-checklist.md`](docs/launch-checklist.md) | Steps only the owner can do before launch, in order (incl. SQL for leftover `pi_mock_%` rows) |
| [`docs/morning-test-plan.md`](docs/morning-test-plan.md) | One Android emulator + one iOS simulator session covering the launch-prep changes |
| [`docs/overnight-log.md`](docs/overnight-log.md) | Launch-prep record: every change, decision and test number |
| [`docs/hardening-report.md`](docs/hardening-report.md) / [`docs/hardening-log.md`](docs/hardening-log.md) | Quality-pass summary by phase / the full working record |
| [`docs/android-handoff.md`](docs/android-handoff.md) | Android build and check notes for Windows |
| [`docs/store/`](docs/store/) | Play listing, Play Data safety, TestFlight / App Review info |
| [`docs/reskin-*.md`](docs/) | Design-system reskin audit, dev notes and what's left |
| [`CODEBASE_OVERVIEW.md`](CODEBASE_OVERVIEW.md) / [`PRODUCT.md`](PRODUCT.md) | File-by-file map / product brief |
| [`legal/`](legal/) | Terms and privacy source (`npm run generate:legal` regenerates the app and landing copies) |

---

## Current Status

### Completed

**Accounts & verification**

- JWT-protected routes; bcrypt password hashing.
- University email OTP verification and verified-only marketplace access. Accepted domains live in one shared list (`UNIVERSITY_EMAIL_DOMAINS` in `packages/shared/src/universities.ts`, exact match, no subdomains): U of T (`mail.utoronto.ca`, `utoronto.ca`), TMU (`torontomu.ca`, `ryerson.ca`), Laurier (`mylaurier.ca`), York (`my.yorku.ca`, `yorku.ca`), Ontario Tech (`ontariotechu.net`, `ontariotechu.ca`), McMaster (`mcmaster.ca`), Waterloo (`uwaterloo.ca`). App and server show the same error sentence.
- An account isn't active until its code is verified: before that it can only verify, read or delete itself. A new sign-up on the same email replaces an unverified one, and unverified accounts with no activity are deleted after 24 h. Codes: 10/day per email, 50/day per network, one resend a minute.
- When the server ends a session (expired, deleted), the app signs out to Login with a notice. A phone's push token belongs to one account at a time.
- Users can block each other (`POST/DELETE /users/:id/block`, list in Settings). Account deletion (`DELETE /users/me`) anonymises the account, hides its listings and removes the profile photo — see "To do next" for the gap against the privacy policy.
- Phone number required at registration — 10-digit Canadian/NANP, accepts common formats (`(416) 555-0192`), normalized to `+1XXXXXXXXXX` before storage. `User.phone` is `NOT NULL`.
- User profiles, public profile surfaces, avatars, reputation, and review summaries.

**Listings & discovery**

- Listings with photos, categories, daily pricing, item value, an owner-configured security deposit, and real device-GPS location.
- `depositAmount` is owner-set per listing (optional, defaults to `0`). If a deposit is set it must be at least $1 and no more than `itemValue`, which is then required. `itemValue` is capped at $1,000. The listing form has **No deposit / Hold a deposit** chips; turning it on suggests 30% of the item value (whole dollars) until the owner types their own amount. Deposit listings show a "Deposit-backed" badge. Rules are in `packages/shared/src/deposits.ts`.
- A listing with booking or chat history is **soft-deleted** (`listings.deletedAt`): hidden everywhere, photos removed from Cloudinary, no new bookings/chats/edits; past bookings keep its title and prices. A booking still in progress blocks the delete.
- Location step uses `expo-location` GPS with a draggable/pinch-zoom map (`LocationMapPreview` → `LocationMapModal`), tiles from MapTiler (`EXPO_PUBLIC_MAPTILER_API_KEY`) with a raw-OSM fallback for local dev only. `MapAttribution` switches its label to match whichever provider is serving.
- Browse/search with geo-distance, category, price, and availability filtering.
- Every growing list (browse/search, My listings, booking lists, inbox, chat history, admin disputes/reports, booking timeline) is **cursor-paginated** (`limit` + `cursor` → `nextCursor`). A request without `limit` gets the old response shape, capped at 100 rows, so older app builds keep working. Responses over 1 KB are gzipped and listing reads revalidate (304).

**Messaging**

- In-app conversations with real per-participant read tracking (`Conversation.renterLastReadAt` / `ownerLastReadAt`), cleared via `POST /conversations/:id/read` on thread open and on every poll tick while focused — not inferred from who sent the last message.
- The optional message on a booking request is posted as the first `Message` in that listing/renter conversation. `Booking.message` no longer exists as a column.

**Booking → payment → handoff → payout**

- Booking states: `PENDING → ACCEPTED → CONFIRMED → PICKUP_PENDING → ACTIVE → RETURN_PENDING → COMPLETED` (plus `DECLINED` / `CANCELLED`). See "Booking Lifecycle" below.
- **Accepting no longer takes payment.** The owner just needs Stripe payouts enabled, and the dates must not overlap a `CONFIRMED`/`ACTIVE` booking. Accepting a request auto-declines any other still-`PENDING` request on the same listing that overlaps those dates; auto-declined requests do not revive if the accepted one is later cancelled.
- **Payment happens at `ACCEPTED → CONFIRMED`**, on the `Pay` screen: the renter creates the rental PaymentIntent (`POST /bookings/:id/payment-intent`), pays through Stripe PaymentSheet, then confirms (`PATCH /bookings/:id/confirm`). If the listing has a deposit, the backend then authorizes the **security deposit as its own off-session PaymentIntent**, reusing the card just saved. Only a deposit PaymentIntent that actually reaches `requires_capture` counts; anything else (e.g. `requires_action` for 3-D Secure, or a decline) releases both holds and leaves the booking `ACCEPTED` so the renter can retry. A **no-deposit booking confirms on the rent alone** (no deposit PaymentIntent, `depositStatus` null). Paying and confirming take row locks and re-check overlaps; a repeated confirm returns the first result.
- While a booking sits `ACCEPTED`-unpaid, the renter sees a "payment needed" badge in the inbox row and a banner in the conversation thread (`Conversation.acceptedUnpaidBookingId`), both linking straight to `Pay`.
- Rentals are capped at **7 days** (`MAX_RENTAL_DAYS`, `packages/shared/src/bookingWindows.ts`). **Deposit rentals are capped at 3 days** (`DEPOSIT_MAX_RENTAL_DAYS`) and can only be paid from **00:00 Toronto time the day before the start** (409 "You can pay from …" before that; the Pay button shows the same). Worst-case deposit hold is about 5 days. No-deposit bookings can be paid any time after acceptance.
- **No pickup without payment.** Every pickup step (start, photo re-submit, Zoink It tap) requires the rent to be `AUTHORIZED`/`CAPTURED` and, for deposit bookings, the deposit `AUTHORIZED`; otherwise 409 `{ error, code: "PICKUP_PAYMENT_REQUIRED" }`. The rule is `isPickupPaymentReady` in `@zoink/shared`, so the app hides the handoff and shows the same notice. If the rent capture fails at pickup, the booking stays put (never goes `ACTIVE` unpaid) and both people are told to keep the item and retry.
- Photo-verified synchronized handoff ("Zoink It"): pickup is initiated by the owner from `CONFIRMED`, return by the renter from `ACTIVE`; each phase needs 2–3 photos and both parties tapping within `ZOINK_TAP_WINDOW_MS`. Synchronized pickup → `ACTIVE` and captures the rental PaymentIntent; synchronized return → `COMPLETED` → `PAYOUT_PENDING` and creates review obligations. Re-submitting photos before the phase confirms does not re-notify or re-transition. Listing and handoff photos open in a full-screen pinch-zoom viewer (`PhotoViewerScreen`).
- Owner payout is held in `PAYOUT_PENDING` for `PAYOUT_HOLD_HOURS` (default 24), then released as a Stripe Transfer by the cleanup job — unless the booking has an unresolved dispute or was resolved `RESOLVED_REFUND` (see "Payout Rules").
- The cleanup/reconciliation jobs run on `node-cron`: stale-handoff cleanup + payout release + deposit release every 15 minutes, Stripe reconciliation hourly (all skipped when `NODE_ENV=test`).

**Pricing**

- **13% Ontario HST** on the rental price only — not the deposit (a hold, not a sale) and not insurance. Charged on top of what the renter pays; never subtracted before commission/payout, so it has no effect on owner earnings. Snapshotted as `Booking.hstAmount` at request time. There is no per-listing jurisdiction field yet, so it applies to every booking. (`HST_RATE` is a hardcoded constant in `paymentService.ts`, not an env var.)
- **Flat platform commission**: 15% of the rental subtotal, minimum $2.00 per rental, never more than the subtotal (so on a rental under $2 the owner keeps $0); owner-side only (no renter fee), never on deposits. Computed once at request time in integer cents, rounded half-up, and snapshotted; `ownerPayout = totalPrice − commission`. Booking detail shows "minimum $2" when the minimum applied. (`COMMISSION_RATE` / `COMMISSION_MIN_CENTS` in `packages/shared/src/commission.ts`; `PLATFORM_COMMISSION_RATE` is no longer used. Bookings made under the old daily-rate tiers keep their snapshotted numbers.)
- **No insurance, damage-protection, or protection fee is offered**, per terms.md §12. The renter is never charged anything beyond rental price, HST, and the (held, not charged) deposit. Dormant `insuranceFee` / `insuranceOptIn` plumbing remains in the schema but is fully disabled: `insuranceOptIn` is forced `false`, `calculateInsuranceFee()` short-circuits to `0`, and `booking.schema.ts` rejects any attempt to set it. The `INSURANCE_RATE` / `MIN_INSURANCE_FEE` / `MAX_INSURANCE_FEE` env vars are unused.

**Security deposit lifecycle** (`Booking.depositStatus`: `AUTHORIZED` / `CAPTURED` / `RELEASED`)

- Only for listings with a deposit. Authorized at `CONFIRMED` as its own manual-capture, off-session PaymentIntent (`stripeDepositPaymentIntentId`), so it stays held through the whole rental rather than being released as a side effect of the rental capture at pickup. Cancelling a paid booking releases both holds.
- Auto-**released** 24 hours after completion (`DEPOSIT_HOLD_HOURS`, `cleanupJob.releaseDueDeposits`) if no dispute is open.
- A dispute filed against a `COMPLETED` booking resolves **against the deposit**: `RESOLVED_REFUND` with a charge captures part or all of the hold (damage found) and transfers it to the owner **in full, no commission cut** (`transferDepositCompensation`); `RESOLVED_REFUND` with no charge cancels the hold (no damage). A manual-capture PaymentIntent can only be captured once, so only the first dispute can resolve the deposit.

**Disputes** (renter/owner + admin)

- `POST /disputes` — renter or owner opens a dispute with `reason` + `description` (10–1000 chars); one unresolved dispute per booking. On a `COMPLETED` booking the dispute must be filed within `DISPUTE_WINDOW_HOURS` (24) of completion, and is rejected if the deposit was already resolved by a prior dispute.
- `GET /disputes` (own) and `GET /disputes/:id` (admin or booking participant). Both project through `toDisputeResponse`: participants see the outcome fields the app renders (`status`, `resolutionNotes`, `refundAmountCents`, timestamps) but not `resolvedByAdminId`; only the raiser (or an admin) sees the dispute `description`; the embedded booking is narrowed to id / status / dates / listing title.
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
- **Stripe webhook fails closed.** `constructEvent` in `stripeWebhookController.ts` verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET` and rejects with HTTP 400 when it can't — a missing header or an unset secret no longer falls through to parsing the raw body as a trusted event. The only unverified path left is `NODE_ENV=test` with no secret configured (the synthetic-event integration fixtures). This means a real deployment **must** set `STRIPE_WEBHOOK_SECRET` for the webhook to function.
- **Authorization is enforced against the live DB, not the token.** `requireAuth` re-reads `role` and `verificationStatus` from the `User` row on every request (the same lookup that already checks `deletedAt`), so revoking an admin or a user's verification takes effect on their next request instead of when their 30-day JWT expires. The JWT still carries `role`/`verificationStatus`, but only as hints — `requireAdmin` / `requireVerified` act on the DB value.
- **Dispute reads are shaped per caller.** `GET /disputes/:id` and `GET /disputes` no longer return the raw row: `resolvedByAdminId` is admin-only, the raiser's free-text `description` is withheld from the counterparty the dispute was raised against, and the embedded booking is narrowed to id / status / dates / listing title.
- **Handoff responses are scrubbed.** The pickup/return/tap endpoints route their booking payload through the shared `toBookingResponse` serializer, so `renter`/`owner` are the `UserSummary` shape — `renter.stripeCustomerId`, `renter.email`, and `owner.stripeAccountId` are no longer sent to the booking counterparty.
- **Personal data is scrubbed from logs, Sentry (server and app) and stored error messages** by one shared rule set (`packages/shared/src/redact.ts`): credentials, emails, push tokens, JWTs, phone numbers, Prisma call arguments.
- **Stricter input.** Unknown request fields are a 400 naming them; the API enforces the app's own limits (no past start dates, bounded passwords/search terms, normalized phones). Error JSON carries `code` when the error has one.
- **Per-user caps** on top of the IP limiter: Stripe calls 30/h, payout status 120/h, new listings 20/day, opening conversations 60/h. Production refuses to start with a `JWT_SECRET` under 32 characters.
- **Deleted photos are removed from Cloudinary** (soft-deleted listings, deleted avatars); only this app's own uploads are ever deleted.
- **Stripe webhooks only move payment state forward**; the deposit/payout jobs and dispute filing lock the booking and re-check before acting. Reconciliation records a missing PaymentIntent once (`RECONCILIATION_MISMATCH`, `reason: payment_intent_missing`) and skips it after that.

**Admin role**

- `User.role` (`USER` / `ADMIN`). The JWT carries a `role` claim, but `requireAuth` re-reads `role` (and `verificationStatus`) from the `User` row on every request and `requireAdmin` enforces that live value — so a demoted admin loses `/admin/*` access on their next call, not 30 days later. The frontend still decodes the JWT `role` into `AuthContext.user` to show the "Admin" panel; backend enforcement is DB-backed.
- Granting/revoking the role is **CLI-only** — `npm run admin:grant -- --email=…` / `npm run admin:revoke -- --email=…` (see "Managing the Admin Role"). There is still no in-app UI for it, but a revoke now takes effect immediately.

**Design system**

- App-wide neobrutalist / flat-card language matched to the landing page: one type scale, a radius scale, a solid offset "block" shadow (`HardBlock`, since RN's native shadow always renders soft), a green gradient + triangle-texture screen background (`ScreenBackground`), all in `frontend/src/theme/colors.ts`. New shared components: `HardBlock`, `DismissKeyboardView`, `PaymentNeededBadge`, `LocationMapPreview`, `LocationMapModal`, `MapAttribution`. `DraggableLocationMap` was removed.

**App performance & reliability**

- One shared React Query cache for server reads (stale-while-revalidate, infinite scroll, cleared on account change); a small built-in HTTP client (`frontend/src/services/http.ts`) replaced axios.
- Photos via `expo-image` with memory + disk cache, fetched as WebP; only the four Fira weights in use ship (assets 8.7 MB → 1.7 MB).
- The splash stays up until the first screen is ready; non-initial screens and payments load lazily. Idle tabs don't re-render on inbox polls; the handoff screen polls only while visible. The chat thread is an inverted list, so loading older messages doesn't jump.
- Plain-language errors from one place (`frontend/src/utils/userMessage.ts`), skeleton/empty/error states on every data screen, an offline bar, one toast system, single-submit guards, confirmations before cancel/decline, light haptics, and per-section crash boundaries.
- Deep links and notification taps open the listing, booking or chat (also from cold start or signed out).

**Tests**

- Backend unit tests across services, middleware, controllers, schemas and scripts (`npm test`, 232). Frontend unit tests (`cd frontend && npm test`, 155). Shared package tests (`cd packages/shared && npm test`, 30 — money/commission property tests, deposits, dates across time zones and DST, universities, redaction).
- Integration tests (`npm run test:integration`, ~600) against a real `zoink_test` Postgres DB + Stripe test mode: booking lifecycle / full flow / cancellation / concurrency, state machine over HTTP, pickup capture and payment guard, deposit rules, dispute resolution, payout release, webhooks and webhook ordering, job races, reconciliation, authorization on every route, push tokens, code send limits, unverified accounts, Cloudinary cleanup, listing soft-delete, user blocking. About 80 of them need real Stripe test keys and `DEV_STRIPE_ACCOUNT_ID`. Every integration file truncates the DB when it finishes, so no test rows are left behind.
- `packages/shared` holds Prisma-generated TypeScript interfaces (`packages/shared/generated/prisma-models.ts`), hand-written response DTOs (`packages/shared/src/dto.ts`), and the business rules both sides use (commission, pricing, deposits, booking windows, dates, handoff, universities, redaction); the frontend's `src/types/index.ts` re-exports from `@zoink/shared` so API shapes can't silently drift.
- `backend/src/scripts/bench/` seeds a benchmark DB and times every route; `EXPO_PUBLIC_PERF_LOG=1` turns on startup/scroll timing in the app.

### To do next

- **Before launch:** run [`docs/morning-test-plan.md`](docs/morning-test-plan.md), including one deposit and one no-deposit booking end to end with Stripe test keys, then work through [`docs/launch-checklist.md`](docs/launch-checklist.md).
- **Privacy policy vs. account deletion don't match.** `legal/privacy.md` §7–8 promise a 30-day purge and that an open booking or dispute blocks deletion; the code anonymises immediately, only hides the user's listings (their photos stay), and doesn't block on open bookings. Reword the policy or build the missing parts.
- Decide whether to bump `CURRENT_TERMS_VERSION` (still 1.0) — terms §5, §10.2, §10.3 and §11 changed in launch-prep.
- Consider a minimum daily price (the $2 commission minimum leaves the owner $0 on rentals under $2) and applying the 24 h pay window to no-deposit bookings too.
- No in-app "pay again" if the rent authorization fails or expires after `CONFIRMED`; the booking has to be cancelled.
- Give admins an in-app (or at least internal-tool) way to grant/revoke the `ADMIN` role — still CLI-only. JWTs can't be revoked before their 30 days.
- Production deployment, environment separation, operational monitoring; App Store / Play submission.

---

## Booking Lifecycle

```text
Renter:
Search → Message → Request booking → [owner accepts]
  → Pay (rental PaymentIntent + PaymentSheet + deposit authorized if the listing has one;
         deposit bookings payable from 00:00 Toronto the day before the start) → CONFIRMED
  → Pickup photos (refused until payment has gone through) → Zoink It → use item → Return photos → Zoink It → Review

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
- Cancelling is allowed until **00:00 Toronto time on the rental day** (correct across DST, whatever the device time zone).
- After payment (`CONFIRMED` / `PICKUP_PENDING`), before pickup completes: **no cancellation fee** — the rental and deposit holds are both released. This is a launch product decision, not a limitation: `bookingService.calculateCancellationFeeCents()` still contains the tiered logic (5% of total, min $5, max $25) behind an unconditional `return 0`, retained for a planned owner opt-in "cancellation fee" toggle.
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

Runs a backend-only users → listing → booking → handoff flow in forced mock-Stripe mode, walking the current path (`accept → payment-intent → confirm/CONFIRMED → pickup → active → return → complete`). It's a quick wiring check; the authoritative coverage is `backend/src/integration-tests/*.integration.test.ts`.

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
| Image storage | Cloudinary SDK 2.x (via `multer` memory storage); app reads through `expo-image` |
| App data layer | `@tanstack/react-query` + a small built-in fetch client (`frontend/src/services/http.ts`) |
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

`stripe listen` prints a `whsec_…` signing secret — put it in `backend/.env` as `STRIPE_WEBHOOK_SECRET` and restart the backend. The webhook now **fails closed**: outside `NODE_ENV=test`, a request with no valid signature (missing `stripe-signature` header, or `STRIPE_WEBHOOK_SECRET` unset) is rejected with `400 { "error": "Invalid Stripe webhook signature." }` and never processed, so an unset secret means `Booking.paymentStatus` never advances and confirming payment fails with `'Payment authorization is not ready yet.'`.

The path must be `/stripe/webhook`, **not** `/webhook` — the backend mounts nothing at `/webhook`, so events forwarded there `404` with no obvious signal, with the same downstream symptom. Fix the `--forward-to` path and use `stripe events resend <event_id>` to redeliver missed events.

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
- `STRIPE_WEBHOOK_SECRET` — **required for the webhook to work outside tests.** If it is unset (or a request arrives without a `stripe-signature` header), `stripeWebhookController` rejects the request with a 400 rather than trusting the body. Get the value from `stripe listen` (local) or the Stripe dashboard webhook endpoint (deployed). Only `NODE_ENV=test` with no secret still accepts unsigned synthetic events, for the integration fixtures.
- `DEV_STRIPE_ACCOUNT_ID` — dev/beta owner-payout account override. In `.env.test` it must be a real, fully-onboarded (`payouts_enabled: true`) Stripe Express test-mode Connect account id; the accept/payout integration tests call the live Connect API against it and fail fast if it's unset.
- `STRIPE_CONNECT_RETURN_URL` / `STRIPE_CONNECT_REFRESH_URL` — **required**. Must be `http://localhost…` or `https://…` pointing at the backend's `/stripe-return` / `/stripe-refresh` pages (e.g. `<ngrok-url>/stripe-return`), not the `zoink://` scheme (Stripe rejects it). Missing/invalid → hard error, no fallback.
- `DEPOSIT_HOLD_HOURS` — delay before an undisputed deposit is auto-released (`releaseDueDeposits`).
- `HST_RATE` (0.13) and the commission (`COMMISSION_RATE`, `COMMISSION_MIN_CENTS`) are **hardcoded in `@zoink/shared`**, not env vars. `PLATFORM_COMMISSION_RATE` is no longer read.
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
    App.tsx  app.config.js  eas.json  metro.config.js
    src/
      components/  config/  context/  navigation/
      screens/  services/  theme/  types/  utils/
  packages/
    shared/
      generated/prisma-models.ts   # Prisma-generated TS interfaces
      src/dto.ts  src/index.ts      # response DTOs, exported as @zoink/shared
      src/commission.ts  deposits.ts  bookingWindows.ts  dates.ts
      src/handoff.ts  pricing.ts  universities.ts  redact.ts   # shared business rules
      legal/                        # generated from legal/*.md
      test/
  legal/
    terms.md  privacy.md            # source of truth for the legal text
  landing/
    index.html  terms.html  privacy.html  delete-account.html  assets/
  docs/
    launch-checklist.md  morning-test-plan.md  overnight-log.md
    hardening-report.md  hardening-log.md  android-handoff.md
    store/                          # Play listing, Data safety, TestFlight info
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
npm test
```

Shared package (not wired into the root scripts):

```bash
cd packages/shared
npm test
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
| 11 | Admin/disputes + abuse reports (backend + frontend), integration tests, hardening | Done — rate limiting, helmet, Sentry, Zod validation in place; a follow-up security pass added fail-closed Stripe webhook verification, DB-backed authorization (no stale-JWT admin), and response scrubbing on the dispute/handoff endpoints; admin-role grant still CLI-only |
| 12 | Booking-flow rework (`CONFIRMED` + Pay screen), separate deposit PaymentIntent, HST, commission (tiered, later flat 15%) | Done |
| 13 | App-wide neobrutalist design system | Done |
| 14 | Quality hardening: correctness, security, backend + frontend performance, reliability/UX ([report](docs/hardening-report.md)) | Done |
| 15 | Launch prep: flat 15% commission, deposit rules, payment gate on pickup, university domains, dependency fixes, store docs ([log](docs/overnight-log.md)) | Done — device + Stripe test-key checks pending |
| 16 | Deployment, TestFlight, store submission | In progress — production EAS builds verified on iOS + Android; see [launch checklist](docs/launch-checklist.md) |

---

## Key Architecture Decisions

- The backend is the source of truth for booking state, pricing, payment status, deposit status, and handoff state. All prices (`totalPrice`, `commissionAmount`, `ownerPayout`, `hstAmount`, `insuranceFee`, `depositAmount`) are snapshotted onto the `Booking` at request time.
- Payment API calls are synchronous; final payment state is webhook-driven (`stripeWebhookController.ts`).
- The rental and the security deposit are **two independent PaymentIntents**. The deposit (when the listing has one) is authorized off-session at `CONFIRMED` and resolved after the return (auto-release or dispute) — never released as a side effect of the pickup capture.
- Business rules that both app and server enforce (commission, deposits, booking windows, pickup-payment readiness, dates, university domains) live once in `@zoink/shared`, so the app's previews and gates match what the server will do.
- Every critical booking transition is a `version`-guarded transactional `updateMany`. `BookingEvent` is an immutable audit log for payment, handoff, webhook, reconciliation, dispute, and error events.
- Dispute resolution holds a `SELECT … FOR UPDATE` row lock on the booking across validation, the Stripe call, and the write, so sequential partial refunds can't collectively exceed the remaining balance.
- Local dev runs mock Stripe with `STRIPE_SECRET_KEY` empty; real beta/prod needs Connect onboarding with payouts enabled before an owner can accept. Stripe native payment collection needs an EAS build, not Expo Go.
- Messaging is polling-based. Read state is per participant (`renterLastReadAt` / `ownerLastReadAt`), set via `POST /conversations/:id/read`.
- Authorization is role-based (`User.role`). `requireAuth` resolves `role` and `verificationStatus` from the `User` row on every request (not from the JWT claim), so `requireAdmin` / `requireVerified` act on the live DB value and a downgrade is effective immediately. Granting the role is CLI-only.
- Disputes are their own `Dispute` records (auditable who/what/how-resolved); abuse reports are a separate `Report` model with a polymorphic, FK-less `targetId` so a report can outlive its target.
- Frontend API shapes come from `@zoink/shared` (generated from Prisma) rather than a hand-maintained parallel type set.

---

Built as a student MVP. Users are verified through university email today; stronger ID verification and support workflows can be layered in as the platform matures.
