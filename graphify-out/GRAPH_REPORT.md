# Graph Report - Zoink  (2026-08-03)

## Corpus Check
- 173 files · ~226,908 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1265 nodes · 2503 edges · 98 communities (72 shown, 26 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `da848035`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bookingService.ts
- devDependencies
- setup.ts
- expo
- bookings.ts
- colors.ts
- listings.ts
- listingsApi.ts
- types/index.ts
- rateLimiter.ts
- mockWeek6.ts
- CreateListingScreen.tsx
- BookingRequestScreen.tsx
- bookingsApi.ts
- backend/src/index.ts
- listingService.ts
- LocationMapModal.tsx
- index.tsx
- scripts
- compilerOptions
- prisma.ts
- validate
- What You Must Do When Invoked
- authService.ts
- conversations.ts
- MyListingsScreen.tsx
- BookingDetailScreen.tsx
- MainAppScreen.tsx
- AuthContext.tsx
- Zoink
- dependencies
- dependencies
- auth.ts
- "users"
- VerifyEmailScreen.tsx
- conversationsApi.ts
- 4. File-by-File Explanation
- Zoink Backend — Integration Tests
- errors.ts
- ReviewPromptScreen.tsx
- 9. Main User Flows
- manageAdminRole.ts
- conversationService.ts
- ActiveRentalScreen.tsx
- disputesApi.ts
- BookingHistoryScreen.tsx
- RootStackParamList
- stripe.schema.ts
- Zoink Codebase Overview
- shared/package.json
- expo-font
- metro.config.js
- frontend/tsconfig.json
- frontend/package.json
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- Zoink — Outstanding Items Audit
- 10. How Files Interact
- devDependencies
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- @stripe/stripe-react-native
- expo-camera
- expo-dev-client
- expo-image-picker
- expo-linear-gradient
- expo-status-bar
- react-dom
- react-native
- react-native-gesture-handler
- 11. Environment Variables
- react-native-safe-area-context
- react-native-web
- react-native-worklets
- react-native-zoom-toolkit
- @react-navigation/native
- 12. Scripts and Commands
- 15. Developer Onboarding Guide
- 7. Database / Prisma
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- expo-blur
- expo-haptics
- expo-location
- expo-notifications
- react-native-screens
- "disputes"

## God Nodes (most connected - your core abstractions)
1. `theme` - 34 edges
2. `useAuth()` - 29 edges
3. `RootStackParamList` - 26 edges
4. `validate()` - 22 edges
5. `prisma` - 21 edges
6. `ScreenBackground()` - 21 edges
7. `4. File-by-File Explanation` - 17 edges
8. `Zoink Codebase Overview` - 16 edges
9. `getTestPrisma()` - 15 edges
10. `expo` - 15 edges

## Surprising Connections (you probably didn't know these)
- `registerForPushNotificationsAsync()` --references--> `"notifications"`  [EXTRACTED]
  frontend/src/services/pushNotifications.ts → backend/prisma/migrations/20260428151800_init/migration.sql
- `BrowseListingsResult` --references--> `ListingBrowseItem`  [EXTRACTED]
  frontend/src/types/index.ts → packages/shared/src/dto.ts
- `"booking_events"` --references--> `"bookings"`  [EXTRACTED]
  backend/prisma/migrations/20260524000000_week7_payments_handoff/migration.sql → backend/prisma/migrations/20260428151800_init/migration.sql
- `buildTestApp()` --calls--> `buildLimiter()`  [EXTRACTED]
  backend/src/middleware/rateLimiter.test.ts → backend/src/middleware/rateLimiter.ts
- `releaseDuePayouts()` --calls--> `transferPayout()`  [EXTRACTED]
  backend/src/services/cleanupJob.ts → backend/src/services/paymentService.ts

## Import Cycles
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/HomeScreen.tsx -> frontend/src/navigation/index.tsx`
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/SearchScreen.tsx -> frontend/src/navigation/index.tsx`

## Communities (98 total, 26 thin omitted)

### Community 0 - "bookingService.ts"
Cohesion: 0.06
Nodes (70): allowedTransitions, assertBookingTransition(), main(), calculateCancellationFeeCents(), createBooking(), createBookingEvent(), CreateBookingInput, createReviewObligationsForCompletedBooking() (+62 more)

### Community 1 - "devDependencies"
Cohesion: 0.04
Nodes (47): author, description, devDependencies, nodemon, prisma, prisma-generator-typescript-interfaces, supertest, ts-node (+39 more)

### Community 2 - "setup.ts"
Cohesion: 0.16
Nodes (24): assertNoFeeCharged(), giveOwnerStripeAccount(), makeAcceptedBooking(), IMPORTANT: These tests call the real Stripe API for PaymentIntent creation, waitForPaymentStatus(), giveOwnerStripeAccount(), makeAcceptedBooking(), makeActiveBooking() (+16 more)

### Community 3 - "expo"
Cohesion: 0.06
Nodes (33): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+25 more)

