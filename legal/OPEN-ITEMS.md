# Zoink legal docs — open items

> **Status update (2026-09-07):** Most of section B and part of C are now implemented in code —
> see the ✅ markers inline below. Still outstanding: a Prisma migration for the new
> `User.cancellationCount` column (run `npx prisma migrate dev` and `npx prisma generate` — not run
> yet, and this session had no shell access to your machine to run it for you); a typecheck/test
> pass (`npm run typecheck` / `npm test` in `backend/`) — also not run this session, so review the
> diffs before deploying; B6's prohibited-items check is a blunt keyword heuristic, not real
> moderation; and the retention sweep's Listing/photo-removal leg is a known gap — deleteListing
> already hard-deletes immediately, which satisfies "gone within 90 days" trivially but doesn't match
> the soft-delete grace period the privacy policy's wording implies. Section A blanks, section D
> (structural risks), and the lawyer review are unchanged — those aren't code.

Companion to `terms.md` and `privacy.md`. Updated after the 2026-09-04 scope decisions:

- **No insurance / protection product at launch.** Security deposits only.
- **No government ID verification at launch.** Student email verification only. ID verification comes later, when volume justifies it.
- **Terms acceptance at registration**, via a scroller the user must get through before they can use the app.
- **Free cancellation any time before the rental starts**, for either party.
- **24-hour dispute window** kept as-is.
- **Retention periods** set to the recommended defaults.

Both documents now reflect all three. What's left is below.

---

## A. Blanks to fill (search for `{{` in both files)

| Placeholder | Notes |
| --- | --- |
| `{{EFFECTIVE_DATE}}` | Date you actually publish |
| `{{FULL LEGAL NAME}}` | Your legal name, since Zoink isn't incorporated. If you register a business name in Ontario you can write "Zoink, a business name registered by ___" |
| `2 Goderich Drive, {{CITY}}, Ontario {{POSTAL CODE}}` | Your home address, per your decision. See D1 for what that means in practice. |
| `zoinksupport@gmail.com` / `zoinksupport@gmail.com` | Can be the same inbox |
| `{{HOSTING PROVIDER}}` | Whoever runs the Postgres DB and the API (Railway, Neon, Render, Fly…), plus the region |
| `{{IF THE LANDING SITE USES ANALYTICS…}}` | privacy.md §13 — depends what's in `landing/` |
| `{{FRENCH VERSION…}}` | Delete the note for an Ontario-only launch |

## B. Code changes the docs now depend on

The documents make promises. These are the code changes that keep them true.

### B1. ✅ Kill the insurance path before launch — highest priority (done 2026-09-07)

`terms.md` §12 now says, in bold, that Zoink provides no insurance and no protection product. The code disagrees:

- `Booking.insuranceOptIn` and `Booking.insuranceFee` exist in the schema
- `paymentService.calculateInsuranceFee()` charges 3% of item value, `$1` min / `$50` max, driven by `INSURANCE_RATE` / `MIN_INSURANCE_FEE` / `MAX_INSURANCE_FEE` env vars
- `getRentalAuthorizationAmount()` folds `insuranceFee` into the amount authorized on the renter's card

If any code path can set `insuranceOptIn = true`, a renter gets charged a fee your Terms say doesn't exist. Worse, in Ontario the word "insurance" is regulated: undertaking to indemnify someone against loss for a fee is transacting insurance under the **Insurance Act**, and doing it unlicensed is an offence.

Before launch:

1. Confirm nothing in the frontend can set `insuranceOptIn`. Server-side, reject the field outright in `booking.schema.ts` rather than relying on the client.
2. Assert `insuranceFee === 0` on every booking created in production.
3. **Rename the columns** when you next migrate. If you revive this later, call it `damageProtectionFee` / `protectionOptIn` and structure it as a contractual waiver — Zoink waiving its own claim against the renter — not as indemnity. That distinction is what keeps it out of the Insurance Act, and it needs a lawyer's wording.

Leaving `insuranceFee` in a live schema is the kind of detail that reads badly in a regulator's letter even if it's never used.

### B2. ✅ Make sure the ID upload path isn't reachable (confirmed done — no upload route exists in `users.ts`/`userController.ts`)

`privacy.md` §2.4 now states plainly that Zoink does not collect government ID or selfies. But `User.idPhotoUrl`, `User.selfieUrl`, and `User.idSubmittedAt` exist, and there's a `requiredVerified` middleware.

Confirm that no route accepts an ID or selfie upload in the build you ship. A privacy policy saying "we don't collect this" alongside a live endpoint that accepts it is exactly the mismatch a complaint gets built on.

