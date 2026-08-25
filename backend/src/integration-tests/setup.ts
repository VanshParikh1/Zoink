/**
 * Integration Test Setup — Zoink Backend
 * =======================================
 *
 * DESIGN CHOICE: truncate-and-reseed between tests (not transaction-per-test)
 * ---------------------------------------------------------------------------
 * We evaluated wrapping each test in a transaction that rolls back (transaction-
 * per-test) but ruled it out for two reasons:
 *
 *  1. @prisma/adapter-pg builds a PrismaClient on top of a pg.Pool. Prisma's
 *     interactive transactions check out a *single connection* from the pool,
 *     but the test helper and the SUT both go through the same singleton prisma
 *     instance and may grab *different connections*, so neither sees the other's
 *     open transaction. True savepoint-based nested transactions are not
 *     supported via the driver-adapter path in Prisma 7.
 *
 *  2. Stripe PaymentIntent creation is an *external* HTTP call that cannot be
 *     rolled back by a DB transaction. Truncating after each test gives a
 *     consistent local state regardless of what external calls succeeded.
 *
 * STRATEGY: truncate all application tables in reverse-FK order inside
 * beforeEach. Because the test DB (zoink_test) is exclusive to the test runner,
 * there's no risk of clobbering dev data.
 *
 * SINGLE PRISMA SINGLETON
 * -----------------------
 * This file must be imported FIRST in every integration test file (it is, by
 * convention — it's always the first import). It sets process.env.DATABASE_URL
 * and process.env.NODE_ENV synchronously before any service module is required.
 * src/utils/prisma.ts uses lazy initialization (Proxy-based), so the Pool is
 * not created until the first DB call, by which point DATABASE_URL already
 * points to zoink_test. All services and tests therefore share one Prisma
 * client connected to the test DB.
 *
 * HOW TO SET UP zoink_test LOCALLY
 * ----------------------------------
 *   createdb zoink_test
 *   DATABASE_URL="postgresql://<user>:<pass>@localhost:5432/zoink_test" \
 *     npx prisma migrate deploy
 *   # 20260721000000_add_role_and_disputes previously had a statement-ordering bug that
 *   # made `migrate deploy` fail on a fresh DB, requiring a manual apply_to_test_db.sql
 *   # workaround. That's fixed now — a plain `migrate deploy` is sufficient.
 *
 * .env.test must contain:
 *   DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/zoink_test
 *   STRIPE_SECRET_KEY=sk_test_...   (test-mode key, never a live sk_live_ key)
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *   NODE_ENV=test
 *
 * KNOWN GOTCHA — campus WiFi
 * --------------------------
 * Some campus networks (including UofT eduroam/campus WiFi) block outbound
 * TLS to api.stripe.com and to the Prisma CDN used during `prisma generate`.
 * If tests hang on Stripe calls or `prisma generate` fails to download the
 * query engine, switch to a personal hotspot or VPN.
 */

// ── Step 1: Load .env.test into process.env BEFORE any other import ──────────
// This MUST be the very first executable code in this module so that when
// src/utils/prisma.ts lazily builds its Pool, DATABASE_URL is already zoink_test.
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

// ── Step 2: Enforce test-mode invariants ─────────────────────────────────────
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? ''
if (STRIPE_KEY && !STRIPE_KEY.startsWith('sk_test_')) {
  console.error(
    '\n🚨  ABORT: STRIPE_SECRET_KEY does not look like a test-mode key (sk_test_...).\n' +
    '    Integration tests must NOT run against a live Stripe account.\n' +
    '    Check your backend/.env.test and make sure STRIPE_SECRET_KEY=sk_test_...\n'
  )
  process.exit(1)
}

// ── Step 3: Now it is safe to import Prisma and app modules ──────────────────
import jwt from 'jsonwebtoken'
import { VerificationStatus, Role, Prisma } from '@prisma/client'
// Import the app's singleton prisma — which is a Proxy that lazily builds its
// Pool from process.env.DATABASE_URL, now set to zoink_test above.
import prisma from '../utils/prisma'

// ── Stripe connectivity check ─────────────────────────────────────────────────
export async function checkStripeConnectivity(): Promise<boolean> {
  if (!STRIPE_KEY) return false
  try {
    const Stripe = require('stripe')
    const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2025-04-30.basil', timeout: 5000 })
    await stripe.balance.retrieve()
    return true
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.warn(
      `\n⚠️  Stripe connectivity check FAILED: ${msg}\n` +
      '   Tests that require live Stripe API calls will be skipped.\n' +
      '   (Known cause: campus WiFi blocks outbound TLS to api.stripe.com)\n'
    )
    return false
  }
}

// ── Expose the shared test prisma (same singleton used by all services) ───────
export function getTestPrisma() {
  // Verify we're connected to the test DB, not the dev DB
  const dbUrl = process.env.DATABASE_URL ?? ''
  if (!dbUrl.includes('zoink_test')) {
    throw new Error(
      `getTestPrisma() called but DATABASE_URL is "${dbUrl}" — expected zoink_test.\n` +
      'Ensure setup.ts is imported first in your integration test file.'
    )
  }
  return prisma
}

export async function disconnectTestPrisma(): Promise<void> {
  await (prisma as any).$disconnect?.()
}

// ── Table truncation ──────────────────────────────────────────────────────────
const TRUNCATE_ORDER = [
  'booking_events',
  'review_obligations',
  'reviews',
  'notifications',
  'disputes',
  'reports',
  'bookings',
  'listing_images',
  'conversations',
  'messages',
  'listings',
  'user_reputations',
  'verification_tokens',
  'users',
]