### Community 4 - "bookings.ts"
Cohesion: 0.12
Nodes (26): acceptBooking, activateBooking, cancelBooking, completeBooking, confirmPickup, confirmReturn, createBooking, declineBooking (+18 more)

### Community 5 - "colors.ts"
Cohesion: 0.12
Nodes (17): SearchBar(), styles, Props, StateCard(), styles, Tone, Nav, ScreenRoute (+9 more)

### Community 6 - "listings.ts"
Cohesion: 0.09
Nodes (29): browseListings, createListing, deleteListing, deleteListingImage, getListing, getListingCategories, getMyListings, validListingBody (+21 more)

### Community 7 - "listingsApi.ts"
Cohesion: 0.10
Nodes (33): CATEGORIES, EditListingScreen(), Nav, Route, styles, BrowseListingsParams, createListing(), CreateListingPayload (+25 more)

### Community 8 - "types/index.ts"
Cohesion: 0.11
Nodes (25): react, VerifiedAppStack(), ACTIVE_STATUSES, AdminDisputeDetailScreen(), Nav, OUTCOME_LABELS, REASON_LABELS, RESOLUTION_OPTIONS (+17 more)

### Community 9 - "rateLimiter.ts"
Cohesion: 0.31
Nodes (7): authLimiter, bearerUserId(), buildLimiter(), globalLimiter, keyByIpAndUser(), rateLimitHandler(), buildTestApp()

### Community 10 - "mockWeek6.ts"
Cohesion: 0.13
Nodes (20): activateBooking(), createBooking(), CreateBookingPayload, bookings, conversations, demoUser, disputes, messagesByConversation (+12 more)

### Community 11 - "CreateListingScreen.tsx"
Cohesion: 0.12
Nodes (17): ButtonVariant, styles, ZoinkButton(), ZoinkButtonProps, CATEGORIES, CreateListingScreen(), DEFAULT_COORDS, FormData (+9 more)

### Community 12 - "BookingRequestScreen.tsx"
Cohesion: 0.16
Nodes (17): isStripePublishableKeyConfigured(), STRIPE_PUBLISHABLE_KEY, addDays(), addMonths(), BookingRequestScreen(), buildMonthDays(), CalendarDay, DAY_LABELS (+9 more)

### Community 13 - "bookingsApi.ts"
Cohesion: 0.19
Nodes (16): Nav, ScreenRoute, styles, ZoinkItScreen(), completeBooking(), confirmHandoff(), getBooking(), getHandoffPhotos() (+8 more)

### Community 14 - "backend/src/index.ts"
Cohesion: 0.13
Nodes (19): app, getMe, getPublicProfile, getStripeConnectStatus, onboardStripeConnect, updateMe, updatePushToken, uploadAvatar (+11 more)

### Community 15 - "listingService.ts"
Cohesion: 0.06
Nodes (29): BrowseListingRow, browseListings(), BrowseListingsInput, buildDistanceSql(), clamp(), CountRow, createListing(), CreateListingInput (+21 more)

### Community 16 - "LocationMapModal.tsx"
Cohesion: 0.18
Nodes (16): Coords, LocationMapModal(), Props, styles, LocationMapPreview(), Props, styles, MapAttribution() (+8 more)

### Community 17 - "index.tsx"
Cohesion: 0.11
Nodes (27): Props, ScreenBackground(), styles, { width: W, height: H }, ZoinkFullLogo(), ZoinkFullLogoProps, useAuth(), Navigation() (+19 more)

### Community 18 - "scripts"
Cohesion: 0.11
Nodes (18): name, overrides, expo, react-native, semver, private, scripts, build:backend (+10 more)

### Community 19 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule, rootDir (+9 more)

### Community 20 - "prisma.ts"
Cohesion: 0.09
Nodes (21): AuthenticatedRequest, getBookingEvents, getDisputeDetail, listDisputes, resolveDispute, AuthenticatedRequest, createDispute, getDispute (+13 more)

### Community 21 - "validate"
Cohesion: 0.16
Nodes (18): runValidate(), runValidate(), runValidate(), submitReview, runValidate(), validReviewBody, runValidate(), errorHandler() (+10 more)

