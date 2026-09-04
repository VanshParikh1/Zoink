# Zoink Backend — Integration Tests

Integration tests for the booking → payment → handoff lifecycle. These tests run against a **real Postgres test database** (`zoink_test`) and **Stripe test mode**, catching bugs that unit tests with mocked Prisma/Stripe cannot catch: state machine transitions, transaction rollback behaviour, and webhook-driven state updates.

---

## Prerequisites

### 1. Postgres test database

Create a dedicated `zoink_test` database. It must be separate from the dev `zoink` database — the test suite truncates all tables between every test.

```bash
createdb zoink_test
```

Apply all migrations to it:

```bash
DATABASE_URL="postgresql://<user>:<pass>@localhost:5432/zoink_test" \
  npx prisma migrate deploy
```

> **Why `migrate deploy` and not `migrate dev`?**  
> `migrate dev` generates new migrations. `migrate deploy` applies existing ones deterministically — the right command for a dedicated test environment.

### 2. `.env.test`

`backend/.env.test` is already present in this repo and pre-configured to point at `zoink_test`. Verify these key values match your local setup:

```env
DATABASE_URL="postgresql://<user>:<pass>@localhost:5432/zoink_test"
STRIPE_SECRET_KEY=sk_test_...        # must start with sk_test_ — never a live key
STRIPE_WEBHOOK_SECRET=whsec_...
NODE_ENV=test
```

The setup file (`setup.ts`) hard-aborts with a clear error message if `STRIPE_SECRET_KEY` does not start with `sk_test_`.

### 3. Network access to Stripe

Tests that call the real Stripe API (PaymentIntent creation, capture, refund) require outbound HTTPS to `api.stripe.com`. A connectivity check runs before those test suites and skips Stripe-dependent assertions gracefully if Stripe is unreachable, rather than hanging.

> **⚠️ Known gotcha — campus WiFi (UofT eduroam and similar networks)**  
> Some campus networks block outbound TLS to `api.stripe.com` and to the Prisma CDN used during `prisma generate`. If tests hang on Stripe calls or `npx prisma generate` fails silently, switch to a personal hotspot or a VPN. This is a known local dev constraint, not a code issue.

---

## Running the tests

### Unit tests only (fast, no DB/Stripe required)

```bash
cd backend
npm test
```

The unit test glob is `src/services/*.test.ts src/middleware/*.test.ts src/middleware/controllers/*.test.ts`. It does **not** touch `src/integration-tests/`.

### Integration tests

```bash
cd backend
npm run test:integration
```

This runs:

```
NODE_ENV=test node --test --require ts-node/register src/integration-tests/*.integration.test.ts
```

Expect the full suite to take **20–60 seconds** depending on Stripe API latency and machine speed. Each test file truncates all tables in `beforeEach`, so files can run in any order.

---

## Test file overview

