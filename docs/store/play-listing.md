# Google Play store listing (draft)

Paste-ready copy for Play Console › Grow › Store presence › Main store listing, plus the app content answers. Positioning: **"Zoink lets students safely rent from and lend to each other on campus."** Proof line: **"Pick up on campus from a verified classmate, with a deposit the lender can hold."** No insurance or protection claims, no "no competitors" claims, no item coverage promises.

## App details

| Field | Value |
| --- | --- |
| App name (≤30) | `Zoink: Student Rentals` (22 chars). Or plain `Zoink` |
| Default language | English (Canada) – en-CA |
| App or game | App |
| Free or paid | Free |
| Category | **Shopping** (closest fit for a peer-to-peer rental marketplace; *Lifestyle* is the alternative) |
| Tags (pick up to 5 in Console) | Marketplace, Rentals, Students |
| Contact email | zoinksupport@gmail.com |
| Website | https://zoinkit.app |
| Phone | leave blank (optional) |
| Privacy policy URL | https://zoinkit.app/privacy.html |
| Account deletion URL (Data safety) | https://zoinkit.app/delete-account.html |

> Check the domain: the landing files are `landing/index.html`, `terms.html`, `privacy.html` and now `delete-account.html`. The URLs above assume they're served at the root of zoinkit.app. Open each one in a browser before submitting.

## Short description (≤80 characters)

```
Rent from and lend to verified classmates on campus, with optional deposits.
```

(76 characters.) Shorter alternative: `Rent from and lend to verified students on campus.` (50)

## Full description (≤4000 characters)

```
Zoink lets students safely rent from and lend to each other on campus.

Need a camera for a class project, a speaker for a club event, or a drill for move-in weekend? Borrow it from a classmate for a few days instead of buying it. Got gear that sits in your closet most of the semester? List it and earn from it.

Pick up on campus from a verified classmate, with a deposit the lender can hold.

HOW IT WORKS
• Sign up with your university email. Every account is checked with a one-time code sent to a student address, so you know who you're renting from.
• Browse listings near you, or list your own item in a couple of minutes: photos, a daily price, and the item's value.
• Request the dates you need (up to 7 days, or up to 3 days for items with a deposit). The lender accepts or declines.
• Pay in the app through Stripe. You pay the rental price plus HST. There's no renter service fee.
• Meet up and "Zoink It": the lender photographs the item at pickup, the renter photographs it at return, and both of you tap Zoink It within the same five minutes to confirm each handoff.

DEPOSITS, IF THE LENDER WANTS ONE
Lenders can choose to hold a security deposit (we suggest 30% of the item's value). It's a hold on the renter's card, not a charge, and it's released 24 hours after the item comes back unless the lender opens a dispute in that window. The pickup can't go ahead until the renter's payment, including any deposit hold, has gone through.

FOR LENDERS
• You set the price, whether to take a deposit and how much.
• Zoink's commission is 15% of the rental price (minimum $2), taken from your payout. Nothing is ever taken from deposits.
• Payouts go to your Stripe account 24 hours after the item is returned.

BUILT FOR CAMPUS
• In-app messaging, so you never have to hand out your number.
• Ratings and reviews for both renters and lenders after every rental.
• Report or block anyone, any time.
• Your exact pickup address is only shared with a renter once they've paid.

Zoink is for students aged 18 and over at supported Ontario universities. Zoink is a marketplace: lenders and renters rent directly to each other. Zoink does not provide insurance, and a deposit only covers what the lender chose to hold. See our Terms of Service for the full details.

Questions? zoinksupport@gmail.com
```

Character count: about 2,300 (well under 4,000). Re-count after edits: `wc -m`.

## Graphics (Vansh)

- App icon 512×512 PNG (from the locked icon set, not regenerated).
- Feature graphic 1024×500.
- Phone screenshots: 2–8, 16:9 or 9:16, min 320 px. Suggested: Home grid, listing detail with "Deposit-backed", request dates, Pay screen, Zoink It handoff, chat.

## Target audience and content

| Question | Answer | Reasoning |
| --- | --- | --- |
| Target age groups | **18 and over** only | Terms §3 and registration require an 18+ attestation; students only |
| Appeals to children? | No | University marketplace; no child-directed content |
| Ads | **No, the app contains no ads** | No ad SDKs |
| App access | **All or some functionality is restricted** → provide the reviewer login | Sign-up needs a university email + OTP. Use the seeded reviewer account (see `testflight-info.md`, "Reviewer access") |
| Government app | No | |
| Financial features | **None of the listed regulated financial features** (it isn't a bank, loan or crypto app). If Console asks about payments: in-app payments for physical goods/services through Stripe | Rental payments and deposit holds via Stripe Connect |
| Health | No | |
| News app | No | |

## IARC content rating questionnaire

Category: **Reference, News, or Educational**? No. Choose **"All Other App Types"** (a marketplace isn't a game, social network or communication app as its main purpose, though it has messaging).

| Question | Answer | Reasoning |
| --- | --- | --- |
| Violence (any kind) | No | No violent content |
| Sexuality / nudity | No | Prohibited by Terms §6 and the report flow |
| Language (profanity) | No | No profanity in app content; user text is user-generated (covered below) |
| Controlled substances (drugs, alcohol, tobacco) | No | Listing alcohol, tobacco, cannabis or drugs is prohibited (Terms §6), and the listing keyword filter blocks it |
| Gambling / simulated gambling | No | |
| Does the app let users **interact or exchange content** (chat, UGC)? | **Yes** | In-app messages between renter and lender; listings, photos, reviews |
| Is that content moderated / can users report and block? | Yes: report a listing, user or message; block a user | `reportService`, `blockService`, admin review |
| Does the app **share the user's location** with other users? | **Yes (approximate)** | A listing's pickup point is shown to other users offset 200–500 m from the real one; the exact address only goes to a renter once they've paid |
| Does the app let users **purchase digital goods**? | No | Rentals are physical items, paid through Stripe |
| Does the app contain **unrestricted internet access** (browser)? | No | |
| Does the app share personal info with third parties? | Yes, only with service providers (see Data safety) | |
| Miscellaneous: "Users can buy physical goods" | Yes | Physical item rentals |

Expected result: a low age rating (likely Everyone / PEGI 3 or Teen / PEGI 12 because of user interaction and location sharing). The Play audience setting (18+) is separate from the IARC rating and is what limits who it's aimed at.
