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
- **Booking system** — request rentals, accept/decline, strict state machine
- **Payments** — Stripe Payment Intents, deposit hold, capture on rental start, payout on completion
- **Insurance** — optional ~5% coverage fee on listed item value for added protection
- **Reviews and ratings** — post-rental reviews and aggregate scores
- **Push notifications** — booking alerts, payment updates, verification approval

---

## Booking Flow

```
Renter:  Search → Message → Book → Pay → Pick up → Use → Return → Review
Lister:  Upload → Set price → Approve → Get paid → Rent → Retrieve → Review
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
| Mobile frontend | React Native + Expo + TypeScript |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Image storage | Cloudinary (listings), AWS S3 (ID photos) |
| Email | AWS SES |
| Hosting | AWS EC2 + RDS (free tier) |
| Payments | Stripe |
| Push notifications | Expo Push Notifications |

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
│   │   └── types/
│   ├── App.tsx
│   └── tsconfig.json
└── README.md
```

---

## 12-Week Build Plan

Two developers, 10–15 hours/week each. Dev 1 owns the backend, Dev 2 owns the frontend.

| Week | Focus | Status |
|---|---|---|
| 1 | Project setup — DB schema, base structure, navigation shell | ✅ Done |
| 2 | Authentication — register/login, JWT, protected routes, auth context | ✅ Done |
| 3 | Identity verification — university email verification, verified badge, email confirmation flow | ✅ Done |
| 4 | User profiles — avatars, public profiles, verified badges | 🚧 Backend done, UI needed |
| 5 | Listings — create, upload photos, detail page, owner management | ✅ Done |
| 6 | Browse, search, and filtering — geo search, categories, price range | 🔨 Up next |
| 7 | Booking system — request flow, state machine, history | — |
| 8 | Payments — Stripe Payment Intents, deposit, payout, refunds | — |
| 9 | Reviews and ratings — post-rental prompts, aggregate scores | — |
| 10 | Push notifications and polish — loading states, empty states, UI pass | — |
| 11 | Testing and bug fixing — integration tests, security audit, device testing | — |
| 12 | Deployment — AWS EC2/RDS, EAS build, TestFlight | — |

---

## Key Architecture Decisions

**Monorepo** — frontend and backend in one repo with shared TypeScript types so API shapes never drift.

**Verification is a hard gate** — every user must verify with a university email before they can browse, list, or book. Middleware chain: `authenticate → requireVerified → handler`. Government ID integration can be added later with no structural changes.

**Geo search from day one** — listings store `latitude` and `longitude` as floats. Haversine query for nearby search, upgradeable to PostGIS with no schema changes.

**Stripe Payment Intents, not Charges** — card is authorized on booking, captured when rental starts, payout sent after completion.

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
