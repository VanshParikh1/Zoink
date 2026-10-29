# Launch checklist (things only Vansh can do)

In order. Each step says where and how to check it worked. Code and docs for all of this are on `launch-prep` (see `docs/overnight-log.md`). Do `docs/morning-test-plan.md` first: it's the hands-on pass these steps assume.

## 0. Before anything else

1. **Read the top of `docs/overnight-log.md`**, especially the "Review first" list (legal text, commission math, deposit timing, the two payment bugs fixed in Task 5).
2. Run the Stripe-backed integration tests on your Mac with your test keys in `backend/.env.test` (`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET`, `DEV_STRIPE_ACCOUNT_ID`):
   ```bash
   cd backend && npm run test:integration
   ```
   Tonight's container had no Stripe keys, so ~85 tests couldn't run (list in the log). Expect them green; if one isn't, check whether it's the new deposit rules first.

## 1. Check for orphaned `pi_mock_%` rows

Fixture bookings with fake PaymentIntent ids used to survive test runs (Task 7). Check both databases. **Read-only first:**

```sql
-- How many, and are any of them on real users?
SELECT b.id, b.status, b."paymentStatus", b."stripePaymentIntentId", b."stripeDepositPaymentIntentId",
       b."createdAt", r.email AS renter, o.email AS owner
FROM bookings b
JOIN users r ON r.id = b."renterId"
JOIN users o ON o.id = b."ownerId"
WHERE b."stripePaymentIntentId" LIKE 'pi_mock_%'
   OR b."stripeDepositPaymentIntentId" LIKE 'pi_mock_%'
ORDER BY b."createdAt" DESC;
```

- **Local `zoink_test`:** safe to wipe; it's only for tests (the suite truncates it anyway). `psql zoink_test -c "SELECT count(*) FROM bookings WHERE \"stripePaymentIntentId\" LIKE 'pi_mock_%';"` should be 0 after one run of the new suite.
- **Railway (production):** there should be **none**. If the query returns rows, look at the emails before deleting anything. Test users look like `*@test.com`. If they're all test data:
  ```sql
  BEGIN;
  DELETE FROM booking_events WHERE "bookingId" IN (SELECT id FROM bookings WHERE "stripePaymentIntentId" LIKE 'pi_mock_%');
  DELETE FROM bookings WHERE "stripePaymentIntentId" LIKE 'pi_mock_%';
  -- check the counts it printed, then:
  COMMIT;   -- or ROLLBACK;
  ```
  (Other tables reference bookings too: reviews, review_obligations, disputes, notifications. If the DELETE complains about a foreign key, delete from that table first the same way.) After the new reconciliation code is deployed, any leftover row is logged once and skipped, so this is cleanup, not an emergency.

## 2. Merge

1. Open a PR `launch-prep` → `quality/hardening`, read the diff, merge.
2. Then `quality/hardening` → `main`.
3. Railway deploys from `main`: watch the deploy logs for `prisma migrate deploy` (tonight added **no new migrations**) and the server starting.

## 3. Stripe live keys

