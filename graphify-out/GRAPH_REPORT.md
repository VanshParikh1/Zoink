# Graph Report - Zoink  (2026-09-01)

## Corpus Check
- 210 files · ~221,607 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1453 nodes · 3020 edges · 117 communities (86 shown, 31 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3d1cfec8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- mockWeek6.ts
- devDependencies
- getTestPrisma
- expo
- bookings.ts
- colors.ts
- listings.ts
- listingsApi.ts
- types/index.ts
- paymentService.ts
- 20260901124106_add_processed_stripe_event/migration.sql
- backend/src/index.ts
- bookingService.ts
- bookingsApi.ts
- BookingRequestScreen.tsx
- listingService.ts
- CreateListingScreen.tsx
- ActiveRentalScreen.tsx
- scripts
- compilerOptions
- prisma.ts
- validate
- What You Must Do When Invoked
- ReviewPromptScreen.tsx
- ProfileCard.tsx
- handoffService.ts
- AuthContext.tsx
- index.tsx
- dto.ts
- MyProfileScreen.tsx
- Zoink
- dependencies
- dependencies
- auth.ts
- "users"
- ListingDetailScreen.tsx
- users.ts
- 4. File-by-File Explanation
- Zoink Backend — Integration Tests
- disputeController.ts
- reviewsApi.ts
- conversationController.test.ts
- usersApi.ts
- Product
- 9. Main User Flows
- reviewService.ts
- manageAdminRole.ts
- ScreenBackground.tsx
- errors.ts
- conversationService.ts
- stripe.schema.ts
- Zoink Codebase Overview
- shared/package.json
- admin.ts
- metro.config.js
- frontend/tsconfig.json
- frontend/package.json
- graphify reference: extra exports and benchmark
- conversationsApi.ts
- graphify reference: query, path, explain
- rateLimiter.ts
- 10. How Files Interact
- devDependencies
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- @stripe/stripe-react-native
- axios
- expo-image-picker
- expo-linear-gradient
- expo-status-bar
- pushNotifications.ts
- instrument.ts
- expo-blur
- 11. Environment Variables
- react-native-web
- react-native-worklets
- react-native-zoom-toolkit
- @react-navigation/native
- 12. Scripts and Commands
- expo-font
- 7. Database / Prisma
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- expo-secure-store
- react-native-gesture-handler
- react-native-reanimated
- react-native-screens
- "disputes"
- @react-navigation/native-stack
- react-native-svg
- expo-dev-client
- @sentry/react-native
- expo-haptics
- expo-notifications
- @expo/vector-icons
- svg.d.ts

## God Nodes (most connected - your core abstractions)
1. `theme` - 42 edges
2. `useAuth()` - 31 edges
3. `RootStackParamList` - 30 edges
4. `getTestPrisma()` - 29 edges
5. `ScreenBackground()` - 29 edges
6. `validate()` - 25 edges
7. `prisma` - 23 edges
8. `futureDates()` - 18 edges
9. `notifyUser()` - 18 edges
10. `4. File-by-File Explanation` - 18 edges

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
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/HomeScreen.tsx -> frontend/src/navigation/index.tsx`
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/SearchScreen.tsx -> frontend/src/navigation/index.tsx`

## Communities (117 total, 31 thin omitted)

### Community 0 - "mockWeek6.ts"
Cohesion: 0.13
Nodes (21): createBooking(), createDispute(), CreateDisputePayload, getDispute(), getMyDisputes(), bookings, conversations, demoUser (+13 more)

### Community 1 - "devDependencies"
Cohesion: 0.04
Nodes (47): author, description, devDependencies, nodemon, prisma, prisma-generator-typescript-interfaces, supertest, ts-node (+39 more)

### Community 2 - "getTestPrisma"
Cohesion: 0.10
Nodes (38): assertNoFeeCharged(), giveOwnerStripeAccount(), makeConfirmedBooking(), IMPORTANT: These tests call the real Stripe API for PaymentIntent creation, waitForPaymentStatus(), giveOwnerStripeAccount(), waitForPaymentStatus(), giveOwnerStripeAccount() (+30 more)

### Community 3 - "expo"
Cohesion: 0.06
Nodes (35): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled, softwareKeyboardLayoutMode, projectId (+27 more)

### Community 4 - "bookings.ts"
Cohesion: 0.12
Nodes (27): acceptBooking, activateBooking, cancelBooking, completeBooking, confirmBookingPayment, confirmPickup, confirmReturn, createBooking (+19 more)

### Community 5 - "colors.ts"
Cohesion: 0.07
Nodes (35): react, HardBlock(), Props, PaymentNeededBadge(), Props, styles, Props, RatingPill() (+27 more)

### Community 6 - "listings.ts"
Cohesion: 0.09
Nodes (29): browseListings, createListing, deleteListing, deleteListingImage, getListing, getListingCategories, getMyListings, validListingBody (+21 more)

### Community 7 - "listingsApi.ts"
Cohesion: 0.11
Nodes (33): SearchScreen(), browseListings(), BrowseListingsParams, createListing(), CreateListingPayload, deleteListing(), deleteListingImage(), getListingCategories() (+25 more)

### Community 8 - "types/index.ts"
Cohesion: 0.09
Nodes (31): ACTIVE_STATUSES, AdminDisputeDetailScreen(), EVENT_ACCENTS, EVENT_LABELS, EventAccent, eventAccentColor(), formatMetadataEntries(), getRefundCapAmount() (+23 more)

### Community 9 - "paymentService.ts"
Cohesion: 0.15
Nodes (24): calculateCancellationFeeCents(), handleCancellationPayment(), releaseDuePayouts(), DISPUTE_WINDOW_HOURS, formatCents(), resolveDispute(), cancelPaymentIntent(), capturePaymentIntent() (+16 more)

### Community 11 - "backend/src/index.ts"
Cohesion: 0.18
Nodes (12): app, requireAuth(), requireVerified(), router, router, router, router, router (+4 more)

### Community 12 - "bookingService.ts"
Cohesion: 0.13
Nodes (30): allowedTransitions, assertBookingTransition(), createBooking(), createBookingEvent(), CreateBookingInput, createPaymentIntentForBooking(), ensureNoOverlap(), ensureOwnerStripeAccount() (+22 more)

### Community 13 - "bookingsApi.ts"
Cohesion: 0.07
Nodes (53): ACTIVE_DISPUTE_STATUSES, BookingDetailScreen(), DISPUTABLE_BOOKING_STATUSES, disputeActiveLabel(), disputeOutcomeLabel(), Nav, ownerDepositStatusLabel(), renterDepositStatusLabel() (+45 more)

### Community 14 - "BookingRequestScreen.tsx"
Cohesion: 0.19
Nodes (15): addDays(), addMonths(), BookingRequestScreen(), buildMonthDays(), CalendarDay, DAY_LABELS, formatDateLabel(), getRentalDays() (+7 more)

### Community 15 - "listingService.ts"
Cohesion: 0.13
Nodes (15): BrowseListingRow, browseListings(), BrowseListingsInput, buildDistanceSql(), clamp(), CountRow, createListing(), CreateListingInput (+7 more)

### Community 16 - "CreateListingScreen.tsx"
Cohesion: 0.11
Nodes (25): Coords, LocationMapModal(), Props, styles, LocationMapPreview(), Props, styles, MapAttribution() (+17 more)

### Community 17 - "ActiveRentalScreen.tsx"
Cohesion: 0.20
Nodes (12): ActiveRentalScreen(), daysLeft(), fullName(), Nav, ScreenRoute, shortDate(), styles, Nav (+4 more)

### Community 18 - "scripts"
Cohesion: 0.11
Nodes (18): name, overrides, expo, react-native, semver, private, scripts, build:backend (+10 more)

### Community 19 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule, rootDir (+9 more)

### Community 20 - "prisma.ts"
Cohesion: 0.08
Nodes (18): AuthenticatedRequest, getBookingEvents, getDisputeDetail, listDisputes, listReports, resolveDispute, resolveReport, getBookingId() (+10 more)

### Community 21 - "validate"
Cohesion: 0.30
Nodes (11): runValidate(), runValidate(), runValidate(), runValidate(), validReviewBody, runPrefsValidate(), runValidate(), errorHandler() (+3 more)

### Community 22 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 23 - "ReviewPromptScreen.tsx"
Cohesion: 0.16
Nodes (15): Nav, PayScreen(), ScreenRoute, styles, defaultScores(), isBorrowerReviewer(), labelForKey(), Nav (+7 more)

### Community 24 - "ProfileCard.tsx"
Cohesion: 0.21
Nodes (13): average(), Badge, BadgeTone, buildBadges(), buildTier(), formatMemberSince(), ProfileCard(), ProfileCardProps (+5 more)

### Community 25 - "handoffService.ts"
Cohesion: 0.19
Nodes (19): main(), createReviewObligationsForCompletedBooking(), assertHandoffParticipant(), assertParticipant(), completedStatus(), CONFIRM_WINDOW_MS, confirmHandoff(), getBooking() (+11 more)

### Community 26 - "AuthContext.tsx"
Cohesion: 0.17
Nodes (7): App(), isStripePublishableKeyConfigured(), STRIPE_PUBLISHABLE_KEY, AuthContext, AuthContextType, AuthProvider(), User

### Community 27 - "index.tsx"
Cohesion: 0.09
Nodes (32): ZoinkFullLogo(), ZoinkFullLogoProps, useAuth(), Navigation(), RootStackParamList, Stack, DEFAULT_COORDS, HomeScreen() (+24 more)

### Community 28 - "dto.ts"
Cohesion: 0.15
Nodes (13): BookingListingSnapshot, BrowseListingsResult, ConversationDetailResponse, ConversationInFlightBooking, ConversationListingSnapshot, ConversationMessagePreview, ConversationResponse, ListingImageSummary (+5 more)

### Community 29 - "MyProfileScreen.tsx"
Cohesion: 0.13
Nodes (15): MainAppRoute, MainAppScreen(), MainTab, ScreenProps, styles, TAB_ICONS, TAB_LABELS, TAB_ORDER (+7 more)

### Community 30 - "Zoink"
Cohesion: 0.07
Nodes (29): A peer-to-peer rental marketplace for students, Backend, Backend behavior, `backend/.env`, Backend integration tests, Booking & handoff routes, Booking Lifecycle, Build Plan Status (+21 more)

### Community 31 - "dependencies"
Cohesion: 0.05
Nodes (39): @aws-sdk/client-ses, dependencies, @aws-sdk/client-ses, bcryptjs, cloudinary, cors, dotenv, express (+31 more)

### Community 32 - "dependencies"
Cohesion: 0.13
Nodes (15): expo, expo-build-properties, expo-camera, expo-location, dependencies, expo, expo-build-properties, expo-camera (+7 more)

### Community 33 - "auth.ts"
Cohesion: 0.27
Nodes (8): login, register, resendOTP, verifyEmail, router, LoginSchema, RegisterSchema, VerifyEmailSchema

### Community 34 - ""users""
Cohesion: 0.20
Nodes (15): "bookings", "conversations", "listing_images", "listings", "messages", "notifications", "review_obligations", "reviews" (+7 more)

### Community 35 - "ListingDetailScreen.tsx"
Cohesion: 0.16
Nodes (11): ButtonVariant, styles, ZoinkButton(), ZoinkButtonProps, Nav, Route, styles, { width: SCREEN_WIDTH } (+3 more)

### Community 36 - "users.ts"
Cohesion: 0.27
Nodes (12): deleteMe, getMe, getPublicProfile, getStripeConnectStatus, onboardStripeConnect, updateMe, updateNotificationPrefs, updatePushToken (+4 more)

### Community 37 - "4. File-by-File Explanation"
Cohesion: 0.11
Nodes (18): 4. File-by-File Explanation, Backend Config Files, Backend Controllers (`backend/src/middleware/controllers/`), Backend Entry, Instrument, Middleware, Utils, Test Helpers, Backend Integration Tests (`backend/src/integration-tests/`), Backend Prisma, Backend Routes, Backend Scripts (+10 more)

### Community 38 - "Zoink Backend — Integration Tests"
Cohesion: 0.12
Nodes (15): 1. Postgres test database, 2. `.env.test`, 3. Network access to Stripe, Design decisions, Direct Prisma writes for mid-flow pre-conditions, Integration tests, No mocking in integration tests, Prerequisites (+7 more)

### Community 39 - "disputeController.ts"
Cohesion: 0.15
Nodes (12): AuthenticatedRequest, createDispute, DisputeRow, getDispute, getMyDisputes, toDisputeResponse(), AuthenticatedRequest, createReport (+4 more)

### Community 40 - "reviewsApi.ts"
Cohesion: 0.21
Nodes (10): api, mockGetPendingReviews(), mockSubmitReview(), createReport(), CreateReportPayload, getPendingReviews(), submitReview(), SubmitReviewPayload (+2 more)

### Community 41 - "conversationController.test.ts"
Cohesion: 0.40
Nodes (7): getConversationById, getConversationMessages, getMyConversations, markConversationRead, openConversation, sendMessage, SendMessageSchema

### Community 42 - "usersApi.ts"
Cohesion: 0.11
Nodes (25): DEMO_MODE, DEMO_TOKEN, DEMO_USER, uploadHandoffPhotoImage(), demoProfile, mockDeleteMyAccount(), mockGetMyProfile(), mockGetPublicProfile() (+17 more)

### Community 43 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 44 - "9. Main User Flows"
Cohesion: 0.18
Nodes (11): 9. Main User Flows, Admin / moderation, Creating a listing, Deposits & payouts, Disputes, Messaging, Owner accept / decline, Pickup / return handoff ("Zoink It") (+3 more)

### Community 45 - "reviewService.ts"
Cohesion: 0.13
Nodes (22): releaseDueDeposits(), createNotification(), getExpoAccessToken(), isExpoPushToken(), NotificationPrefs, NotifyInput, notifyUser(), PREF_COLUMN_BY_TYPE (+14 more)

### Community 46 - "manageAdminRole.ts"
Cohesion: 0.44
Nodes (6): AdminRoleOutcome, findUserByEmail(), grantAdminRole(), main(), parseEmailArg(), revokeAdminRole()

### Community 47 - "ScreenBackground.tsx"
Cohesion: 0.07
Nodes (32): DismissKeyboardView(), Props, LogoPlaceholderProps, SIZE_MAP, styles, buildTexture(), Props, ScreenBackground() (+24 more)

### Community 48 - "errors.ts"
Cohesion: 0.13
Nodes (17): generateOTP(), isEmailDomainAllowed(), loginUser(), registerUser(), resendOTP(), sendVerificationEmail(), sesClient, signJWT() (+9 more)

### Community 49 - "conversationService.ts"
Cohesion: 0.10
Nodes (19): getConversationById(), getConversationForParticipant(), getConversationMessages(), getMyConversations(), IN_FLIGHT_BOOKING_STATUSES, markConversationRead(), openConversation(), sendMessage() (+11 more)

### Community 52 - "stripe.schema.ts"
Cohesion: 0.33
Nodes (5): CaptureMethodSchema, CurrencySchema, PartialCaptureBody, NOTE: capture_method is always set to 'manual' internally in, NOTE: The Stripe webhook endpoint (POST /stripe/webhook) receives a raw

### Community 53 - "Zoink Codebase Overview"
Cohesion: 0.15
Nodes (12): 13. Important Patterns, 14. Current Gaps / TODOs / Risks, 15. Developer Onboarding Guide, 1. Project Overview, 2. Tech Stack, 3. Folder Structure, 5. Frontend Flow, 6. Backend Flow (+4 more)

### Community 54 - "shared/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 55 - "admin.ts"
Cohesion: 0.22
Nodes (10): requireAdmin(), router, AdminListDisputesQuerySchema, CreateDisputeSchema, DisputeIdParamsSchema, ResolveDisputeSchema, AdminListReportsQuerySchema, CreateReportSchema (+2 more)

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

### Community 60 - "conversationsApi.ts"
Cohesion: 0.23
Nodes (13): ConversationThreadScreen(), getConversation(), getConversationMessages(), getMyConversations(), markConversationRead(), openConversation(), sendMessage(), mockGetConversation() (+5 more)

### Community 61 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 62 - "rateLimiter.ts"
Cohesion: 0.31
Nodes (7): authLimiter, bearerUserId(), buildLimiter(), globalLimiter, keyByIpAndUser(), rateLimitHandler(), buildTestApp()

### Community 63 - "10. How Files Interact"
Cohesion: 0.40
Nodes (5): 10. How Files Interact, Backend layering, Frontend → Backend route map, Global config impact, Reused frontend components

### Community 64 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, react-native-svg-transformer, @types/react, typescript, typescript, react-native-svg-transformer, @types/react

### Community 65 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 66 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 67 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 76 - "pushNotifications.ts"
Cohesion: 0.60
Nodes (5): clearPushToken(), getProjectId(), registerForPushNotificationsAsync(), syncPushToken(), updateMyPushToken()

### Community 79 - "11. Environment Variables"
Cohesion: 0.67
Nodes (3): 11. Environment Variables, Backend, Frontend

### Community 85 - "12. Scripts and Commands"
Cohesion: 0.50
Nodes (4): 12. Scripts and Commands, Backend, Frontend, Root

### Community 89 - "7. Database / Prisma"
Cohesion: 0.67
Nodes (3): 7. Database / Prisma, Enums, Models

## Knowledge Gaps
- **514 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+509 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `colors.ts`, `frontend/package.json`, `@stripe/stripe-react-native`, `axios`, `expo-image-picker`, `expo-linear-gradient`, `expo-status-bar`, `expo-blur`, `react-native-web`, `react-native-worklets`, `react-native-zoom-toolkit`, `@react-navigation/native`, `expo-font`, `expo-secure-store`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-screens`, `@react-navigation/native-stack`, `react-native-svg`, `expo-dev-client`, `@sentry/react-native`, `expo-haptics`, `expo-notifications`, `@expo/vector-icons`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `react` connect `colors.ts` to `dependencies`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `VerifiedAppStack()` connect `colors.ts` to `reviewsApi.ts`, `types/index.ts`, `index.tsx`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _514 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `mockWeek6.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13043478260869565 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `getTestPrisma` be split into smaller, more focused modules?**
  _Cohesion score 0.09921355111917725 - nodes in this community are weakly interconnected._