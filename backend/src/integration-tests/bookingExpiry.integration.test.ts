/**
 * Integration Tests — expiry of unanswered / unpaid bookings
 * ==========================================================
 * PENDING and ACCEPTED both expire at the end of the start day (00:00
 * Toronto the next day), so a same-day request isn't cancelled at once. Both become CANCELLED with reason
 * "expired", any rent PaymentIntent is cancelled, both parties are told it
 * expired, and nobody's cancellationCount moves. Pay and Confirm refuse an
 * ACCEPTED booking once its start day has ended.
 */
import test, { before, beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, createTestListing, getTestPrisma, disconnectTestPrisma, getApp, checkStripeConnectivity } from './setup'
import * as paymentService from '../services/paymentService'
import { expireUnconfirmedBookings } from '../services/cleanupJob'
import { dayOffset } from '../scripts/seedReviewerAccount'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'

let stripeAvailable = false
let owner: { id: string; token: string }
let renter: { id: string; token: string }
let listingId: string

// Start day Nov 10 2026: it begins 00:00 EST Nov 10 (05:00 UTC); PENDING and
// ACCEPTED expire at 00:00 EST Nov 11.
const START = new Date('2026-11-10T00:00:00.000Z')
const PENDING_DEADLINE = new Date('2026-11-10T05:00:00.000Z')
const ACCEPTED_DEADLINE = new Date('2026-11-11T05:00:00.000Z')

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID ?? null })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { title: 'Kayak' })).id
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

function booking(status: BookingStatus, overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: START,
      endDate: START,
      totalPrice: new Prisma.Decimal(30),
      depositAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(4.5),
      ownerPayout: new Prisma.Decimal(25.5),
      status,
      paymentStatus: PaymentStatus.PENDING_AUTH,
      version: 1,
      ...overrides,
    },
  })
}

const statusOf = async (id: string) => (await getTestPrisma().booking.findUniqueOrThrow({ where: { id } })).status
const settle = () => new Promise((r) => setTimeout(r, 200))

