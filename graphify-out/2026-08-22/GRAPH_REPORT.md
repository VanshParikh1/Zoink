# Graph Report - Zoink  (2026-08-22)

## Corpus Check
- 189 files · ~238,120 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1348 nodes · 2713 edges · 106 communities (79 shown, 27 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c1d8b8bc`
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
- admin.ts
- BookingRequestScreen.tsx
- bookingsApi.ts
- users.ts
- listingService.ts
- CreateListingScreen.tsx
- ScreenBackground.tsx
- scripts
- compilerOptions
- prisma.ts
- validate
- What You Must Do When Invoked
- authService.ts
- conversations.ts
- dto.ts
- backend/src/index.ts
- MainAppScreen.tsx
- AuthContext.tsx
- MyProfileScreen.tsx
- Zoink
- dependencies
- dependencies
- auth.ts
- "users"
- ListingDetailScreen.tsx
- conversationsApi.ts
- 4. File-by-File Explanation
- Zoink Backend — Integration Tests
- stripeWebhookController.ts
- errors.ts
- userService.ts
- ReviewPromptScreen.tsx
- Product
- 9. Main User Flows
- manageAdminRole.ts
- conversationService.ts
- reviewController.test.ts
- reviewService.ts
- disputesApi.ts
- BookingHistoryScreen.tsx
- index.tsx
- stripe.schema.ts
- Zoink Codebase Overview
- shared/package.json
- expo-font
- metro.config.js
- frontend/tsconfig.json
- frontend/package.json
- graphify reference: extra exports and benchmark
- react
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
- expo
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
- 15. Developer Onboarding Guide
- 7. Database / Prisma
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- expo-secure-store
- expo-haptics
- expo-location
- expo-notifications
- react-native-screens
- "disputes"
- @react-navigation/native-stack

## God Nodes (most connected - your core abstractions)
1. `theme` - 38 edges
2. `useAuth()` - 31 edges
3. `RootStackParamList` - 28 edges
4. `ScreenBackground()` - 27 edges
5. `validate()` - 24 edges
6. `prisma` - 22 edges
7. `4. File-by-File Explanation` - 17 edges
8. `getTestPrisma()` - 16 edges
9. `Zoink Codebase Overview` - 16 edges
10. `createMockResponse()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `registerForPushNotificationsAsync()` --references--> `"notifications"`  [EXTRACTED]
  frontend/src/services/pushNotifications.ts → backend/prisma/migrations/20260428151800_init/migration.sql
- `BrowseListingsResult` --references--> `ListingBrowseItem`  [EXTRACTED]
  frontend/src/types/index.ts → packages/shared/src/dto.ts
- `"reports"` --references--> `"users"`  [EXTRACTED]
  backend/prisma/migrations/20260803233651_add_report/migration.sql → backend/prisma/migrations/20260428151800_init/migration.sql
- `"booking_events"` --references--> `"bookings"`  [EXTRACTED]
  backend/prisma/migrations/20260524000000_week7_payments_handoff/migration.sql → backend/prisma/migrations/20260428151800_init/migration.sql
- `buildTestApp()` --calls--> `buildLimiter()`  [EXTRACTED]
  backend/src/middleware/rateLimiter.test.ts → backend/src/middleware/rateLimiter.ts

## Import Cycles
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/HomeScreen.tsx -> frontend/src/navigation/index.tsx`
- 3-file cycle: `frontend/src/navigation/index.tsx -> frontend/src/screens/MainAppScreen.tsx -> frontend/src/screens/SearchScreen.tsx -> frontend/src/navigation/index.tsx`

## Communities (106 total, 27 thin omitted)

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
Nodes (34): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+26 more)

### Community 4 - "bookings.ts"
Cohesion: 0.12
Nodes (25): acceptBooking, activateBooking, cancelBooking, completeBooking, confirmPickup, confirmReturn, createBooking, declineBooking (+17 more)

### Community 5 - "colors.ts"
Cohesion: 0.10
Nodes (20): HardBlock(), Props, SearchBar(), styles, Props, StateCard(), styles, Tone (+12 more)

### Community 6 - "listings.ts"
Cohesion: 0.10
Nodes (28): browseListings, createListing, deleteListing, deleteListingImage, getListing, getListingCategories, getMyListings, toggleAvailability (+20 more)

### Community 7 - "listingsApi.ts"
Cohesion: 0.11
Nodes (33): HomeScreen(), SearchScreen(), browseListings(), BrowseListingsParams, createListing(), CreateListingPayload, deleteListing(), deleteListingImage() (+25 more)

### Community 8 - "types/index.ts"
Cohesion: 0.08
Nodes (37): ACTIVE_STATUSES, AdminDisputeDetailScreen(), EVENT_ACCENTS, EVENT_LABELS, EventAccent, eventAccentColor(), formatMetadataEntries(), Nav (+29 more)

### Community 9 - "rateLimiter.ts"
Cohesion: 0.31
Nodes (7): authLimiter, bearerUserId(), buildLimiter(), globalLimiter, keyByIpAndUser(), rateLimitHandler(), buildTestApp()

### Community 10 - "mockWeek6.ts"
Cohesion: 0.17
Nodes (14): demoProfile, now, publicProfiles, toDemoUser(), bookings, conversations, demoUser, disputes (+6 more)

### Community 11 - "admin.ts"
Cohesion: 0.19
Nodes (13): requireAuth(), requireVerified(), router, router, router, AdminListDisputesQuerySchema, CreateDisputeSchema, DisputeIdParamsSchema (+5 more)

### Community 12 - "BookingRequestScreen.tsx"
Cohesion: 0.19
Nodes (15): addDays(), addMonths(), BookingRequestScreen(), buildMonthDays(), CalendarDay, DAY_LABELS, formatDateLabel(), getRentalDays() (+7 more)

### Community 13 - "bookingsApi.ts"
Cohesion: 0.06
Nodes (56): ActiveRentalScreen(), daysLeft(), fullName(), Nav, ScreenRoute, shortDate(), styles, ACTIVE_DISPUTE_STATUSES (+48 more)

### Community 14 - "users.ts"
Cohesion: 0.29
Nodes (9): getMe, getPublicProfile, getStripeConnectStatus, onboardStripeConnect, updateMe, updatePushToken, uploadAvatar, upload (+1 more)

### Community 15 - "listingService.ts"
Cohesion: 0.13
Nodes (15): BrowseListingRow, browseListings(), BrowseListingsInput, buildDistanceSql(), clamp(), CountRow, createListing(), CreateListingInput (+7 more)

### Community 16 - "CreateListingScreen.tsx"
Cohesion: 0.09
Nodes (29): Coords, LocationMapModal(), Props, styles, LocationMapPreview(), Props, styles, MapAttribution() (+21 more)

### Community 17 - "ScreenBackground.tsx"
Cohesion: 0.09
Nodes (30): DismissKeyboardView(), Props, buildTexture(), Props, ScreenBackground(), styles, Tile, ZoinkFullLogo() (+22 more)

### Community 18 - "scripts"
Cohesion: 0.11
Nodes (18): name, overrides, expo, react-native, semver, private, scripts, build:backend (+10 more)

### Community 19 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule, rootDir (+9 more)

### Community 20 - "prisma.ts"
Cohesion: 0.09
Nodes (16): AuthenticatedRequest, getBookingEvents, getDisputeDetail, listDisputes, listReports, resolveDispute, resolveReport, AuthenticatedRequest (+8 more)

### Community 21 - "validate"
Cohesion: 0.30
Nodes (10): runValidate(), runValidate(), runValidate(), validListingBody, runValidate(), runValidate(), errorHandler(), validate() (+2 more)

### Community 22 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 23 - "authService.ts"
Cohesion: 0.40
Nodes (9): generateOTP(), isEmailDomainAllowed(), loginUser(), registerUser(), resendOTP(), sendVerificationEmail(), sesClient, signJWT() (+1 more)

### Community 24 - "conversations.ts"
Cohesion: 0.36
Nodes (7): getConversationMessages, getMyConversations, markConversationRead, openConversation, sendMessage, router, SendMessageSchema

### Community 25 - "dto.ts"
Cohesion: 0.14
Nodes (15): mockGetPendingReviews(), mockSubmitReview(), getPendingReviews(), submitReview(), SubmitReviewPayload, BookingListingSnapshot, BrowseListingsResult, ConversationListingSnapshot (+7 more)

### Community 26 - "backend/src/index.ts"
Cohesion: 0.17
Nodes (11): app, beforeSend(), scrubObject(), stripeWebhook, router, router, router, cleanupStaleHandoffs() (+3 more)

### Community 27 - "MainAppScreen.tsx"
Cohesion: 0.22
Nodes (8): MainAppRoute, MainAppScreen(), MainTab, ScreenProps, styles, TAB_ICONS, TAB_LABELS, TAB_ORDER

### Community 28 - "AuthContext.tsx"
Cohesion: 0.17
Nodes (7): App(), isStripePublishableKeyConfigured(), STRIPE_PUBLISHABLE_KEY, AuthContext, AuthContextType, AuthProvider(), User

### Community 29 - "MyProfileScreen.tsx"
Cohesion: 0.08
Nodes (37): plugins, average(), Badge, BadgeTone, buildBadges(), buildTier(), formatMemberSince(), ProfileCard() (+29 more)

### Community 30 - "Zoink"
Cohesion: 0.08
Nodes (24): A peer-to-peer rental marketplace for students, Backend, Build Plan Status, Cancellation Rules, Core User Flow, Current Status, Disputes And Admin, Environment Variables (+16 more)

### Community 31 - "dependencies"
Cohesion: 0.05
Nodes (41): @aws-sdk/client-ses, dependencies, @aws-sdk/client-ses, bcryptjs, cloudinary, cors, dotenv, express (+33 more)

### Community 32 - "dependencies"
Cohesion: 0.13
Nodes (15): axios, expo-blur, expo-dev-client, @expo/vector-icons, dependencies, axios, expo-blur, expo-dev-client (+7 more)

### Community 33 - "auth.ts"
Cohesion: 0.27
Nodes (8): login, register, resendOTP, verifyEmail, router, LoginSchema, RegisterSchema, VerifyEmailSchema

### Community 34 - ""users""
Cohesion: 0.19
Nodes (15): "bookings", "conversations", "listing_images", "listings", "messages", "notifications", "review_obligations", "reviews" (+7 more)

### Community 35 - "ListingDetailScreen.tsx"
Cohesion: 0.10
Nodes (19): LogoPlaceholderProps, SIZE_MAP, styles, styles, ZoinkLogo(), ZoinkLogoProps, CATEGORIES, EditListingScreen() (+11 more)

### Community 36 - "conversationsApi.ts"
Cohesion: 0.17
Nodes (14): DEMO_MODE, DEMO_TOKEN, DEMO_USER, getConversationMessages(), getMyConversations(), markConversationRead(), openConversation(), sendMessage() (+6 more)

### Community 37 - "4. File-by-File Explanation"
Cohesion: 0.12
Nodes (17): 4. File-by-File Explanation, Backend Config Files, Backend Controllers, Backend Entry, Middleware, Utils, and Test Helpers, Backend Integration Tests, Backend Prisma Files, Backend Routes, Backend Script Files (+9 more)

### Community 38 - "Zoink Backend — Integration Tests"
Cohesion: 0.12
Nodes (15): 1. Postgres test database, 2. `.env.test`, 3. Network access to Stripe, Design decisions, Direct Prisma writes for mid-flow pre-conditions, Integration tests, No mocking in integration tests, Prerequisites (+7 more)

### Community 39 - "stripeWebhookController.ts"
Cohesion: 0.21
Nodes (8): AuthenticatedRequest, createReport, getBookingId(), TODO: this doesn't distinguish a partial refund from a full one — it fires on…, StripeEvent, updateBookingFromEvent(), asyncHandler(), AsyncRequestHandler

### Community 40 - "errors.ts"
Cohesion: 0.17
Nodes (8): requireAdmin(), AppError, BadRequestError, ConflictError, ForbiddenError, InternalServerError, TooManyRequestsError, UnauthorizedError

### Community 41 - "userService.ts"
Cohesion: 0.18
Nodes (5): getPublicProfile(), toNumber(), UpdateMeInput, MyProfileResponse, PublicProfileResponse

### Community 42 - "ReviewPromptScreen.tsx"
Cohesion: 0.31
Nodes (8): defaultScores(), labelForKey(), Nav, promptForRole(), ReviewPromptScreen(), SCALE, ScreenRoute, styles

### Community 43 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 44 - "9. Main User Flows"
Cohesion: 0.14
Nodes (14): 9. Main User Flows, Account Creation, Admin / Moderation, Browsing / Searching Listings, Creating a Listing, Deposits and Payments, Disputes, Logging In (+6 more)

### Community 45 - "manageAdminRole.ts"
Cohesion: 0.44
Nodes (6): AdminRoleOutcome, findUserByEmail(), grantAdminRole(), main(), parseEmailArg(), revokeAdminRole()

### Community 46 - "conversationService.ts"
Cohesion: 0.36
Nodes (8): getConversationForParticipant(), getConversationMessages(), getMyConversations(), markConversationRead(), openConversation(), sendMessage(), toConversationSummary(), toMessage()

### Community 47 - "reviewController.test.ts"
Cohesion: 0.39
Nodes (5): getPendingReviews, submitReview, validReviewBody, router, SubmitReviewSchema

### Community 48 - "reviewService.ts"
Cohesion: 0.36
Nodes (8): assertScore(), average(), getPendingReviews(), recomputeUserReputation(), scoreLabelsForRole(), submitReview(), SubmitReviewInput, toDecimal()

### Community 49 - "disputesApi.ts"
Cohesion: 0.22
Nodes (10): api, createDispute(), CreateDisputePayload, getDispute(), getMyDisputes(), mockCreateDispute(), mockGetDispute(), mockGetMyDisputes() (+2 more)

### Community 50 - "BookingHistoryScreen.tsx"
Cohesion: 0.36
Nodes (8): BookingHistoryScreen(), formatDate(), formatDateRange(), isActiveRental(), Nav, statusTone(), styles, getMyBookings()

### Community 51 - "index.tsx"
Cohesion: 0.11
Nodes (22): useAuth(), Navigation(), Stack, ConversationThreadScreen(), InboxScreen(), LoginScreen(), Nav, PhotoViewerScreen() (+14 more)

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

### Community 60 - "react"
Cohesion: 0.67
Nodes (3): react, VerifiedAppStack(), react

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
- **498 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+493 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `expo-font`, `frontend/package.json`, `react`, `@stripe/stripe-react-native`, `expo-camera`, `expo`, `expo-image-picker`, `expo-linear-gradient`, `expo-status-bar`, `react-dom`, `expo-build-properties`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-web`, `react-native-worklets`, `react-native-zoom-toolkit`, `@react-navigation/native`, `expo-secure-store`, `expo-haptics`, `expo-location`, `expo-notifications`, `react-native-screens`, `@react-navigation/native-stack`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `dependencies`, `colors.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `VerifiedAppStack()` connect `react` to `types/index.ts`, `dto.ts`, `index.tsx`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _498 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bookingService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05939629990262902 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `expo` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._