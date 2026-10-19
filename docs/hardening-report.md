# Hardening report

The readable summary of the `quality/hardening` branch: what was measured, what was wrong, what changed and what's still open, phase by phase. Each section is written when its phase finishes. The working record with every finding, commit and number is [`hardening-log.md`](hardening-log.md).

Severity: **S1** money, data loss or a security hole reachable in normal use · **S2** wrong behaviour a user can hit · **S3** robustness, performance or polish.

---

## Phase 0: baseline

Measured before any change, so every later phase has a number to beat.

- **Tests:** backend 212 unit (1 flaky, since fixed) and 292 integration (3 skipped on purpose), frontend 3. Both typechecks pass.
- **App size:** 4.37 MB JS bundle plus 8.6 MB of assets, of which 8.4 MB are fonts: every Fira Sans and Fira Mono weight ships although the app uses four.
- **API speed:** every route is well inside the targets on a local database (reads p95 under 150 ms, writes under 300 ms). The only slow route is sign-up, at about 270 ms by design (password hashing). The problem is size, not speed: lists aren't paginated. In the worst case `/bookings/requests` is 1.2 MB.
- **Cold start (iOS simulator, Release):** about 1.9 s to the login screen, 1.7 s to the signed-in tabs, 2.2 s until Home listings are on screen. There's a blank white then tan flash between the splash and the first screen.
- **Scrolling:** the two-column Home grid drops frames as new rows load (45 to 57 JS FPS at 150 items). The one-column Search list doesn't.

Tooling added for this: a seeded benchmark database and runner (`backend/src/scripts/bench/`) and opt-in startup and scroll timing in the app (`EXPO_PUBLIC_PERF_LOG=1`).

---

## Phase 1: correctness and data integrity

### What was wrong

Fifteen findings: five S1, eight S2, two S3. The S1s were all about money:

- **Two renters could pay for the same dates.** Paying didn't lock the listing, and dates weren't held during the pickup and return handoffs.
- **A double-tapped Confirm could put two deposit holds on a card**, or cancel the rent hold the booking had just been confirmed with.
- **Cancelling a paid booking left money held.** After confirming, the deposit stayed held for up to about 7 days. During pickup, nothing was released at all.
- **A late Stripe webhook could stop the owner's payout.** A capture event arriving after the rental finished reset the booking to a state the payout job never picks up.

The S2s were races (two disputes on one booking, a deposit released or a payout sent while a dispute was being filed, overlapping job runs, an accepted booking flipped to declined), webhooks moving payment status backwards, stale actions answering 500 instead of a clear message, and rental dates showing the wrong day in the evening.

### What changed

- Paying, confirming and accepting take row locks and re-check for overlaps inside the transaction. Bookings hold their dates from confirmation until the return.
- Stripe webhooks only move a payment forward. The deposit and payout jobs, and filing a dispute, all lock the booking and re-check before acting.
- Cancelling releases both holds. A repeat confirm returns the first result. Illegal moves answer 409 with a readable message.
- One shared date helper (`@zoink/shared` `dates.ts`) for every screen that shows a rental date. Rental days read the same in any device time zone; real times show in Toronto time.
- The request screen prices with the server's own formula, so the preview always matches the charge.

### Owner decisions, applied

| Open question | Decision | Result |
|---|---|---|
| A failed card capture at pickup let the rental start unpaid | Block the handoff | The booking can't go ACTIVE until the rent is captured. If capture fails, both people are told to keep the item and retry, and the failure is logged and alerted. Retrying uses a fresh Stripe request |
| Cancellation closed at 7 to 8 PM the evening before the rental | It's a time-zone bug | Cancelling is now allowed until 00:00 Toronto time on the rental day, tested across both DST changes |
| The state table allowed skipping the handoffs | Remove those moves | Gone, along with the code path that used them |
| Half-cent ties rounded down 1,980 times in 700,000 quotes | Round half-up if trivial | It was. Commission and HST now round half-up in whole cents. Amounts already booked don't change |
| Tiered vs flat commission | Keep tiered | No change. Flat 15% with a $2 minimum is logged as a next feature |
| Card holds can expire before pickup | Next feature | Logged, not built: pay no earlier than 1 day before pickup, and rentals with a deposit capped at 3 days |

