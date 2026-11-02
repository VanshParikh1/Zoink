# Google Play Data safety form (draft answers)

Derived from what the code actually collects (`backend/prisma/schema.prisma`, the services, `frontend/app.config.js` permissions, the Sentry setup in `frontend/App.tsx`) and from `legal/privacy.md` §2, §5, §7, §8. Items marked **⚠ check** are judgement calls or places where the code and the policy don't quite match. Decide those before submitting.

Play's definitions, as they apply here:
- **Collected** = sent off the device (to Zoink's API or to an SDK/service in the app).
- **Shared** = sent to a third party. Sending data to a **service provider** that processes it on Zoink's behalf (Stripe, Cloudinary, AWS SES, Expo push, Sentry, Railway) is **not** "sharing". **Showing a user's data to another user is sharing.** Play counts user-to-user transfers you initiate (e.g. showing a renter's name and photo to the lender) as sharing, so name, photos, messages and approximate location are marked shared below.

## Overview section

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes**: the API is HTTPS only; release builds block cleartext HTTP (`usesCleartextTraffic` is only on in debug); Stripe, Cloudinary, Expo and Sentry are all HTTPS |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in-app (Profile › Settings › Delete account) and by email. URL: https://zoinkit.app/delete-account.html |
| Independent security review (MASA)? | No |
| Families policy | Not applicable (18+) |

## Data types

For each: Collected? Shared? Processed ephemerally? Required or optional? Purposes.

### Location

| Type | Collected | Shared | Required? | Purposes | Notes |
| --- | --- | --- | --- | --- | --- |
| Approximate location | Yes | **Yes** | Optional | App functionality | Other users see a listing's pickup point offset 200–500 m (`listingLocationPrivacy`). Device location is only used while the app is in use, with permission |
| Precise location | Yes | **Yes** (only with the renter of a paid booking) | Optional | App functionality | `ACCESS_FINE_LOCATION`, used to set a listing's pickup point and sort nearby listings. The exact pickup address reaches the renter once the booking is paid. Not collected in the background |

### Personal info

| Type | Collected | Shared | Required? | Purposes | Notes |
| --- | --- | --- | --- | --- | --- |
| Name | Yes | **Yes** (other users see first/last name) | Required | App functionality, Account management | |
| Email address | Yes | No | Required | App functionality, Account management, Fraud prevention/security | Student email for verification; sent to AWS SES (service provider) for OTP and notices |
| User IDs | Yes | No | Required | App functionality, Account management, Fraud prevention | Internal account id; attached to Sentry error reports |
| Phone number | Yes | No | Required | Account management, Fraud prevention/security | Collected at sign-up. ⚠ check: not shown to other users in the code paths I read (public profile omits phone). If you ever show it to a counterparty, mark it shared |
| Address | Yes | **Yes** (pickup address to the renter of a paid booking) | Optional | App functionality | Listing pickup address |
| Race, political, religion, sexual orientation, other info | No | | | | |

### Financial info

| Type | Collected | Shared | Required? | Purposes | Notes |
| --- | --- | --- | --- | --- | --- |
| User payment info | Yes | No | Required (to rent) | App functionality (payments) | Card details are entered in Stripe's PaymentSheet **inside the app**, so Play counts them as collected by the app even though Zoink's servers never see the card number. Stripe is a service provider → not shared. Lenders' banking details go to Stripe Connect onboarding (Stripe-hosted) |
| Purchase history | Yes | **Yes** ⚠ check | Required | App functionality, Account management | Bookings with prices. The other party sees the booking amounts. Arguably "app functionality between the two parties to a transaction"; marking it shared is the conservative choice |
| Credit score, other financial info | No | | | | Payout amounts are booking data (above) |

### Messages

| Type | Collected | Shared | Required? | Purposes |
| --- | --- | --- | --- | --- |
| In-app messages | Yes | **Yes** (to the other person in the conversation) | Optional (needed to coordinate) | App functionality; also reviewed for reports/disputes (Fraud prevention, security, compliance) |
| Emails, SMS/MMS | No | | | |

### Photos and videos

| Type | Collected | Shared | Required? | Purposes | Notes |
| --- | --- | --- | --- | --- | --- |
| Photos | Yes | **Yes** | Listing photos and handoff photos are required for those features; profile photo optional | App functionality | Listing photos are public in the app; handoff photos go to the other party (and admins in a dispute); profile photo shown to other users. Hosted on Cloudinary (service provider) |
| Videos | No | | | | |

### Audio, Health & fitness, Contacts, Calendar, Files & docs, Web browsing

All **No**. (`RECORD_AUDIO` is in `blockedPermissions`; microphone permission is off in the image-picker plugin.)

### App activity

| Type | Collected | Shared | Purposes | Notes |
| --- | --- | --- | --- | --- |
| App interactions | Yes ⚠ check | No | App functionality | Server-side booking events, review and report records. privacy.md §2.2 says "which listings you view and book". I found no view tracking/analytics SDK in the code. If there is none, you can answer "No" for interactions and narrow the policy wording |
| In-app search history | No | | | Search terms are sent to the API to run the search but not stored (⚠ check the API logs: if request URLs with `q=` are logged and kept, that's "collected") |
| Installed apps, other UGC, other actions | **Other user-generated content: Yes, shared** | Yes | App functionality | Listing titles/descriptions, reviews, reports |

### App info and performance

| Type | Collected | Shared | Purposes | Notes |
| --- | --- | --- | --- | --- |
| Crash logs | Yes | No | **Analytics** (Play's own examples file crash monitoring here) and App functionality | Sentry (service provider), `sendDefaultPii: false`, scrubbed `beforeSend` |
| Diagnostics | Yes | No | Same as crash logs | Sentry performance/diagnostics, device model, OS version |
| Other app performance data | No | | | |

### Device or other IDs

| Type | Collected | Shared | Purposes | Notes |
| --- | --- | --- | --- | --- |
| Device or other IDs | Yes | No | App functionality (push notifications) | Expo push token; Sentry may attach a device/installation id ⚠ check in a Sentry event |

## Purposes legend (for the Console checkboxes)

App functionality · Analytics · Developer communications · Advertising or marketing (**never**) · Fraud prevention, security, and compliance · Personalization (**no**) · Account management.

## Things to fix or decide before submitting

1. **⚠ privacy.md vs. deletion code.** privacy.md §7 says accounts are soft-deleted then **purged within 30 days**, and §8 says an **open booking or dispute must be resolved before deletion**. The code (`userService.deleteMe`) anonymises immediately (name, phone, bio, photo, email, password, push token), hides the user's listings (`isAvailable = false`) but **doesn't delete them or their photos**, doesn't block deletion while a booking/dispute is open, and there's **no 30-day purge job**. Either add the open-booking check and a purge of the deleted user's own listings/photos, or reword §7/§8. The delete-account page describes the current behaviour.
2. Usage tracking wording (App activity, above).
3. Whether to mark purchase history as shared (conservative: yes).
4. Apple's privacy "nutrition label" must match these answers. Data linked to the user: name, email, phone, address, precise/approx location, photos, messages, purchase history, user ID, payment info (via Stripe). Not used for tracking. Crash data and diagnostics: linked (user id) unless you drop the id from Sentry.
