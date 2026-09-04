# Graph Report - Zoink  (2026-08-31)

## Corpus Check
- 204 files · ~236,496 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1424 nodes · 2941 edges · 112 communities (84 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d0830a35`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- handoffService.ts
- devDependencies
- getTestPrisma
- expo
- bookings.ts
- colors.ts
- listings.ts
- listingsApi.ts
- types/index.ts
- users.ts
- bookingsApi.ts
- backend/src/index.ts
- disputeService.ts
- mockWeek6.ts
- BookingRequestScreen.tsx
- listingService.ts
- CreateListingScreen.tsx
- index.tsx
- scripts
- compilerOptions
- errors.ts
- validate
- What You Must Do When Invoked
- ReviewPromptScreen.tsx
- paymentService.ts
- BookingDetailScreen.tsx
- bookingService.ts
- MainAppScreen.tsx
- dto.ts
- AuthContext.tsx
- Zoink
- dependencies
- dependencies
- auth.ts
- "users"
- ListingDetailScreen.tsx
- conversationsApi.ts
- 4. File-by-File Explanation
- Zoink Backend — Integration Tests
- adminController.ts
- reviewsApi.ts
- conversationController.test.ts
- prisma.ts
- Product
- 9. Main User Flows
- conversationService.ts
- manageAdminRole.ts
- ScreenBackground.tsx
- reviewService.ts
- SearchScreen.tsx
- stripe.schema.ts
- Zoink Codebase Overview
- shared/package.json
- expo-font
- metro.config.js
- frontend/tsconfig.json
- frontend/package.json
- graphify reference: extra exports and benchmark
- BookingRequestsScreen.tsx
- graphify reference: query, path, explain
- axios
- 10. How Files Interact
- devDependencies
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- @stripe/stripe-react-native
- createBooking
- expo-image-picker
- expo-linear-gradient
- expo-status-bar
- react-dom
- expo-build-properties
- react-native-gesture-handler
- 11. Environment Variables
- react-native-safe-area-context
- react-native-web
- react-native-worklets
- react-native-zoom-toolkit
- @react-navigation/native
- 12. Scripts and Commands
- ActiveRentalScreen.tsx
- 7. Database / Prisma
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- expo-secure-store
- instrument.ts
- expo-location
- react-native-screens
- "disputes"
- @react-navigation/native-stack
- expo
- expo-dev-client
- @sentry/react-native

## God Nodes (most connected - your core abstractions)
1. `theme` - 41 edges
2. `getTestPrisma()` - 29 edges
3. `useAuth()` - 29 edges
4. `RootStackParamList` - 29 edges
5. `ScreenBackground()` - 28 edges
6. `validate()` - 24 edges
7. `prisma` - 22 edges
8. `futureDates()` - 18 edges
9. `4. File-by-File Explanation` - 18 edges
10. `BookingDetailScreen()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `registerForPushNotificationsAsync()` --references--> `"notifications"`  [EXTRACTED]
  frontend/src/services/pushNotifications.ts → backend/prisma/migrations/20260428151800_init/migration.sql
- `BrowseListingsResult` --references--> `ListingBrowseItem`  [EXTRACTED]
  frontend/src/types/index.ts → packages/shared/src/dto.ts
- `"reports"` --references--> `"users"`  [EXTRACTED]
  backend/prisma/migrations/20260803233651_add_report/migration.sql → backend/prisma/migrations/20260428151800_init/migration.sql
- `"booking_events"` --references--> `"bookings"`  [EXTRACTED]
  backend/prisma/migrations/20260524000000_week7_payments_handoff/migration.sql → backend/prisma/migrations/20260428151800_init/migration.sql
- `giveOwnerStripeAccount()` --calls--> `getTestPrisma()`  [EXTRACTED]
  backend/src/integration-tests/bookingFullFlow.integration.test.ts → backend/src/integration-tests/setup.ts

## Import Cycles
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/SearchScreen.tsx -> frontend/src/navigation/index.tsx`
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/HomeScreen.tsx -> frontend/src/navigation/index.tsx`

## Communities (112 total, 28 thin omitted)

### Community 0 - "handoffService.ts"
Cohesion: 0.21
Nodes (19): createBookingEvent(), createReviewObligationsForCompletedBooking(), assertParticipant(), completedStatus(), CONFIRM_WINDOW_MS, confirmHandoff(), getBooking(), getCompletedHandoffPhotos() (+11 more)

### Community 1 - "devDependencies"
Cohesion: 0.04
Nodes (47): author, description, devDependencies, nodemon, prisma, prisma-generator-typescript-interfaces, supertest, ts-node (+39 more)

### Community 2 - "getTestPrisma"
Cohesion: 0.10
Nodes (38): assertNoFeeCharged(), giveOwnerStripeAccount(), makeConfirmedBooking(), IMPORTANT: These tests call the real Stripe API for PaymentIntent creation, waitForPaymentStatus(), giveOwnerStripeAccount(), waitForPaymentStatus(), giveOwnerStripeAccount() (+30 more)

### Community 3 - "expo"
Cohesion: 0.06
Nodes (34): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+26 more)