Repoint `VerificationStatus` at the student-email flow: `VERIFIED` should mean "confirmed a student email," which is what `terms.md` §4 now promises the badge means.

**When you do add ID verification later**, both documents need updating and users need 30 days' notice under `terms.md` §19 before it applies to them. Use **Stripe Identity** — the images never touch your infrastructure and you store only a pass/fail. That single choice removes most of your privacy exposure and makes a breach far less serious.

### B3. ✅ Student email — resolved by a different route than this doc assumed

Registration was refactored to a per-university `University` enum (`packages/shared/src/universities.ts`)
instead of a flat `ALLOWED_EMAIL_DOMAINS` env var — each university maps to one fixed domain, checked
server-side in `auth.schema.ts`'s `RegisterSchema`. This is safer than the env-var approach below (no
way to silently misconfigure it to an empty or overly-permissive value), so the two gaps this section
originally flagged no longer apply the same way. 18+ attestation is covered by B4.

<details><summary>Original text, kept for history</summary>

### B3 (original). Student email — mostly built, one gap

Correction to an earlier version of this list: the domain allowlist **already exists**. `authService.isEmailDomainAllowed()` checks the email domain against `ALLOWED_EMAIL_DOMAINS`, `registerUser()` rejects anything else, and the OTP flow through `VerificationToken` confirms the address. `terms.md` §4 is accurate as written.

Two things left:

- **Populate `ALLOWED_EMAIL_DOMAINS` in production.** The check reads an env var defaulting to an empty string, so an unset value rejects every domain — or, if someone "fixes" that by loosening the check, accepts every domain. Set it explicitly (`utoronto.ca,mail.utoronto.ca,torontomu.ca,yorku.ca,uwaterloo.ca,queensu.ca,…`) and add a startup assertion that it's non-empty in production.
- **18+ attestation.** No date of birth anywhere in the schema and nothing asks. Covered by B4.

</details>

### B4. ✅ Record terms acceptance — done (2026-09-04/05)

Fully implemented, matching the spec in `legal/ACCEPTANCE-PROMPT.md`: `config/legal.ts` holds the
versioned constants, the 5 `User` columns exist and are stamped in `registerUser()`/`acceptTerms()`,
`RegisterSchema` requires `ageAttested: true`, `TermsAcceptanceScreen.tsx` implements the scroll-gate +
two checkboxes, and `navigation/index.tsx` has the re-acceptance gate as its own branch. Nothing left
here.

<details><summary>Original spec pointer, kept for history</summary>

### B4 (original). Record terms acceptance — spec written

Full implementation prompt in **`legal/ACCEPTANCE-PROMPT.md`**, ready to paste into Claude Code. What it specifies:

- Documents bundled into the app from `packages/shared/legal/`, not fetched at runtime, so the accepted text is pinned to the build
- Acceptance happens **before** `register()` fires — no personal information stored before the user agrees to the policy governing it
- Scroll-to-bottom enforcement, then two separate unchecked boxes (terms, and 18+)
- Five new `User` columns: `termsAcceptedAt`, `termsVersion`, `privacyAcceptedAt`, `privacyVersion`, `ageAttestedAt`
- Server rejects a stale version rather than trusting the client
- Re-acceptance gate as a fourth branch in `navigation/index.tsx`, next to the existing verification gate — that gate is what makes the 30-day notice promise in §19 actually deliverable

Version both documents from day one. Without the version string you know someone accepted *something*, but not what, and that's most of the value gone.

</details>

### B5. ✅ `RECORD_AUDIO` in `app.json` — removed (2026-09-07)

`frontend/app.json` declares `android.permission.RECORD_AUDIO`. Nothing in the app appears to record audio — almost certainly a leftover from `expo-camera`. Neither document mentions audio, deliberately. Remove it; Google Play's data-safety review will ask, and a permission you can't justify is a rejection risk.

### B6. ✅ Prohibited items — keyword flag added (2026-09-07)

`listingService.ts` now rejects listing creation/update if the title, description, or category matches
a keyword pattern for firearms, alcohol/tobacco/cannabis, prescription/medical devices, motor vehicles,
animals, counterfeit/stolen goods, surveillance items, or car seats/life-safety equipment. This is a
blunt heuristic (false positives and evasive-spelling false negatives are both possible) — the `Report`
flow and your takedown rights remain the real backstop, this just catches the obvious case for free.

### B7. Cancellation policy — mostly built already, two gaps closed (2026-09-07)

