/**
 * Integration Tests — booking races
 * =================================
 * Double taps and two people acting at once, over HTTP, against the real
 * database and Stripe test mode:
 *
 *   - double-tap Pay, double-tap Confirm
 *   - owner accepts while the renter cancels
 *   - two overlapping requests accepted at once
 *   - two renters confirming overlapping dates at once
 *   - a mid-handoff (PICKUP_PENDING) booking keeps its dates
 *   - cancelling a paid booking releases both the rent and the deposit holds
 *
 * Stripe-backed cases are skipped when api.stripe.com isn't reachable.
 */

import test, { before, beforeEach, after, describe, mock } from 'node:test'
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
  confirmTestPaymentIntent,
  getApp,
} from './setup'
import * as bookingService from '../services/bookingService'
import * as bookingUtils from '../services/bookingUtils'
import { BookingStatus, DepositStatus, PaymentStatus, Prisma } from '@prisma/client'

type TestUser = { id: string; email: string; token: string }

let stripeAvailable = false
let owner: TestUser
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  mock.restoreAll()
  // These flows predate the pilot deposit rules (deposit rentals of at most 3
  // days, paid no earlier than 24 h before the start) and book deposit
  // listings days ahead; depositRules.integration.test.ts covers the rules.
  mock.method(bookingUtils, 'assertDepositRentalLength', () => {})
  mock.method(bookingUtils, 'assertPaymentWindowOpen', () => {})
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID ?? null })
  listingId = (await createTestListing(owner.id, { dailyPrice: 20, itemValue: 200, depositAmount: 30 })).id
})

after(async () => {
  await disconnectTestPrisma()
})

function stripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
}

function http() {
  return supertest(getApp())
}

async function renter(name: string) {
  return createTestUser({ firstName: name, email: `${name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com` })
}

async function request(user: TestUser, startOffset = 6, days = 3) {
  const { startDate, endDate } = futureDates(startOffset, days)
  return bookingService.createBooking(user.id, { listingId, startDate: new Date(startDate), endDate: new Date(endDate) })
}

/** Accepted, with the rent authorized on a real test card. */
async function acceptedAndAuthorized(user: TestUser, startOffset = 6, days = 3) {
  const booking = await request(user, startOffset, days)
  await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
  const withIntent = await bookingService.createPaymentIntentForBooking(booking.id, user.id)
  await confirmTestPaymentIntent(withIntent.stripePaymentIntentId!)
  await getTestPrisma().booking.update({ where: { id: booking.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } })
  return getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
}

async function statusChanges(bookingId: string) {
  const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId, type: 'STATUS_CHANGE' }, orderBy: { createdAt: 'asc' } })
  return events.map((e) => e.metadata as { from?: string; to?: string; reason?: string })
}

describe('double taps', () => {
  test('double-tapped Pay returns the same PaymentIntent', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unreachable')
    const alice = await renter('Alice')
    const booking = await request(alice)
    await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)

    const [a, b] = await Promise.all([
      http().post(`/bookings/${booking.id}/payment-intent`).set('Authorization', `Bearer ${alice.token}`),
      http().post(`/bookings/${booking.id}/payment-intent`).set('Authorization', `Bearer ${alice.token}`),
    ])

    assert.equal(a.status, 200, JSON.stringify(a.body))
    assert.equal(b.status, 200, JSON.stringify(b.body))
    assert.equal(a.body.stripePaymentIntentId, b.body.stripePaymentIntentId)
    const stored = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(stored.stripePaymentIntentId, a.body.stripePaymentIntentId)
  })

  test('double-tapped Confirm confirms once with one deposit hold', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unreachable')
    const alice = await renter('Alice')
    const booking = await acceptedAndAuthorized(alice)

    const responses = await Promise.all([
      http().patch(`/bookings/${booking.id}/confirm`).set('Authorization', `Bearer ${alice.token}`),
      http().patch(`/bookings/${booking.id}/confirm`).set('Authorization', `Bearer ${alice.token}`),
    ])

    for (const res of responses) assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(responses[0].body.stripeDepositPaymentIntentId, responses[1].body.stripeDepositPaymentIntentId)

    const stored = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(stored.status, BookingStatus.CONFIRMED)
    assert.equal(stored.depositStatus, DepositStatus.AUTHORIZED)
    const depositEvents = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: booking.id, type: 'PAYMENT_INTENT_CREATED' } })
    assert.equal(depositEvents.filter((e) => (e.metadata as any)?.purpose === 'deposit').length, 1)
    assert.equal((await statusChanges(booking.id)).filter((c) => c.to === 'CONFIRMED').length, 1)

    // The rent authorization the first confirm used is still live.
    const rent = await stripe().paymentIntents.retrieve(stored.stripePaymentIntentId!)
    assert.equal(rent.status, 'requires_capture')
    const deposit = await stripe().paymentIntents.retrieve(stored.stripeDepositPaymentIntentId!)
    assert.equal(deposit.status, 'requires_capture')
  })
})