### Community 4 - "bookings.ts"
Cohesion: 0.11
Nodes (27): acceptBooking, activateBooking, cancelBooking, completeBooking, confirmBookingPayment, confirmPickup, confirmReturn, createBooking (+19 more)

### Community 5 - "colors.ts"
Cohesion: 0.13
Nodes (20): HardBlock(), Props, PaymentNeededBadge(), Props, styles, Props, StateCard(), styles (+12 more)

### Community 6 - "listings.ts"
Cohesion: 0.10
Nodes (28): browseListings, createListing, deleteListing, deleteListingImage, getListing, getListingCategories, getMyListings, toggleAvailability (+20 more)

### Community 7 - "listingsApi.ts"
Cohesion: 0.10
Nodes (33): SearchScreen(), browseListings(), BrowseListingsParams, createListing(), CreateListingPayload, deleteListing(), deleteListingImage(), getListingCategories() (+25 more)

### Community 8 - "types/index.ts"
Cohesion: 0.09
Nodes (31): ACTIVE_STATUSES, AdminDisputeDetailScreen(), EVENT_ACCENTS, EVENT_LABELS, EventAccent, eventAccentColor(), formatMetadataEntries(), getRefundCapAmount() (+23 more)

### Community 9 - "users.ts"
Cohesion: 0.29
Nodes (9): getMe, getPublicProfile, getStripeConnectStatus, onboardStripeConnect, updateMe, updatePushToken, uploadAvatar, upload (+1 more)

### Community 10 - "bookingsApi.ts"
Cohesion: 0.17
Nodes (18): Nav, ScreenRoute, styles, ZoinkItScreen(), completeBooking(), confirmHandoff(), createBookingPaymentIntent(), getBooking() (+10 more)

### Community 11 - "backend/src/index.ts"
Cohesion: 0.10
Nodes (25): app, getPendingReviews, submitReview, requireAdmin(), requireAuth(), requireVerified(), router, router (+17 more)

### Community 12 - "disputeService.ts"
Cohesion: 0.21
Nodes (16): calculateCancellationFeeCents(), handleCancellationPayment(), releaseDueDeposits(), releaseDuePayouts(), DISPUTE_WINDOW_HOURS, formatCents(), resolveDispute(), cancelPaymentIntent() (+8 more)

### Community 13 - "mockWeek6.ts"
Cohesion: 0.09
Nodes (30): activateBooking(), confirmBookingPayment(), createBooking(), CreateBookingPayload, createDispute(), CreateDisputePayload, getDispute(), getMyDisputes() (+22 more)