| File | What it tests |
|---|---|
| `bookingLifecycle.integration.test.ts` | Full happy path: create → accept → pickup handoff (photos + Zoink It) → ACTIVE → return handoff → COMPLETED → review obligations created → `PAYOUT_PENDING`. Also: validations, overlap detection, data access controls, full HTTP path via supertest. |
| `bookingCancellation.integration.test.ts` | Cancellation fee rules at all stages: PENDING (no fee, PI voided), ACCEPTED (5% fee, $5–$25 clamp), PICKUP_PENDING. Invalid cancellations (COMPLETED/DECLINED). HTTP 200/401/403/404 paths. |
| `disputeResolution.integration.test.ts` | `createDispute` / `resolveDispute` service layer + HTTP layer. All three resolution outcomes (RESOLVED_REFUND, RESOLVED_NO_ACTION, DISMISSED). Admin-only resolve endpoint. BookingEvent audit trail. |
| `stripeWebhooks.integration.test.ts` | Synthetic signed webhook events POSTed to `/stripe/webhook`. Rental vs. deposit PaymentIntent routing (a deposit event never touches the rental's `paymentStatus`). Partial vs. full refund (`amount_refunded` < charge total ⇒ `refundedAmountCents` recorded, not stamped `REFUNDED`). Signature verification (invalid sig → 400). Unknown event type. Replay idempotency. |
| `payoutRelease.integration.test.ts` | `releaseDuePayouts` / `releaseDueDeposits` against a real Connect test account. Full payout for `NONE`/`RESOLVED_NO_ACTION`/`DISMISSED` and for `RESOLVED_REFUND` with no rental refund; proportional remainder after a partial rental refund; nothing (closed out via `payoutSentAt`) when fully refunded; blocked for `OPEN`/`UNDER_REVIEW`. |
| `handoffRace.integration.test.ts` | Two concurrent handoff-confirm calls (`Promise.all`) for the same phase → exactly one transition, one `ZOINK_TAP`, no duplicate `STATUS_CHANGE`, clean 409 for the loser. Return (→ `COMPLETED`) and pickup (→ `ACTIVE`) phases. |
| `setup.ts` | Shared utilities: `truncateAllTables`, `createTestUser`, `createTestListing`, `futureDates`, `buildSignedWebhookPayload`, `signTestJwt`, `checkStripeConnectivity`, `getApp`. Aborts the run if `DATABASE_URL` is not a `zoink_test` URL. |

---

## Design decisions

### Truncate-and-reseed, not transaction-per-test

We evaluated wrapping each test in a transaction that rolls back (transaction-per-test) but ruled it out for two reasons:

1. `@prisma/adapter-pg` builds `PrismaClient` on top of a `pg.Pool`. Prisma's interactive transactions check out a **single connection** from the pool; the test setup and the service under test both use the same singleton prisma instance and may grab **different connections**, so neither sees the other's open transaction. True savepoint-based nested transactions are not supported via the driver-adapter path in Prisma 7.

2. Stripe PaymentIntent creation is an **external HTTP call** that cannot be rolled back by a DB transaction. Truncating after each test gives a consistent local state regardless of what external calls succeeded.

### Synthetic webhook events, not `stripe listen`

The webhook tests use `stripe.webhooks.generateTestHeaderString()` to produce a valid `Stripe-Signature` header, then POST the signed payload to `/stripe/webhook` via supertest. This exercises the full signature-verification path in `stripeWebhookController.ts` without requiring `stripe listen --forward-to` to be running. The test suite is fully self-contained and passes in CI with no Stripe CLI present.

### Direct Prisma writes for mid-flow pre-conditions

When a test needs to verify behaviour at a specific booking state (e.g., testing return-handoff without walking through pickup first), it sets up the pre-condition with a direct `db.booking.create(...)` rather than calling transition functions out of order. Calling transition functions out of order is correctly rejected by the state machine — that behaviour is covered by the unit tests in `bookingStateMachine.test.ts`.

### No mocking in integration tests

Integration tests call the real Prisma client and real services. No `mock.method` or module-level stubs are used. This is intentional — the whole point of integration tests is to exercise the real wiring. The Prisma 7 Proxy-based client is not safely mockable with `mock.method` anyway (a known constraint documented in the Phase 7 spec).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `DATABASE_URL is not set` | `.env.test` not found or not loaded | Confirm `backend/.env.test` exists and `NODE_ENV=test` is set |
| `ABORT: STRIPE_SECRET_KEY does not look like a test-mode key` | Live key in `.env.test` | Replace with `sk_test_...` key from Stripe dashboard |
| Tests hang for 30+ seconds on Stripe calls | Campus WiFi blocking `api.stripe.com` | Switch to hotspot or VPN |
| `relation "users" does not exist` | Migrations not applied to `zoink_test` | Run `DATABASE_URL=... npx prisma migrate deploy` |
| `connect ECONNREFUSED 127.0.0.1:5432` | Postgres not running | Start Postgres locally |
| Unit tests suddenly require DB | `*.integration.test.ts` accidentally matched by `npm test` glob | Confirm `npm test` script does not include `integration-tests/` path — it should not |