### Community 22 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 23 - "authService.ts"
Cohesion: 0.40
Nodes (9): generateOTP(), isEmailDomainAllowed(), loginUser(), registerUser(), resendOTP(), sendVerificationEmail(), sesClient, signJWT() (+1 more)

### Community 24 - "conversations.ts"
Cohesion: 0.42
Nodes (6): getConversationMessages, getMyConversations, markConversationRead, openConversation, sendMessage, SendMessageSchema

### Community 25 - "MyListingsScreen.tsx"
Cohesion: 0.24
Nodes (9): BookingRequestsScreen(), Nav, styles, MyListingsScreen(), Nav, styles, getIncomingRequests(), getMyListings() (+1 more)

### Community 26 - "BookingDetailScreen.tsx"
Cohesion: 0.25
Nodes (13): ACTIVE_DISPUTE_STATUSES, BookingDetailScreen(), DISPUTABLE_BOOKING_STATUSES, disputeActiveLabel(), disputeOutcomeLabel(), Nav, RESOLVED_DISPUTE_STATUSES, ScreenRoute (+5 more)

### Community 27 - "MainAppScreen.tsx"
Cohesion: 0.11
Nodes (18): DEFAULT_COORDS, HomeScreen(), Nav, styles, InboxScreen(), MainAppRoute, MainAppScreen(), MainTab (+10 more)

### Community 29 - "AuthContext.tsx"
Cohesion: 0.05
Nodes (50): App(), plugins, average(), Badge, BadgeTone, buildBadges(), buildTier(), formatMemberSince() (+42 more)

### Community 30 - "Zoink"
Cohesion: 0.08
Nodes (24): A peer-to-peer rental marketplace for students, Backend, Build Plan Status, Cancellation Rules, Core User Flow, Current Status, Disputes And Admin, Environment Variables (+16 more)

### Community 31 - "dependencies"
Cohesion: 0.05
Nodes (39): @aws-sdk/client-ses, dependencies, @aws-sdk/client-ses, bcryptjs, cloudinary, cors, dotenv, express (+31 more)

### Community 32 - "dependencies"
Cohesion: 0.15
Nodes (13): axios, expo, expo-secure-store, @expo/vector-icons, dependencies, axios, expo, expo-secure-store (+5 more)

### Community 33 - "auth.ts"
Cohesion: 0.27
Nodes (8): login, register, resendOTP, verifyEmail, router, LoginSchema, RegisterSchema, VerifyEmailSchema

### Community 34 - ""users""
Cohesion: 0.23
Nodes (14): "bookings", "conversations", "listing_images", "listings", "messages", "notifications", "review_obligations", "reviews" (+6 more)

### Community 35 - "VerifyEmailScreen.tsx"
Cohesion: 0.22
Nodes (7): LogoPlaceholderProps, SIZE_MAP, styles, styles, ZoinkLogo(), ZoinkLogoProps, styles

### Community 36 - "conversationsApi.ts"
Cohesion: 0.27
Nodes (10): getConversationMessages(), getMyConversations(), markConversationRead(), openConversation(), sendMessage(), mockGetConversationMessages(), mockGetMyConversations(), mockMarkConversationRead() (+2 more)

### Community 37 - "4. File-by-File Explanation"
Cohesion: 0.12
Nodes (17): 4. File-by-File Explanation, Backend Config Files, Backend Controllers, Backend Entry, Middleware, Utils, and Test Helpers, Backend Integration Tests, Backend Prisma Files, Backend Routes, Backend Script Files (+9 more)

### Community 38 - "Zoink Backend — Integration Tests"
Cohesion: 0.12
Nodes (15): 1. Postgres test database, 2. `.env.test`, 3. Network access to Stripe, Design decisions, Direct Prisma writes for mid-flow pre-conditions, Integration tests, No mocking in integration tests, Prerequisites (+7 more)

### Community 40 - "errors.ts"
Cohesion: 0.12
Nodes (16): assertScore(), average(), getPendingReviews(), recomputeUserReputation(), scoreLabelsForRole(), submitReview(), SubmitReviewInput, toDecimal() (+8 more)

### Community 42 - "ReviewPromptScreen.tsx"
Cohesion: 0.16
Nodes (16): defaultScores(), labelForKey(), Nav, promptForRole(), ReviewPromptScreen(), SCALE, ScreenRoute, styles (+8 more)

### Community 44 - "9. Main User Flows"
Cohesion: 0.14
Nodes (14): 9. Main User Flows, Account Creation, Admin / Moderation, Browsing / Searching Listings, Creating a Listing, Deposits and Payments, Disputes, Logging In (+6 more)

