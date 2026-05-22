# Zoink 🔁
### A peer-to-peer rental marketplace for students

Zoink connects university students who have items sitting unused with students who need them temporarily — making access affordable and ownership optional.

Instead of paying $75/day at a rental shop or buying something you'll use once, you rent it from someone nearby for a fraction of the cost. Snowboard for the weekend. Speaker for the party. Drill for the one IKEA job. Camera for the trip.

> Currently in active development. Authentication, profiles, listings, search/filtering, booking + messaging, reviews, and push notifications are implemented. Payments, release hardening, and deployment are still in progress. ✅

---

## The Problem

Rising cost of living has made ownership hard to justify for students — especially for items used only occasionally. At the same time, people own things that sit idle for most of the year. Existing options either lack trust (Facebook Marketplace), lack rental infrastructure (Kijiji), or are too expensive (traditional rental shops).

Zoink fills that gap with a purpose-built, trust-first rental platform.

---

## Core Features

- **Authentication** — email/password registration, JWT-based auth, protected routes ✅
- **Identity verification** — university email OTP verification with verified-only app access ✅
- **User profiles** — avatar, bio, verified badge, public profiles, and review reputation ✅
- **Listings** — create items with photos, description, category, daily price, and location ✅
- **Search and filtering** — geo-based nearby search, category, price range, availability ✅
- **Messaging** — in-app chat between renters and listers before and during a booking ✅
- **Booking system** — request rentals, accept/decline, strict state machine ✅
- **Payments** — Stripe Payment Intents, deposit hold, capture on rental start, payout on completion 🚧 Planned
- **Insurance** — optional ~5% coverage fee on listed item value for added protection 🚧 Planned
- **Reviews and ratings** — post-rental reviews and aggregate scores ✅
- **Push notifications** — booking alerts, message notifications, status updates ✅

---

## Booking Flow

```
Renter:  Search → Message → Book → Pay → Pick up → Use → Return → Review
Lister:  Upload → Set price → Message → Approve → Get paid → Rent → Retrieve → Review
```

Booking states enforced strictly on the backend:

```
PENDING → ACCEPTED → ACTIVE → COMPLETED
PENDING → DECLINED
PENDING / ACCEPTED → CANCELLED
```

---

## Business Model

| Rental Price | Commission |
|---|---|
| $0 – $50 | 15% |
| $50 – $150 | 12% |
| $150+ | 10% |

Additional revenue streams:
- **Optional insurance** — ~5% of listed item value per rental
- **Featured listings** — pay to boost item visibility
- **Power seller subscription** — lower commission, featured slots, and platform tools (future)

Early adopters get zero-commission incentives to kickstart supply.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile frontend | React Native + Expo SDK 54 + TypeScript |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Image storage | Cloudinary (listings and profile photos) |
| Email | AWS SES |
| Hosting | AWS EC2 + RDS (free tier) |
| Payments | Stripe |
| Push notifications | Expo Push Notifications |

---

## Current Implementation Notes

- Frontend listings are implemented: nearby home feed, create listing form, photo selection/upload flow, listing detail, owner listing management, and edit listing screens.
- Frontend browse/search is implemented: bottom navigation now exposes dedicated Home, Search, Messages, and Profile surfaces, and the Search screen supports query, category filtering, price filtering, and sort/filter menus.
- Frontend profiles are now implemented with collectible-style profile cards, public profile viewing, inline profile editing, avatar upload, and demo-mode mock profile data for UI testing.
- Week 6 is implemented: renters can open conversations, send messages, create booking requests, and view booking history; owners can review and act on incoming requests.
- Week 8 is implemented end-to-end: completed bookings create review prompts, both sides can submit three-score reviews, and reputation aggregates are available for profile surfaces.
- Week 9 is implemented end-to-end: push notification tokens are registered and synced on the frontend, Expo push service handles notifications for booking status transitions and messages on the backend, and UI polish (including liquid glass UI theme, clean empty states, and optimized navigation flow) has been applied.
- `GET /listings?latitude=...&longitude=...&radiusKm=...` powers geo-based nearby listing search and returns `distanceKm`.
- The app UI uses the Zoink palette: Logo Green `#6DD832` (with variations `#4EA822`, `#3A7D19`, `#96E85A`, `#F2FAE8`) and the Deep Forest Liquid Glass styling tokens (`glassLight`, `glassDark`, `glassGreen`, `glassBorder`).
- Temporary in-app Zoink logo placeholders exist in the frontend so real logo assets can be swapped in later.
- Frontend demo mode can run core browse, profile, booking, messaging, and review flows locally without a live backend.

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Expo CLI
- AWS account (free tier)
- Stripe account
- Cloudinary account