The refund/state-machine plumbing (free full refund, `BookingEvent` audit trail, `handleCancellationPayment`)
was already built and tested (`bookingCancellation.integration.test.ts`). Two things this doc flagged were
actually still open and are now fixed:
- ✅ **Blocked once the rental start time has passed** — `transitionBookingStatus` now rejects a CANCELLED
  transition once `new Date() >= booking.startDate`, regardless of status, matching terms.md §9's "no
  longer cancellable" line (the state machine alone allowed it from CONFIRMED/PICKUP_PENDING either way).
- ✅ **Per-user cancellation count** — added `User.cancellationCount` (needs a migration — see the status
  note at the top of this file) and it's incremented on the actor whenever a booking they're party to gets
  cancelled, so the suspension right in §15 has something to act on.

Original text, kept for history:

`terms.md` §9 is now concrete: **either party may cancel free at any time before the rental start time**, with a full refund including the deposit release. After the start time, no cancellation.

To build:

- A cancel action available to both parties while `status` is `ACCEPTED` / `CONFIRMED` and `startDate` is in the future
- Full refund of `totalPrice + hstAmount`, plus release of the deposit authorization
- Block the action once `startDate` has passed
- A `BookingEvent` recording who cancelled and when

**Worth knowing what you picked.** Free cancellation until the last minute is the most owner-hostile of the options. An owner who turns down two other requests and gets cancelled on an hour before pickup has lost the weekend and gets nothing. That's fine at pilot scale where you want zero friction and few users — but watch for it. The usual fix, once you see it happening, is either a short lock-in window (no free cancellation inside 24h of start) or a cancellation rate on the profile that other users can see. Section 19 gives you the mechanism to change it later with 30 days' notice.

Also, since you can't charge a cancellation fee, the suspension right in §15 is your only lever against someone who serially cancels. Track cancellation counts per user from day one so you can actually use it.

## C. Numbers to decide

### Windows — decided, now written into the Terms

| Window | Where | Value |
| --- | --- | --- |
| Dispute filing window after completion | `disputeService.DISPUTE_WINDOW_HOURS` | 24 hours |
| Deposit auto-release | `DEPOSIT_HOLD_HOURS` env | 24 hours |
| Payout release after completion | `PAYOUT_HOLD_HOURS` env | 24 hours |
| Handoff tap window | `ZOINK_TAP_WINDOW_MS` env | 5 minutes |

✅ **Done (2026-09-07).** All three moved to `backend/src/config/bookingWindows.ts` as fixed constants
(`DEPOSIT_HOLD_HOURS`, `PAYOUT_HOLD_HOURS`, `ZOINK_TAP_WINDOW_MS`), same pattern as `config/legal.ts`.
`cleanupJob.ts` imports them instead of reading `process.env`. `DISPUTE_WINDOW_HOURS` in
`disputeService.ts` was already a hardcoded constant, not an env var — nothing to do there.

<details><summary>Original problem statement, kept for history</summary>

These were stated as fixed numbers in `terms.md` §10.4 and §11, which created one problem: **three of them were environment variables.** A production misconfiguration, or a future you tuning `DEPOSIT_HOLD_HOURS`, could silently change a term your users contractually agreed to.

</details>

One consequence of keeping 24 hours worth designing around: an owner who doesn't inspect the item the day it comes back has no recourse but Small Claims, because there's no insurance behind it. Make the "your deposit claim window closes in X hours" notification loud, and send it at return, not at completion.

### Retention periods — written into privacy.md §7

| Data | Value | Why |
| --- | --- | --- |
| Account after deletion | 30 days soft-delete, then purge | Enough to reverse an accidental deletion, short enough to be defensible |
| Listings and photos after removal | 90 days | Covers a dispute filed just after a listing comes down |
| Handoff / condition photos | 12 months, or dispute resolution + 90 days | These are your evidence in a damage claim; a year covers the small-claims limitation runway |
| Messages | 24 months | Long enough to investigate a pattern of behaviour, short enough not to be a liability |
| Disputes and reports | 3 years after resolution | Pattern detection across repeat bad actors, and legal defence |
| Error and diagnostic logs | 90 days | Standard; long enough to debug a slow-burn bug |
| Transactions and tax records | 7 years | Fixed by CRA — not a choice |

✅ **Mostly done (2026-09-07).** `cleanupJob.ts` now has `purgeOldMessages()` (24mo), `purgeOldDisputesAndReports()` (3yr, resolved/reviewed rows only), and `purgeOldHandoffPhotos()` (clears photo URLs at 12mo, or resolution+90d if disputed — the `Booking` row itself is kept for the 7-year tax record). Wired into a new daily 3am cron in `index.ts`, separate from the 15-minute payment cron. Two gaps remain, deliberately not touched by a DB sweep:
- **Error/diagnostic logs (90d)** is a Sentry project retention setting, not application code — set it in the Sentry dashboard.
- **Listings/photos after removal (90d)** — `listingService.deleteListing()` still hard-deletes immediately on request, which satisfies "gone within 90 days" trivially (zero is less than 90), but doesn't implement the soft-delete-then-purge shape this row's wording implies. Revisit only if you actually want the 90-day evidence-preservation window for disputes filed right after a listing comes down — it needs a `deletedAt` column on `Listing` and its own purge sweep, which wasn't built this pass.

