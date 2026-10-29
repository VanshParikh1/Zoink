# Morning test plan (hands-on)

Everything changed overnight on `launch-prep`, plus the leftover device checks from `docs/android-handoff.md` (items 1, 8, 9, 18) and the iOS check of the inverted chat list. One **Android emulator** session (Windows) and one **iOS simulator** session (Mac). Write pass, or what happened, next to each step.

## 0. Setup (once)

1. `git switch launch-prep && git pull`, then from the repo root: `npm install && npm run build:shared`.
2. Bench API (Stripe mocked), from `backend/`:
   ```bash
   PORT=3000 npx ts-node src/scripts/bench/serve.ts --seed
   ```
   The bench seed changed tonight: **renter1 now owns 12 listings** (for item 1 below), and paid bench bookings now carry an authorized rent + deposit hold, so their handoffs aren't blocked by the new payment check. Accounts: `renter1@mail.utoronto.ca`, `owner2@mail.utoronto.ca`, password `BenchPass123!`.
3. Every bench listing has a **$50 deposit**, so tonight's deposit rules apply to them all: bookings ≤ 3 days, payable only from the day before the start.
4. The Pay sheet itself needs real Stripe test keys. For the steps marked **(Stripe)**, point the app at a backend with `sk_test_…` + `pk_test_…` instead of the bench (card 4242 4242 4242 4242).
5. Useful SQL against `zoink_bench` (ids change on every `--seed`):
   ```sql
   -- one of renter1's CONFIRMED bookings (for the payment-gate checks)
   SELECT b.id, l.title FROM bookings b JOIN users u ON u.id = b."renterId" JOIN listings l ON l.id = b."listingId"
   WHERE u.email = 'renter1@mail.utoronto.ca' AND b.status = 'CONFIRMED' LIMIT 1;
   -- make it look like the payment failed after confirming
   UPDATE bookings SET "paymentStatus" = 'FAILED' WHERE id = '<id>';
   -- and put it back
   UPDATE bookings SET "paymentStatus" = 'AUTHORIZED' WHERE id = '<id>';
   ```

---

## A. Android emulator session

Build and run the release app as in `docs/android-handoff.md` §4 (Windows notes there still apply).

### A1. Leftover handoff item 1: My listings grid
1. Sign in as renter1 → Profile › My listings. **Expect** 12 listings, each with photos and a lime **Deposit-backed** badge.
2. Fling fast down and back up 20 times. **Expect** no blank cells, no missing photos or badges after scrolling back.

### A2. Leftover handoff item 8: pull-to-refresh
On Home, Search results, My listings, Rentals (Bookings), Requests (as owner2), Inbox, and the admin lists (an admin account): pull down. **Expect** the app's colours on the spinner, the list goes back to page one, and a light haptic tick when it triggers (real phone only, Touch feedback on).

### A3. Leftover handoff item 9: polling only while focused
1. Open a booking's Zoink It screen. Watch `adb logcat | Select-String "\[api\]"`. **Expect** `GET /bookings/<id>` every ~3 s.
2. Press Home (app to background). **Expect** the polls stop within a few seconds.
3. Bring the app back. **Expect** polling resumes. Same for a chat thread (its message poll).

### A4. Leftover handoff item 18: double taps
Tap each of these twice as fast as you can: **Sign in**, **Send** (chat), **Request** (booking request), **Report** (report a user), **List it** (new listing). **Expect** exactly one request each in the `[api]` lines and the bench API log: one listing, one message, one booking, one report.

### A5. Commission (Task 3)
1. As renter1, List an item: daily price `$20`. **Expect** "What you'd keep" says *On a 3-day rental. Zoink takes 15% (minimum $2) per rental.* Rent $60.00, **Zoink commission (15%) −$9.00, You keep $51.00**.
2. Change the daily price to `$4`. **Expect** rent $12.00, **Zoink commission (minimum $2) −$2.00, You keep $10.00**.
3. Change to `$0.50`. **Expect** rent $1.50, commission −$1.50, keep $0.00 (the under-$2 edge case: see the log).
4. Open an existing bench booking as owner2 (Booking detail). **Expect** its payout card still shows the commission it was booked with (bench rows: $7.50 on $60 = 12.5%). History is not recomputed.