1. **Railway (backend):** set `STRIPE_SECRET_KEY` to the **live** secret key (`sk_live_…`). Nothing in the code checks that it's a live key, so double-check the prefix. Make sure `DEV_STRIPE_ACCOUNT_ID` is **not** set on Railway (`config/productionGuards.ts` refuses to start in production if it is).
2. **Stripe Dashboard (live mode) › Developers › Webhooks:** add the endpoint `https://<railway domain>/stripe/webhook` (`backend/src/index.ts`) with the events the app handles: `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `refund.succeeded`, and any `account.*` events you use for Connect. Copy its signing secret into Railway as `STRIPE_WEBHOOK_SECRET`.
3. **EAS (app):** set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`frontend/src/config/stripe.ts`) to `pk_live_…` in the **production** environment on expo.dev (Project › Environment variables › production).
4. Connect: confirm live-mode Connect onboarding works with your own account before inviting lenders.
5. Do one real $1-ish rental end to end between two of your own accounts (one with a deposit, one without: Task 5 fixed a bug that would have broken no-deposit payments), then refund it from the Dashboard.

## 4. EAS production builds (both platforms)

```bash
cd frontend
eas build --platform ios --profile production
```
```bash
cd frontend
eas build --platform android --profile production
```

`EXPO_PUBLIC_DEMO_MODE` is already `false` in the production profile. Don't set `EXPO_PUBLIC_QA_TOOLS` for store builds.

## 5. iOS: App Store

1. Seed the reviewer account on the production DB **the day you submit, in Toronto daytime** (its ready-to-pay booking starts tomorrow; see `docs/store/testflight-info.md`):
   ```bash
   cd backend
   DATABASE_URL='<Railway public URL>' REVIEWER_PASSWORD='<new strong password>' npx ts-node src/scripts/seedReviewerAccount.ts --confirm-remote
   ```
2. App Store Connect: upload screenshots (6.9" and 6.5" iPhone at least), fill in subtitle/description/keywords/URLs from `docs/store/testflight-info.md` (end section) and `docs/store/play-listing.md`.
3. App Privacy (nutrition label): use `docs/store/play-data-safety.md` (bottom: Apple notes).
4. TestFlight › Test Information: beta description, feedback email, What to Test from `testflight-info.md`.
5. App Review Information: `reviewer@zoink.app` + the password, and the Notes block. If Apple rejected before, go through Resolution Center against the guideline table in `testflight-info.md`.
6. Submit for review.

## 6. Android: Google Play (start the closed test ASAP: it takes 14 days)

1. Play Console: create the app (`com.zoink.app`), default language en-CA, free, app.
2. **Closed testing track with at least 12 testers, opted in for 14 consecutive days.** Required for new personal developer accounts before you can apply for production. **Start this first**: upload the production AAB to the closed track, add testers by email list, share the opt-in link.
3. Main store listing: from `docs/store/play-listing.md` (short + full description, category, contact, graphics).
4. App content: privacy policy URL, ads (none), app access (reviewer login), target audience 18+, content rating (IARC answers in `play-listing.md`), Data safety (`docs/store/play-data-safety.md`), financial features, government app (no).
5. **Account deletion URL:** `https://zoinkit.app/delete-account.html`. Deploy `landing/` first (the page is new) and open it in a browser.
6. Play API service account (for `eas submit --platform android` later): Google Cloud project › service account with the "Service Account User" role → JSON key → Play Console › Users and permissions › invite the service account email with release permissions. Store the JSON key as an EAS secret / in `eas.json` `submit.production.android.serviceAccountKeyPath` (not in git).
7. After 14 days with 12+ testers: **Apply for production access** (Dashboard), answer the questionnaire about the test, then promote the release.

## 7. Backend settings to revisit

- **Rate limiting behind Railway's proxy:** `backend/src/index.ts` has `app.set('trust proxy', 1)`. Confirm Railway puts exactly one proxy hop in front of the app; otherwise `req.ip` is wrong and every user can share (or dodge) one rate-limit bucket. Check: log `req.ip` and `req.headers['x-forwarded-for']` for one request from your phone on production. `req.ip` should be your phone's public IP.
- Sentry: set error/diagnostic retention to 90 days (privacy.md §7) in the Sentry project settings.

## 8. Design follow-up (not done tonight)

- **Android adaptive icon padding:** the foreground art needs to sit inside the 66 dp safe zone (it gets clipped on round/squircle masks). Needs a redesigned foreground PNG from the locked brand set. No code change; replace `adaptiveIcon.foregroundImage` in `frontend/app.config.js` once the asset exists.

## 9. Decisions waiting on you (from tonight's log)

- privacy.md §7/§8 vs. account deletion code (immediate anonymisation, listings hidden not deleted, no open-booking check, no 30-day purge). Reword or build.
- Owner keeps $0 on rentals under $2 (commission is capped at the subtotal). Consider a minimum daily price.
- Whether the 24h pay window should apply to **all** bookings (no-deposit rent holds can still expire if paid >7 days ahead).
- Terms version: `terms.md` changed tonight (commission, deposit timing) but `CURRENT_TERMS_VERSION` is still `1.0`. If anyone outside testing has already accepted 1.0, bump it (and the version in `packages/shared/scripts/syncLegal.ts`) so they re-accept.

## 10. Lawyer review

Skipped by choice for the pilot. When it happens: lead with `terms.md` §17 (liability cap), per `legal/OPEN-ITEMS.md` D4a, then the deposit and commission sections changed tonight.
