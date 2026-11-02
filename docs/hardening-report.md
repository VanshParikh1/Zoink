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

---

## Phase 3: backend performance

### What was slow or heavy

Nothing was slow on a local database (every route was already inside the targets in Phase 0). The problem was size and round trips:

- **Lists weren't paginated.** The owner's requests list sent every booking with every field: 1.2 MB in the bench's worst case. My listings fetched that same list just to mark which items were rented out. The inbox, which the app polls every 15 seconds on every tab for its unread badge, sent every conversation. Chat history past the newest 100 messages couldn't be loaded at all.
- **Nothing was compressed**, and listing reads had no caching headers.
- **Lists loaded each related table in its own query** (listing, photos, each person): 6 to 9 round trips per list load.
- **Several hot lookups had no index**: the push-token check on every sign-in, the payment jobs that run every 15 minutes, reputation updates, dispute lookups, and the checks Postgres runs when an account is deleted.
- **A real bug on the way:** a chat message sent in the same millisecond as the newest one on an open chat was never shown in that chat until it was reopened.

### What changed

- **Every growing list is paginated by cursor**: booking lists, My listings, browse and search, the inbox, chat history, admin disputes and reports, the booking timeline, and a user's disputes. Pages carry only what the screen shows and come from one database query each. Pages keep their place when new items arrive (cursor, not offset).
- **Older app builds keep working**: a request without `limit` gets exactly the old response, capped at 100 rows. The app switches to pages in Phase 4.
- My listings now gets each listing's active rental with the listing, so it no longer needs the booking list. The inbox reports its unread count, so the badge no longer needs the whole inbox. A booking screen asks for its own dispute only.
- Responses over 1 KB are gzip-compressed. Listing reads tell the phone to revalidate, so an unchanged listing comes back as an empty 304.
- Eight additive indexes; the auto-decline on accept is one statement instead of one per request; messages are ordered by time and id, which fixes the skipped-message bug.

### Before and after (local bench, 50 requests per route)

| Route | Before (Phase 0) | After |
|---|---|---|
| Owner's requests list | 1,244 KB, 7 queries, p95 54 ms | 15 KB a page (2.5 KB on the wire), 3 queries, p95 8 ms |
| Renter's rentals list | 133 KB, 7 queries | 15 KB a page (2.8 KB on the wire), 3 queries |
| Inbox (polled every 15 s) | 41 KB, 9 queries | 22 KB a page (3.5 KB on the wire), 3 queries |
| Browse / search page | 16 KB, 6 queries | 6.8 KB (1.9 KB on the wire), 2 queries |
| My listings | 47 KB, 5 queries | 6.7 KB a page (1.8 KB on the wire), 2 queries |
| Opening a long chat | 39 KB (newest 100 with senders) | 12.5 KB (newest 50, 1.6 KB on the wire); older pages on demand |
| Admin disputes / reports | 64 KB / 50 KB | 13 KB / 10 KB a page |
| An unchanged listing | 1.1 KB | 304, no body |

Targets: every read is under 150 ms p95 (slowest 23 ms) and every write under 300 ms, except sign-up at about 350 ms, which is the deliberate password-hashing cost and was already over in Phase 0. At production-like volumes (100k users, 500k messages), the new indexes take the sign-in push-token check from 17 to 4 ms, the payout job's scan from 27 to 0.4 ms, and deleting an account from 108 to 16 ms.

Not changed: booking state changes still take 17 to 26 database round trips, because Prisma loads a full booking one table at a time and the fix needs a preview feature. All are under 30 ms locally. Browse sorts every listing by distance; that's fine to tens of thousands of listings and would need a spatial index beyond that, logged as an idea.

### Migrations

Two, both additive: `listings.deletedAt` (the soft-delete decision) and eight indexes. Neither touches existing rows. Plain index builds briefly block writes to their table, well under a second at today's size.

### Tests

Backend integration **592: 589 pass, 3 skipped on purpose (cancellation fees), 0 fail**; unit 232, shared 19, frontend 10; both typechecks pass. New suites walk every paged list page by page against the order its screen shows, and cover the listing soft-delete, compression, caching headers and the skipped-message bug.

**Deploy order:** the backend first. Phase 4's app build uses the paged routes; the backend keeps answering older builds the old way.

---

## Phase 4: frontend performance

### What was slow or heavy

- **8.4 MB of fonts the app never uses** shipped in every install and every over-the-air update: all 21 Fira files, for 4 weights.
- **The Home grid dropped frames while scrolling** (5 to 31 per fast fling), because the list built too many photo cards at once.
- **No caching**: every screen refetched everything each time it appeared, and list screens loaded whole lists (Home only ever showed the first 20 listings).
- **Every 15 seconds, all four main tabs re-rendered** because of the inbox poll, even when nothing had changed.
- **The handoff screen polled every 3 seconds** for as long as it existed, including behind the camera and with the phone locked.
- **Startup** showed a blank white screen and then a tan loading screen between the splash and the app. It also loaded payment and camera code that the first screen doesn't need, and waited for a fresh GPS fix before loading listings.