### Community 14 - "BookingRequestScreen.tsx"
Cohesion: 0.19
Nodes (15): addDays(), addMonths(), BookingRequestScreen(), buildMonthDays(), CalendarDay, DAY_LABELS, formatDateLabel(), getRentalDays() (+7 more)

### Community 15 - "listingService.ts"
Cohesion: 0.07
Nodes (20): BrowseListingRow, browseListings(), BrowseListingsInput, buildDistanceSql(), clamp(), CountRow, createListing(), CreateListingInput (+12 more)

### Community 16 - "CreateListingScreen.tsx"
Cohesion: 0.09
Nodes (29): Coords, LocationMapModal(), Props, styles, LocationMapPreview(), Props, styles, MapAttribution() (+21 more)

### Community 17 - "index.tsx"
Cohesion: 0.10
Nodes (29): ZoinkFullLogo(), ZoinkFullLogoProps, useAuth(), Navigation(), RootStackParamList, Stack, DEFAULT_COORDS, HomeScreen() (+21 more)

### Community 18 - "scripts"
Cohesion: 0.11
Nodes (18): name, overrides, expo, react-native, semver, private, scripts, build:backend (+10 more)

### Community 19 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule, rootDir (+9 more)

### Community 20 - "errors.ts"
Cohesion: 0.10
Nodes (16): generateOTP(), isEmailDomainAllowed(), loginUser(), registerUser(), resendOTP(), sendVerificationEmail(), sesClient, signJWT() (+8 more)

### Community 21 - "validate"
Cohesion: 0.28
Nodes (11): runValidate(), runValidate(), runValidate(), validListingBody, runValidate(), validReviewBody, runValidate(), errorHandler() (+3 more)

### Community 22 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 23 - "ReviewPromptScreen.tsx"
Cohesion: 0.16
Nodes (15): Nav, PayScreen(), ScreenRoute, styles, defaultScores(), isBorrowerReviewer(), labelForKey(), Nav (+7 more)

### Community 24 - "paymentService.ts"
Cohesion: 0.21
Nodes (12): calculateCommission(), calculateHst(), calculateOwnerPayout(), COMMISSION_TIERS, createConnectAccountLink(), getCommissionRate(), getStripeConnectRedirectUrl(), INSURANCE_RATE (+4 more)

### Community 25 - "BookingDetailScreen.tsx"
Cohesion: 0.23
Nodes (15): ACTIVE_DISPUTE_STATUSES, BookingDetailScreen(), DISPUTABLE_BOOKING_STATUSES, disputeActiveLabel(), disputeOutcomeLabel(), Nav, ownerDepositStatusLabel(), renterDepositStatusLabel() (+7 more)

### Community 26 - "bookingService.ts"
Cohesion: 0.17
Nodes (20): allowedTransitions, assertBookingTransition(), CreateBookingInput, createPaymentIntentForBooking(), ensureNoOverlap(), ensureOwnerStripeAccount(), getBookingById(), getBookingForParticipant() (+12 more)

### Community 27 - "MainAppScreen.tsx"
Cohesion: 0.22
Nodes (8): MainAppRoute, MainAppScreen(), MainTab, ScreenProps, styles, TAB_ICONS, TAB_LABELS, TAB_ORDER

### Community 28 - "dto.ts"
Cohesion: 0.15
Nodes (14): BrowseListingsResult, BookingListingSnapshot, BrowseListingsResult, ConversationDetailResponse, ConversationInFlightBooking, ConversationListingSnapshot, ConversationMessagePreview, ConversationResponse (+6 more)

### Community 29 - "AuthContext.tsx"
Cohesion: 0.05
Nodes (51): App(), plugins, average(), Badge, BadgeTone, buildBadges(), buildTier(), formatMemberSince() (+43 more)

### Community 30 - "Zoink"
Cohesion: 0.07
Nodes (29): A peer-to-peer rental marketplace for students, Backend, Backend behavior, `backend/.env`, Backend integration tests, Booking & handoff routes, Booking Lifecycle, Build Plan Status (+21 more)

