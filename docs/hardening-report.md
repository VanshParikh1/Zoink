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

Not started in this session; handed to a separate terminal session on 2026-10-18. Findings gathered before the handoff and the work already started (in `git stash`) are listed under "Where to pick up" in the log.