Still open: an ACCEPTED request whose dates were taken stays payable (it's refused at Pay), and disputes can be filed on bookings in any status.

### Invariants pinned by tests

These are business rules. If one of these tests fails, a contract term or the revenue model changed. That needs a product decision and a terms update, not a test edit.

- Commission is 15% up to $20/day, 12.5% up to $50/day, 10% above, keyed on the daily rate. HST is 13% of the rental price only.
- Every quote from $0.01 to $1,000/day for 1 to 7 days is whole cents. Commission plus payout equals the rental total. The pickup charge is rent plus HST. Commission and HST are exact half-up.
- Deposit and payout holds are 24 h. The Zoink It window is 5 minutes. Handoffs take 2 to 3 photos, listings up to 8.
- Nine booking states, no skipped steps. Every action is allowed only from its own states and by its own party.
- Cancellation closes at 00:00 Toronto on the rental day.

### Migrations

Phase 1 added no migrations; every fix is code. Nothing can fail to apply on production data. The log has six read-only queries that find rows the old bugs could have left in production: overlapping paid bookings, duplicate open disputes, rentals that started after a failed capture, cancelled bookings still holding money, finished rentals never paid out, and money released during an open dispute. They haven't been run against production yet. Any row they return needs a person to settle it in Stripe.

### Tests

Shared: 16 (money, contract limits, the 700,000-quote property test, dates across six device time zones and both DST changes, the cancellation cutoff). Backend unit: 221. Backend integration: 345, with 340 passing and 3 skipped on purpose (cancellation fees). Two failed in the full run: both were old pickup tests that relied on a failed capture still starting the rental, which the owner's decision now forbids. They were updated and that file re-ran clean (43/43). New suites cover the state machine over HTTP, booking concurrency against Stripe test mode, webhook ordering, job races, pickup capture failure and the cancellation cutoff. Both typechecks pass.

---

## Phase 2: security

### What was wrong

Twenty findings: one S1, seven S2, twelve S3, plus the npm audit.

- **Credentials are in the public git history (S1): resolved by owner, keys rotated.** A file named `backend/env` was committed on 2026-06-01 and deleted the same day. It holds the database URL, the JWT secret, an AWS key pair, the Cloudinary secret, a Stripe test secret key and a webhook signing secret, and the GitHub repository is public. The owner confirmed on 2026-10-19 that every key in it was rotated long ago.
- **Phones could get someone else's notifications.** When a session ended without a sign-out, the phone's push token stayed on the old account, so the next person to sign in on that phone got both accounts' notifications, message previews included.
- **Expired or deleted sessions left the app stuck** "signed in", with every screen failing.
- **Anyone could lock a student out of signing up** by registering their university email first: the address stayed taken and unverified accounts were never cleaned up. And with no daily limit on codes, guessing through to someone else's email took about two months.
- **Personal data reached logs and Sentry.** A Prisma validation error prints the failed call's arguments (email, password hash, name), in logs, in Sentry and in the booking history admins read. SES and Expo errors put addresses and push tokens in the logs, and the app's Sentry setup had no scrubbing at all.
- **Deleted photos stayed public.** Deleting a listing, or an account, left the photos on Cloudinary at their URLs, against what the privacy policy promises.
- **Smaller gaps.** Booking responses gave each party the other's Stripe ids. Unknown request fields were silently dropped. The API took limits only the app enforced (past start dates, free-text phone numbers, unbounded passwords and search terms). The verification email put the typed name into HTML unescaped. The routes that call Stripe or post to everyone had no per-user cap. The JWT secret's length was never checked.

### What changed

- The app signs out to Login with a one-line notice when the server ends the session, and drops an expired session at launch. Checked on the iOS simulator for expiry and deletion, both mid-use and at launch.
- A phone's push token is on one account at a time: signing in takes it off any other account, and signing out, a session ended by the server, or an expired session at launch all release it. Checked on the simulator.
- Verification codes: at most 10 a day per email address and 50 a day per network, one resend a minute, six digits, still 5 guesses a code. Guessing is now capped at 50 a day.
- Each booking party sees only their own Stripe ids. Unknown fields are a 400 that names them. The API now enforces what the app always did. The name in the email is escaped.
- Logs, Sentry (server and app) and stored error messages drop credentials, emails, push tokens, JWTs, phone numbers and Prisma call arguments, by one shared set of rules.
- Deleted listings' photos and deleted accounts' profile photos are removed from Cloudinary; only this app's own uploads are ever deleted.
- Per-user caps: Stripe calls 30 an hour, payout status 120 an hour, new listings 20 a day, opening conversations 60 an hour.
- Production refuses to start with a JWT secret under 32 characters.
- npm audit's non-major fixes: production advisories from 61 (2 critical) to 43 (none critical).

### Owner decision, applied

| Open question | Decision | Result |
|---|---|---|
| Unverified sign-ups block the real student | An account isn't active until its code is verified; a new sign-up replaces an unverified one; unverified accounts older than 24 h are deleted | Before verifying, an account can only verify, read or delete itself. A new sign-up replaces it as a new account with a new id, so the earlier sign-up's session can't reach the verified account. The 15-minute job deletes unverified accounts after 24 h; it is idempotent and only ever deletes an account with no activity at all |

### Before deploying

1. ~~Rotate every credential in that committed file.~~ Resolved by owner, keys rotated.
2. **Check the JWT secret in Railway is at least 32 characters**, or the deploy won't start. Railway keeps the old deployment serving if it doesn't.
3. **The first cleanup run deletes existing unverified accounts older than 24 h** that never did anything. The log has a read-only query to count them first. The App Review account is verified and isn't affected.

### Owner decisions, applied (2026-10-19)

| Open question | Decision | Result |
|---|---|---|
| A listing anyone has messaged about or booked couldn't be deleted (500) | Soft-delete it | It disappears from browse, search and the owner's list, its photos are deleted from Cloudinary, and it takes no new bookings, chats or edits. Bookings and chats keep its title and prices. A listing with no history is still deleted outright. A booking still in progress blocks the delete with a clear message rather than a 500. One additive column (`listings.deletedAt`). The privacy policy's "deleted immediately" line needs a small edit; the log has proposed wording (not applied) |
| Old app builds send a retired booking field and were refused | Accept and ignore it | Dropped unread before validation; a test shows it changes nothing |

Still open from this: should deleting a listing auto-decline its pending requests instead of asking the owner to decline them first?

Still open: tokens can't be revoked before their 30 days; soft-deleted accounts are never purged (the privacy policy says within 30 days); `cloudinary` 2.x and the Expo/React Native tooling advisories need major upgrades.

### Migrations

One, additive: a new `verification_email_sends` table for the per-address code cap. It touches no existing row, so it can't fail on production data. The data-changing step is the cleanup job's first run (above).

### Tests

Shared 19, backend unit 232, frontend 10. Backend integration **555: 552 pass, 3 skipped on purpose (cancellation fees), 0 fail**, after the dependency updates. New suites cover who can reach what on every route (155), push tokens, code send limits, unverified accounts and Cloudinary cleanup. Both typechecks pass, and a Release build was smoke-tested on the iOS simulator.