describe('two people at once', () => {
  test('owner accepts while the renter cancels: exactly one wins', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unreachable')
    const alice = await renter('Alice')
    const booking = await request(alice)

    const [accept, cancel] = await Promise.all([
      http().patch(`/bookings/${booking.id}/accept`).set('Authorization', `Bearer ${owner.token}`),
      http().patch(`/bookings/${booking.id}/cancel`).set('Authorization', `Bearer ${alice.token}`),
    ])

    const statuses = [accept.status, cancel.status].sort()
    assert.deepEqual(statuses, [200, 409], `accept ${accept.status}, cancel ${cancel.status}`)
    const stored = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(stored.status, accept.status === 200 ? BookingStatus.ACCEPTED : BookingStatus.CANCELLED)
    const changes = await statusChanges(booking.id)
    assert.equal(changes.filter((c) => c.from === 'PENDING').length, 1, 'one transition out of PENDING')
  })

  test('two overlapping requests accepted at once: one is accepted, the other declined, never both', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unreachable')
    const [alice, bob] = await Promise.all([renter('Alice'), renter('Bob')])
    const a = await request(alice, 6, 3)
    const b = await request(bob, 7, 3)

    await Promise.all([
      http().patch(`/bookings/${a.id}/accept`).set('Authorization', `Bearer ${owner.token}`),
      http().patch(`/bookings/${b.id}/accept`).set('Authorization', `Bearer ${owner.token}`),
    ])

    const rows = await getTestPrisma().booking.findMany({ where: { id: { in: [a.id, b.id] } } })
    const statuses = rows.map((r) => r.status).sort()
    assert.deepEqual(statuses, [BookingStatus.ACCEPTED, BookingStatus.DECLINED])
    for (const row of rows) {
      const illegal = (await statusChanges(row.id)).filter((c) => c.from === 'ACCEPTED' && c.to === 'DECLINED')
      assert.equal(illegal.length, 0, 'an accepted booking is never overwritten to DECLINED')
    }
  })

  test('two renters confirming overlapping dates: one booking holds the dates, the other is refused and released', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unreachable')
    const [alice, bob] = await Promise.all([renter('Alice'), renter('Bob')])
    // Bob requests after Alice was accepted, so both end up ACCEPTED (accepting
    // doesn't hold dates) with the rent authorized.
    const a = await acceptedAndAuthorized(alice, 6, 3)
    const b = await acceptedAndAuthorized(bob, 7, 3)

    const [resA, resB] = await Promise.all([
      http().patch(`/bookings/${a.id}/confirm`).set('Authorization', `Bearer ${alice.token}`),
      http().patch(`/bookings/${b.id}/confirm`).set('Authorization', `Bearer ${bob.token}`),
    ])

    assert.deepEqual([resA.status, resB.status].sort(), [200, 409])
    const winner = resA.status === 200 ? a : b
    const loser = resA.status === 200 ? b : a
    const rows = await getTestPrisma().booking.findMany({ where: { id: { in: [a.id, b.id] } } })
    const byId = new Map(rows.map((r) => [r.id, r]))
    assert.equal(byId.get(winner.id)!.status, BookingStatus.CONFIRMED)
    assert.equal(byId.get(loser.id)!.status, BookingStatus.ACCEPTED)
    assert.equal(byId.get(loser.id)!.stripeDepositPaymentIntentId, null)

    // The refused renter isn't left with a hold on their card.
    const loserRent = await stripe().paymentIntents.retrieve(loser.stripePaymentIntentId!)
    assert.equal(loserRent.status, 'canceled')
    const winnerRent = await stripe().paymentIntents.retrieve(winner.stripePaymentIntentId!)
    assert.equal(winnerRent.status, 'requires_capture')
  })
})

describe('dates and holds', () => {
  test('a booking mid-handoff (PICKUP_PENDING) still holds its dates', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unreachable')
    const [alice, bob, cara] = await Promise.all([renter('Alice'), renter('Bob'), renter('Cara')])
    // Bob is accepted and has paid before Alice's handoff starts on overlapping dates.
    const b = await acceptedAndAuthorized(bob, 7, 3)
    const { startDate, endDate } = futureDates(6, 3)
    await getTestPrisma().booking.create({
      data: {
        listingId,
        renterId: alice.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(60),
        status: BookingStatus.PICKUP_PENDING,
        paymentStatus: PaymentStatus.AUTHORIZED,
      },
    })

    const res = await http().patch(`/bookings/${b.id}/confirm`).set('Authorization', `Bearer ${bob.token}`)
    assert.equal(res.status, 409)
    assert.match(res.body.error, /overlap/)
    assert.equal((await stripe().paymentIntents.retrieve(b.stripePaymentIntentId!)).status, 'canceled')

    // Nor can the owner accept a new request into those dates.
    const c = await request(cara, 7, 2)
    const accept = await http().patch(`/bookings/${c.id}/accept`).set('Authorization', `Bearer ${owner.token}`)
    assert.equal(accept.status, 409)
  })

  for (const stage of [BookingStatus.CONFIRMED, BookingStatus.PICKUP_PENDING]) {
    test(`cancelling a ${stage} booking releases the rent and the deposit`, async (t) => {
      if (!stripeAvailable) return t.skip('Stripe unreachable')
      const alice = await renter('Alice')
      const accepted = await acceptedAndAuthorized(alice)
      await bookingService.transitionBookingStatus(accepted.id, alice.id, BookingStatus.CONFIRMED)
      if (stage === BookingStatus.PICKUP_PENDING) {
        await getTestPrisma().booking.update({ where: { id: accepted.id }, data: { status: BookingStatus.PICKUP_PENDING, version: { increment: 1 } } })
      }
      const confirmed = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: accepted.id } })

      const res = await http().patch(`/bookings/${accepted.id}/cancel`).set('Authorization', `Bearer ${alice.token}`)
      assert.equal(res.status, 200, JSON.stringify(res.body))

      assert.equal((await stripe().paymentIntents.retrieve(confirmed.stripePaymentIntentId!)).status, 'canceled')
      assert.equal((await stripe().paymentIntents.retrieve(confirmed.stripeDepositPaymentIntentId!)).status, 'canceled')
      const stored = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: accepted.id } })
      assert.equal(stored.status, BookingStatus.CANCELLED)
      assert.equal(stored.depositStatus, DepositStatus.RELEASED)
    })
  }
})