### Community 31 - "dependencies"
Cohesion: 0.05
Nodes (41): @aws-sdk/client-ses, dependencies, @aws-sdk/client-ses, bcryptjs, cloudinary, cors, dotenv, express (+33 more)

### Community 32 - "dependencies"
Cohesion: 0.13
Nodes (15): expo-blur, expo-camera, expo-haptics, expo-notifications, @expo/vector-icons, dependencies, expo-blur, expo-camera (+7 more)

### Community 33 - "auth.ts"
Cohesion: 0.15
Nodes (15): login, register, resendOTP, verifyEmail, authLimiter, bearerUserId(), buildLimiter(), globalLimiter (+7 more)

### Community 34 - ""users""
Cohesion: 0.20
Nodes (15): "bookings", "conversations", "listing_images", "listings", "messages", "notifications", "review_obligations", "reviews" (+7 more)

### Community 35 - "ListingDetailScreen.tsx"
Cohesion: 0.11
Nodes (17): LogoPlaceholderProps, SIZE_MAP, styles, styles, ZoinkLogo(), ZoinkLogoProps, CATEGORIES, EditListingScreen() (+9 more)

### Community 36 - "conversationsApi.ts"
Cohesion: 0.21
Nodes (14): ConversationThreadScreen(), getConversation(), getConversationMessages(), getMyConversations(), markConversationRead(), openConversation(), sendMessage(), mockGetConversation() (+6 more)

### Community 37 - "4. File-by-File Explanation"
Cohesion: 0.11
Nodes (18): 4. File-by-File Explanation, Backend Config Files, Backend Controllers (`backend/src/middleware/controllers/`), Backend Entry, Instrument, Middleware, Utils, Test Helpers, Backend Integration Tests (`backend/src/integration-tests/`), Backend Prisma, Backend Routes, Backend Scripts (+10 more)

### Community 38 - "Zoink Backend — Integration Tests"
Cohesion: 0.12
Nodes (15): 1. Postgres test database, 2. `.env.test`, 3. Network access to Stripe, Design decisions, Direct Prisma writes for mid-flow pre-conditions, Integration tests, No mocking in integration tests, Prerequisites (+7 more)

### Community 39 - "adminController.ts"
Cohesion: 0.09
Nodes (21): AuthenticatedRequest, getBookingEvents, getDisputeDetail, listDisputes, listReports, resolveDispute, resolveReport, AuthenticatedRequest (+13 more)

### Community 40 - "reviewsApi.ts"
Cohesion: 0.21
Nodes (10): api, mockGetPendingReviews(), mockSubmitReview(), createReport(), CreateReportPayload, getPendingReviews(), submitReview(), SubmitReviewPayload (+2 more)

### Community 41 - "conversationController.test.ts"
Cohesion: 0.40
Nodes (7): getConversationById, getConversationMessages, getMyConversations, markConversationRead, openConversation, sendMessage, SendMessageSchema

### Community 42 - "prisma.ts"
Cohesion: 0.25
Nodes (5): main(), adapter, pool, prisma, NOTE: dotenv.config() is intentionally NOT called here.

### Community 43 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 44 - "9. Main User Flows"
Cohesion: 0.18
Nodes (11): 9. Main User Flows, Admin / moderation, Creating a listing, Deposits & payouts, Disputes, Messaging, Owner accept / decline, Pickup / return handoff ("Zoink It") (+3 more)

### Community 45 - "conversationService.ts"
Cohesion: 0.35
Nodes (10): getConversationById(), getConversationForParticipant(), getConversationMessages(), getMyConversations(), IN_FLIGHT_BOOKING_STATUSES, markConversationRead(), openConversation(), sendMessage() (+2 more)

### Community 46 - "manageAdminRole.ts"
Cohesion: 0.44
Nodes (6): AdminRoleOutcome, findUserByEmail(), grantAdminRole(), main(), parseEmailArg(), revokeAdminRole()

