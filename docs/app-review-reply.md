# App Review reply (Guideline 2.1)

Draft for the Resolution Center reply on [submission ID / date]. Every statement below was checked against the code at `0d7372d` (backend live on Railway, app = iOS build 6 + the production EAS update). Fill in the [bracketed] parts before sending.

---

Hello,

Thank you for reviewing Zoink. We've attached a screen recording from a physical iPhone showing [account registration, the reviewer flows below, and account deletion].

**What Zoink is.** Zoink is a peer-to-peer rental marketplace where university students in Ontario lend physical items (cameras, speakers, tools) to each other. Sign-up is limited to university email addresses and requires a 6-digit code sent to that address, so we've prepared two verified demo accounts (below).

**Demo accounts**

Main account, for everything except deleting an account:

- Email: [REVIEWER_EMAIL]
- Password: [REVIEWER_PASSWORD]

Second account, for trying Delete account:

- Email: [DELETION_REVIEWER_EMAIL]
- Password: [DELETION_REVIEWER_PASSWORD]

The app opens on the sign-in screen: enter the email and password and tap Sign in. No verification code is asked for at sign-in; the code is only needed once, when a new account verifies its email.

**Payments.** Payments run through Stripe in test mode for review. Use card 4242 4242 4242 4242, any future expiry date and any CVC. Rentals are of physical items handed over in person, so they are paid through Stripe, not in-app purchase (Guideline 3.1.3(e)).

**What to try with the main account**

1. **Home:** browse listings and tap one to see its details and the lender.
2. **Pay:** on Home, tap Bookings, open "JBL PartyBox Bluetooth Speaker" (accepted, waiting for payment) and tap Pay now. The Pay screen's button reads "Pay $… + hold $…" (rent plus a refundable deposit hold). Tap it and pay with the test card in the Stripe payment sheet.
3. **Zoink It (handoff):** in Bookings, open "Canon EOS DSLR Camera Kit". The lender has already added their pickup photos. Tap Zoink It to confirm your side of the pickup. In person both people tap within five minutes of each other; the lender isn't there for this demo, so the app then waits for their tap.
4. **Inbox:** conversations with the lenders.

**Safety (Guideline 1.2)**

- **Report a listing:** open any listing and tap "Report this listing" below the description.
- **Report or block a user:** on a listing, tap the lender's name to open their profile, then "Report this user" or "Block this user". In a chat, tap the ⋮ button (top right) for "Report [name]" / "Block [name]".
- **Report a message:** in a chat, long-press a message, then "Report message". The chat with Sam Patel is there for this.
- Reports ask for a reason (Spam, Scam, Inappropriate content, Harassment, Other) and optional details, and go to our moderation queue; each new report also emails our support team. We review reports within 24 hours, as our support page says (https://zoinkit.app/support.html), and remove content or accounts that break our Terms.
- Blocking hides each person's listings, profile and conversations from the other and stops messages and bookings between them. Blocked users can be unblocked in Profile › Settings › Blocked users.
- Users accept the Terms of Service (https://zoinkit.app/terms.html) before they can sign up. Listing text is also checked against a list of prohibited items.

**Account deletion (Guideline 5.1.1(v))**

Please use the second demo account for this. Sign in with it, then Profile › Settings › Delete account, and confirm twice. The profile is anonymized, the user is signed out, their listings are taken down and bookings that haven't been picked up yet are cancelled (any payment hold is released).

Deletion is refused by design while an item is with someone (between pickup and return) or while a dispute is open, because the other person still depends on the account; the app then asks the user to finish those first. Our Terms (section 15) say the same. The second account has no rentals or disputes, so its deletion goes through. Instructions are also at https://zoinkit.app/delete-account.html.

**Third-party services.** Zoink uses:

- Stripe: card payments, deposit holds and payouts to lenders (Stripe Connect)
- Amazon SES: verification-code emails, and report alerts to our support inbox
- Cloudinary: listing, profile and handoff photo storage
- Sentry: crash and error reporting
- Expo push notification service (via Apple Push Notification service): notifications
- Expo EAS Update: app updates over the air
- MapTiler (OpenStreetMap data): map tiles for a listing's general area
- Railway: hosting for our API and database

Zoink does not use third-party advertising or tracking SDKs.

[Anything else Apple's 2.1 message asked for, answered point by point.]

Thank you,
[Name]
Zoink · zoinksupport@gmail.com

---

## Notes for you (not part of the reply)

- **Both accounts come from the seed.** `seedReviewerAccount.ts` with `REVIEWER_PASSWORD` and `DELETION_REVIEWER_PASSWORD`; the deletion account is `reviewer-delete@zoink.app` by default. Re-running the seed restores the Pay and Zoink It bookings and recreates a deleted account.
- **The 24-hour promise still needs a person.** Each report now emails zoinksupport@gmail.com, but someone has to read it and act in the admin Review reports screen.
- **Bookings is not a tab.** The tabs are Home, Search, Inbox and Profile. Bookings is a quick action on Home.
- **Removed from the services list:** Unsplash and DiceBear (seed/demo images only, never called by the app), Vercel (only hosts the website). Add Vercel back if you want the website host listed.
- **Re-seed before submitting.** The JBL booking can only be paid from 00:00 Toronto time the day before it starts, and it starts the day after you seed.