## D. Structural risks

### D1. Sole proprietorship, and the address

As written, you personally are the counterparty on every rental, you personally hold the deposits, and you personally carry unlimited liability — an injury from a rented item, a data breach, a payment dispute. There's no corporate veil between Zoink's problems and your own assets.

**On the address:** you chose to use your home address, which is legal and free, and at pilot scale with a few dozen students it's a reasonable call. Two things to know before you publish it.

It's permanent in practice — it goes into app store listings, gets archived, and gets screenshotted. And the population seeing it is the population most likely to be angry at you: someone whose $400 deposit was captured, or whose deposit claim was denied. You are the dispute resolver, personally, at your home address.

If that sits fine, use it. If you'd rather not, the two cheap alternatives are a virtual mailbox (~$150–300/year in the GTA) or, better, incorporating and using the registered office address — which solves the liability problem at the same time. **Incorporating is the move that fixes both**, and an Ontario incorporation is a few hundred dollars.

Either way: do it before you take a real transaction. When you incorporate, swap the entity name into both documents and delete the "Zoink is not incorporated" line in `terms.md` §1.

### D2. Stripe Connect obligations

Stripe requires your Owners to accept the **Stripe Connected Account Agreement** directly, and requires your terms to say Stripe's terms apply. `terms.md` §10.1 does that. Two more:

- Check your model against Stripe's prohibited and restricted businesses list. Peer-to-peer rental of general goods is fine; some categories your users might list are not.
- Your deposit flow — authorize, capture, then transfer to a third party — should be confirmed in writing with Stripe support as within their rules for your account.

### D3. Ontario Consumer Protection Act, 2023

Passed December 2023, **not yet in force**; regulations still in consultation. The headline change for you: suppliers won't be able to unilaterally amend consumer agreements, the default becomes active acceptance by the consumer, and non-compliant amendments are void.

`terms.md` §19 is already written that way, and your registration scroller gives you the mechanism. Re-check once the regulations land.

### D4. No arbitration clause — deliberate

Most US marketplace terms carry mandatory arbitration and a class-action waiver. Both are left out on purpose: under Ontario's Consumer Protection Act they're void against consumers. Including one would be unenforceable and would advertise that the terms came from a US template.

### D5. App store requirements

Both stores need a publicly reachable privacy policy URL before review. Apple's privacy nutrition labels and Google's Data safety form must match `privacy.md` §5 exactly — every third party, plus location, photos, and identifiers. Mismatches are a common rejection reason. Host both documents in `landing/` and link them from the registration scroller.

## E. Pre-launch checklist

1. ~~Fill every `{{placeholder}}`~~ — done, except `{{HOSTING PROVIDER}}`, the landing-site cookies clause, and one missed `{{FULL LEGAL NAME}}` in `privacy.md`'s signature block (all still `{{...}}` as of 2026-09-07)
2. ✅ **B1** — insurance path can't fire; schema rejects the field, service hardcodes `insuranceOptIn = false` and asserts `insuranceFee === 0`
3. ✅ **B2** — confirmed no ID upload route ships
4. ✅ **B3** — resolved via the per-university domain enum instead of `ALLOWED_EMAIL_DOMAINS`
5. ✅ **B4** — done
6. ✅ **B7** — free-cancellation-before-start built; now also blocked once start time passes, and cancellation counts are tracked per user (needs a migration — see status note at top)
7. ✅ **B5** — `RECORD_AUDIO` dropped
8. ✅ Retention sweeps built in `cleanupJob.ts` (C) — logs and listing hard-delete are the two known gaps, see that section
9. ✅ Window env vars moved to constants (C)
10. Fill in your address, and decide whether incorporating first is the better path (D1) — address is filled in; incorporation decision is still yours
11. **Have an Ontario lawyer review both documents.** UTM and U of T both run free or subsidised legal clinics for student ventures — worth asking before you pay retail. Downtown Legal Services at U of T is the usual starting point.
12. **New:** run `npx prisma migrate dev` (adds `User.cancellationCount`) and a full `npm run typecheck` / `npm test` pass in `backend/` — this session edited the code but had no shell access to your machine to run either.