### What changed

- Only the four font weights in use ship. Assets went from 8.7 MB to 1.7 MB.
- The Home grid builds a couple of rows at a time, and its cards don't re-render while it scrolls.
- **Photos:**
  - Photos load through Expo's image library, with a memory and disk cache.
  - They are fetched as WebP, 4–39% smaller than JPEG.
  - Tapping a listing starts downloading its main photo before the listing page asks for it.
- **One shared cache** (React Query) for everything the app reads from the server:
  - Screens show what they already have immediately and refresh it in the background.
  - Every list loads more as you scroll, and pull-to-refresh returns to the first page.
  - Changes such as accepting a request or editing a listing update every screen that shows them.
  - The cache is cleared whenever the signed-in account changes.
- The handoff screen polls only while it's on screen.
- The tabs re-render only when their own data changes.
- **Startup:**
  - The splash stays up until the first screen is ready, then fades straight into it.
  - Screens other than the first ones load the first time they're opened, and payments set up only on the Pay screen.
  - The first-screen check starts earlier.
  - Home uses a recent location instead of waiting for GPS.
- **Bundle:** the new cache library would have made the app's code larger. That was offset by:
  - replacing a large Node polyfill, used for five checks inside a notification library, with a five-line shim;
  - replacing axios with a small built-in client with the same behaviour;
  - removing an unused package.

### Before and after (iOS simulator, Release builds)

| | Before | After |
|---|---|---|
| JS bundle | 4.38 MB | **4.35 MB** (−29 KB) |
| Assets shipped | 8.7 MB | **1.7 MB** |
| Home grid, fast flings | 5–31 dropped frames each (median 16) | **0–2** (16 of 20 flings at 0), with pages loading mid-scroll |
| Renders while idle on Home | 15 a minute | **0** |
| Splash to app | Blank white, then a tan loading screen | **Cross-fades straight into the app** |
| Cold start to Home content (median) | 2.93 s | **2.77 s** |
| Cold start to Login / main screen (median) | 2.50 s / 2.44 s | 2.46 s / 2.45 s (unchanged within noise) |
| A listing photo (grid card, same image) | 46 KB | 28 KB |

### Targets

- **No dropped frames on normal grid scrolling:** met, apart from an occasional single frame.
- **Bundle no larger than the baseline:** met.
- **Cold start ≤ 2.0 s:** not met on this Mac, which was under heavy background load from iCloud sync and a virtual machine during every measurement. Medians were 2.4–2.8 s, while the same build's fastest launches were 1.3–1.7 s. Phase 0, on a quieter machine, measured 1.7 s to the main screen before any change. This needs re-measuring on a quiet machine or a real phone.

### Needs a decision

**One build setting (`inlineRequires`) trades bundle size for startup speed.** Turned on, launches were about 10% faster on this Mac, but the bundle grows 70 KB and ends up 1% over the baseline. I left it off so the bundle target holds. It's a one-line change.

### Android pending

Nine checks to run on an Android release build. The log lists each with exact steps:
- the grid with its Android-only optimisation (no blank cells)
- grid scrolling frames
- release cold start
- the splash on Android 12+
- photos through Android's image loader
- the chat history scroll
- uploads and sign-out through the new HTTP client
- pull-to-refresh
- polling pausing in the background

### Deploy notes

- The backend goes first: the app's paged lists need the Phase 3 routes.
- This app version needs a new store build, not an over-the-air update, because two native modules were added and one removed.

### Tests

Frontend 16 (new tests for the HTTP client), shared 19, backend unit 232, backend integration **592: 589 pass, 3 skipped on purpose, 0 fail**; both typechecks pass. Each change was also checked on the iOS simulator: paging on every list, the inbox badge and polling, accepting a request, a 500-message chat, review prompts, sign-in errors, and a photo upload through the new HTTP client.

---

## Phase 5: reliability and UX polish

Before it started, the owner's four decisions were recorded: keep refusing to delete a listing with a booking in progress, keep `inlineRequires` off until cold start is measured on a phone, apply the approved privacy wording (done, word for word), and keep the new HTTP client.

### What was wrong

