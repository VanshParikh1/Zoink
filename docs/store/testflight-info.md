# TestFlight and App Review information (draft)

For App Store Connect › TestFlight › Test Information, and › App Store › App Review Information. Positioning used throughout: **"Zoink lets students safely rent from and lend to each other on campus."** Proof line: **"Pick up on campus from a verified classmate, with a deposit the lender can hold."** No insurance, protection or item-coverage claims.

## Beta App Description

```
Zoink lets students safely rent from and lend to each other on campus. Pick up on campus from a verified classmate, with a deposit the lender can hold.

List an item with photos and a daily price, request dates on someone else's item, pay in the app through Stripe, then meet up and confirm the pickup and the return with photos and a two-person "Zoink It" tap. Lenders can choose to hold a deposit, which is released 24 hours after the return unless they open a dispute.
```

## Feedback Email

`zoinksupport@gmail.com`

## What to Test

```
Thanks for testing Zoink! This build is wired to Stripe TEST mode: use card 4242 4242 4242 4242, any future expiry, any CVC and postal code. No real money moves.

Please try:
1. Sign up with your university email, enter the 6-digit code, accept the terms.
2. List an item: 2+ photos, a daily price, the item's value, and try "Hold a deposit" (it suggests 30% of the item value).
3. On someone else's listing, request dates. Items with a deposit can be booked for up to 3 days.
4. As the lender, accept the request. As the renter, pay. A booking with a deposit can only be paid from the day before it starts; the Pay button tells you when.
5. Pickup: the lender takes 2–3 photos, then both of you tap Zoink It within 5 minutes.
6. Return: the renter takes the photos, both tap Zoink It again. Leave each other a review.
7. Chat, report a listing or a user, block someone, pull to refresh lists, and try airplane mode.

Tell us about anything confusing, any wrong amount (commission is 15% of the rental price, minimum $2, taken from the lender's payout), and any crash, with what you tapped just before.
```

## App Review Information (App Store)

| Field | Value |
| --- | --- |
| Sign-in required | Yes |
| User name | `reviewer@zoink.app` |
| Password | the `REVIEWER_PASSWORD` you seed it with (≥ 12 characters; **not written down here**) |
| Contact | Vansh Parikh · zoinksupport@gmail.com · (phone) |
| Notes | below |

### Reviewer access: recommendation

Sign-up only accepts university email addresses and verifies them with a one-time code, which a reviewer can't receive. **Sign-in itself is email + password** (`POST /auth/login`); the code is only needed once, to verify a new account. So the reviewer needs an account that is already verified, not a way around verification.

Options looked at:

| Option | Verdict |
| --- | --- |
| **Seeded, pre-verified reviewer account** (`backend/src/scripts/seedReviewerAccount.ts`, already built and tested in `seedReviewerAccount.integration.test.ts`) | **Recommended.** A normal account with a normal password; nothing special in the production auth code. It seeds an owner, a second user (to report/block), listings, a completed rental, an accepted booking ready to pay, a pickup ready to Zoink It, and chats. Re-runnable, including after the reviewer deletes the account |
| `EXPO_PUBLIC_DEMO_MODE` | **Not usable for review.** `config/demoModeGate.ts` only turns it on in **dev builds** (`__DEV__`), so a store build can never show it. It also runs on mock data, which isn't what Apple reviews |
| An OTP bypass / magic code for one address | **Don't.** A backdoor in production auth. Not needed, since password sign-in already works |

To set it up (Vansh, against the **production** DB, only right before submitting):

```bash
cd backend
DATABASE_URL='<Railway public Postgres URL>' REVIEWER_PASSWORD='<new strong password>' \
  npx ts-node src/scripts/seedReviewerAccount.ts --confirm-remote
```

Run it in Toronto daytime on the day you submit (and again if review drags on past a couple of days): the accepted "speaker" booking starts **tomorrow**, because a booking with a deposit can only be paid from the day before it starts.

### Notes for the reviewer (paste into "Notes")

```
Zoink is a peer-to-peer rental marketplace for university students in Ontario. Sign-up is limited to university email addresses, so please use the demo account above; it is already verified.

Payments use Stripe in test mode for review: card 4242 4242 4242 4242, any future expiry, any CVC. Rentals are of physical items between students, paid through Stripe (not in-app purchases of digital content).

What to look at with the demo account:
- Home: browse listings. Tap one to see details, the lender and the "Deposit-backed" label.
- Bookings: an accepted booking ("JBL PartyBox") is ready to pay: tap Pay now, use the test card.
- A pickup ("Canon EOS") is ready: open it and tap Zoink It to confirm the handoff (the other party's photos are already there).
- Inbox: conversations with the lender.
- Safety: on a listing or profile, use the menu to Report a listing or a user, or Block a user; in a chat, long-press a message to report it. Reports go to the admin queue for review within 24 hours.
- Account deletion: Profile > Settings > Delete account.

Terms of Service (shown and accepted at sign-up): https://zoinkit.app/terms.html
Privacy Policy: https://zoinkit.app/privacy.html
```

## Apple's earlier review feedback

**No record of a previous App Review rejection exists in the repo** (searched docs, legal, commit messages). The repo does carry an App Review walkthrough test (`appReviewFlow.integration.test.ts`: register → verify → login → list → request → report listing/user/message → block → delete account) and the reviewer seed, which suggests user-generated-content requirements were anticipated. The guidelines most likely to come up, and where they're covered:

| Guideline | What Apple checks | Covered by |
| --- | --- | --- |
| 2.1 App completeness / demo account | A working login and content | Seeded reviewer account (above) |
| 1.2 User-generated content | Terms users agree to, filtering, report, block, responding to reports within 24 h | Terms scroller at sign-up; prohibited-items keyword filter; report listing/user/message; block; admin report queue. ⚠ Commit to the 24-hour response in practice |
| 5.1.1(v) Account deletion | Deletion inside the app | Profile › Settings › Delete account (two confirmations), plus `delete-account.html` |
| 5.1.1 / 5.1.2 Data & privacy | Privacy policy link, purpose strings, nutrition label | `privacy.html`; camera/photos/location purpose strings in `app.config.js`; label answers in `play-data-safety.md` §"Apple" |
| 3.1.1 / 3.1.3(e) Payments | IAP not required for physical goods/services | Rentals of physical items via Stripe |
| 4.0 / 4.2 Design, minimum functionality | Native, complete flows | Full booking/handoff flow; no web wrappers |
| 1.4.x / 5.3 | Not gambling, not financial services | N/A |

If you do have Apple's earlier message (in App Store Connect › Resolution Center), check each point against this table and add a row for anything it names.

## App Store metadata (if you need it now)

No App Store metadata draft existed in the repo. The Play copy in `play-listing.md` works for App Store too:
- Subtitle (≤30): `Rent from verified classmates` (29)
- Promotional text (≤170): `Borrow what you need for a few days from a verified classmate on campus, or lend what you have. Pick up in person, confirm with Zoink It.`
- Description: the Play full description.
- Keywords (≤100): `rent,rental,borrow,lend,student,campus,university,marketplace,camera,speaker,tools,share`
- Category: Shopping (secondary: Lifestyle). Age rating: answer "Unrestricted web access: No", "User-generated content: Yes". Apple will likely land on 12+ or 17+ for UGC/messaging; the app itself is for 18+ via the Terms.
- Support URL: https://zoinkit.app · Marketing URL: https://zoinkit.app · Privacy URL: https://zoinkit.app/privacy.html
