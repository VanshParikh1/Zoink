# Zoink

A peer-to-peer rental marketplace where users can rent everyday items from people nearby instead of buying them.

---

## What is Zoink?

Zoink connects people who have items sitting unused with people who need them temporarily. Instead of buying a power drill for one job, a camera for one trip, or a speaker for one party — you rent it from someone nearby for a fraction of the cost.

### Examples of rentable items
- Tools and equipment
- Cameras and photography gear
- Speakers and audio equipment
- Sports equipment
- Gaming consoles
- Event equipment

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

## Core Features

- **Authentication** — email and password registration, JWT-based auth, protected routes
- **Identity verification** — required for all users before browsing or booking (manual photo review for MVP, Stripe Identity later)
- **User profiles** — avatar, bio, verified badge, listings, and reviews
- **Listings** — create items with photos, description, category, daily price, and location
- **Search and filtering** — geo-based nearby search, category, price range, availability
- **Booking system** — request rentals, accept/decline, strict state machine
- **Payments** — Stripe Payment Intents, deposit hold, capture on rental start, payout on completion
- **Reviews and ratings** — post-rental reviews, star ratings, aggregate scores on profiles
- **Push notifications** — booking alerts, payment updates, verification approval

---

## Booking State Machine

Every booking moves through a strict set of states. The backend enforces valid transitions only.