### Community 47 - "ScreenBackground.tsx"
Cohesion: 0.11
Nodes (21): DismissKeyboardView(), Props, buildTexture(), Props, ScreenBackground(), styles, Tile, Nav (+13 more)

### Community 48 - "reviewService.ts"
Cohesion: 0.18
Nodes (18): createNotification(), getExpoAccessToken(), isExpoPushToken(), NotifyInput, notifyUser(), sendDirectPush(), sendExpoPush(), assertItemRating() (+10 more)

### Community 49 - "SearchScreen.tsx"
Cohesion: 0.12
Nodes (12): react, Props, RatingPill(), styles, SearchBar(), styles, VerifiedAppStack(), CATEGORIES (+4 more)

### Community 52 - "stripe.schema.ts"
Cohesion: 0.33
Nodes (5): CaptureMethodSchema, CurrencySchema, PartialCaptureBody, NOTE: capture_method is always set to 'manual' internally in, NOTE: The Stripe webhook endpoint (POST /stripe/webhook) receives a raw

### Community 53 - "Zoink Codebase Overview"
Cohesion: 0.15
Nodes (12): 13. Important Patterns, 14. Current Gaps / TODOs / Risks, 15. Developer Onboarding Guide, 1. Project Overview, 2. Tech Stack, 3. Folder Structure, 5. Frontend Flow, 6. Backend Flow (+4 more)

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

### Community 60 - "BookingRequestsScreen.tsx"
Cohesion: 0.14
Nodes (21): BookingHistoryScreen(), formatDate(), formatDateRange(), Nav, statusTone(), styles, BookingRequestsScreen(), formatDate() (+13 more)

### Community 61 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 63 - "10. How Files Interact"
Cohesion: 0.40
Nodes (5): 10. How Files Interact, Backend layering, Frontend → Backend route map, Global config impact, Reused frontend components

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

### Community 72 - "createBooking"
Cohesion: 0.42
Nodes (7): createBooking(), ensureValidBookingDates(), getRentalDays(), MAX_RENTAL_DAYS, roundCurrency(), calculateInsuranceFee(), toDecimal()

### Community 79 - "11. Environment Variables"
Cohesion: 0.67
Nodes (3): 11. Environment Variables, Backend, Frontend

### Community 85 - "12. Scripts and Commands"
Cohesion: 0.50
Nodes (4): 12. Scripts and Commands, Backend, Frontend, Root

### Community 88 - "ActiveRentalScreen.tsx"
Cohesion: 0.31
Nodes (8): ActiveRentalScreen(), daysLeft(), fullName(), Nav, ScreenRoute, shortDate(), styles, UserSummary

### Community 89 - "7. Database / Prisma"
Cohesion: 0.67
Nodes (3): 7. Database / Prisma, Enums, Models

## Knowledge Gaps
- **506 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+501 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `SearchScreen.tsx`, `expo-font`, `frontend/package.json`, `axios`, `@stripe/stripe-react-native`, `expo-image-picker`, `expo-linear-gradient`, `expo-status-bar`, `react-dom`, `expo-build-properties`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-web`, `react-native-worklets`, `react-native-zoom-toolkit`, `@react-navigation/native`, `expo-secure-store`, `expo-location`, `react-native-screens`, `@react-navigation/native-stack`, `expo`, `expo-dev-client`, `@sentry/react-native`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `react` connect `SearchScreen.tsx` to `dependencies`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `BookingResponse` connect `BookingRequestsScreen.tsx` to `bookingsApi.ts`, `mockWeek6.ts`, `ReviewPromptScreen.tsx`, `ActiveRentalScreen.tsx`, `BookingDetailScreen.tsx`, `bookingService.ts`, `dto.ts`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _506 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `getTestPrisma` be split into smaller, more focused modules?**
  _Cohesion score 0.09921355111917725 - nodes in this community are weakly interconnected._
- **Should `expo` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._