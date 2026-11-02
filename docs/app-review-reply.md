# App Review reply (Guideline 2.1)

Draft for the Resolution Center reply on [submission ID / date]. Every statement below was checked against the code at `15c0fc8` (backend live on Railway, app = iOS build 6 + the production EAS update). Fill in the [bracketed] parts before sending.

---

Hello,

Thank you for reviewing Zoink. We've attached a screen recording from a physical iPhone showing [account registration, the reviewer flows below, and account deletion].

**What Zoink is.** Zoink is a peer-to-peer rental marketplace where university students in Ontario lend physical items (cameras, speakers, tools) to each other. Sign-up is limited to university email addresses and requires a 6-digit code sent to that address, so we've prepared a verified demo account (below).

**Demo account**

- Email: [REVIEWER_EMAIL]
- Password: [REVIEWER_PASSWORD]

The app opens on the sign-in screen: enter the email and password and tap Sign in. No verification code is asked for at sign-in; the code is only needed once, when a new account verifies its email.

**Payments.** Payments run through Stripe in test mode for review. Use card 4242 4242 4242 4242, any future expiry date and any CVC. Rentals are of physical items handed over in person, so they are paid through Stripe, not in-app purchase (Guideline 3.1.3(e)).

**What to try with the demo account**

1. **Home:** browse listings and tap one to see its details and the lender.
2. **Pay:** on Home, tap Bookings, open "JBL PartyBox Bluetooth Speaker" (accepted, waiting for payment) and tap Pay now. The Pay screen's button reads "Pay $… + hold $…" (rent plus a refundable deposit hold). Tap it and pay with the test card in the Stripe payment sheet.
3. **Zoink It (handoff):** in Bookings, open "Canon EOS DSLR Camera Kit". The lender has already added their pickup photos. Tap Zoink It to confirm the pickup.
4. **Inbox:** conversations with the lenders.

**Safety (Guideline 1.2)**

- **Report a listing:** open any listing and tap "Report this listing" below the description.
- **Report or block a user:** on a listing, tap the lender's name to open their profile, then "Report this user" or "Block this user". In a chat, tap the ⋮ button (top right) for "Report [name]" / "Block [name]".
- **Report a message:** in a chat, long-press a message, then "Report message". The chat with Sam Patel is there for this.
- Reports ask for a reason (Spam, Scam, Inappropriate content, Harassment, Other) and optional details, and go to our moderation queue. We review reports within 24 hours, as our support page says (https://zoinkit.app/support.html), and remove content or accounts that break our Terms.
- Blocking hides each person's listings, profile and conversations from the other and stops messages and bookings between them. Blocked users can be unblocked in Profile › Settings › Blocked users.
- Users accept the Terms of Service (https://zoinkit.app/terms.html) before they can sign up. Listing text is also checked against a list of prohibited items.

**Account deletion (Guideline 5.1.1(v))**

Profile › Settings › Delete account, then confirm twice. The profile is anonymized, the user is signed out, their listings are taken down and bookings that haven't been picked up yet are cancelled (any payment hold is released). While an item is out on loan, or a dispute is open, the app asks the user to finish that first. [Recording order: if you show Zoink It before Delete account on the same account, the camera rental is then in progress and deletion will be refused. See note below.] Instructions are also at https://zoinkit.app/delete-account.html.

**Third-party services.** Zoink uses:

- Stripe: card payments, deposit holds and payouts to lenders (Stripe Connect)
- Amazon SES: verification-code emails
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

- **Delete account after Zoink It is refused.** The seeded camera booking is PICKUP_PENDING. Once the reviewer taps Zoink It it becomes ACTIVE, and `userService.deleteMe` then refuses with "Finish your current rentals and any open disputes before deleting your account." Apple tests deletion on the same account. Either record deletion on your throwaway account (as planned) and keep the sentence above, or decide whether the reviewer account should be able to delete mid-rental.
- **24-hour moderation is a promise you have to keep by hand.** Filing a report notifies nobody; it lands in the in-app admin Report queue only. Check it daily while in review.
- **Terms §15 disagrees with the code.** `legal/terms.md` says closing your account "does not cancel bookings that are already confirmed". Since `eb8e707` deletion cancels every booking not yet picked up and refuses deletion mid-rental. The reply above describes the code.
- **Bookings is not a tab.** The tabs are Home, Search, Inbox and Profile. Bookings is a quick action on Home.
- **Removed from the services list:** Unsplash and DiceBear (seed/demo images only, never called by the app), Vercel (only hosts the website). Add Vercel back if you want the website host listed.
- **Re-seed before submitting.** The JBL booking can only be paid from 00:00 Toronto time the day before it starts, and it starts the day after you seed.
