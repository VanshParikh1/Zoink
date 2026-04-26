# Zoink 🔁
### A peer-to-peer rental marketplace for students

Zoink connects university students who have items sitting unused with students who need them temporarily — making access affordable and ownership optional.

Instead of paying $75/day at a rental shop or buying something you'll use once, you rent it from someone nearby for a fraction of the cost. Snowboard for the weekend. Speaker for the party. Drill for the one IKEA job. Camera for the trip.

> Currently in active development. Backend, authentication, and listing system complete. ✅

---

## The Problem

Rising cost of living has made ownership hard to justify for students — especially for items used only occasionally. At the same time, people own things that sit idle for most of the year. Existing options either lack trust (Facebook Marketplace), lack rental infrastructure (Kijiji), or are too expensive (traditional rental shops).

Zoink fills that gap with a purpose-built, trust-first rental platform.

---

## Core Features

- **Authentication** — email/password registration, JWT-based auth, protected routes ✅
- **Identity verification** — university email verification to ensure a trusted student-only network
- **User profiles** — avatar, bio, verified badge, listings, and reviews
- **Listings** — create items with photos, description, category, daily price, and location
- **Search and filtering** — geo-based nearby search, category, price range, availability
- **Messaging** — in-app chat between renters and listers before and during a booking
- **Booking system** — request rentals, accept/decline, strict state machine
- **Payments** — Stripe Payment Intents, deposit hold, capture on rental start, payout on completion
- **Insurance** — optional ~5% coverage fee on listed item value for added protection
- **Reviews and ratings** — post-rental reviews and aggregate scores
- **Push notifications** — booking alerts, payment updates, message notifications

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
| Image storage | Cloudinary (listings), AWS S3 (profile photos) |
| Email | AWS SES |
| Hosting | AWS EC2 + RDS (free tier) |
| Payments | Stripe |
| Push notifications | Expo Push Notifications |

---

## Current Implementation Notes

- Frontend listings are implemented: nearby home feed, create listing form, photo selection/upload flow, listing detail, owner listing management, and edit listing screens.
- `GET /listings?lat=...&lng=...&radius=...` exists for geo-based nearby listing search and returns `distanceKm`.
- The app UI uses the Zoink palette: Electric Green `#00EF20`, Ink Black `#040F0F`, Forest Green `#248232`, Jet Black `#2D3A3A`, and Porcelain `#FCFFFC`.
- Temporary in-app Zoink logo placeholders exist in the frontend so real logo assets can be swapped in later.

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
cp .env.example .env        # fill in your values
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
AWS_S3_BUCKET=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

SES_FROM_EMAIL=
ADMIN_EMAIL=
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
│   │   ├── controllers/
│   │   ├── middleware/
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
| 3 | User profiles — avatars, public profiles, verified badge + AWS SES wire-up | — |
| 4 | Listings — create, upload photos, detail page, owner management | ✅ Done |
| 5 | Browse, search, and filtering — geo search, categories, price range | 🚧 Backend done, UI in progress |
| 6 | Booking system + messaging — request flow, state machine, in-app chat | — |
| 7 | Payments — Stripe Payment Intents, deposit, payout, refunds | — |
| 8 | Reviews and ratings — post-rental prompts, aggregate scores | — |
| 9 | Push notifications and polish — loading states, empty states, UI pass | — |
| 10 | Testing and security audit — integration tests, device testing, security review | — |
| 11–12 | Deployment — AWS EC2/RDS, EAS build, TestFlight, CI/CD | — |

---

## Week 5 — Browse, Search, and Filtering

### Currently working on: frontend UI

The backend endpoints (`GET /listings`, `GET /listings/categories`) are built and verified. The following frontend work is in progress:

**API integration**
- Add Axios frontend helpers for listings queries and category fetching.

**Browse / Explore screen**
- Implement an infinite-scroll `FlatList` to display listing cards from the nearby feed.
- Show `distanceKm` on each card returned by the geo query.

**Search and filter interactions**
- Build a search bar and accessible filter modal with `category`, `minPrice`, and `maxPrice` controls.
- Validate that combined filters are strictly enforced on the query.

**Geolocation**
- Request device location permissions to populate `latitude` and `longitude` on search.
- Verify `distanceKm` values are accurate against known test locations.

**Pagination**
- Validate that scrolling triggers `limit` and `offset` fetching correctly until `hasMore` is false.

---

## Week 6 — Booking System + Messaging

Messaging is load-bearing for a peer-to-peer marketplace — renters need a way to ask questions before committing to a booking request. Both features ship together this week as a full vertical slice.

### Booking system

**Backend**
- `Booking` model: `id`, `listingId`, `renterId`, `ownerId`, `startDate`, `endDate`, `totalPrice`, `depositAmount`, `status`, `createdAt`, `updatedAt`
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
- `totalPrice` and `depositAmount` computed server-side, not trusted from client

**Frontend**
- Book Now button and date picker on listing detail screen
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
- Unread badge on the inbox tab icon

### Schema additions (Prisma)

```prisma
model Booking {
  id            String        @id @default(uuid())
  listing       Listing       @relation(fields: [listingId], references: [id])
  listingId     String
  renter        User          @relation("RenterBookings", fields: [renterId], references: [id])
  renterId      String
  owner         User          @relation("OwnerBookings", fields: [ownerId], references: [id])
  ownerId       String
  startDate     DateTime
  endDate       DateTime
  totalPrice    Float
  depositAmount Float
  status        BookingStatus @default(PENDING)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

enum BookingStatus {
  PENDING
  ACCEPTED
  DECLINED
  CANCELLED
  ACTIVE
  COMPLETED
}

model Conversation {
  id        String    @id @default(uuid())
  listing   Listing   @relation(fields: [listingId], references: [id])
  listingId String
  renter    User      @relation("RenterConversations", fields: [renterId], references: [id])
  renterId  String
  owner     User      @relation("OwnerConversations", fields: [ownerId], references: [id])
  ownerId   String
  messages  Message[]
  createdAt DateTime  @default(now())

  @@unique([listingId, renterId])
}

model Message {
  id             String       @id @default(uuid())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  conversationId String
  sender         User         @relation(fields: [senderId], references: [id])
  senderId       String
  body           String
  createdAt      DateTime     @default(now())
}
```

### Definition of done — week 6

- [ ] All booking state transitions work end-to-end and reject invalid transitions
- [ ] Double-booking is blocked at the API level
- [ ] Owner can approve/decline from the requests screen
- [ ] Renter can view booking history with accurate status
- [ ] Two users can exchange messages on a listing thread
- [ ] Inbox shows last message and updates on poll
- [ ] Conversation is created automatically when renter taps Message

---

## Key Architecture Decisions

**Monorepo** — frontend and backend in one repo with shared TypeScript types so API shapes never drift.

**Vertical slice delivery** — each week ships a complete feature end-to-end (backend + frontend). No catch-up UI weeks.

**Verification is a hard gate** — every user must verify with a university email before they can browse, list, or book. Middleware chain: `authenticate → requireVerified → handler`. Government ID integration can be added later with no structural changes.

**Geo search from day one** — listings store `latitude` and `longitude` as floats. Haversine query for nearby search, upgradeable to PostGIS with no schema changes.

**Stripe Payment Intents, not Charges** — card is authorized on booking, captured when rental starts, payout sent after completion.

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