### Backend setup

```bash
cd backend
npm install
# create backend/.env with the variables below
npx prisma migrate dev
npx prisma generate
npm run dev
```

Backend runs at `http://localhost:3000`. Test it at `http://localhost:3000/health`.

### Frontend setup

```bash
cd frontend
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator, `a` for Android, `w` for web.

### Environment variables

Create `backend/.env`:

```
DATABASE_URL="postgresql://youruser@localhost:5432/zoink"
JWT_SECRET="your-secret-key"
PORT=3000

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

EXPO_ACCESS_TOKEN=

SES_FROM_EMAIL=
ADMIN_EMAIL=
ALLOWED_EMAIL_DOMAINS=utoronto.ca,uwaterloo.ca,tmu.ca
OTP_EXPIRY_MINUTES=15
```

For frontend development, create `frontend/.env` locally:

```
EXPO_PUBLIC_API_URL="https://your-ngrok-url.ngrok-free.app"
```

`frontend/.env` is intentionally local and should not be committed.

To preview the frontend without a running backend, enable demo mode locally:

```
EXPO_PUBLIC_DEMO_MODE=true
```

Demo mode lets the app log in with local mock auth and use local mock listings. Remove it or set it to `false` when testing against the real backend.

---

## Project Structure

```
zoink/
├── backend/
│   ├── src/
│   │   ├── middleware/
│   │   │   └── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── prisma.config.ts
│   ├── .env
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── navigation/
│   │   ├── services/
│   │   ├── context/
│   │   ├── theme/
│   │   └── types/
│   ├── App.tsx
│   └── tsconfig.json
└── README.md
```

---

## 12-Week Build Plan

Two developers, 10–15 hours/week each. Each week delivers a complete vertical slice — backend and frontend together — so the app is always demo-able.

| Week | Focus | Status |
|---|---|---|
| 1 | Project setup — DB schema, base structure, navigation shell | ✅ Done |
| 2 | Authentication — register/login, JWT, protected routes, auth context | ✅ Done |
| 3 | User profiles — avatars, public profiles, profile card UI + email verification flow | ✅ Done |
| 4 | Listings — create, upload photos, detail page, owner management | ✅ Done |
| 5 | Browse, search, and filtering — geo search, categories, price range | ✅ Done |
| 6 | Booking system + messaging — request flow, state machine, in-app chat | ✅ Done |
| 7 | Payments — Stripe Payment Intents, deposit, payout, refunds | 🚧 Planned |
| 8 | Reviews and ratings — post-rental prompts, aggregate scores | ✅ Done |
| 9 | Push notifications and polish — loading states, empty states, UI pass | ✅ Done |
| 10 | Testing and security audit — integration tests, device testing, security review | 🔨 Up next |
| 11–12 | Deployment — AWS EC2/RDS, EAS build, TestFlight, CI/CD | — |

---

## Week 5 — Browse, Search, and Filtering

### Status: complete

The backend endpoints (`GET /listings`, `GET /listings/categories`) are built and verified, and the main Week 5 frontend browse flow is now wired into the app.

**API integration**
- Axios frontend helpers now support listings browse queries and category fetching.

**Browse / Explore screen**
- Nearby listings render in the app feed and show `distanceKm` when available.

**Search and filter interactions**
- A dedicated Search screen now supports query input, category filtering, price filtering, and sort/filter menus.

**Geolocation**
- Device location is requested to populate `latitude` and `longitude` for nearby browse results.

**Pagination**
- Basic browse/search results are wired; pagination/infinite scroll can be extended further if the product needs larger result sets.

---

## Week 6 — Booking System + Messaging

Messaging is load-bearing for a peer-to-peer marketplace — renters need a way to ask questions before committing to a booking request. Both features ship together this week as a full vertical slice.

### Status: complete

Week 6 has been implemented and the main user flows were manually verified in the app: opening or resuming a conversation, sending messages, creating booking requests, reviewing incoming requests, and progressing booking states through the owner/renter flow.

### Booking system

**Backend**
- `Booking` model: `id`, `listingId`, `renterId`, `ownerId`, `startDate`, `endDate`, `totalPrice`, `status`, `createdAt`, `updatedAt`
- Status enum: `PENDING | ACCEPTED | DECLINED | CANCELLED | ACTIVE | COMPLETED`
- State machine enforced in middleware — invalid transitions return 400
- Endpoints:
  - `POST /bookings` — renter creates a request (status: `PENDING`)
  - `PATCH /bookings/:id/accept` — owner accepts (→ `ACCEPTED`)
  - `PATCH /bookings/:id/decline` — owner declines (→ `DECLINED`)
  - `PATCH /bookings/:id/cancel` — renter or owner cancels (→ `CANCELLED`)
  - `PATCH /bookings/:id/activate` — mark rental as started (→ `ACTIVE`)
- `PATCH /bookings/:id/complete` — mark rental as returned (→ `COMPLETED`)
- `GET /bookings/me` — renter's booking history
- `GET /bookings/requests` — owner's incoming booking requests
- Block double-booking: query for overlapping `ACCEPTED` or `ACTIVE` bookings before accepting
- `totalPrice` is computed server-side, and the current deposit amount shown in the API/UI is derived server-side from the booking total

**Frontend**
- Book Now button and booking request flow on listing detail screen
- Booking request confirmation screen (dates, price breakdown, deposit)
- Incoming requests screen for owners (approve / decline actions)
- Booking history screen for renters with status badges
- Booking detail screen with current status and available actions

### Messaging

**Backend**
- `Conversation` model: `id`, `listingId`, `renterId`, `ownerId`, `createdAt`
- `Message` model: `id`, `conversationId`, `senderId`, `body`, `createdAt`
- One conversation per (renter, listing) pair — enforced with a unique constraint
- Endpoints:
  - `POST /conversations` — open or retrieve existing conversation for a listing
  - `GET /conversations/me` — all conversations for the current user (inbox)
  - `GET /conversations/:id/messages` — paginated message thread
  - `POST /conversations/:id/messages` — send a message
- Poll-based for now (no WebSockets) — `GET /conversations/:id/messages?after=<messageId>` for incremental updates
- Authorization: only conversation participants can read or write

**Frontend**
- Message button on listing detail screen (opens or resumes conversation)
- Inbox screen — list of conversations with last message preview and unread indicator
- Thread screen — scrollable message history with send input at the bottom
- Auto-poll on thread screen every 3–5 seconds while focused
- Inbox entry point from the home screen

### Schema additions (Prisma)

```prisma
model Booking {
  id                    String        @id @default(uuid())
  status                BookingStatus @default(PENDING)
  startDate             DateTime
  endDate               DateTime
  totalPrice            Decimal       @db.Decimal(10, 2)
  message               String?
  stripePaymentIntentId String?
  stripeChargeId        String?
  paidAt                DateTime?
  payoutSentAt          DateTime?
  renterId              String
  renter                User          @relation("RenterBookings", fields: [renterId], references: [id])
  ownerId               String
  owner                 User          @relation("OwnerBookings", fields: [ownerId], references: [id])
  listingId             String
  listing               Listing       @relation(fields: [listingId], references: [id])
  completedAt           DateTime?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  @@map("bookings")
}