### A6. Deposit rules (Task 6)
1. List an item, item value `$250`. Tap **Hold a deposit**. **Expect** the deposit field fills with **75** (30%), caption "Suggested: 30% of the item value ($75). Rentals with a deposit are up to 3 days."
2. Change the item value to `$100` without touching the deposit. **Expect** it follows: **30**. Type `40` yourself, then change the item value. **Expect** it stays 40.
3. Item value `1200`. **Expect** "At most $1,000." under the field and List it refuses.
4. Deposit `0.50`. **Expect** "At least $1, or leave it empty." Deposit more than the item value. **Expect** "Can't be more than the item value."
5. Tap **No deposit**. **Expect** the deposit field disappears and the listing saves with no deposit.
6. Edit an existing listing with a deposit. **Expect** the toggle starts on **Hold a deposit** with its amount.
7. As renter1, open owner2's listing (bench listings all have a deposit). **Expect** the listing detail shows the **Deposit-backed** badge next to "$50 held". Request: **Expect** "Your dates (up to 3 days)", and picking a 4th day shows *Rentals with a deposit can be at most 3 days. Pick a closer end date.* The deposit card says "You pay up to 24h before pickup. Released 24h after return".
8. Request dates starting **a week from now**; as owner2, accept. As renter1, open the booking. **Expect** the footer button is disabled and reads **"You can pay from {the day before}, 12:00 AM"**; Pay now from the chat's pinned card opens the Pay screen with the same disabled button.
9. Request dates starting **tomorrow** on another listing; accept. **Expect** Pay now is enabled. **(Stripe)** Pay with 4242…: the booking becomes Confirmed.

### A7. No handoff without payment (Task 5)
1. As owner2, open a **CONFIRMED** booking that's paid (the SQL in §0 finds one; owner2's own requests list has some). **Expect** "Start Handoff" as before.
2. Run the "payment failed" UPDATE from §0 on that booking. Pull to refresh Booking detail. **Expect** no Start Handoff button; a yellow notice: **"Payment hasn't gone through. The renter needs to pay before pickup."** Same on the Active rental screen.
3. Open Zoink It for it directly (`zoink://` link or from Bookings). **Expect** the notice, no photo picker, and a disabled **Waiting for payment** button.
4. Put it back to AUTHORIZED. **Expect** Start Handoff returns and the pickup works as before.
5. **(Stripe)** Pay for a booking **without a deposit** (create a no-deposit listing first). **Expect** it confirms. (Before tonight this path tried a $0 deposit hold, which Stripe refuses.)

### A8. Sign-up domains (Task 4)
On Register, choose University of Toronto and type `sam@utoronto.ca`. **Expect** no email error. Type `sam@gmail.com`. **Expect** *Please use your University of Toronto student email (@mail.utoronto.ca or @utoronto.ca).* Pick York with `sam@yorku.ca`, TMU with `sam@ryerson.ca`. **Expect** both accepted (you can stop before submitting).

### A9. Photo uploads after the Cloudinary 2.x upgrade (Task 2)
Needs the real backend with Cloudinary credentials (the bench doesn't upload).
1. Create a listing with 3 photos. **Expect** they show in the form, on the listing and in the grid.
2. Change your profile photo. **Expect** the new avatar shows (cropped square, face-centred).
3. Do a pickup with 2 handoff photos. **Expect** the other phone sees them on Zoink It.
4. Delete one listing photo, then the listing, then (test account) delete the account. **Expect** in the Cloudinary Media Library: the deleted photos and the avatar are gone.

---

## B. iOS simulator session

Run on the iPhone simulator against the bench (`http://localhost:3000`), as in `docs/hardening-log.md`.

### B1. Inverted chat list (Task 1, first check on iOS)
Sign in as renter1, open the conversation with 500 messages.
1. **Opens on the newest message**, sitting just above the composer, with today's date pill above the latest group.
2. Scroll up steadily through several pages (until the first message, "Message 0"). **Expect** older pages appear above with **no jump**: the message under your finger stays put as each page loads, and the spinner appears only at the top while loading.
3. From far up (around Message 5), type and **send** a message. **Expect** the list lands on your new message at the bottom, under a TODAY label.
4. Tap the composer: **keyboard opens**, the newest messages stay visible right above it (nothing hidden behind the keyboard). Dismiss it: the list settles back without a jump.
5. **Incoming while reading history:** scroll up ~100 messages, then send a message to renter1 from owner2 (second simulator/device, or `curl` the API as owner2). **Expect** you are **not** pulled down to the bottom. Note whether what you're reading shifts up by about one message (expected with an inverted list on iOS; tell me if it's more than that).
6. Long-press another person's bubble: the report menu opens. Day separators and bubble tails (last bubble of a run has the tail and time) look the same as before.

### B2. Repeat on iOS: A5 (commission preview), A6 steps 1–2 and 7–8 (deposit toggle, Deposit-backed, 3-day calendar, "You can pay from"), A7 steps 1–3 (payment gate), A8 (domains).

### B3. Leftover items on iOS (quick)
A3 (polling stops in background: watch the bench API log), A4 (double taps), A2 (pull-to-refresh on three lists).

---

## C. Store pages (browser, after deploying `landing/`)

1. `https://zoinkit.app/delete-account.html` loads, matches the Terms page styling, and its links (Privacy, email) work.
2. `terms.html` §10.3 says **15% of the rental price (minimum $2)**; §10.2/§11 describe deposit timing; `privacy.html` §7's listing row is the newer wording.
