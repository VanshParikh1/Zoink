# Reskin: what's left

Inventory taken 2026-10-17 on `design/mockup-reskin`, after the Messages reskin (`5e66f70`). It lists every screen, modal and sheet in `frontend/` that doesn't render the mockup `<Screen>` and mockup primitives yet.

Counts are per file, before any work in this pass: **hex** = quoted `'#RRGGBB'` literals, **fs** = `fontSize`, **fw** = `fontWeight` (each `fontWeight` is also a system-font weight that won't map onto Fira).

## A. Profile & account

There are no separate screens for edit profile, payouts / Stripe Connect, verification or notification preferences. Each one lives inside a screen below.

| File | Lines | hex | fs | fw | What it is |
|---|---:|---:|---:|---:|---|
| `screens/MyProfileScreen.tsx` | 792 | 0 | 17 | 12 | Profile tab. Includes the **edit profile** form (inline, toggled by "Edit"), the avatar upload, the **Payouts / Stripe Connect** panel (setup / under review / ready; opens Stripe's hosted onboarding in the browser), the quick links (listings, bookings, requests, inbox, settings), the admin links and Sign out. |
| `components/ProfileCard.tsx` | 473 | 0 | 17 | 15 | Hero card used by MyProfile and PublicProfile: tier chip, big photo, name, rentals bubble, bio quote, derived badges, review/lender/borrower stats, rating tracks, demo-only review highlights. |
| `screens/PublicProfileScreen.tsx` | 185 | 0 | 6 | 4 | Another user's profile (modal): ProfileCard, plus Report / Block links. |
| `screens/SettingsScreen.tsx` | 354 | 0 | 10 | 9 | Account (email, log out, delete account), **notification preferences** (5 switches), blocked users (unblock), legal, support, version, dev gallery link. |
| (verification) | — | — | — | — | No standalone screen. Verification is `VerificationGateScreen` / `VerifyEmailScreen`, both already reskinned in the auth pass. |

## B. Owner flows

| File | Lines | hex | fs | fw | What it is |
|---|---:|---:|---:|---:|---|
| `screens/BookingRequestsScreen.tsx` | 282 | 8 | 12 | 9 | Owner's incoming requests: rows with renter, dates, total, net payout, status pill, and inline **Accept / Decline** on pending rows; tapping a row opens BookingDetail. |
| `screens/ActiveRentalScreen.tsx` | 249 | 5 | 7 | 7 | Live rental hub, the **owner's handoff entry point**: "Start Handoff" (owner, CONFIRMED) and "Zoink It" (pickup/return pending), a pulsing "ready" banner, dates and days left, other party with Chat, the deposit row. |
| (accept / decline detail) | — | — | — | — | Already reskinned: `BookingDetailScreen` (owner actions, payout card) and `ZoinkItScreen` (handoff). |

## C. Trust & safety

| File | Lines | hex | fs | fw | What it is |
|---|---:|---:|---:|---:|---|
| `screens/FileDisputeScreen.tsx` | 161 | 0 | 6 | 5 | Open a dispute on a booking (reason + details). |
| `screens/FileReportScreen.tsx` | 176 | 0 | 6 | 5 | Report a user, listing or message. |
| `screens/AdminDisputesScreen.tsx` | 200 | 6 | 8 | 6 | Admin list of disputes. |
| `screens/AdminDisputeDetailScreen.tsx` | 603 | 0 | 17 | 12 | Admin dispute view and resolution (uses `fontFamily: 'Courier'`). |
| `screens/AdminReportsScreen.tsx` | 319 | 4 | 17 | 13 | Admin report queue, with a transparent slide-up `Modal` sheet. |
| `utils/confirmBlockUser.ts` | — | — | — | — | Block confirmation, built from native `Alert`s (platform-styled, nothing to reskin). |
| (reviews list) | — | — | — | — | No reviews-list screen exists. Reviews show only as aggregate ratings inside `ProfileCard`. `ReviewPromptScreen` is already reskinned. |

## D. Utility

| File | Lines | hex | fs | fw | What it is |
|---|---:|---:|---:|---:|---|
| `screens/PhotoViewerScreen.tsx` | 86 | 3 | 2 | 2 | Full-screen pinch-zoom photo modal (black, doesn't import theme). |
| `components/LocationMapModal.tsx` | 177 | 0 | 3 | 3 | Full-screen map picker with place search (Create/Edit listing). |
| `components/LocationMapPreview.tsx` | 99 | 0 | 1 | 1 | Approximate-area map on ListingDetail. |
| `components/MapAttribution.tsx` | 32 | 0 | 1 | 0 | Map tile attribution. |
| `navigation/index.tsx` | 207 | 0 | 0 | 0 | Loading gates (lines ~104 and ~175): a bare `ActivityIndicator` on `theme.primary`. This is the de facto splash / auth-loading gate. |
| `App.tsx` | 46 | 0 | 0 | 0 | Root. **No error boundary** exists anywhere. |
| (offline banner, toasts) | — | — | — | — | **None exist.** Errors use about 60 native `Alert.alert` calls (platform-styled, so no reskin). |
| Action sheets | — | — | — | — | `ActionSheetIOS` in ConversationThread (report/block), with an `Alert` on Android. Native. |
| `components/StateCard.tsx` | 139 | 0 | 5 | 5 | Legacy empty/error card, still used by C screens. |
| `components/ZoinkButton.tsx` | 210 | 0 | 4 | 4 | Legacy button, still used by C screens. |
| `components/PaymentNeededBadge.tsx`, `WaitingOnPaymentBadge.tsx` | 38 each | 0 | 1 | 1 | Warning pills used by Inbox, Thread and Requests. |
| `components/BackButton.tsx`, `HardBlock.tsx`, `ScreenBackground.tsx` | — | 0 | 0 | 0 | Legacy chrome. They can go once C and D are done. |

## Order

This pass covers **A and B**. C and D come next.