enum BookingStatus {
  PENDING
  ACCEPTED
  DECLINED
  ACTIVE
  COMPLETED
  CANCELLED
}

model Conversation {
  id         String    @id @default(uuid())
  listingId  String
  listing    Listing   @relation(fields: [listingId], references: [id])
  renterId   String
  renter     User      @relation("RenterConversations", fields: [renterId], references: [id])
  ownerId    String
  owner      User      @relation("OwnerConversations", fields: [ownerId], references: [id])
  messages   Message[]
  createdAt  DateTime  @default(now())

  @@unique([listingId, renterId])
  @@map("conversations")
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderId       String
  sender         User         @relation(fields: [senderId], references: [id])
  body           String
  createdAt      DateTime     @default(now())

  @@map("messages")
}

model Notification {
  id        String           @id @default(uuid())
  type      NotificationType
  title     String
  body      String
  read      Boolean          @default(false)
  data      Json?
  userId    String
  user      User             @relation(fields: [userId], references: [id])
  createdAt DateTime         @default(now())

  @@map("notifications")
}
```

### Definition of done — week 6

- [x] All booking state transitions work end-to-end and reject invalid transitions
- [x] Double-booking is blocked at the API level
- [x] Owner can approve/decline from the requests screen
- [x] Renter can view booking history with accurate status
- [x] Two users can exchange messages on a listing thread
- [x] Inbox shows last message and updates on poll
- [x] Conversation is created automatically when renter taps Message

---

## Week 8 — Reviews and Ratings

To maintain a high-trust peer-to-peer network, Zoink enforces a strict mandatory review system upon the completion of any rental. 

### Status: complete

Week 8 has been implemented. The backend correctly generates review obligations when a rental is marked as completed, and the frontend surfaces a hard-gated review screen that cannot be bypassed until the user clears their review backlog.

### Features
**Backend**
- `Review` and `ReviewObligation` models implemented to track pending and completed reviews.
- `POST /reviews` endpoint that accepts 3 distinct scores and a comment.
- Role-based score dimensions:
  - Renters review Owners on: Item Quality, Communication, and Accuracy.
  - Owners review Renters on: Care of Item, Reliability, and Communication.
- Reputation re-computation triggered asynchronously after every review submission to keep profile scores up-to-date.
- Database logic enforces that users can only submit a review for an obligation they own, and only once.

**Frontend**
- `ReviewPromptScreen` presents a dynamic review form with slider inputs and a text area.
- "Trust Check" Lock: If a user has a pending review obligation, the navigation stack intercepts them on app launch and forces `ReviewPromptScreen` as the initial route. Swiping back or hardware back buttons are disabled.
- Booking completion immediately resets the navigation stack to the review prompt, eliminating escape hatches.
- Users with multiple pending reviews are automatically chained through them sequentially.

---

## Week 9 — Push Notifications and Polish

To improve engagement and close the communication loop, Zoink implements push notifications for critical booking actions and direct messages, along with a comprehensive UI polish using a frosted glass aesthetic.

### Status: complete

Week 9 has been implemented end-to-end. Device token registration and token syncing are integrated on the frontend, while the backend triggers Expo push notifications for conversation messages and booking state changes. The UI also features polished transitions, custom empty states, and a frosted glass visual design.

### Features

**Backend**
- `Notification` model and `expoPushToken` stored in PostgreSQL database.
- `PATCH /users/me/push-token` endpoint allowing mobile devices to register/clear their Expo Push tokens.
- Integration with the Expo Push Notification API (`https://exp.host/--/api/v2/push/send`) via a modular `notificationService`.
- Push notifications triggered automatically on:
  - New booking requests (notifying the owner).
  - Booking status updates (accepted, declined, cancelled, completed sent to the renter/owner).
  - Incoming chat messages (notifying the other chat participant with a message body snippet).