describe('expireUnconfirmedBookings', () => {
  test('PENDING expires at the end of the start day, not its start; both are told it expired; no cancellation counted', async () => {
    const b = await booking(BookingStatus.PENDING)
    assert.equal((await expireUnconfirmedBookings(PENDING_DEADLINE)).expired, 0, 'still answerable on its start day')
    assert.equal((await expireUnconfirmedBookings(new Date(ACCEPTED_DEADLINE.getTime() - 1000))).expired, 0)
    assert.equal((await expireUnconfirmedBookings(ACCEPTED_DEADLINE)).expired, 1)
    assert.equal(await statusOf(b.id), BookingStatus.CANCELLED)
    const event = await getTestPrisma().bookingEvent.findFirstOrThrow({ where: { bookingId: b.id, type: 'STATUS_CHANGE' } })
    assert.equal((event.metadata as any).reason, 'expired')
    assert.equal(event.actorId, null)

    await settle()
    const notes = await getTestPrisma().notification.findMany({ where: { type: 'BOOKING_CANCELLED' } })
    assert.equal(notes.length, 2)
    for (const n of notes) {
      assert.equal(n.title, 'Request expired')
      assert.match(n.body, /expired because .*(answer it|answered) by the end of its start day/)
      assert.doesNotMatch(n.body, /cancel/i)
    }
    const users = await getTestPrisma().user.findMany({ where: { id: { in: [owner.id, renter.id] } }, select: { cancellationCount: true } })
    assert.deepEqual(users.map((u) => u.cancellationCount), [0, 0])
  })

  test('ACCEPTED expires at the end of the start day, not at its start; its rent hold is released', async () => {
    const rent = mock.method(paymentService, 'cancelPaymentIntent', async (b: { stripePaymentIntentId: string }) => ({ id: b.stripePaymentIntentId, status: 'canceled' }))
    const withPi = await booking(BookingStatus.ACCEPTED, { stripePaymentIntentId: 'pi_expire_1', paymentStatus: PaymentStatus.AUTHORIZED })
    const withoutPi = await booking(BookingStatus.ACCEPTED)

    assert.equal((await expireUnconfirmedBookings(PENDING_DEADLINE)).expired, 0, 'still payable on its start day')
    assert.equal((await expireUnconfirmedBookings(new Date(ACCEPTED_DEADLINE.getTime() - 1000))).expired, 0)
    assert.equal((await expireUnconfirmedBookings(ACCEPTED_DEADLINE)).expired, 2)
    assert.equal(await statusOf(withPi.id), BookingStatus.CANCELLED)
    assert.equal(await statusOf(withoutPi.id), BookingStatus.CANCELLED)
    assert.equal(rent.mock.callCount(), 1)

    await settle()
    const toRenter = await getTestPrisma().notification.findFirstOrThrow({ where: { userId: renter.id } })
    assert.match(toRenter.body, /expired because it wasn't paid by the end of its start day\. You weren't charged\./)
  })

  test('a rent PaymentIntent already cancelled on Stripe is tolerated', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
    const pi = await stripe.paymentIntents.create({ amount: 3000, currency: process.env.STRIPE_CURRENCY ?? 'cad', payment_method_types: ['card'], capture_method: 'manual' })
    await stripe.paymentIntents.cancel(pi.id)
    const b = await booking(BookingStatus.ACCEPTED, { stripePaymentIntentId: pi.id })
    const result = await expireUnconfirmedBookings(ACCEPTED_DEADLINE)
    assert.equal(result.failed, 0)
    assert.equal(result.expired, 1)
    assert.equal(await statusOf(b.id), BookingStatus.CANCELLED)
  })

  test('a real unpaid hold is cancelled on Stripe', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
    const pi = await stripe.paymentIntents.create({ amount: 3000, currency: process.env.STRIPE_CURRENCY ?? 'cad', payment_method: 'pm_card_visa', payment_method_types: ['card'], confirm: true, capture_method: 'manual' })
    await booking(BookingStatus.ACCEPTED, { stripePaymentIntentId: pi.id, paymentStatus: PaymentStatus.AUTHORIZED })
    assert.equal((await expireUnconfirmedBookings(ACCEPTED_DEADLINE)).expired, 1)
    assert.equal((await stripe.paymentIntents.retrieve(pi.id)).status, 'canceled')
  })

  test('other statuses are left alone; overlapping runs expire once', async () => {
    for (const s of [BookingStatus.CONFIRMED, BookingStatus.ACTIVE, BookingStatus.DECLINED, BookingStatus.COMPLETED]) await booking(s)
    const pending = await booking(BookingStatus.PENDING)
    const later = new Date(ACCEPTED_DEADLINE.getTime() + 86_400_000)
    const [a, b] = await Promise.all([expireUnconfirmedBookings(later), expireUnconfirmedBookings(later)])
    assert.equal(a.expired + b.expired, 1)
    assert.equal(await getTestPrisma().bookingEvent.count({ where: { bookingId: pending.id, type: 'STATUS_CHANGE' } }), 1)
    assert.equal(await getTestPrisma().booking.count({ where: { status: BookingStatus.CANCELLED } }), 1)
  })

  test('a Confirm holding the lock wins; the job then leaves the booking alone', async () => {
    const b = await booking(BookingStatus.ACCEPTED, { stripePaymentIntentId: 'pi_confirm_race', paymentStatus: PaymentStatus.AUTHORIZED })
    const rent = mock.method(paymentService, 'cancelPaymentIntent', async () => ({ status: 'canceled' }))
    let release!: () => void
    let locked!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const held = new Promise<void>((r) => (locked = r))
    const confirmTx = getTestPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${b.id} FOR UPDATE`
      await tx.booking.update({ where: { id: b.id }, data: { status: BookingStatus.CONFIRMED } })
      locked()
      await gate
    }, { timeout: 20_000 })
    await held
    const job = expireUnconfirmedBookings(ACCEPTED_DEADLINE)
    await new Promise((r) => setTimeout(r, 300))
    release()
    await confirmTx
    assert.equal((await job).expired, 0)
    assert.equal(rent.mock.callCount(), 0)
    assert.equal(await statusOf(b.id), BookingStatus.CONFIRMED)
  })

  test('App Review demo bookings are not expired; a normal one is', async () => {
    const reviewer = await createTestUser({ email: 'reviewer@zoink.app', firstName: 'App' })
    const demo = await booking(BookingStatus.ACCEPTED, { renterId: reviewer.id })
    const normal = await booking(BookingStatus.ACCEPTED)
    assert.equal((await expireUnconfirmedBookings(new Date(ACCEPTED_DEADLINE.getTime() + 7 * 86_400_000))).expired, 1)
    assert.equal(await statusOf(demo.id), BookingStatus.ACCEPTED)
    assert.equal(await statusOf(normal.id), BookingStatus.CANCELLED)
  })
})

describe('same-day requests', () => {
  test('a request made today, after 00:00, survives the job and can still be answered today', async () => {
    const today = dayOffset(0).toISOString()
    const created = await supertest(getApp()).post('/bookings').set('Authorization', `Bearer ${renter.token}`).send({ listingId, startDate: today, endDate: today })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal((await expireUnconfirmedBookings(new Date())).expired, 0)
    assert.equal(await statusOf(created.body.id), BookingStatus.PENDING)
  })
})

describe('Pay / Confirm after the start day', () => {
  test('an ACCEPTED booking whose start day has ended cannot be paid or confirmed', async () => {
    const b = await booking(BookingStatus.ACCEPTED, { startDate: dayOffset(-1), endDate: dayOffset(-1) })
    const pay = await supertest(getApp()).post(`/bookings/${b.id}/payment-intent`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(pay.status, 400, JSON.stringify(pay.body))
    assert.equal(pay.body.error, 'This booking expired at the end of its start day.')
    const confirm = await supertest(getApp()).patch(`/bookings/${b.id}/confirm`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(confirm.status, 400, JSON.stringify(confirm.body))
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: b.id } })).stripePaymentIntentId, null)
  })

  test('App Review demo bookings past their start day can still be paid and confirmed; a normal one cannot', async () => {
    const expiry = 'This booking expired at the end of its start day.'
    const reviewer = await createTestUser({ email: 'reviewer@zoink.app', firstName: 'App' })
    const asRenter = await booking(BookingStatus.ACCEPTED, { renterId: reviewer.id, startDate: dayOffset(-1), endDate: dayOffset(-1) })
    const pay = await supertest(getApp()).post(`/bookings/${asRenter.id}/payment-intent`).set('Authorization', `Bearer ${reviewer.token}`)
    assert.notEqual(pay.body.error, expiry, JSON.stringify(pay.body))
    const confirm = await supertest(getApp()).patch(`/bookings/${asRenter.id}/confirm`).set('Authorization', `Bearer ${reviewer.token}`)
    assert.notEqual(confirm.body.error, expiry, JSON.stringify(confirm.body))

    // The reviewer as the owner (the recording cast's renter is a normal account here).
    const reviewerOwner = await createTestUser({ email: 'reviewer-owner@zoink.app', firstName: 'Owner', stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID ?? null })
    const demoListing = (await createTestListing(reviewerOwner.id, { title: 'Demo tent' })).id
    const asOwner = await booking(BookingStatus.ACCEPTED, { listingId: demoListing, ownerId: reviewerOwner.id, startDate: dayOffset(-1), endDate: dayOffset(-1) })
    const ownerPay = await supertest(getApp()).post(`/bookings/${asOwner.id}/payment-intent`).set('Authorization', `Bearer ${renter.token}`)
    assert.notEqual(ownerPay.body.error, expiry, JSON.stringify(ownerPay.body))

    const normal = await booking(BookingStatus.ACCEPTED, { startDate: dayOffset(-1), endDate: dayOffset(-1) })
    const refused = await supertest(getApp()).post(`/bookings/${normal.id}/payment-intent`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(refused.status, 400)
    assert.equal(refused.body.error, expiry)
  })

  test('a PENDING request whose start day has ended cannot be accepted; one starting today can', async () => {
    const expired = await booking(BookingStatus.PENDING, { startDate: dayOffset(-1), endDate: dayOffset(-1) })
    const res = await supertest(getApp()).patch(`/bookings/${expired.id}/accept`).set('Authorization', `Bearer ${owner.token}`)
    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.equal(res.body.error, 'This booking expired at the end of its start day.')
    assert.equal(await statusOf(expired.id), BookingStatus.PENDING)

    const today = await booking(BookingStatus.PENDING, { startDate: dayOffset(0), endDate: dayOffset(0) })
    const ok = await supertest(getApp()).patch(`/bookings/${today.id}/accept`).set('Authorization', `Bearer ${owner.token}`)
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
  })

  test('a Confirm after the job expired the booking is refused', async () => {
    const b = await booking(BookingStatus.ACCEPTED, { startDate: dayOffset(0), endDate: dayOffset(0) })
    // The job ran at the deadline (simulated by expiring it at a later "now").
    await expireUnconfirmedBookings(new Date(Date.now() + 2 * 86_400_000))
    assert.equal(await statusOf(b.id), BookingStatus.CANCELLED)
    const confirm = await supertest(getApp()).patch(`/bookings/${b.id}/confirm`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(confirm.status, 409)
  })
})
