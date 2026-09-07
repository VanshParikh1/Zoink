# Graph Report - Zoink  (2026-09-07)

## Corpus Check
- 232 files · ~247,987 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1696 nodes · 3361 edges · 149 communities (109 shown, 40 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cf9540b7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- mockWeek6.ts
- devDependencies
- getTestPrisma
- expo
- bookings.ts
- EditListingScreen.tsx
- listings.ts
- listingsApi.ts
- types/index.ts
- BookingRequestsScreen.tsx
- 20260901124106_add_processed_stripe_event/migration.sql
- backend/src/index.ts
- bookingService.ts
- bookingsApi.ts
- colors.ts
- listingService.ts
- LocationMapModal.tsx
- userService.ts
- scripts
- compilerOptions
- prisma.ts
- handoffService.ts
- What You Must Do When Invoked
- PayScreen.tsx
- ProfileCard.tsx
- B. Code changes the docs now depend on
- AuthContext.tsx
- ScreenBackground.tsx
- BookingRequestScreen.tsx
- paymentService.ts
- Zoink
- dependencies
- dependencies
- B. Code changes the docs now depend on
- "users"
- Zoink — Terms of Service
- users.ts
- 4. File-by-File Explanation
- Zoink Backend — Integration Tests
- backend/package.json
- disputesApi.ts
- instrument.ts
- usersApi.ts
- Product
- 9. Main User Flows
- reviewService.ts
- manageAdminRole.ts
- index.tsx
- errors.ts
- authController.test.ts
- stripe.schema.ts
- Zoink Codebase Overview
- shared/package.json
- Zoink — Terms of Service
- metro.config.js
- frontend/tsconfig.json
- frontend/package.json
- graphify reference: extra exports and benchmark
- RootStackParamList
- graphify reference: query, path, explain
- notificationService.ts
- 10. How Files Interact
- devDependencies
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- @stripe/stripe-react-native
- conversationController.test.ts
- expo-image-picker
- expo-linear-gradient
- expo-status-bar
- ConversationThreadScreen.tsx
- scripts
- BackButton.tsx
- 11. Environment Variables
- Zoink — Privacy Policy
- react-native-web
- react-native-worklets
- react-native-zoom-toolkit
- @react-navigation/native
- 12. Scripts and Commands
- dto.ts
- 7. Database / Prisma
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- expo-secure-store
- pg
- cleanupJob.ts
- react-native-screens
- "disputes"
- Zoink — Privacy Policy
- rateLimiter.ts
- expo-build-properties
- @sentry/react-native
- Implementation prompt — terms acceptance gate
- Implementation prompt — terms acceptance gate
- conversationService.ts
- deploy
- 10. Money: prices, fees, taxes, and payouts
- expo-haptics
- expo-notifications
- @expo/vector-icons
- 10. Money: prices, fees, taxes, and payouts
- syncLegal.ts
- svg.d.ts
- 2. What we collect
- 2. What we collect
- 5. Listing an item (Owners)
- expo-camera
- 5. Listing an item (Owners)
- expo-location
- react-native
- disputeService.ts
- createBooking
- @react-navigation/native-stack
- helmet
- bcryptjs
- cloudinary
- expo-blur
- expo-font
- multer
- zod
- react-native-reanimated
- react-native-svg

## God Nodes (most connected - your core abstractions)
1. `theme` - 44 edges
2. `useAuth()` - 31 edges
3. `ScreenBackground()` - 30 edges
4. `RootStackParamList` - 30 edges
5. `getTestPrisma()` - 29 edges
6. `validate()` - 25 edges
7. `prisma` - 24 edges
8. `Zoink — Terms of Service` - 22 edges
9. `Zoink — Terms of Service` - 22 edges
10. `BackButton()` - 19 edges

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

## Communities (149 total, 40 thin omitted)

### Community 0 - "mockWeek6.ts"
Cohesion: 0.10
Nodes (32): ConversationThreadScreen(), createBooking(), getConversation(), getConversationMessages(), markConversationRead(), openConversation(), sendMessage(), bookings (+24 more)

### Community 1 - "devDependencies"
Cohesion: 0.07
Nodes (29): devDependencies, nodemon, prisma, prisma-generator-typescript-interfaces, supertest, ts-node, @types/bcryptjs, @types/cors (+21 more)

### Community 2 - "getTestPrisma"
Cohesion: 0.10
Nodes (39): assertNoFeeCharged(), giveOwnerStripeAccount(), makeConfirmedBooking(), IMPORTANT: These tests call the real Stripe API for PaymentIntent creation, waitForPaymentStatus(), giveOwnerStripeAccount(), waitForPaymentStatus(), giveOwnerStripeAccount() (+31 more)

### Community 3 - "expo"
Cohesion: 0.06
Nodes (31): backgroundColor, foregroundImage, adaptiveIcon, googleServicesFile, package, predictiveBackGestureEnabled, softwareKeyboardLayoutMode, projectId (+23 more)

### Community 4 - "bookings.ts"
Cohesion: 0.11
Nodes (27): acceptBooking, activateBooking, cancelBooking, completeBooking, confirmBookingPayment, confirmPickup, confirmReturn, createBooking (+19 more)

### Community 5 - "EditListingScreen.tsx"
Cohesion: 0.07
Nodes (28): DismissKeyboardView(), Props, LogoPlaceholderProps, SIZE_MAP, styles, styles, ZoinkLogo(), ZoinkLogoProps (+20 more)

### Community 6 - "listings.ts"
Cohesion: 0.10
Nodes (29): browseListings, createListing, deleteListing, deleteListingImage, getListing, getListingCategories, getMyListings, toggleAvailability (+21 more)

### Community 7 - "listingsApi.ts"
Cohesion: 0.10
Nodes (34): SearchScreen(), browseListings(), BrowseListingsParams, createListing(), CreateListingPayload, deleteListing(), deleteListingImage(), getListing() (+26 more)

### Community 8 - "types/index.ts"
Cohesion: 0.10
Nodes (30): ACTIVE_STATUSES, AdminDisputeDetailScreen(), EVENT_ACCENTS, EVENT_LABELS, EventAccent, eventAccentColor(), formatMetadataEntries(), getRefundCapAmount() (+22 more)

### Community 9 - "BookingRequestsScreen.tsx"
Cohesion: 0.18
Nodes (17): BookingHistoryScreen(), formatDate(), formatDateRange(), Nav, statusTone(), styles, BookingRequestsScreen(), formatDate() (+9 more)

### Community 11 - "backend/src/index.ts"
Cohesion: 0.13
Nodes (19): app, getPendingReviews, submitReview, requireAuth(), requireVerified(), router, router, router (+11 more)

### Community 12 - "bookingService.ts"
Cohesion: 0.16
Nodes (22): allowedTransitions, assertBookingTransition(), CreateBookingInput, createPaymentIntentForBooking(), ensureNoOverlap(), ensureOwnerStripeAccount(), getBookingById(), getBookingForParticipant() (+14 more)

### Community 13 - "bookingsApi.ts"
Cohesion: 0.11
Nodes (35): ACTIVE_DISPUTE_STATUSES, BookingDetailScreen(), DISPUTABLE_BOOKING_STATUSES, disputeActiveLabel(), disputeOutcomeLabel(), Nav, ownerDepositStatusLabel(), renterDepositStatusLabel() (+27 more)

### Community 14 - "colors.ts"
Cohesion: 0.07
Nodes (31): LocationMapPreview(), Props, styles, Props, RatingPill(), styles, SearchBar(), styles (+23 more)

### Community 15 - "listingService.ts"
Cohesion: 0.13
Nodes (17): assertNoProhibitedContent(), BrowseListingRow, browseListings(), BrowseListingsInput, buildDistanceSql(), clamp(), CountRow, createListing() (+9 more)

### Community 16 - "LocationMapModal.tsx"
Cohesion: 0.21
Nodes (13): Coords, LocationMapModal(), Props, styles, MapAttribution(), styles, buildTileGrid(), MapTile (+5 more)

### Community 17 - "userService.ts"
Cohesion: 0.12
Nodes (18): CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, generateOTP(), loginUser(), registerUser(), resendOTP(), sendVerificationEmail(), sesClient (+10 more)

### Community 18 - "scripts"
Cohesion: 0.10
Nodes (19): name, overrides, expo, react-native, semver, private, scripts, build:backend (+11 more)

### Community 19 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, outDir, resolveJsonModule, rootDir (+9 more)

### Community 20 - "prisma.ts"
Cohesion: 0.06
Nodes (28): AuthenticatedRequest, getBookingEvents, getDisputeDetail, listDisputes, listReports, resolveDispute, resolveReport, AuthenticatedRequest (+20 more)

### Community 21 - "handoffService.ts"
Cohesion: 0.18
Nodes (20): main(), createBookingEvent(), createReviewObligationsForCompletedBooking(), assertHandoffParticipant(), assertParticipant(), completedStatus(), CONFIRM_WINDOW_MS, confirmHandoff() (+12 more)

### Community 22 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 23 - "PayScreen.tsx"
Cohesion: 0.16
Nodes (15): Nav, PayScreen(), ScreenRoute, styles, defaultScores(), isBorrowerReviewer(), labelForKey(), Nav (+7 more)

### Community 24 - "ProfileCard.tsx"
Cohesion: 0.21
Nodes (13): average(), Badge, BadgeTone, buildBadges(), buildTier(), formatMemberSince(), ProfileCard(), ProfileCardProps (+5 more)

### Community 25 - "B. Code changes the docs now depend on"
Cohesion: 0.10
Nodes (20): A. Blanks to fill (search for `{{` in both files), B1. Kill the insurance path before launch — highest priority, B2. Make sure the ID upload path isn't reachable, B3. Student email — mostly built, one gap, B4. Record terms acceptance — spec written, B5. `RECORD_AUDIO` in `app.json`, B6. Prohibited items aren't enforced, B7. Build the cancellation policy you chose (+12 more)

### Community 26 - "AuthContext.tsx"
Cohesion: 0.06
Nodes (30): App(), plugins, isStripePublishableKeyConfigured(), STRIPE_PUBLISHABLE_KEY, AuthContext, AuthContextType, AuthProvider(), User (+22 more)

### Community 27 - "ScreenBackground.tsx"
Cohesion: 0.13
Nodes (17): buildTexture(), Props, ScreenBackground(), styles, Tile, ZoinkFullLogo(), ZoinkFullLogoProps, DEFAULT_COORDS (+9 more)

### Community 28 - "BookingRequestScreen.tsx"
Cohesion: 0.19
Nodes (15): addDays(), addMonths(), BookingRequestScreen(), buildMonthDays(), CalendarDay, DAY_LABELS, formatDateLabel(), getRentalDays() (+7 more)

### Community 29 - "paymentService.ts"
Cohesion: 0.23
Nodes (12): calculateCommission(), calculateOwnerPayout(), COMMISSION_TIERS, createConnectAccountLink(), getCommissionRate(), getMockAuthorizedPaymentStatus(), getStripeConnectRedirectUrl(), INSURANCE_RATE (+4 more)

### Community 30 - "Zoink"
Cohesion: 0.07
Nodes (29): A peer-to-peer rental marketplace for students, Backend, Backend behavior, `backend/.env`, Backend integration tests, Booking & handoff routes, Booking Lifecycle, Build Plan Status (+21 more)

### Community 31 - "dependencies"
Cohesion: 0.07
Nodes (27): @aws-sdk/client-ses, dependencies, @aws-sdk/client-ses, cors, dotenv, express, express-rate-limit, jsonwebtoken (+19 more)

### Community 32 - "dependencies"
Cohesion: 0.13
Nodes (15): axios, expo, expo-dev-client, dependencies, axios, expo, expo-dev-client, react (+7 more)

### Community 33 - "B. Code changes the docs now depend on"
Cohesion: 0.09
Nodes (22): A. Blanks to fill (search for `{{` in both files), B1. ✅ Kill the insurance path before launch — highest priority (done 2026-09-07), B2. ✅ Make sure the ID upload path isn't reachable (confirmed done — no upload route exists in `users.ts`/`userController.ts`), B3 (original). Student email — mostly built, one gap, B3. ✅ Student email — resolved by a different route than this doc assumed, B4 (original). Record terms acceptance — spec written, B4. ✅ Record terms acceptance — done (2026-09-04/05), B5. ✅ `RECORD_AUDIO` in `app.json` — removed (2026-09-07) (+14 more)

### Community 34 - ""users""
Cohesion: 0.20
Nodes (15): "bookings", "conversations", "listing_images", "listings", "messages", "notifications", "review_obligations", "reviews" (+7 more)

### Community 35 - "Zoink — Terms of Service"
Cohesion: 0.10
Nodes (20): 11. Security deposits and damage claims, 12. There is no insurance on Zoink, 13. Reviews and ratings, 14. Things you must not do, 15. Suspension and termination, 16. Disclaimers, 17. Limitation of liability, 18. Indemnity (+12 more)

### Community 36 - "users.ts"
Cohesion: 0.21
Nodes (14): acceptTerms, deleteMe, getMe, getPublicProfile, getStripeConnectStatus, onboardStripeConnect, updateMe, updateNotificationPrefs (+6 more)

### Community 37 - "4. File-by-File Explanation"
Cohesion: 0.11
Nodes (18): 4. File-by-File Explanation, Backend Config Files, Backend Controllers (`backend/src/middleware/controllers/`), Backend Entry, Instrument, Middleware, Utils, Test Helpers, Backend Integration Tests (`backend/src/integration-tests/`), Backend Prisma, Backend Routes, Backend Scripts (+10 more)

### Community 38 - "Zoink Backend — Integration Tests"
Cohesion: 0.12
Nodes (15): 1. Postgres test database, 2. `.env.test`, 3. Network access to Stripe, Design decisions, Direct Prisma writes for mid-flow pre-conditions, Integration tests, No mocking in integration tests, Prerequisites (+7 more)

### Community 39 - "backend/package.json"
Cohesion: 0.20
Nodes (9): author, description, keywords, license, main, name, prisma, seed (+1 more)

### Community 40 - "disputesApi.ts"
Cohesion: 0.20
Nodes (11): api, createDispute(), CreateDisputePayload, getDispute(), getMyDisputes(), mockCreateDispute(), mockGetDispute(), mockGetMyDisputes() (+3 more)

### Community 42 - "usersApi.ts"
Cohesion: 0.11
Nodes (24): DEMO_MODE, DEMO_TOKEN, DEMO_USER, uploadHandoffPhotoImage(), demoProfile, mockDeleteMyAccount(), mockGetMyProfile(), mockGetPublicProfile() (+16 more)

### Community 43 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 44 - "9. Main User Flows"
Cohesion: 0.18
Nodes (11): 9. Main User Flows, Admin / moderation, Creating a listing, Deposits & payouts, Disputes, Messaging, Owner accept / decline, Pickup / return handoff ("Zoink It") (+3 more)

### Community 45 - "reviewService.ts"
Cohesion: 0.36
Nodes (9): assertItemRating(), assertScore(), average(), recomputeListingRating(), recomputeUserReputation(), resolveReviewFields(), submitReview(), SubmitReviewInput (+1 more)

### Community 46 - "manageAdminRole.ts"
Cohesion: 0.44
Nodes (6): AdminRoleOutcome, findUserByEmail(), grantAdminRole(), main(), parseEmailArg(), revokeAdminRole()

### Community 47 - "index.tsx"
Cohesion: 0.08
Nodes (34): useAuth(), Navigation(), PendingRegistration, Stack, VerifiedAppStack(), ListingDetailScreen(), LoginScreen(), getPromptSeen() (+26 more)

### Community 48 - "errors.ts"
Cohesion: 0.13
Nodes (21): runValidate(), runValidate(), runValidate(), validListingBody, runValidate(), validReviewBody, runPrefsValidate(), runValidate() (+13 more)

### Community 49 - "authController.test.ts"
Cohesion: 0.19
Nodes (13): getLegalVersion, login, register, resendOTP, BASE_REGISTRATION_FIELDS, VALID_LEGAL_FIELDS, VALID_UNIVERSITY_FIELDS, verifyEmail (+5 more)

### Community 52 - "stripe.schema.ts"
Cohesion: 0.33
Nodes (5): CaptureMethodSchema, CurrencySchema, PartialCaptureBody, NOTE: capture_method is always set to 'manual' internally in, NOTE: The Stripe webhook endpoint (POST /stripe/webhook) receives a raw

### Community 53 - "Zoink Codebase Overview"
Cohesion: 0.15
Nodes (12): 13. Important Patterns, 14. Current Gaps / TODOs / Risks, 15. Developer Onboarding Guide, 1. Project Overview, 2. Tech Stack, 3. Folder Structure, 5. Frontend Flow, 6. Backend Flow (+4 more)

### Community 54 - "shared/package.json"
Cohesion: 0.33
Nodes (5): main, name, private, types, version

### Community 55 - "Zoink — Terms of Service"
Cohesion: 0.10
Nodes (20): 11. Security deposits and damage claims, 12. There is no insurance on Zoink, 13. Reviews and ratings, 14. Things you must not do, 15. Suspension and termination, 16. Disclaimers, 17. Limitation of liability, 18. Indemnity (+12 more)

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

### Community 60 - "RootStackParamList"
Cohesion: 0.14
Nodes (16): PaymentNeededBadge(), Props, styles, RootStackParamList, InboxScreen(), Nav, styles, MainAppRoute (+8 more)

### Community 61 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 62 - "notificationService.ts"
Cohesion: 0.26
Nodes (10): createNotification(), getExpoAccessToken(), isExpoPushToken(), NotificationPrefs, NotifyInput, notifyUser(), PREF_COLUMN_BY_TYPE, sendExpoPush() (+2 more)

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

### Community 72 - "conversationController.test.ts"
Cohesion: 0.35
Nodes (8): getConversationById, getConversationMessages, getMyConversations, markConversationRead, openConversation, sendMessage, router, SendMessageSchema

### Community 76 - "ConversationThreadScreen.tsx"
Cohesion: 0.14
Nodes (16): HardBlock(), Props, Props, StateCard(), styles, Tone, AdminDisputesScreen(), FILTERS (+8 more)

### Community 77 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, admin:grant, admin:revoke, build, dev, smoke:week7, start, test (+1 more)

### Community 78 - "BackButton.tsx"
Cohesion: 0.12
Nodes (19): BackButton(), Props, styles, ActiveRentalScreen(), daysLeft(), fullName(), Nav, ScreenRoute (+11 more)

### Community 79 - "11. Environment Variables"
Cohesion: 0.67
Nodes (3): 11. Environment Variables, Backend, Frontend

### Community 80 - "Zoink — Privacy Policy"
Cohesion: 0.13
Nodes (15): 10. Your rights, 11. Automated decisions, 12. Children, 13. Cookies and similar technology, 14. Changes to this policy, 15. Contact, 1. Introduction, 3. Why we use it (+7 more)

### Community 85 - "12. Scripts and Commands"
Cohesion: 0.50
Nodes (4): 12. Scripts and Commands, Backend, Frontend, Root

### Community 88 - "dto.ts"
Cohesion: 0.17
Nodes (12): BookingListingSnapshot, BrowseListingsResult, ConversationDetailResponse, ConversationInFlightBooking, ConversationListingSnapshot, ConversationMessagePreview, ConversationResponse, ListingImageSummary (+4 more)

### Community 89 - "7. Database / Prisma"
Cohesion: 0.67
Nodes (3): 7. Database / Prisma, Enums, Models

### Community 95 - "cleanupJob.ts"
Cohesion: 0.29
Nodes (9): DEPOSIT_HOLD_HOURS, PAYOUT_HOLD_HOURS, ZOINK_TAP_WINDOW_MS, cleanupStaleHandoffs(), monthsAgo(), purgeOldDisputesAndReports(), purgeOldHandoffPhotos(), purgeOldMessages() (+1 more)

### Community 104 - "Zoink — Privacy Policy"
Cohesion: 0.13
Nodes (15): 10. Your rights, 11. Automated decisions, 12. Children, 13. Cookies and similar technology, 14. Changes to this policy, 15. Contact, 1. Introduction, 3. Why we use it (+7 more)

### Community 106 - "rateLimiter.ts"
Cohesion: 0.31
Nodes (7): authLimiter, bearerUserId(), buildLimiter(), globalLimiter, keyByIpAndUser(), rateLimitHandler(), buildTestApp()

### Community 110 - "Implementation prompt — terms acceptance gate"
Cohesion: 0.17
Nodes (11): Implementation prompt — terms acceptance gate, Part 1 — Ship the documents inside the app, Part 2 — Schema, Part 3 — Backend, Part 4 — The terms screen, Part 5 — Wire up registration, Part 6 — Re-acceptance gate, Part 7 — Settings (+3 more)

### Community 113 - "Implementation prompt — terms acceptance gate"
Cohesion: 0.17
Nodes (11): Implementation prompt — terms acceptance gate, Part 1 — Ship the documents inside the app, Part 2 — Schema, Part 3 — Backend, Part 4 — The terms screen, Part 5 — Wire up registration, Part 6 — Re-acceptance gate, Part 7 — Settings (+3 more)

### Community 114 - "conversationService.ts"
Cohesion: 0.35
Nodes (10): getConversationById(), getConversationForParticipant(), getConversationMessages(), getMyConversations(), IN_FLIGHT_BOOKING_STATUSES, markConversationRead(), openConversation(), sendMessage() (+2 more)

### Community 115 - "deploy"
Cohesion: 0.22
Nodes (8): build, buildCommand, builder, deploy, restartPolicyMaxRetries, restartPolicyType, startCommand, $schema

### Community 116 - "10. Money: prices, fees, taxes, and payouts"
Cohesion: 0.29
Nodes (7): 10.1 Payments are processed by Stripe, 10.2 What a Renter pays, 10.3 What an Owner receives — the commission, 10.4 Payouts, 10.5 Taxes, 10.6 Changing fees, 10. Money: prices, fees, taxes, and payouts

### Community 120 - "10. Money: prices, fees, taxes, and payouts"
Cohesion: 0.29
Nodes (7): 10.1 Payments are processed by Stripe, 10.2 What a Renter pays, 10.3 What an Owner receives — the commission, 10.4 Payouts, 10.5 Taxes, 10.6 Changing fees, 10. Money: prices, fees, taxes, and payouts

### Community 121 - "syncLegal.ts"
Cohesion: 0.38
Nodes (6): escapeForTemplateLiteral(), generate(), LEGAL_OUT_DIR, LEGAL_SRC_DIR, main(), REPO_ROOT

### Community 125 - "2. What we collect"
Cohesion: 0.40
Nodes (5): 2.1 Information you give us, 2.2 Information we collect automatically, 2.3 Information from others, 2.4 What we do not collect, 2. What we collect

### Community 126 - "2. What we collect"
Cohesion: 0.40
Nodes (5): 2.1 Information you give us, 2.2 Information we collect automatically, 2.3 Information from others, 2.4 What we do not collect, 2. What we collect

### Community 135 - "disputeService.ts"
Cohesion: 0.24
Nodes (14): calculateCancellationFeeCents(), handleCancellationPayment(), releaseDuePayouts(), DISPUTE_WINDOW_HOURS, formatCents(), resolveDispute(), cancelPaymentIntent(), capturePaymentIntent() (+6 more)

### Community 138 - "createBooking"
Cohesion: 0.42
Nodes (7): createBooking(), ensureValidBookingDates(), getRentalDays(), MAX_RENTAL_DAYS, roundCurrency(), calculateInsuranceFee(), toDecimal()

## Knowledge Gaps
- **681 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+676 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `VerifiedAppStack()` connect `index.tsx` to `dependencies`, `types/index.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `expo-camera`, `expo-location`, `react-native`, `@react-navigation/native-stack`, `expo-blur`, `expo-font`, `react-native-reanimated`, `react-native-svg`, `frontend/package.json`, `@stripe/stripe-react-native`, `expo-image-picker`, `expo-linear-gradient`, `expo-status-bar`, `react-native-web`, `react-native-worklets`, `react-native-zoom-toolkit`, `@react-navigation/native`, `expo-secure-store`, `react-native-screens`, `expo-build-properties`, `@sentry/react-native`, `expo-haptics`, `expo-notifications`, `@expo/vector-icons`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `react` connect `dependencies` to `colors.ts`, `index.tsx`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _681 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `mockWeek6.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09747899159663866 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `getTestPrisma` be split into smaller, more focused modules?**
  _Cohesion score 0.09643483343074226 - nodes in this community are weakly interconnected._