**Frontend**
- Expo notifications device registration helper (`pushNotifications.ts`) requesting proper OS-level notification permissions.
- Automated token syncing: registers/syncs the device's token with the backend upon login/email verification, and clears the token on logout.
- Fully polished "Deep Forest Liquid Glass" visual design across all surfaces with glassmorphism components (`glassLight`, `glassDark`, `glassGreen`, `glassBorder`).
- Enhanced empty/loading states and refined navigation flow.

## Key Architecture Decisions

**Monorepo** — frontend and backend live in one repo. Types are currently maintained separately, so shared contracts are still a worthwhile future improvement.

**Vertical slice delivery** — each week ships a complete feature end-to-end (backend + frontend). No catch-up UI weeks.

**Verification is a hard gate** — every user must verify with a university email before they can browse, list, or book. Middleware chain: `authenticate → requireVerified → handler`. Government ID integration can be added later with no structural changes.

**Geo search from day one** — listings store `latitude` and `longitude` as floats. Haversine query for nearby search, upgradeable to PostGIS with no schema changes.

**Stripe Payment Intents, not Charges** — this is still the intended payments design for Week 7; the live Stripe flow is not implemented yet.

**Messaging via polling, not WebSockets** — simpler to deploy and sufficient for MVP usage patterns. Upgradeable to WebSockets or a service like Ably post-launch with no schema changes.

**Booking state machine in middleware** — transitions are validated centrally, not scattered across controllers.

---

## AWS Free Tier Usage

| Service | Purpose | Free tier limit |
|---|---|---|
| EC2 t3.micro | Node/Express API hosting | 750 hrs/month |
| RDS db.t3.micro | PostgreSQL database | 750 hrs/month + 20GB |
| SES | University email verification + notifications | 62k emails/month |

---

## Target Market

Zoink's initial focus is ~250,000 university students across the GTA (UofT, TMU, Wilfrid Laurier, and others). Year 1 target: 2,000 active users. The platform will expand to young professionals and urban users as it matures.

---

## Team

| Role | Responsibilities |
|---|---|
| Dev 1 | Backend API, database, infrastructure, deployment |
| Dev 2 | React Native frontend, UI/UX, Expo build |

---

*Built as a student MVP. Users are verified via university email. Government ID verification can be layered in as the platform grows.*
