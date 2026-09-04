/**
 * Integration Tests — Concurrent Handoff-Confirm Race
 * ===================================================
 * Two near-simultaneous "Zoink It" confirm calls for the same handoff phase
 * (fired with Promise.all) must not double-transition the booking.
 *
 * handoffService.confirmHandoff uses optimistic concurrency: it reads the
 * booking's `version`, then does a conditional `updateMany({ where: { id,
 * version } })` inside a transaction. The first writer wins (count === 1); the
 * loser sees count === 0 and throws ConflictError, which asyncHandler surfaces
 * as a clean HTTP 409 — never a 500, never a second STATUS_CHANGE, never a
 * duplicate ZOINK_TAP for the same actor.
 *
 * This was verified safe manually in a prior QA pass; this file makes it a
 * permanent regression test.
 */

import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  checkStripeConnectivity,
  getApp,
  stripeSkipReason,
} from './setup'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'

let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  const listing = await createTestListing(owner.id, { dailyPrice: 20, itemValue: 100, depositAmount: 0 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

const PHOTOS = [
  'https://res.cloudinary.com/demo/image/upload/h1.jpg',
  'https://res.cloudinary.com/demo/image/upload/h2.jpg',
]

/** Seed a booking parked in a *_PENDING handoff phase with photos uploaded and
 *  one party (the renter) already tapped, so the very next tap by the other
 *  party would complete the phase. */
async function seedHandoffPendingBooking(opts: {
  phase: 'pickup' | 'return'
  stripePaymentIntentId: string
}) {
  const db = getTestPrisma()
  const { startDate, endDate } = futureDates(3, 2)
  const isPickup = opts.phase === 'pickup'
  return db.booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(40),
      depositAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(6),
      ownerPayout: new Prisma.Decimal(34),
      insuranceFee: new Prisma.Decimal(0),
      hstAmount: new Prisma.Decimal(0),
      status: isPickup ? BookingStatus.PICKUP_PENDING : BookingStatus.RETURN_PENDING,
      paymentStatus: PaymentStatus.CAPTURED,
      paidAt: new Date(),
      stripePaymentIntentId: opts.stripePaymentIntentId,
      pickupPhotos: PHOTOS,
      returnPhotos: isPickup ? [] : PHOTOS,
      handoffInitiatedAt: new Date(),
      returnInitiatedAt: isPickup ? null : new Date(),
      // renter has already tapped this phase; the owner's tap is the one that races
      renterPickupTappedAt: isPickup ? new Date() : null,
      renterReturnTappedAt: isPickup ? null : new Date(),
      version: 1,
    },
  })
}

async function fireConcurrentOwnerConfirms(app: any, bookingId: string, phase: 'pickup' | 'return') {
  const ownerToken = owner.token
  const path = `/bookings/${bookingId}/${phase}/confirm`
  return Promise.all([
    supertest(app).post(path).set('Authorization', `Bearer ${ownerToken}`).send({}),
    supertest(app).post(path).set('Authorization', `Bearer ${ownerToken}`).send({}),
  ])
}

async function assertRaceInvariants(bookingId: string, opts: {
  responses: any[]
  expectedStatus: BookingStatus
  fromStatus: BookingStatus
}) {
  const db = getTestPrisma()
  const codes = opts.responses.map((r) => r.status).sort()
  assert.deepEqual(codes, [200, 409], `exactly one winner (200) and one clean loser (409); got ${JSON.stringify(codes)}`)

  const loser = opts.responses.find((r) => r.status === 409)
  assert.match(loser.body.error ?? '', /updated by someone else/i, 'loser gets the ConflictError message, not a 500')

  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
  assert.equal(booking.status, opts.expectedStatus, 'booking transitioned exactly once')
  assert.equal(booking.version, 2, 'version incremented exactly once (one write won)')

  const events = await db.bookingEvent.findMany({ where: { bookingId } })
  const statusChanges = events.filter(
    (e: any) => e.type === 'STATUS_CHANGE' && (e.metadata as any)?.to === opts.expectedStatus
  )
  assert.equal(statusChanges.length, 1, 'exactly one STATUS_CHANGE event for the transition — no duplicate')

  const ownerTaps = events.filter(
    (e: any) => e.type === 'ZOINK_TAP' && String((e.metadata as any)?.actorField).startsWith('owner')
  )
  assert.equal(ownerTaps.length, 1, 'exactly one ZOINK_TAP recorded from the second confirmer (owner)')
}

describe('concurrent handoff confirm — return phase (→ COMPLETED)', () => {
  test('two simultaneous owner confirms complete the booking exactly once, loser gets 409', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const booking = await seedHandoffPendingBooking({
      phase: 'return',
      stripePaymentIntentId: `pi_mock_race_return_${Date.now()}`,
    })

    const responses = await fireConcurrentOwnerConfirms(app, booking.id, 'return')

    await assertRaceInvariants(booking.id, {
      responses,
      expectedStatus: BookingStatus.COMPLETED,
      fromStatus: BookingStatus.RETURN_PENDING,
    })

    // return → COMPLETED also creates the two review obligations; exactly once.
    const obligations = await db.reviewObligation.findMany({ where: { bookingId: booking.id } })
    assert.equal(obligations.length, 2, 'review obligations created exactly once (2 rows), not duplicated by the losing tx')

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'CAPTURED → PAYOUT_PENDING on completion, once')
  })
})

describe('concurrent handoff confirm — pickup phase (→ ACTIVE)', () => {
  test('two simultaneous owner confirms activate the booking exactly once, loser gets 409', async (t) => {
    const skip = stripeSkipReason()
    if (skip || !stripeAvailable) {
      t.skip(`pickup completion captures the rental PaymentIntent — needs Stripe (${skip ?? 'unreachable'})`)
      return
    }
    const app = getApp()

    // A real confirmed-but-uncaptured PI so the pickup capture succeeds cleanly.
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
    const intent = await stripe.paymentIntents.create({
      amount: 4000,
      currency: process.env.STRIPE_CURRENCY ?? 'cad',
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
      confirm: true,
      capture_method: 'manual',
    })

    const booking = await seedHandoffPendingBooking({ phase: 'pickup', stripePaymentIntentId: intent.id })

    const responses = await fireConcurrentOwnerConfirms(app, booking.id, 'pickup')

    await assertRaceInvariants(booking.id, {
      responses,
      expectedStatus: BookingStatus.ACTIVE,
      fromStatus: BookingStatus.PICKUP_PENDING,
    })
  })
})
