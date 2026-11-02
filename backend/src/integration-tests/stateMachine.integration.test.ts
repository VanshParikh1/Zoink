/**
 * Integration Tests — the booking state machine over HTTP
 * =======================================================
 * Pins the invariant: PENDING -> ACCEPTED -> CONFIRMED (paid) ->
 * PICKUP_PENDING -> ACTIVE -> RETURN_PENDING -> COMPLETED, plus DECLINED and
 * CANCELLED. No skipped steps, no new states.
 *
 * For every status, every booking action the API offers is tried by the
 * party allowed to take it. Anything not on the legal list must answer 4xx
 * and leave the booking exactly as it was (no status change, no
 * STATUS_CHANGE event). Illegal requests are rejected before any Stripe call,
 * so this needs no network.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  handoffPhotoUrl,
  getApp,
} from './setup'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'

type TestUser = { id: string; token: string }
type Actor = 'owner' | 'renter'
type Action = {
  name: string
  actor: Actor
  send: (req: supertest.Agent, bookingId: string, token: string) => supertest.Test
}

let owner: TestUser
let renter: TestUser
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

after(async () => {
  await disconnectTestPrisma()
})

const photos = (id: string) => [handoffPhotoUrl(id, 'a'), handoffPhotoUrl(id, 'b')]

const ACTIONS: Action[] = [
  { name: 'accept', actor: 'owner', send: (r, id, t) => r.patch(`/bookings/${id}/accept`).set('Authorization', `Bearer ${t}`) },
  { name: 'decline', actor: 'owner', send: (r, id, t) => r.patch(`/bookings/${id}/decline`).set('Authorization', `Bearer ${t}`) },
  { name: 'cancel', actor: 'renter', send: (r, id, t) => r.patch(`/bookings/${id}/cancel`).set('Authorization', `Bearer ${t}`) },
  { name: 'confirm', actor: 'renter', send: (r, id, t) => r.patch(`/bookings/${id}/confirm`).set('Authorization', `Bearer ${t}`) },
  { name: 'pay', actor: 'renter', send: (r, id, t) => r.post(`/bookings/${id}/payment-intent`).set('Authorization', `Bearer ${t}`) },
  { name: 'pickup initiate', actor: 'owner', send: (r, id, t) => r.post(`/bookings/${id}/pickup/initiate`).set('Authorization', `Bearer ${t}`).send({ photos: photos(id) }) },
  { name: 'pickup tap', actor: 'owner', send: (r, id, t) => r.post(`/bookings/${id}/zoink-tap`).set('Authorization', `Bearer ${t}`).send({ phase: 'pickup' }) },
  { name: 'return initiate', actor: 'renter', send: (r, id, t) => r.post(`/bookings/${id}/return/initiate`).set('Authorization', `Bearer ${t}`).send({ photos: photos(id) }) },
  { name: 'return tap', actor: 'renter', send: (r, id, t) => r.post(`/bookings/${id}/zoink-tap`).set('Authorization', `Bearer ${t}`).send({ phase: 'return' }) },
]

// Actions that are legal (or a harmless no-op) from each status. Everything
// else in the matrix must be refused. Legal moves are exercised end to end by
// bookingFullFlow / bookingLifecycle / handoffRace; here they're skipped
// because they'd call Stripe.
const ALLOWED: Record<BookingStatus, string[]> = {
  PENDING: ['accept', 'decline', 'cancel'],
  ACCEPTED: ['cancel', 'confirm', 'pay'],
  CONFIRMED: ['cancel', 'pickup initiate'],
  // Re-submitting photos and the first tap stay in PICKUP_PENDING.
  PICKUP_PENDING: ['cancel', 'pickup initiate', 'pickup tap'],
  // A pickup tap after both tapped answers "already confirmed" without changing anything.
  ACTIVE: ['return initiate', 'pickup tap'],
  RETURN_PENDING: ['return initiate', 'return tap'],
  COMPLETED: ['return tap'],
  DECLINED: [],
  CANCELLED: [],
}

async function bookingIn(status: BookingStatus) {
  const { startDate, endDate } = futureDates(5, 3)
  const id = require('crypto').randomUUID()
  const handoffDone = [BookingStatus.ACTIVE, BookingStatus.RETURN_PENDING, BookingStatus.COMPLETED].includes(status as any)
  const returnStarted = [BookingStatus.RETURN_PENDING, BookingStatus.COMPLETED].includes(status as any)
  return getTestPrisma().booking.create({
    data: {
      id,
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(30),
      depositAmount: new Prisma.Decimal(0),
      status,
      paymentStatus: PaymentStatus.PENDING_AUTH,
      pickupPhotos: status === BookingStatus.PICKUP_PENDING || handoffDone ? photos(id) : [],
      returnPhotos: returnStarted ? photos(id) : [],
      completedAt: status === BookingStatus.COMPLETED ? new Date() : null,
    },
  })
}

describe('illegal transitions are refused and change nothing', () => {
  for (const status of Object.keys(ALLOWED) as BookingStatus[]) {
    test(`from ${status}`, async () => {
      const req = supertest(getApp())
      for (const action of ACTIONS) {
        if (ALLOWED[status].includes(action.name)) continue
        const booking = await bookingIn(status)
        const token = action.actor === 'owner' ? owner.token : renter.token
        const res = await action.send(req, booking.id, token)
        assert.ok(res.status >= 400 && res.status < 500, `${action.name} from ${status} answered ${res.status}: ${JSON.stringify(res.body)}`)

        const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
        assert.equal(after.status, status, `${action.name} from ${status} changed the status to ${after.status}`)
        const changes = await getTestPrisma().bookingEvent.count({ where: { bookingId: booking.id, type: 'STATUS_CHANGE' } })
        assert.equal(changes, 0, `${action.name} from ${status} recorded a status change`)
      }
    })
  }
})

describe('no step can be skipped', () => {
  test('a CONFIRMED booking cannot become ACTIVE without the pickup handoff', async () => {
    const booking = await bookingIn(BookingStatus.CONFIRMED)
    const res = await supertest(getApp()).post(`/bookings/${booking.id}/zoink-tap`).set('Authorization', `Bearer ${owner.token}`).send({ phase: 'pickup' })
    assert.equal(res.status, 400)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CONFIRMED)
  })

  test('an ACTIVE booking cannot complete without the return handoff', async () => {
    const booking = await bookingIn(BookingStatus.ACTIVE)
    const res = await supertest(getApp()).post(`/bookings/${booking.id}/zoink-tap`).set('Authorization', `Bearer ${renter.token}`).send({ phase: 'return' })
    assert.equal(res.status, 400)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.ACTIVE)
  })
})

describe('each step belongs to one party', () => {
  const cases: [BookingStatus, string, Actor][] = [
    [BookingStatus.PENDING, 'accept', 'renter'],
    [BookingStatus.PENDING, 'decline', 'renter'],
    [BookingStatus.ACCEPTED, 'confirm', 'owner'],
    [BookingStatus.ACCEPTED, 'pay', 'owner'],
    [BookingStatus.CONFIRMED, 'pickup initiate', 'renter'],
    [BookingStatus.ACTIVE, 'return initiate', 'owner'],
  ]
  for (const [status, name, wrongActor] of cases) {
    test(`${name} by the ${wrongActor} is refused`, async () => {
      const booking = await bookingIn(status)
      const action = ACTIONS.find((a) => a.name === name)!
      const res = await action.send(supertest(getApp()), booking.id, wrongActor === 'owner' ? owner.token : renter.token)
      assert.equal(res.status, 403, JSON.stringify(res.body))
      assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status, status)
    })
  }
})

describe('the state set itself', () => {
  test('there are exactly nine booking states', () => {
    assert.deepEqual(Object.values(BookingStatus).sort(), [
      'ACCEPTED',
      'ACTIVE',
      'CANCELLED',
      'COMPLETED',
      'CONFIRMED',
      'DECLINED',
      'PENDING',
      'PICKUP_PENDING',
      'RETURN_PENDING',
    ])
  })
})
