# Reskin audit: frontend vs. 8 mockup screens

Audited on branch `design/mockup-reskin`, cut from `perf-security-pass` @ `976b3d4`. Read-only: this doc is the only change.

The counts come from a regex scan of `frontend/src/screens/*.tsx`, `frontend/src/components/*.tsx`, `App.tsx` and `navigation/index.tsx`. They are rough. They miss values computed at runtime and values spread in from `theme`.

---

## 1. Navigation map

All navigation lives in [`frontend/src/navigation/index.tsx`](../frontend/src/navigation/index.tsx). The app uses **only `@react-navigation/native-stack`**. `@react-navigation/bottom-tabs` is **not installed**. Every stack sets `headerShown: false`, so each screen draws its own header (usually a `BackButton` plus a title).

`Navigation()` chooses one of four root stacks from the auth state:

| Stack | Condition | Screens → file |
|---|---|---|
| **Auth stack** | `!user` | `Login` → `screens/LoginScreen.tsx`; `Register` → `screens/RegisterScreen.tsx`; `TermsAcceptance` → `screens/TermsAcceptanceScreen.tsx` |
| **Verification stack** | `user.verificationStatus !== 'VERIFIED'` | `VerificationGate` → `screens/VerificationGateScreen.tsx`; `VerifyEmail` → `screens/VerifyEmailScreen.tsx` |
| **Terms-update stack** | terms or privacy version is stale | `TermsAcceptance` (mode `update`, gesture disabled) |
| **`VerifiedAppStack`** | verified and terms current | listed below |

`VerifiedAppStack`'s initial route is `ReviewPrompt` when a pending review exists, otherwise `MainApp`:

| Route | File | Presentation |
|---|---|---|
| `MainApp` | `screens/MainAppScreen.tsx` | hosts the 4 tabs (see below) |
| `CreateListing` | `screens/CreateListingScreen.tsx` | push |
| `ListingDetail` | `screens/ListingDetailScreen.tsx` | push |
| `EditListing` | `screens/EditListingScreen.tsx` | push |
| `MyListings` | `screens/MyListingsScreen.tsx` | push |
| `BookingRequest` | `screens/BookingRequestScreen.tsx` | push |
| `Pay` | `screens/PayScreen.tsx` | push |
| `BookingHistory` | `screens/BookingHistoryScreen.tsx` | push |
| `BookingRequests` | `screens/BookingRequestsScreen.tsx` | push |
| `BookingDetail` | `screens/BookingDetailScreen.tsx` | push |
| `FileDispute` | `screens/FileDisputeScreen.tsx` | push |
| `AdminDisputes` | `screens/AdminDisputesScreen.tsx` | push |
| `AdminDisputeDetail` | `screens/AdminDisputeDetailScreen.tsx` | push |
| `FileReport` | `screens/FileReportScreen.tsx` | push |
| `AdminReports` | `screens/AdminReportsScreen.tsx` | push |
| `ActiveRental` | `screens/ActiveRentalScreen.tsx` | push |
| `ZoinkIt` | `screens/ZoinkItScreen.tsx` | push (mode `pickup` \| `return`) |
| `PhotoViewer` | `screens/PhotoViewerScreen.tsx` | `fullScreenModal`, fade |
| `ReviewPrompt` | `screens/ReviewPromptScreen.tsx` | push, gesture disabled |
| `Inbox` | `screens/InboxScreen.tsx` | push (also rendered as a tab) |
| `MyProfile` | `screens/MyProfileScreen.tsx` | push (also rendered as a tab) |
| `Settings` | `screens/SettingsScreen.tsx` | push |
| `PublicProfile` | `screens/PublicProfileScreen.tsx` | `modal` |
| `ConversationThread` | `screens/ConversationThreadScreen.tsx` | push |
| `TermsAcceptance` | `screens/TermsAcceptanceScreen.tsx` | push (mode `view`) |

While a booking is loading, the navigator and `VerifiedAppStack` both show a bare full-screen `ActivityIndicator` on `theme.screen`.

### Tabs: fully custom, no tab navigator

`MainAppScreen.tsx` **is** the tab bar. It does not use a tab navigator:

- The four tab screens, `HomeScreen`, `SearchScreen`, `InboxScreen` and `MyProfileScreen`, are mounted **side by side in a horizontal paging `Animated.ScrollView`**. Users can swipe between tabs. `MainTabContext` (`context/MainTabContext.tsx`) tells each tab whether it is the one on screen (`useIsTabActive` / `useTabLoad`).
- The bar is a floating pill positioned absolutely at `bottom: insets.bottom + 16`, `left/right: 16`. It is built from an `expo-blur` `BlurView` (dark tint, `rgba(15,255,80,0.12)` fill, radius 32) with Feather icons and labels. An animated highlight that follows `scrollX` marks the active tab.
- A **raised center "+"** already exists: a 60×60 green circle at `top: -24` that navigates to `CreateListing`. The bar leaves a 72px `centerSlot` gap for it. This matches the mockup's tab bar structure, so the reskin only needs restyling, not new architecture.
- The Inbox icon shows an unread dot fed by `useConversationsFeed`.
- Tab content pads its own bottom by about 120px so it scrolls clear of the bar.

The labels are Home / Search / Inbox / Profile. The mockup's names (Browse, Lend, Messages) may differ. Check that against the mockup.

---

## 2. Mockup → real screen mapping

| Mockup | Real file(s) | Real has that mockup lacks / mockup has that real lacks |
|---|---|---|
| **Sign up** (student email + 6-digit OTP) | `RegisterScreen.tsx` → `TermsAcceptanceScreen.tsx` (mode `register`) → `VerificationGateScreen.tsx` → `VerifyEmailScreen.tsx` | **Real has:** sign-up spread over 3–4 screens; first/last name, phone and password fields; a university picker in a `Modal` (`RegisterScreen`), with the email domain checked against `UNIVERSITY_DOMAINS`; a full Terms/Privacy acceptance step; and a separate "one quick step" gate screen before the code entry. `VerifyEmailScreen` already has 6 single-digit `TextInput`s, backspace navigation and "Resend". **Mockup has:** one email + OTP flow. Check whether name, phone and university are shown, and whether the terms step is visible. `LoginScreen` is the sibling and is not in the mockup. |
| **Browse** (search, category chips, nearby cards, floating tab bar with raised "+") | `HomeScreen.tsx` (Home tab, nearby list) and `SearchScreen.tsx` (Search tab: `SearchBar`, `CATEGORIES` chips, "Trending near you", "Recently viewed"); tab bar in `MainAppScreen.tsx` | **Real has:** browse split across **two tabs**. Home has a hero ("Don't buy, … it."), quick links (List item / My listings / Bookings / Requests) and nearby cards with distance in km. Search has chips, a trending carousel and recently viewed. Both ask for location permission. **Mockup has:** a single screen that combines search, chips and nearby cards. Decide whether Home absorbs Search or the mockup maps onto Search only. |
| **Listing detail** (dates, price breakdown, request) | `ListingDetailScreen.tsx` → `BookingRequestScreen.tsx` | **Real has:** detail and request on **two screens**. Detail has a photo carousel (into `PhotoViewer`), price per day, a `RatingPill`, "About this item", an approximate-area map (`LocationMapPreview`), a "Listed by" card with a link to the public profile, "Report this listing", an owner-only "Manage listing" (Edit/Delete) section and a "Message" button. Request has a date-range picker, a message to the owner and a price breakdown (daily rate, days, rental total, deposit hold, HST 13%, total). **Mockup has:** dates and breakdown on the detail screen itself. |
| **Checkout** (owner accepted, pay rent + deposit hold) | `PayScreen.tsx`; also the "Approve rental" / "Pay now" panel in `ConversationThreadScreen.tsx` and "Pay now" in `BookingDetailScreen.tsx` | **Real has:** a price breakdown (rental total, deposit hold, optional insurance, HST, charged today) and Stripe PaymentSheet errors raised through `Alert`. **Real lacks:** any visible "owner accepted" status or header. Pay is only reachable after acceptance, but the screen doesn't say so. The mockup's state banner would be new UI. |
| **Zoink It** (pickup/return, photos, both taps within 5 min) | `ZoinkItScreen.tsx` (launched from `ActiveRentalScreen` / `BookingDetailScreen`) | **Real has:** a camera-only photo capture step (photo library not allowed, with a max-photo alert), "Clear photos" / "Edit Photos", then a big tap target with a ripple and bounce animation, haptics, "Waiting for {name}…" polling, and a 409-retry flow. The confirm window is **enforced by the server and not shown in the UI**: no countdown, no "5 min" copy. **Mockup has:** the 5-minute rule spelled out, which needs new copy or a timer. |
| **Rental status** (return + deposit release timeline) | `ActiveRentalScreen.tsx`; deposit status and payout also in `BookingDetailScreen.tsx` | **Real has:** a hero image, a pulsing "ready" banner, dates with "N days left", the other party with a "Chat" button, a "CAD $X held as deposit" row and a single context action (Start Handoff / Start Return / Zoink It / View Booking Detail). **Real lacks:** any timeline or stepper component. Deposit status shows only as a text row on BookingDetail. A timeline would be a new component. |
| **Lend** (create listing, payout breakdown) | `CreateListingScreen.tsx` (5-step wizard: basics → pricing → photos → location → review/"Go live"), also `LocationMapModal`; `EditListingScreen.tsx` is the edit twin | **Real has:** the multi-step wizard, item value/deposit validation, a place search plus "Use my current location", and a review step. **Real lacks:** **any payout breakdown** in create (no fee, earn or payout math). The only payout card is in `BookingDetailScreen` (owner view: rental price, net payout, payout status, "Security deposit — not part of your earnings"). The breakdown would be new UI, and the fee logic needs to come from the backend or shared code. |
| **Messages** (chat with owner) | `ConversationThreadScreen.tsx` (thread); `InboxScreen.tsx` (list, a tab) | **Real has:** a booking context panel in the thread ("View listing", "Approve rental", "Pay now", `WaitingOnPaymentBadge`), block/report through `ActionSheetIOS` (iOS only), `StateCard` error/empty states and polling. The Inbox list has `PaymentNeededBadge` / `WaitingOnPaymentBadge`. **Mockup has:** the thread only. The Inbox list is not designed. |