export async function truncateAllTables(): Promise<void> {
  // Use a dedicated one-shot pg client (outside the Prisma pool) to run the
  // TRUNCATE. This prevents any Prisma-managed connection from holding an open
  // transaction or advisory lock that would cause TRUNCATE to block or fail
  // with FK constraint errors in fast back-to-back beforeEach calls.
  const { Client } = require('pg')
  const client = new Client({ connectionString: process.env.DATABASE_URL! })
  await client.connect()
  try {
    const tableList = TRUNCATE_ORDER.map((t: string) => `"${t}"`).join(', ')
    await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
  } finally {
    await client.end()
  }
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
export function signTestJwt(payload: {
  userId: string
  verificationStatus?: VerificationStatus
  role?: Role
  email?: string
  firstName?: string
}): string {
  const secret = process.env.JWT_SECRET ?? 'test-jwt-secret-for-integration-tests'
  return jwt.sign(
    {
      userId: payload.userId,
      verificationStatus: payload.verificationStatus ?? VerificationStatus.VERIFIED,
      role: payload.role ?? Role.USER,
      email: payload.email ?? 'test@test.com',
      firstName: payload.firstName ?? 'Test',
    },
    secret,
    { expiresIn: '1h' }
  )
}

// ── Seed helpers ──────────────────────────────────────────────────────────────
export async function createTestUser(overrides: {
  email?: string
  firstName?: string
  lastName?: string
  phone?: string
  role?: Role
  stripeAccountId?: string | null
} = {}): Promise<{ id: string; email: string; token: string }> {
  const bcrypt = require('bcryptjs')
  const email = overrides.email ?? `user_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`
  const hash = await bcrypt.hash('TestPass123!', 10)

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      phone: overrides.phone ?? '+14165550100',
      verificationStatus: VerificationStatus.VERIFIED,
      role: overrides.role ?? Role.USER,
      stripeAccountId: overrides.stripeAccountId !== undefined ? overrides.stripeAccountId : null,
    },
  })

  const token = signTestJwt({ userId: user.id, role: user.role })
  return { id: user.id, email, token }
}

export async function createTestListing(ownerId: string, overrides: {
  title?: string
  dailyPrice?: number
  itemValue?: number
  depositAmount?: number
  isAvailable?: boolean
} = {}): Promise<{ id: string }> {
  const listing = await prisma.listing.create({
    data: {
      title: overrides.title ?? 'Test Listing',
      description: 'A test listing for integration tests',
      category: 'Electronics',
      dailyPrice: new Prisma.Decimal(overrides.dailyPrice ?? 10),
      itemValue: new Prisma.Decimal(overrides.itemValue ?? 100),
      depositAmount: new Prisma.Decimal(overrides.depositAmount ?? 0),
      isAvailable: overrides.isAvailable ?? true,
      latitude: 43.6629,
      longitude: -79.3957,
      city: 'Toronto',
      address: "27 King's College Circle, Toronto",
      ownerId,
    },
  })
  return { id: listing.id }
}

export function futureDates(startOffsetDays = 1, durationDays = 2) {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + startOffsetDays)
  start.setUTCHours(12, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + durationDays - 1)
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  }
}

// ── Synthetic Stripe webhook helpers ──────────────────────────────────────────
export function buildSignedWebhookPayload(
  eventType: string,
  data: object,
  bookingId: string
): { body: Buffer; signature: string } {
  const Stripe = require('stripe')
  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2025-04-30.basil' })

  const event = {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2025-04-30.basil',
    created: Math.floor(Date.now() / 1000),
    type: eventType,
    data: {
      object: {
        ...data,
        metadata: { bookingId },
      },
    },
  }

  const body = Buffer.from(JSON.stringify(event))
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  let signature = ''
  if (webhookSecret) {
    signature = stripe.webhooks.generateTestHeaderString({
      payload: body.toString(),
      secret: webhookSecret,
    })
  }

  return { body, signature }
}

// ── Express app helper ────────────────────────────────────────────────────────
// Returns the Express app for use with supertest. Import is lazy so the app
// module loads AFTER this file has set process.env from .env.test.
export function getApp() {
  return require('../index').default
}

export function stripeSkipReason(): string | null {
  if (!STRIPE_KEY) return 'STRIPE_SECRET_KEY not set'
  if (!STRIPE_KEY.startsWith('sk_test_')) return 'Not a test-mode key'
  return null
}

/** Confirms a rental PaymentIntent (created via createPaymentIntentForBooking,
 *  which leaves it at status=requires_payment_method) with a real Stripe test
 *  card, same as the borrower's PaymentSheet would. Required as of the
 *  separate-deposit-PaymentIntent change: transitionBookingStatus's CONFIRMED
 *  branch reads back the payment method attached to this PaymentIntent to
 *  authorize the deposit off-session, so it must actually be confirmed — a
 *  bare `paymentStatus: AUTHORIZED` DB write is no longer enough to fake it. */
export async function confirmTestPaymentIntent(paymentIntentId: string): Promise<void> {
  if (!STRIPE_KEY) return
  const Stripe = require('stripe')
  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2025-04-30.basil' })
  // createPaymentIntent() (paymentService.ts) enables automatic_payment_methods
  // with redirects allowed (matching the real PaymentSheet client flow, which
  // supplies its own returnURL) — confirming server-side here needs the same
  // return_url Stripe requires whenever redirect-based methods are possible.
  await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: 'pm_card_visa',
    return_url: 'https://example.com/stripe-redirect',
  })
}