- **Raw technical text reached people.** A refund Stripe refused showed Stripe's internal error; an expired session showed "No token provided."; a bad form showed "Validation failed."; no connection showed "Network Error"; the Pay screen showed the payment sheet's raw errors.
- **Screens that couldn't load popped an alert and threw you back**, even for an ordinary case like a deleted listing or a stale link. Some lists had no error state at all and showed "Nothing here" when they had failed; Settings said "You haven't blocked anyone" when it couldn't load the list.
- **Offline, nothing said so**, and writes failed with whatever the error happened to say.
- **A refused pickup said nothing (S2).** When the rent can't be captured, the pickup is refused (Phase 1's decision) and both people are told to keep the item. The Zoink It screen silently ignored that answer, so neither phone said why the pickup didn't happen.
- **A double tap could submit twice (S2)**: two listings, two booking requests, a message sent twice. Cancelling a booking or declining a request took one tap, with no confirmation, and can't be undone.
- **Forms jumped** when an error appeared, the email field autocorrected "utoronto" to "Toronto", and creating a listing silently dropped photos that failed to upload.
- **No deep links**: tapping a notification just opened the app.

### What changed

- **Plain messages from one place.** Sentences the server writes for people are shown; everything else gets a plain sentence for its kind ("Couldn't reach Zoink. Check your connection and try again."). A test holds every listed sentence to the server's exact wording. The raw error is still logged.
- **Every data screen** shows a skeleton while loading, an empty state that says what to do next, and an error with Try again. A deleted or someone else's item shows "no longer available" with a way Home.
- **Offline:** a bar across the top; lists wait and load by themselves when the connection returns; anything you try to send says it wasn't sent, and a chat message stays in the box to retry.
- **One toast system** for successes and errors that don't need an answer; alerts only for questions (destructive confirmations).
- **Forms:** each message sits under its field in space that's always kept, so nothing moves; the right keyboard, autocorrect and autofill per field; every submit runs once at a time. Cancelling and declining now ask first.
- **Light haptics** on the moments that matter (request sent, accept/decline, message sent, pull-to-refresh), following the phone's own setting on both iOS and Android.
- **Links and notification taps** open the listing, booking or chat, whether the app was closed, open, or signed out (it opens right after sign-in). Unknown links land on a "Link not found" screen.
- **No dead ends:** Back always goes somewhere; a part of the app that crashes shows "Try again" (and "Go back") instead of taking the whole app down.

### Phase 3 and 4 numbers, re-measured

| | After Phase 4 | After Phase 5 |
|---|---|---|
| iOS JS bundle (baseline 4,378,588 B) | 4,349,908 B | **4,356,268 B**, still 22 KB under |
| Android JS bundle (baseline 4,385,144 B) | 4,356,504 B | **4,362,760 B**, still 22 KB under |
| Renders while idle on Home | 0 a minute | **0** |
| Home grid, fast flings | 0–2 dropped frames (16 of 20 at 0) | **0–2** (12 of 19 at 0), 59–60 JS FPS |

Phase 5's code alone would have put the bundle 5 KB over the baseline; a library was shipping a version-check package used only in development builds, and leaving it out of release builds made room. Re-measuring also caught one regression from this phase (idle tabs re-rendering on every inbox poll), fixed before the numbers above.

Cold start wasn't re-measured; per the owner's decision it gets measured on a real phone.

### Checked on the iOS simulator

Sign-in errors and fields; links (open, closed, signed out, deleted, someone else's, unknown) and Back from each; offline and back online (with a test switch, since the simulator has no airplane mode); the server being down; the crash screens at app, tab and screen level; the cancel confirmation; skeletons. Not possible on the simulator and on the device lists: real airplane mode, notification taps, haptics, the keyboard on the profile editor.

### Needs a decision

1. The review prompt has no way out except submitting (offline it can't be sent). Keep it strict, or add "Later"?
2. Only `zoink://` links work; web links that open the app need the website set up. Should the Share button include a link?
3. The privacy policy's "Last updated" date, version bump (which makes everyone re-accept) and the website copy.
4. A declined card shows Stripe's own sentence ("Your card was declined."). Keep it?
5. Toasts cover the top of the screen for about 3 seconds. Keep them at the top?
6. A "review received" notification opens the booking; it could open your reviews instead.
7. Existing haptics on navigation taps were kept. Fewer?

### Android

Moving to the owner's Windows machine. **`docs/android-handoff.md`** has the setup and every Android check from Phases 4 and 5 with exact steps (22 in all), including real airplane mode, links and notification taps, haptics with the system setting on and off, and the keyboard on every form.

### Deploy notes

- Backend first, as before. The app needs a new store build (another native module, `expo-network`, joins Phase 4's), not an over-the-air update.
- Build store releases without `EXPO_PUBLIC_QA_TOOLS`.

### Tests

Frontend **145** (was 16): error messages and the guard on the server's wording, toasts, offline handling, deep-link routing, form validation and the double-submit guard. Shared 19, backend unit 232, backend integration **592: 589 pass, 3 skipped on purpose, 0 fail**; both typechecks pass. One backend unit test failed twice from a stray packet another program on this Mac sent to the test server's port (seen in Phases 1 and 2 too); a clean rerun passed 232/232.