### Community 45 - "manageAdminRole.ts"
Cohesion: 0.44
Nodes (6): AdminRoleOutcome, findUserByEmail(), grantAdminRole(), main(), parseEmailArg(), revokeAdminRole()

### Community 46 - "conversationService.ts"
Cohesion: 0.36
Nodes (9): getConversationForParticipant(), getConversationMessages(), getMyConversations(), markConversationRead(), openConversation(), sendMessage(), toConversationSummary(), toMessage() (+1 more)

### Community 48 - "ActiveRentalScreen.tsx"
Cohesion: 0.31
Nodes (8): ActiveRentalScreen(), daysLeft(), fullName(), Nav, ScreenRoute, shortDate(), styles, BookingResponse

### Community 49 - "disputesApi.ts"
Cohesion: 0.31
Nodes (8): createDispute(), CreateDisputePayload, getDispute(), getMyDisputes(), mockCreateDispute(), mockGetDispute(), mockGetMyDisputes(), UNRESOLVED_DISPUTE_STATUSES

### Community 50 - "BookingHistoryScreen.tsx"
Cohesion: 0.39
Nodes (7): BookingHistoryScreen(), formatDateRange(), isActiveRental(), Nav, statusTone(), styles, getMyBookings()

### Community 51 - "RootStackParamList"
Cohesion: 0.17
Nodes (10): RootStackParamList, Nav, PhotoViewerScreen(), ScreenRoute, styles, Nav, PublicProfileScreen(), ScreenRoute (+2 more)

### Community 52 - "stripe.schema.ts"
Cohesion: 0.33
Nodes (5): CaptureMethodSchema, CurrencySchema, PartialCaptureBody, NOTE: capture_method is always set to 'manual' internally in, NOTE: The Stripe webhook endpoint (POST /stripe/webhook) receives a raw

### Community 53 - "Zoink Codebase Overview"
Cohesion: 0.20
Nodes (9): 13. Important Patterns, 14. Current Gaps / TODOs / Risks, 1. Project Overview, 2. Tech Stack, 3. Folder Structure, 5. Frontend Flow, 6. Backend Flow, 8. Authentication Flow (+1 more)

### Community 54 - "shared/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 56 - "metro.config.js"
Cohesion: 0.40
Nodes (4): config, { getDefaultConfig }, monorepoRoot, path

### Community 57 - "frontend/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, strict, extends, expo/tsconfig.base

### Community 58 - "frontend/package.json"
Cohesion: 0.20
Nodes (9): main, name, private, scripts, android, ios, start, web (+1 more)

### Community 59 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 61 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 62 - "Zoink — Outstanding Items Audit"
Cohesion: 0.33
Nodes (5): Output format requested, Tier 1 — Fix now (cheap, high-risk-if-left), Tier 2 — Needed before calling this launch-ready, Tier 3 — Can wait until post-launch (verify status but don't prioritize fixing), Zoink — Outstanding Items Audit

### Community 63 - "10. How Files Interact"
Cohesion: 0.40
Nodes (5): 10. How Files Interact, Backend Layering Pattern, Frontend to Backend Route Map, Global Config Impact, Reused Frontend Components

### Community 64 - "devDependencies"
Cohesion: 0.40
Nodes (5): devDependencies, @types/react, typescript, typescript, @types/react

### Community 65 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 66 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 67 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 79 - "11. Environment Variables"
Cohesion: 0.67
Nodes (3): 11. Environment Variables, Backend, Frontend

### Community 85 - "12. Scripts and Commands"
Cohesion: 0.67
Nodes (3): 12. Scripts and Commands, Backend, Frontend

### Community 88 - "15. Developer Onboarding Guide"
Cohesion: 0.67
Nodes (3): 15. Developer Onboarding Guide, Start Working on Zoink, Where to Edit Common Features

### Community 89 - "7. Database / Prisma"
Cohesion: 0.67
Nodes (3): 7. Database / Prisma, Enums, Models

## Knowledge Gaps
- **465 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+460 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BookingResponse` connect `ActiveRentalScreen.tsx` to `bookingService.ts`, `mockWeek6.ts`, `bookingsApi.ts`, `listingService.ts`, `BookingHistoryScreen.tsx`, `MyListingsScreen.tsx`, `BookingDetailScreen.tsx`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `expo` connect `expo` to `AuthContext.tsx`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `plugins` connect `AuthContext.tsx` to `expo`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _465 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bookingService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.059720869847452125 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `expo` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._