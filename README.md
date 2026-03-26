Zoink 🚀

Zoink is a peer-to-peer rental marketplace app that allows users to list, discover, and rent items securely. The platform emphasizes trust, identity verification, and seamless transactions.

📱 Tech Stack

Frontend

React Native (Expo)

TypeScript

Axios

Expo APIs (Camera, Notifications, Location)

Backend

Node.js + Express

TypeScript

Prisma ORM

PostgreSQL

Infrastructure

AWS (EC2, RDS, S3, SES)

Stripe (payments)

Cloudinary (media storage)

🔐 Core Features

User authentication (JWT-based)

Identity verification (ID + selfie)

Listings marketplace (create, browse, filter)

Booking system with availability checks

Stripe-powered payments

Reviews and ratings

Push notifications

Real-time trust indicators (verified badges)

🧠 Development Philosophy

Zoink is built with:

Trust-first design (verification gates before transactions)

Scalable backend architecture

Mobile-first UX

Production-ready deployment practices

🗺️ 12-Week Development Plan

The full interactive roadmap is included below:

👉 Open the full plan here:

Overview
Phase	Weeks	Focus
Setup	Week 1	Project initialization
Identity	Weeks 2–4	Auth + verification + profiles
Marketplace	Weeks 5–7	Listings + browsing + bookings
Transactions	Weeks 8–9	Payments + reviews
Polish	Weeks 10–11	Notifications + testing
Ship	Week 12	Deployment
⚙️ How to Run the Project
1. Clone the repo
git clone https://github.com/your-username/zoink.git
cd zoink
2. Backend setup
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
3. Frontend setup
cd frontend
npm install
npx expo start
🔑 Environment Variables
Backend (.env)
DATABASE_URL=
JWT_SECRET=
AWS_ACCESS_KEY=
AWS_SECRET_KEY=
STRIPE_SECRET_KEY=
Frontend
EXPO_PUBLIC_API_URL=
🚀 Deployment

Backend: AWS EC2 + RDS + S3

Frontend: Expo EAS (iOS + Android)

Payments: Stripe live mode

Distribution: TestFlight (initially)

📌 Future Improvements

In-app messaging

AI-based fraud detection

Dynamic pricing suggestions

Advanced search (recommendation engine)

Web version of Zoink

🤝 Contributing

This is currently a private project. Contributions may open later once core features are stable.