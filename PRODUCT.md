# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

**Primary: Owners (listers/lenders)** — GTA university students who own items (cameras, speakers, tools, sports gear, DJ equipment) that sit unused most of the time. They want passive income and a way to monetize things they already have. Supply-side is the hard problem; when a decision has to pick a side, optimize for owners.

**Secondary: Renters (borrowers)** — GTA university students who need an item temporarily — for a class project, event, move, or one-time activity — and don't want to buy it. Renter flow must stay frictionless, but owner wins on conflict.

**Operator: Admins** — Platform team managing dispute resolution, marketplace integrity, and payout decisions.

All users are verified students at one of five GTA universities (see Capabilities and Constraints).

## Product Purpose

Zoink is a peer-to-peer rental marketplace for GTA university students. It makes it safe and practical to rent items between strangers: an owner lists something, a renter books it, Stripe holds the deposit in escrow, and both parties confirm the handoff through a synchronized dual-photo confirmation ("Zoink It") before custody transfers.

Success means owners confidently list valuable items knowing their deposit is protected and their asset is documented. Renters get access to things they need briefly without buying. The platform earns a commission on completed rentals.

## Positioning

**"The deposit hold and verified handoff that group chat rentals don't have."**

Facebook Marketplace and campus group chats have no answer for: "item comes back damaged — who holds the money?" or "how do we both confirm the handoff actually happened?" Zoink does: manual-capture Stripe deposit escrow + synchronized dual-photo confirmation with a 5-minute window. Lead copy and design with this mechanism, not a vague trust claim.

## Operating Context

- Students rent items for events, class projects, moves, one-time activities — short-duration, low-frequency needs
- Exchanges happen in person, on campus or nearby, in the GTA
- Both parties must confirm each handoff phase ("Zoink It") within a synchronized 5-minute window before the booking state advances
- Owners photograph the item at pickup; renters photograph at return — both photos are stored and surfaced in disputes
- All messaging happens in-app; no external coordination required
- Stripe PaymentSheet handles payment authorization; payout releases after a 24-hour hold post-completion
- Disputes freeze payout until resolved by an admin

## Capabilities and Constraints

**Verified university access only.** Supported email domains (GTA universities):
- University of Toronto: `utoronto.ca`, `mail.utoronto.ca`
- Toronto Metropolitan University: `torontomu.ca`
- Wilfrid Laurier University: `wlu.ca`
- York University: `yorku.ca`
- McMaster University: `mcmaster.ca`
- Ontario Tech University: `ontariotechu.ca`

Do not expand beyond these five universities without an explicit product decision.

**Booking state machine:** `PENDING → ACCEPTED → PICKUP_PENDING → ACTIVE → RETURN_PENDING → COMPLETED` (with `DECLINED`/`CANCELLED` exits). State transitions are strictly enforced on the backend.

**Payment model:** Owner-configured deposit (held in escrow) + 15% platform commission + optional 3% insurance (capped $1–$50). Payout held 24 hours post-completion; blocked if any open dispute exists.

**Cancellation:** No fee pre-pickup (authorization released). No automatic refund post-pickup — requires admin/support.

**No social proof copy:** No user counts, listing counts, or transaction figures exist yet. All copy must rely on the mechanism claim, not social proof.

**Stripe PaymentSheet** requires EAS development or release build — does not work in Expo Go.

**Location:** GPS-based listings, GTA-focused, 5000 km search radius (intentionally wide for MVP flexibility).

**Terminology:** "Zoink It" is the in-app verb for the synchronized handoff confirmation tap. It is both brand and UX copy — preserve it.

## Brand Commitments

**Name:** Zoink. "Zoink It" is the handoff confirmation action — treat as locked copy.

**Locked assets — do not regenerate or replace:**
- `frontend/assets/ZoinkFullLogo.jpeg`
- `frontend/assets/ZoinkTransparent.png`
- Icon, splash, and android-adaptive-icon asset set in `frontend/assets/`
- `frontend/src/theme/colors.ts` — the established color palette; restyle around it, do not replace it
- `frontend/landing/index.html` — the existing landing page treatment

**Voice:** Mechanism-forward, direct. No vague trust language ("safe," "trusted," "verified" as a headline). Lead with what the product concretely does for the owner.

## Evidence on Hand

No confirmed usage numbers yet. Do not write copy that depends on social proof ("join X students," specific counts). Mechanism claim is the only reliable proof point available.

## Product Principles

1. **Owner confidence first.** When a product decision creates friction, put it on the renter side. Owners who trust the platform list more; supply unlocks everything else.
2. **The mechanism is the message.** Deposit escrow + dual-photo handoff is the differentiated claim. Design and copy lead with the concrete mechanism, not a generic trust badge.
3. **Verification as a feature, not a gate.** University email verification and photo-verified handoffs are signals of legitimacy to both parties — surface them, don't hide them as compliance steps.
4. **State is the truth.** Booking and payment state machines are the authoritative record of what happened. Disputes, payouts, and UI all derive from state — never let the UI get ahead of backend state.
5. **Simple handoff, hard to fake.** The "Zoink It" confirmation requires both parties, in a time window, with photos — by design. Complexity in the protocol is what makes it trustworthy.

## Accessibility & Inclusion

No product-specific accessibility standard established yet. Follow platform defaults (React Native accessibility APIs, sufficient contrast in theme).