---

## 3. Screens and surfaces the mockups do NOT cover

**Auth / onboarding:** `LoginScreen`, `VerificationGateScreen`, `TermsAcceptanceScreen` (3 modes: register / update / view), the `RegisterScreen` university picker `Modal`.

**Profile / account:** `MyProfileScreen` (tab; profile card, edit form with keyboard handling, avatar upload), `PublicProfileScreen` (modal), `SettingsScreen`, `components/ProfileCard.tsx` (473 lines, rich card with a 56pt display number).

**Listings management:** `MyListingsScreen`, `EditListingScreen`.

**Bookings:** `BookingHistoryScreen` (renter), `BookingRequestsScreen` (owner inbox of requests; accept/decline), `BookingDetailScreen` (owner **payout card**, deposit status, pickup/return photos, "Report a Problem", decline/cancel, "Leave required review", plus a black full-screen **photos `Modal`**).

**Trust & safety:** `FileDisputeScreen`, `FileReportScreen`, `AdminDisputesScreen`, `AdminDisputeDetailScreen` (uses `fontFamily: 'Courier'`), `AdminReportsScreen` (slide-up transparent **`Modal`** sheet).

**Reviews:** `ReviewPromptScreen` (can be the app's *initial* route, gesture-locked).

**Media:** `PhotoViewerScreen` (full-screen modal, pinch-zoom through `react-native-zoom-toolkit`, does not import theme).

**Messaging:** `InboxScreen` list.

**Modals and sheets:** the Register university picker, BookingDetail photos, the AdminReports sheet, `LocationMapModal` (full-screen map plus place search), `ActionSheetIOS` in ConversationThread (iOS; check the Android fallback), and about 90 native `Alert.alert` calls (errors, validation, permission prompts) that stay platform-styled whatever the reskin does.

**Empty / error / loading states:**
- `components/StateCard.tsx` (eyebrow / title / body / up to 2 actions, `tone: 'error'`) is used by Search, Inbox, BookingHistory, BookingRequests, ConversationThread, AdminDisputes and AdminReports.
- Ad-hoc empty states: Home ("No listings found" / "Nothing nearby right now"), Inbox ("No messages yet"), ListingDetail ("No photos yet"), BookingDetail ("No pickup photos found.").
- Loading: bare `ActivityIndicator` on most screens, plus inline "Loading nearby listings…" (Home) and "Loading the conversation…" (Thread). No skeletons exist.
- Badges: `PaymentNeededBadge`, `WaitingOnPaymentBadge`, `RatingPill`.

---

## 4. Theme state

There is **one theme file**: [`frontend/src/theme/colors.ts`](../frontend/src/theme/colors.ts). It exports `colors` (raw palette) and `theme` (semantic tokens). It is fairly complete:

- Colors: green ramp `#6DD832` / `#4EA822` / `#3A7D19` / `#96E85A` / `#F2FAE8`, a gray ramp, danger/warning plus surfaces, and semantic `screen`, `surface*`, `border*`, `text*`, `primary*`, `card*`, `glass*`.
- `radius` scale: `sm 8 / md 16 / lg 24 / pill 999`.
- Shadows: `shadowSm` / `shadowMdElevation` / `shadowLgElevation` (iOS shadow props plus Android `elevation` 2/4/6), and a dead-looking CSS-string `cardShadow`.
- `hard`: the neobrutalist system (ink border 2.5 / 1.5, block-shadow offsets 3/5/7), used through `components/HardBlock.tsx`.
- `type` scale: `screenTitle, sectionTitle, body, bodyMuted, label, caption, eyebrow` (sizes, weights and lineHeights, **no fontFamily**).
- `header` rhythm: `stackTop: 64, tabTop: 64, titleGap, contentGap`.
- `backgroundGradient` and `textureColor` for `ScreenBackground`.

**Adoption:** every screen except `PhotoViewerScreen` imports `theme`, and so does every component except `MapAttribution`, `DismissKeyboardView` and the two logos. Usage is **mixed**:
- Colors mostly go through `theme.*`. Literal hex or rgba is concentrated in a few files (see §5).
- **`fontSize` is almost always a literal.** About 380 literal `fontSize` values across the files against a handful of `...theme.type.*` spreads. The type scale is largely unused.
- `borderRadius` is mixed: `theme.radius.*` in newer code, literal 10/12/14/20/32 elsewhere (`ZoinkButton` hardcodes 10).
- `paddingTop: 64` is hardcoded in about 12 screens next to `theme.header.stackTop` (also 64) in others.

There is no theming provider and no dark mode. Changing the theme means editing one module and reloading.

> Note: `ScreenBackground`'s comment says it is "rendered once at the app root behind the navigator", but it is actually rendered **per screen** (28 screens wrap themselves in it, including `MainAppScreen`). Each screen renders a gradient plus a grid of about 60 rotated `View` diamonds.

---

## 5. Hardcoded-style hotspots (worst first)

Columns: literal hex strings · literal `rgb(a)(` strings · numeric `fontSize` · numeric `border*Radius` · shadow/elevation props not taken from theme. The table includes only files with a total of 4 or more.

| File | hex | rgba | fontSize | radius | shadow/elev | **total** |
|---|---:|---:|---:|---:|---:|---:|
| screens/CreateListingScreen.tsx | 4 | 3 | 30 | 16 | 15 | **68** |
| screens/BookingDetailScreen.tsx | 7 | 2 | 21 | 10 | 0 | **40** |
| screens/ActiveRentalScreen.tsx | 5 | 1 | 7 | 10 | 0 | **23** |
| screens/MainAppScreen.tsx (tab bar) | 2 | 4 | 2 | 5 | 10 | **23** |
| screens/MyProfileScreen.tsx | 0 | 2 | 17 | 4 | 0 | **23** |
| screens/AdminReportsScreen.tsx | 4 | 1 | 17 | 0 | 0 | **22** |
| screens/ListingDetailScreen.tsx | 0 | 1 | 17 | 4 | 0 | **22** |
| screens/TermsAcceptanceScreen.tsx | 0 | 0 | 15 | 6 | 0 | **21** |
| screens/ZoinkItScreen.tsx | 0 | 0 | 5 | 0 | 16 | **21** |
| screens/BookingHistoryScreen.tsx | 8 | 0 | 12 | 0 | 0 | **20** |
| screens/BookingRequestScreen.tsx | 0 | 1 | 19 | 0 | 0 | **20** |
| screens/BookingRequestsScreen.tsx | 8 | 0 | 12 | 0 | 0 | **20** |
| screens/EditListingScreen.tsx | 0 | 1 | 8 | 6 | 5 | **20** |
| screens/AdminDisputeDetailScreen.tsx | 0 | 0 | 17 | 2 | 0 | **19** |
| screens/HomeScreen.tsx | 0 | 1 | 14 | 3 | 0 | **18** |
| components/ProfileCard.tsx | 0 | 0 | 17 | 0 | 0 | **17** |
| screens/SearchScreen.tsx | 0 | 0 | 12 | 4 | 0 | **16** |
| screens/RegisterScreen.tsx | 0 | 1 | 12 | 2 | 0 | **15** |
| screens/AdminDisputesScreen.tsx | 6 | 0 | 8 | 0 | 0 | **14** |
| screens/ReviewPromptScreen.tsx | 0 | 0 | 10 | 4 | 0 | **14** |
| screens/ConversationThreadScreen.tsx | 0 | 0 | 9 | 3 | 0 | **12** |
| screens/InboxScreen.tsx | 1 | 0 | 9 | 2 | 0 | **12** |
| screens/MyListingsScreen.tsx | 0 | 0 | 9 | 3 | 0 | **12** |
| screens/SettingsScreen.tsx | 0 | 2 | 10 | 0 | 0 | **12** |
| screens/FileDisputeScreen.tsx | 0 | 0 | 6 | 4 | 0 | **10** |
| components/ZoinkButton.tsx | 0 | 0 | 4 | 6 | 0 | **10** |
| screens/PhotoViewerScreen.tsx | 3 | 2 | 2 | 2 | 0 | **9** |
| screens/LoginScreen.tsx | 0 | 0 | 6 | 2 | 0 | **8** |
| screens/PayScreen.tsx | 0 | 0 | 8 | 0 | 0 | **8** |
| screens/PublicProfileScreen.tsx | 0 | 0 | 6 | 2 | 0 | **8** |
| screens/VerifyEmailScreen.tsx | 0 | 0 | 6 | 2 | 0 | **8** |
| components/LocationMapModal.tsx | 0 | 0 | 3 | 4 | 0 | **7** |
| screens/FileReportScreen.tsx | 0 | 0 | 6 | 0 | 0 | **6** |
| screens/VerificationGateScreen.tsx | 0 | 0 | 5 | 1 | 0 | **6** |
| components/StateCard.tsx | 0 | 0 | 5 | 0 | 0 | **5** |
| components/LocationMapPreview.tsx | 0 | 0 | 1 | 3 | 0 | **4** |
| components/MapAttribution.tsx | 0 | 2 | 1 | 1 | 0 | **4** |

`BackButton`, `PaymentNeededBadge`, `RatingPill`, `SearchBar` and `WaitingOnPaymentBadge` have one literal each. `HardBlock`, `ScreenBackground`, `DismissKeyboardView`, the logos, `App.tsx` and `navigation/index.tsx` have none.

**Takeaway:** colors are mostly tokenized already. **Typography is the real hotspot**: almost every `fontSize` and `fontWeight` is literal, so the type change will touch every file. `CreateListingScreen` (Lend mockup) is by far the heaviest single file.

---

## 6. Shared components that already exist

| Component | What it is | Used in |
|---|---|---|
| `ZoinkButton` | Button with variants `stamped` (green gradient plus ink block shadow), `stampedOutline`, `inset`, `danger`; haptics, loading spinner | ListingDetail, Settings, MyProfile, CreateListing. **Only 4 screens.** Most screens hand-roll `TouchableOpacity` buttons (`actionButton`, `chatButton` and so on). |
| `HardBlock` | Neobrutalist card: ink backing plate plus bordered panel | ListingDetail, Pay, AdminDisputes, BookingRequest, Home, StateCard, ProfileCard |
| `StateCard` | Empty/error state card (eyebrow/title/body/actions) | AdminDisputes, BookingRequests, Inbox, BookingHistory, ConversationThread, AdminReports, Search |
| `ScreenBackground` | Gradient plus diamond-texture backdrop | 28 screens (all except ActiveRental, ZoinkIt, PhotoViewer) |
| `BackButton` | Back link | 18 screens |
| `SearchBar` | Search input | Search |
| `ProfileCard` | Profile hero card | MyProfile, PublicProfile |
| `RatingPill` | Star rating pill | ListingDetail, Search |
| `PaymentNeededBadge` / `WaitingOnPaymentBadge` | Status badges | Inbox / Inbox, ConversationThread |
| `LocationMapPreview` / `LocationMapModal` / `MapAttribution` | Map preview, full-screen picker, attribution | ListingDetail, CreateListing / CreateListing / both map components |
| `DismissKeyboardView` | Tap-outside-to-dismiss wrapper | 12 form screens |
| `ZoinkLogo` / `ZoinkFullLogo` | SVG logos (through `react-native-svg-transformer`) | 7 screens / 4 screens |

**Missing as shared components** (each one is hand-rolled per screen today): text input / form field, list row or card for listings (Home and Search each define their own listing cards), chip (Search defines its own), price-breakdown table (duplicated across BookingRequest, Pay and BookingDetail), avatar, section header, tab bar item (inline in MainAppScreen), timeline/stepper (does not exist).

---

## 7. Fonts

- **No custom fonts are loaded.** There is no `useFonts`, no `Font.loadAsync`, no font files in `frontend/assets/`, and no `fontFamily` anywhere except one `fontFamily: 'Courier'` in `AdminDisputeDetailScreen`.
- `expo-font` **is installed** (`~14.0.12`, resolved 14.0.12) and listed as a config plugin in `app.config.js`, but nothing uses it yet. The config plugin can embed fonts at build time (`"expo-font", { fonts: [...] }`), which avoids a runtime load gate.
- **`@expo-google-fonts/*` is not installed.**
- Every screen renders in the system font (SF Pro on iOS, Roboto on Android) with heavy weights (`'800'` / `'900'` appear about 200 times).

---

## 8. Dependencies and safe areas

| Package | In package.json | Installed |
|---|---|---|
| `react-native-svg` | `15.12.1` | 15.12.1 (plus `react-native-svg-transformer ^1.5.3` dev) |
| `expo-linear-gradient` | `~15.0.8` | 15.0.8 |
| `react-native-safe-area-context` | `~5.6.0` | 5.6.2 |
| (also relevant) `expo-blur` | `~15.0.8` | 15.0.8 |

Expo SDK `~54.0.33`, React Native 0.81.5, React 19.1.

**Safe-area usage is inconsistent:**
- `SafeAreaProvider` wraps the app in `App.tsx`.
- **No screen uses `SafeAreaView`.**
- Only **5 files** call `useSafeAreaInsets`: MainAppScreen (tab bar bottom), CreateListing, ListingDetail, ZoinkIt and ConversationThread.
- Every other screen gets its top spacing from a **fixed `paddingTop: 64`** (literal in about 12 screens, `theme.header.stackTop` / `tabTop` = 64 in the rest) and its bottom from a fixed `paddingBottom` (32/40/120).
- No `StatusBar` component is configured anywhere.

---

## 9. Android-specific risks

1. **Fixed 64px top padding instead of insets.** Android status bar heights vary (24–50dp, more with a display cutout), and SDK 54 runs Android edge-to-edge. Headers will sit too high on tall-cutout devices and leave too much gap on others. The bottom paddings also ignore the gesture or 3-button nav bar, except on the tab bar.
2. **Elevation-based shadows:**
   - `MainAppScreen`: tab-bar wrapper `elevation: 8` behind a `BlurView` with `overflow: 'hidden'` and radius 32, and the "+" button `elevation: 10` with `shadowColor: theme.primary`. Android ignores `shadowColor` before API 28 and only partly honours it after, so the green glow renders as a gray drop shadow. Elevation on a translucent BlurView parent also tends to draw a dark rectangle.
   - `ZoinkItScreen`: `elevation` 8 / 12 / 14 on the tap target and ripple layers.
   - `CreateListingScreen`: three `elevation: 2`. `EditListingScreen`: one `elevation: 1`.
   - `theme.shadowSm/Md/Lg` carry `elevation` 2/4/6.
   - The `HardBlock` / `ZoinkButton` "block shadow" uses stacked views, not elevation, so it is Android-safe. Keep that pattern for any mockup shadows that must look the same on both platforms.
3. **`expo-blur` on Android:** `BlurView` is experimental on Android and falls back to a semi-transparent tint unless `experimentalBlurMethod` is set. The tab bar will look different from iOS.
4. **lineHeight smaller than fontSize:** none found. The smallest ratio is the "+" glyph (`fontSize 32 / lineHeight 34` with `marginTop: -2`). Android text has extra font padding (`includeFontPadding` is never set), so the "+" will probably sit off-center. If a custom font is added, recheck every `lineHeight` paired with `theme.type`.
5. **Heavy font weights with the system font:** Roboto does not ship every weight from 800 to 900 on older Android versions, so `'900'` may render as bold (700). Bundling a custom font with explicit weight files fixes this.
6. **`fontFamily: 'Courier'`** (`AdminDisputeDetailScreen`) does not exist on Android and silently falls back. Use `'monospace'` or a bundled mono font.
7. **`Platform.OS` branches in styling or UI:**
   - `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` in 13 screens. `ConversationThread` also sets `keyboardVerticalOffset` 20 on iOS and 0 on Android. With edge-to-edge on, `'height'` often double-shifts.
   - `ConversationThreadScreen` uses `ActionSheetIOS` behind `Platform.OS === 'ios'`. The Android path is a different (Alert) UI.
   - `pushNotifications.ts` has an Android notification channel branch. The other `Platform.OS === 'web'` branches (AuthContext, MyProfile, api.ts) are not styling.
8. **`Dimensions.get('window')` read at module load** (6 places, for example `ZoinkItScreen` `RIPPLE_SIZE` and the `SCREEN_WIDTH` constants). Sizes go stale on Android split-screen or fold, and on rotation.
9. **`Modal` sheets** (`AdminReports` transparent slide, `BookingDetail` photos, Register picker) don't draw under the status or nav bar on Android edge-to-edge unless `statusBarTranslucent` / `navigationBarTranslucent` are set. Expect color bands at the edges.

---

## Done (2026-10-18)

Everything above was the starting audit. This section records where the reskin landed on `design/mockup-reskin` (`bebd512..HEAD`). iOS was checked in the simulator in demo mode; **Android has not been run yet** (see `docs/reskin-dev.md` §5).

### Screens reskinned

Every screen and modal now renders the mockup `Screen` (or, for full-bleed layouts, the mockup primitives directly):

- **Auth:** Login, Register (and its university picker), Terms acceptance (register / update / view), Verification gate, Verify email.
- **Browse:** Home (2-column grid), Search, Listing detail, Booking request (date picker).
- **Rent:** Checkout (Pay), Zoink It handoff, Booking detail (status timeline), Rentals list, Active rental.
- **Lend:** Create listing, Edit listing, My listings.
- **Messages:** Inbox, Conversation thread.
- **Profile & account:** My profile (including the edit form and Stripe payouts panel), Public profile, Settings (including notification preferences and blocked users).
- **Owner:** Incoming requests (inline Accept / Decline).
- **Trust & safety:** Report a problem (dispute), Report user/listing/message, admin Dispute queue, Dispute detail and Report queue (including its resolve sheet).
- **Utility:** Photo viewer, map preview and full-screen map picker, boot loading gates, tab bar, a new top-level error boundary, and the dev-only Design gallery.

Screenshots are in `docs/reskin-shots/`. Native `Alert.alert` dialogs (about 70 calls) and the iOS action sheets stay platform-styled.

### New shared components (`frontend/src/components/mockup/`)

| Component | What it is |
|---|---|
| `Screen`, `ScreenHeader`, `ScreenBackground` | Page shell: safe areas, optional footer, keyboard avoiding, pull-to-refresh, hatch + glow backdrop |
| `Button` (primary / zoink / secondary / link), `IconButton`, `Chip`, `CategoryChips` | Controls with 48pt targets |
| `Card`, `InkCard`, `HardShadow`, `StatePanel` | Surfaces, the single ink explainer card, solid offset shadow, empty/error panel |
| `Badge`, `bookingStatus.ts`, `adminStatus.ts` | Pills, plus one status→badge mapping for bookings, disputes and reports |
| `TextField`, `OtpInput`, `ListingForm` | Form inputs and the shared create/edit listing form |
| `ListingCard`, `ListingGridCard`, `Thumb`, `PriceTable`, `Timeline` | Listing rows/grid cards, image/initials thumb, money breakdown, booking timeline |
| `RowGroup` / `ListRow`, `ProfileHeader` | Settings-style row lists; profile avatar + name + stats |
| `LogoPill`, `HighlightText`, `AuthEntry` | Brand pieces |
| `MapPin`, `LoadingGate`, `ErrorBoundary` | Map area marker, boot spinner, crash fallback |
| `tabBarMetrics.ts`, `listingFormat.ts` | Tab bar clearance, listing price/distance formatting |

Removed as dead: `ProfileCard`, `ZoinkButton`, `ZoinkLogo`, `BackButton`, `HardBlock`, `StateCard`, the legacy `ScreenBackground`, the old `theme` object and its colour aliases, and the `expo-blur` dependency.

### Constants moved to `@zoink/shared`

Backend and app now read one value instead of each keeping a copy:

- `bookingWindows.ts`: `DEPOSIT_HOLD_HOURS` (24), `PAYOUT_HOLD_HOURS` (24), `ZOINK_TAP_WINDOW_MS` (5 min), `HANDOFF_PHOTOS_MIN` / `HANDOFF_PHOTOS_MAX` (2 / 3), `LISTING_PHOTOS_MAX` (8).
- `commission.ts`: `COMMISSION_TIERS`, `getCommissionRate`, `calculateCommission`, `calculateOwnerPayout` (used by the backend and by Lend's payout preview).

### Token changes (`theme/colors.ts`)

| Token | Before → after | Why |
|---|---|---|
| `greenText` | `#248232` → `#1F702B` | 4.18:1 on bg and 4.15:1 on lime, under 4.5:1 for small text. Now 5.29 on bg, 5.88 on surface, 5.25 on lime, 4.52 on tan. |
| `danger` | `#D72C0D` → `#BA260B` | 3.63:1 on the tan "problem" cards. Now 5.36 on bg, 5.95 on surface, 4.58 on tan. |

The type scale gained `type.tab` (11/13, tab labels). No preset sets `fontWeight`; the Fira family carries the weight.

### Safety fixes made along the way

- **Demo mode is gated at build time** (`config/demoModeGate.ts`): it needs `__DEV__` *and* `EXPO_PUBLIC_DEMO_MODE === 'true'`, and every mock-module `require` carries the same guard. Before this, a local release build on a machine whose `frontend/.env` set the flag would have shipped demo mode. Covered by `npm test` in `frontend/`.
- **Booking detail rental dates** are formatted in UTC; they had shown a day early in Ontario.

### Open product questions

1. **Commission:** the code charges tiered 15% / 12.5% / 10% by daily rate (`COMMISSION_TIERS`); the business plan says a flat 15%. One of them needs to change.
2. **Rentals isn't a tab.** It's reached from Home → Bookings or Profile → My bookings. The mockup tab bar has no slot for it.
3. **Insurance is forced off.** `bookingService` hardcodes `insuranceOptIn = false` and asserts the fee is zero (terms.md §12, legal OPEN-ITEMS B1). The pricing code and the DB columns still exist.
4. **Unread is boolean only.** The API sends `unread: true/false` per conversation, so the Inbox shows a "New" badge instead of a count.
5. **No offline banner or toasts.** Errors surface through native alerts; there's no network-status UI.
6. **Accepted version mismatches:** `npx expo install --check` wants `@stripe/stripe-react-native` 0.50.3 (installed 0.62.0) and `@sentry/react-native` ~7.2 (installed 8.21). Both are kept on purpose (see `claude/playstore-prep-status.md`).