```
PENDING → ACCEPTED → ACTIVE → COMPLETED
PENDING → DECLINED
PENDING / ACCEPTED → CANCELLED
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

Create `backend/.env` with the following:

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

## 12-Week Build Plan

Two developers, 10–15 hours per week each. Dev 1 owns the backend, Dev 2 owns the frontend. Work runs in parallel within each week.

---

### Week 1 — Project setup
**Dev 1 (Backend)**
- Init Node/Express + TypeScript
- Prisma setup + PostgreSQL connection
- Full DB schema design (all models)
- Base folder structure + env config

**Dev 2 (Frontend)**
- Init Expo + TypeScript
- Folder structure + navigation shell
- Base UI components (Button, Input, Card)
- Axios instance + API base config

**Milestone:** Both apps run locally. DB schema agreed and locked.

---

### Week 2 — Authentication backend
**Dev 1 (Backend)**
- Register + login endpoints
- bcrypt password hashing
- JWT issuing + refresh token
- requireAuth middleware
- requireVerified middleware (returns 403 if PENDING)

**Dev 2 (Frontend)**
- Register screen UI
- Login screen UI
- AsyncStorage token persistence
- Auth context + protected route wrapper
- Basic error handling on forms

**Milestone:** User can register, log in, and hit a protected route.

---

### Week 3 — Identity verification flow
**Dev 1 (Backend)**
- ID photo + selfie upload to S3 (private bucket)
- Verification submission endpoint
- Admin approve/reject endpoint
- SES email to admin on new submission
- Push notification to user on approval

**Dev 2 (Frontend)**
- Verification gate screen (shown to PENDING users)
- Camera capture for ID photo + selfie
- Submission flow UI
- Pending approval waiting screen
- Verified badge component

**Milestone:** Full manual verification flow works end to end.

> ⚠️ Heaviest week — budget extra time and avoid scheduling around exams.

---

### Week 4 — User profiles
**Dev 1 (Backend)**
- Get + update profile endpoints
- Avatar upload to Cloudinary
- Public profile endpoint (listings + reviews)
- Input validation + sanitization

**Dev 2 (Frontend)**
- Edit profile screen
- Avatar picker + upload
- Public profile page
- Verified badge display
- Navigation to profile from listings

**Milestone:** Users have profiles with avatars and verified badges.

---

### Week 5 — Listings: create and detail
**Dev 1 (Backend)**
- Create listing endpoint
- Multi-image upload to Cloudinary
- Get listing by ID endpoint
- Get listings by owner endpoint
- Delete + update listing endpoints

**Dev 2 (Frontend)**
- Create listing form (multi-step)
- Image picker + multi-upload UI
- Listing detail screen
- Owner listing management screen
- Category picker component

**Milestone:** Owners can create listings with photos. Detail page works.

---

### Week 6 — Browse, search, and filtering
**Dev 1 (Backend)**
- Geo search endpoint (Haversine query)
- Category + price filter params
- Availability filter (checks bookings)
- Pagination on listings endpoint
- Location permission + coords on listing create

**Dev 2 (Frontend)**
- Home feed / browse screen
- Map view of nearby listings
- Search bar + filter drawer UI
- Infinite scroll / pagination
- Location permission request

**Milestone:** Renters can browse and filter nearby listings.

---

### Week 7 — Booking system
**Dev 1 (Backend)**
- Create booking endpoint
- State machine transitions (accept/decline/cancel)
- Availability conflict check
- Booking history endpoints
- Push notification on booking events

**Dev 2 (Frontend)**
- Date picker + booking request screen
- Booking confirmation screen
- Owner incoming requests screen
- Accept / decline UI
- Booking history screen (both sides)

**Milestone:** Full booking flow works. State machine enforced.

---

### Week 8 — Payments with Stripe
**Dev 1 (Backend)**
- Stripe Payment Intent on booking create
- Capture payment on rental start
- Payout to owner on completion
- Stripe webhook handler
- Refund logic on decline/cancel

**Dev 2 (Frontend)**
- Stripe card input (Stripe React Native SDK)
- Payment confirmation screen
- Payment status display in booking
- Error handling for failed payments
- Receipt / payment history screen

**Milestone:** Real payments flow through Stripe end to end.

> ⚠️ Second heaviest week — give yourself extra time for webhook testing.

---

### Week 9 — Reviews and ratings
**Dev 1 (Backend)**
- Create review endpoint (post-completion only)
- Aggregate rating calculation
- Get reviews by user endpoint
- Block duplicate reviews per booking

**Dev 2 (Frontend)**
- Post-rental review prompt screen
- Star rating component
- Reviews list on profile page
- Average rating display on listings

**Milestone:** Reviews work. Ratings show on profiles and listings.

---

### Week 10 — Push notifications and polish
**Dev 1 (Backend)**
- Expo push token storage endpoint
- Notification service (booking, payment, verify)
- Background job for rental status updates
- API error handling audit

**Dev 2 (Frontend)**
- Expo push token registration
- In-app notification centre screen
- Loading states + skeleton screens
- Empty states for all screens
- General UI polish pass

**Milestone:** Push notifications work. App feels complete.

---

### Week 11 — Testing and bug fixing
**Dev 1 (Backend)**
- Write integration tests for auth + bookings
- Write integration tests for payments
- Fix any API edge cases found
- Security audit (rate limiting, input validation)

**Dev 2 (Frontend)**
- End-to-end flow testing on iOS + Android
- Fix UI bugs found during testing
- Test on multiple screen sizes
- Performance check (image loading, list scroll)

**Milestone:** App is stable. No critical bugs. Ready for deployment.

---

### Week 12 — Deployment
**Dev 1 (Backend)**
- Provision EC2 + RDS on AWS free tier
- Configure S3 buckets + SES in production
- Set up environment variables + secrets
- Deploy Node API + configure PM2
- Point domain + set up HTTPS

**Dev 2 (Frontend)**
- Configure Expo EAS build
- Set production API base URL
- Build iOS + Android binaries
- Submit to TestFlight for internal testing
- Final smoke test on real devices

**Milestone:** Zoink is live. Backend on AWS. App on TestFlight.

---

## Key Architecture Decisions

**Monorepo** — frontend and backend in one repo with shared TypeScript types so API shapes never drift out of sync.

**Verification is a hard gate** — every user starts as `PENDING` and cannot browse, list, or book until approved. Middleware chain: `authenticate → requireVerified → handler`.

**ID photos are private and temporary** — stored in a restricted S3 bucket, accessible only via signed URLs for admin review, deleted after a decision is made.

**Geo search from day one** — listings store `latitude` and `longitude` as floats. Haversine query for nearby search, upgradeable to PostGIS later with no schema changes.

**Zero schema changes when Stripe Identity arrives** — `verificationStatus`, `verificationId`, and `verifiedAt` are in the User model from day one. Adding automated ID verification later is just swapping the approval mechanism.

**Stripe Payment Intents, not Charges** — card is authorized on booking, captured when rental starts, payout sent after completion.

---

## Team

| Role | Responsibilities |
|---|---|
| Dev 1 | Backend API, database, infrastructure, deployment |
| Dev 2 | React Native frontend, UI/UX, Expo build |

---

## AWS Free Tier Usage

| Service | What it's used for | Free tier limit |
|---|---|---|
| EC2 t3.micro | Node/Express API hosting | 750 hrs/month |
| RDS db.t3.micro | PostgreSQL database | 750 hrs/month + 20GB |
| S3 | Private ID photo storage | 5GB + 20k requests |
| SES | Admin verification emails | 62k emails/month |

---

*Built as a student MVP project. Stripe Identity will replace manual verification in a future release.*
