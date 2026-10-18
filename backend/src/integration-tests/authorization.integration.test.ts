/**
 * Integration Tests — Who can reach what (authZ / IDOR matrix)
 * ============================================================
 * One table per resource. For every route that takes an id:
 *  - a verified user who isn't a party to the resource gets 403 or 404 and
 *    nothing changes;
 *  - no token gets 401;
 *  - an unverified account gets 403 where the route needs a verified student;
 *  - a regular user gets 403 on every admin route.
 * Plus: responses never carry another user's credentials, Stripe ids or
 * contact details.
 *
 * No Stripe calls: every refused request stops before one, and the fixtures
 * are written straight to the database.
 */

import test, { after, before, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, DisputeReason, PaymentStatus, Prisma, ReviewRole, Role, VerificationStatus } from '@prisma/client'
import {
  createTestListing,
  createTestUser,
  disconnectTestPrisma,
  futureDates,
  getApp,
  getTestPrisma,
  handoffPhotoUrl,
  truncateAllTables,
} from './setup'

type U = { id: string; token: string }
let owner: U
let renter: U
let stranger: U
let unverified: U
let admin: U

let listingId: string
let listingImageId: string
let pendingBookingId: string
let confirmedBookingId: string
let pickupBookingId: string
let completedBookingId: string
let conversationId: string
let disputeId: string
let renterObligationId: string

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

async function bookingRow(status: BookingStatus, extra: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  const { startDate, endDate } = futureDates(5, 2)
  const row = await getTestPrisma().booking.create({
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
      hstAmount: new Prisma.Decimal(5.2),
      status,
      ...extra,
    },
  })
  return row.id
}

before(async () => {
  await truncateAllTables()
  const db = getTestPrisma()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_owner_secret' })
  renter = await createTestUser({ firstName: 'Renter' })
  stranger = await createTestUser({ firstName: 'Stranger' })
  unverified = await createTestUser({ firstName: 'Unverified' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  await db.user.update({ where: { id: unverified.id }, data: { verificationStatus: VerificationStatus.PENDING } })
  await db.user.update({ where: { id: renter.id }, data: { stripeCustomerId: 'cus_test_renter_secret' } })

  listingId = (await createTestListing(owner.id, { dailyPrice: 20 })).id
  listingImageId = (
    await db.listingImage.create({
      data: { listingId, url: 'https://res.cloudinary.com/demo/image/upload/v1/listings/one.jpg', order: 0 },
    })
  ).id

  pendingBookingId = await bookingRow(BookingStatus.PENDING)
  confirmedBookingId = await bookingRow(BookingStatus.CONFIRMED, {
    paymentStatus: PaymentStatus.AUTHORIZED,
    stripePaymentIntentId: 'pi_test_authz_secret',
  })
  pickupBookingId = await bookingRow(BookingStatus.PICKUP_PENDING, {
    paymentStatus: PaymentStatus.AUTHORIZED,
    stripePaymentIntentId: 'pi_test_authz_pickup',
    pickupPhotos: ['https://res.cloudinary.com/demo/image/upload/a.jpg', 'https://res.cloudinary.com/demo/image/upload/b.jpg'],
    handoffInitiatedAt: new Date(),
  })
  completedBookingId = await bookingRow(BookingStatus.COMPLETED, {
    paymentStatus: PaymentStatus.CAPTURED,
    completedAt: new Date(),
  })

  conversationId = (await db.conversation.create({ data: { listingId, renterId: renter.id, ownerId: owner.id } })).id
  await db.message.create({ data: { conversationId, senderId: renter.id, body: 'Is this still available?' } })

  disputeId = (
    await db.dispute.create({
      data: {
        bookingId: completedBookingId,
        raisedByUserId: renter.id,
        reason: DisputeReason.ITEM_NOT_AS_DESCRIBED,
        description: 'Private details about what went wrong.',
      },
    })
  ).id

  renterObligationId = (
    await db.reviewObligation.create({
      data: { bookingId: completedBookingId, userId: renter.id, targetUserId: owner.id, reviewerRole: ReviewRole.RENTER },
    })
  ).id
})

after(async () => {
  await disconnectTestPrisma()
})

type Req = ReturnType<typeof supertest.agent> extends never ? never : any
type Call = { name: string; send: (agent: any, token?: string) => Req }

function as(token: string | undefined, req: any) {
  return token ? req.set('Authorization', `Bearer ${token}`) : req
}

/** A snapshot of everything a refused request must not have changed. */
async function snapshot() {
  const db = getTestPrisma()
  const [bookings, listing, images, messages, conversations, disputes, reviews, obligations] = await Promise.all([
    db.booking.findMany({ orderBy: { id: 'asc' } }),
    db.listing.findUnique({ where: { id: listingId } }),
    db.listingImage.findMany({ orderBy: { id: 'asc' } }),
    db.message.count(),
    db.conversation.findMany({ orderBy: { id: 'asc' } }),
    db.dispute.findMany({ orderBy: { id: 'asc' } }),
    db.review.count(),
    db.reviewObligation.findMany({ orderBy: { id: 'asc' } }),
  ])
  return JSON.stringify({ bookings, listing, images, messages, conversations, disputes, reviews, obligations })
}

// Every route that acts on someone else's resource by id. Bodies are valid,
// so a refusal can only come from the authorization check.
const RESOURCE_CALLS: Call[] = [
  // Bookings
  { name: 'GET /bookings/:id', send: (a, t) => as(t, a.get(`/bookings/${confirmedBookingId}`)) },
  { name: 'GET /bookings/:id/photos', send: (a, t) => as(t, a.get(`/bookings/${completedBookingId}/photos`)) },
  { name: 'PATCH /bookings/:id/accept', send: (a, t) => as(t, a.patch(`/bookings/${pendingBookingId}/accept`)) },
  { name: 'PATCH /bookings/:id/decline', send: (a, t) => as(t, a.patch(`/bookings/${pendingBookingId}/decline`)) },
  { name: 'PATCH /bookings/:id/cancel', send: (a, t) => as(t, a.patch(`/bookings/${confirmedBookingId}/cancel`)) },
  { name: 'POST /bookings/:id/payment-intent', send: (a, t) => as(t, a.post(`/bookings/${pendingBookingId}/payment-intent`)) },
  { name: 'PATCH /bookings/:id/confirm', send: (a, t) => as(t, a.patch(`/bookings/${pendingBookingId}/confirm`)) },
  {
    name: 'POST /bookings/:id/pickup/initiate',
    send: (a, t) =>
      as(t, a.post(`/bookings/${confirmedBookingId}/pickup/initiate`)).send({
        photos: [handoffPhotoUrl(confirmedBookingId, 'x1'), handoffPhotoUrl(confirmedBookingId, 'x2')],
      }),
  },
  {
    name: 'POST /bookings/:id/photos',
    send: (a, t) =>
      as(t, a.post(`/bookings/${confirmedBookingId}/photos`)).send({
        phase: 'pickup',
        photoUrls: [handoffPhotoUrl(confirmedBookingId, 'y1'), handoffPhotoUrl(confirmedBookingId, 'y2')],
      }),
  },
  {
    name: 'POST /bookings/:id/photos/upload',
    send: (a, t) =>
      as(t, a.post(`/bookings/${confirmedBookingId}/photos/upload`)).attach('image', PNG_1PX, { filename: 'p.png', contentType: 'image/png' }),
  },
  { name: 'POST /bookings/:id/zoink-tap', send: (a, t) => as(t, a.post(`/bookings/${pickupBookingId}/zoink-tap`)).send({ phase: 'pickup' }) },
  { name: 'POST /bookings/:id/pickup/confirm', send: (a, t) => as(t, a.post(`/bookings/${pickupBookingId}/pickup/confirm`)) },
  { name: 'POST /bookings/:id/return/confirm', send: (a, t) => as(t, a.post(`/bookings/${pickupBookingId}/return/confirm`)) },
  {
    name: 'POST /bookings/:id/return/initiate',
    send: (a, t) =>
      as(t, a.post(`/bookings/${pickupBookingId}/return/initiate`)).send({
        photos: [handoffPhotoUrl(pickupBookingId, 'r1'), handoffPhotoUrl(pickupBookingId, 'r2')],
      }),
  },
  // Listings
  { name: 'PATCH /listings/:id', send: (a, t) => as(t, a.patch(`/listings/${listingId}`)).send({ title: 'Mine now' }) },
  { name: 'PATCH /listings/:id/availability', send: (a, t) => as(t, a.patch(`/listings/${listingId}/availability`)).send({ isAvailable: false }) },
  { name: 'DELETE /listings/:id', send: (a, t) => as(t, a.delete(`/listings/${listingId}`)) },
  {
    name: 'POST /listings/:id/images',
    send: (a, t) => as(t, a.post(`/listings/${listingId}/images`)).attach('image', PNG_1PX, { filename: 'l.png', contentType: 'image/png' }),
  },
  { name: 'DELETE /listings/:id/images/:imageId', send: (a, t) => as(t, a.delete(`/listings/${listingId}/images/${listingImageId}`)) },
  // Conversations
  { name: 'GET /conversations/:id', send: (a, t) => as(t, a.get(`/conversations/${conversationId}`)) },
  { name: 'GET /conversations/:id/messages', send: (a, t) => as(t, a.get(`/conversations/${conversationId}/messages`)) },
  { name: 'POST /conversations/:id/messages', send: (a, t) => as(t, a.post(`/conversations/${conversationId}/messages`)).send({ body: 'hi' }) },
  { name: 'POST /conversations/:id/read', send: (a, t) => as(t, a.post(`/conversations/${conversationId}/read`)) },
  // Disputes and reviews
  { name: 'GET /disputes/:id', send: (a, t) => as(t, a.get(`/disputes/${disputeId}`)) },
  {
    name: 'POST /disputes',
    send: (a, t) =>
      as(t, a.post('/disputes')).send({ bookingId: completedBookingId, reason: 'OTHER', description: 'Not my booking at all.' }),
  },
  {
    name: 'POST /reviews',
    send: (a, t) =>
      as(t, a.post('/reviews')).send({
        obligationId: renterObligationId,
        reviewerRole: 'RENTER',
        scoreA: 1,
        scoreB: 1,
        scoreC: 1,
        itemRating: 1,
      }),
  },
]

describe('a verified user who is not a party gets 403/404 and changes nothing', () => {
  for (const call of RESOURCE_CALLS) {
    test(call.name, async () => {
      const before = await snapshot()
      const res = await call.send(supertest(getApp()), stranger.token)
      assert.ok([403, 404].includes(res.status), `${call.name} answered ${res.status}: ${JSON.stringify(res.body)}`)
      assert.equal(await snapshot(), before, `${call.name} changed data for a stranger`)
    })
  }

  test('a stranger never sees the conversation in their inbox', async () => {
    const res = await supertest(getApp()).get('/conversations/me').set('Authorization', `Bearer ${stranger.token}`)
    assert.equal(res.status, 200)
    assert.ok(!JSON.stringify(res.body).includes(conversationId))
  })

  test("a stranger's dispute list doesn't include other people's disputes", async () => {
    const res = await supertest(getApp()).get('/disputes').set('Authorization', `Bearer ${stranger.token}`)
    assert.equal(res.status, 200)
    assert.ok(!JSON.stringify(res.body).includes(disputeId))
  })
})

// Every route behind requireAuth, with no token at all.
const AUTHED_ROUTES: [string, string][] = [
  ['get', '/users/me'],
  ['patch', '/users/me'],
  ['delete', '/users/me'],
  ['patch', '/users/me/notification-prefs'],
  ['post', '/users/me/accept-terms'],
  ['patch', '/users/me/push-token'],
  ['post', '/users/me/avatar'],
  ['post', '/users/me/stripe-connect/onboard'],
  ['get', '/users/me/stripe-connect/status'],
  ['get', '/users/me/blocks'],
  ['post', '/users/00000000-0000-4000-8000-000000000000/block'],
  ['delete', '/users/00000000-0000-4000-8000-000000000000/block'],
  ['get', '/users/00000000-0000-4000-8000-000000000000'],
  ['get', '/stripe/connect/status'],
  ['post', '/auth/verify-email'],
  ['post', '/auth/resend-otp'],
  ['get', '/listings'],
  ['get', '/listings/me'],
  ['get', '/listings/categories'],
  ['get', '/listings/x'],
  ['post', '/listings'],
  ['patch', '/listings/x'],
  ['patch', '/listings/x/availability'],
  ['delete', '/listings/x'],
  ['post', '/listings/x/images'],
  ['delete', '/listings/x/images/y'],
  ['post', '/bookings'],
  ['get', '/bookings/me'],
  ['get', '/bookings/requests'],
  ['get', '/bookings/x'],
  ['get', '/bookings/x/photos'],
  ['post', '/bookings/x/pickup/initiate'],
  ['post', '/bookings/x/pickup/confirm'],
  ['post', '/bookings/x/return/initiate'],
  ['post', '/bookings/x/return/confirm'],
  ['post', '/bookings/x/photos'],
  ['post', '/bookings/x/photos/upload'],
  ['post', '/bookings/x/zoink-tap'],
  ['patch', '/bookings/x/accept'],
  ['post', '/bookings/x/payment-intent'],
  ['patch', '/bookings/x/confirm'],
  ['patch', '/bookings/x/decline'],
  ['patch', '/bookings/x/cancel'],
  ['post', '/conversations'],
  ['get', '/conversations/me'],
  ['get', '/conversations/x'],
  ['get', '/conversations/x/messages'],
  ['post', '/conversations/x/messages'],
  ['post', '/conversations/x/read'],
  ['get', '/reviews/pending'],
  ['post', '/reviews'],
  ['post', '/disputes'],
  ['get', '/disputes'],
  ['get', '/disputes/x'],
  ['post', '/reports'],
  ['get', '/admin/disputes'],
  ['get', '/admin/disputes/x'],
  ['patch', '/admin/disputes/x/resolve'],
  ['get', '/admin/bookings/x/events'],
  ['get', '/admin/reports'],
  ['patch', '/admin/reports/x'],
]

describe('no token: 401 everywhere but the public routes', () => {
  for (const [method, path] of AUTHED_ROUTES) {
    test(`${method.toUpperCase()} ${path}`, async () => {
      const res = await (supertest(getApp()) as any)[method](path)
      assert.equal(res.status, 401, `${method.toUpperCase()} ${path} answered ${res.status}`)
    })
  }

  test('a token signed with the wrong secret is refused', async () => {
    const jwt = require('jsonwebtoken')
    const forged = jwt.sign({ userId: admin.id, role: 'ADMIN' }, 'not-the-secret', { algorithm: 'HS256' })
    const res = await supertest(getApp()).get('/admin/disputes').set('Authorization', `Bearer ${forged}`)
    assert.equal(res.status, 401)
  })

  test('an expired token is refused', async () => {
    const jwt = require('jsonwebtoken')
    const expired = jwt.sign({ userId: renter.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -10 })
    const res = await supertest(getApp()).get('/users/me').set('Authorization', `Bearer ${expired}`)
    assert.equal(res.status, 401)
  })
})

// Routes that need a verified student (requireVerified). An unverified account
// can still manage its own profile, block people and verify.
const VERIFIED_ROUTES: [string, string][] = AUTHED_ROUTES.filter(
  ([, path]) =>
    !path.startsWith('/users/me') &&
    !path.startsWith('/admin') &&
    !path.startsWith('/auth') &&
    !path.startsWith('/stripe') &&
    !path.endsWith('/block')
).concat([['post', '/users/me/stripe-connect/onboard']])

describe('an unverified account gets 403 on every student route', () => {
  for (const [method, path] of VERIFIED_ROUTES) {
    test(`${method.toUpperCase()} ${path}`, async () => {
      const res = await (supertest(getApp()) as any)[method](path).set('Authorization', `Bearer ${unverified.token}`)
      assert.equal(res.status, 403, `${method.toUpperCase()} ${path} answered ${res.status}`)
    })
  }
})

describe('a regular user gets 403 on every admin route', () => {
  const adminCalls: Call[] = [
    { name: 'GET /admin/disputes', send: (a, t) => as(t, a.get('/admin/disputes')) },
    { name: 'GET /admin/disputes/:id', send: (a, t) => as(t, a.get(`/admin/disputes/${disputeId}`)) },
    {
      name: 'PATCH /admin/disputes/:id/resolve',
      send: (a, t) => as(t, a.patch(`/admin/disputes/${disputeId}/resolve`)).send({ status: 'DISMISSED', resolutionNotes: 'mine' }),
    },
    { name: 'GET /admin/bookings/:id/events', send: (a, t) => as(t, a.get(`/admin/bookings/${completedBookingId}/events`)) },
    { name: 'GET /admin/reports', send: (a, t) => as(t, a.get('/admin/reports')) },
    {
      name: 'PATCH /admin/reports/:id',
      send: (a, t) => as(t, a.patch('/admin/reports/00000000-0000-4000-8000-000000000000')).send({ status: 'DISMISSED' }),
    },
  ]
  for (const call of adminCalls) {
    test(`${call.name} (booking participant, not admin)`, async () => {
      const before = await snapshot()
      const res = await call.send(supertest(getApp()), renter.token)
      assert.equal(res.status, 403)
      assert.equal(await snapshot(), before)
    })
  }

  test('the admin can read the dispute list (the gate is the role, not a blanket block)', async () => {
    const res = await supertest(getApp()).get('/admin/disputes').set('Authorization', `Bearer ${admin.token}`)
    assert.equal(res.status, 200)
  })
})

describe('responses never carry credentials, Stripe ids or contact details', () => {
  const SECRETS = ['passwordHash', 'acct_test_owner_secret', 'cus_test_renter_secret', 'stripeAccountId', 'stripeCustomerId']

  function assertClean(body: unknown, label: string, extra: string[] = []) {
    const text = JSON.stringify(body)
    for (const secret of [...SECRETS, ...extra]) {
      assert.ok(!text.includes(secret), `${label} leaks ${secret}`)
    }
  }

  test("a booking, to either party, has no Stripe ids or the other party's credentials", async () => {
    for (const viewer of [owner, renter]) {
      const res = await supertest(getApp()).get(`/bookings/${confirmedBookingId}`).set('Authorization', `Bearer ${viewer.token}`)
      assert.equal(res.status, 200)
      assertClean(res.body, 'GET /bookings/:id')
    }
  })

  test('booking lists have no Stripe ids', async () => {
    const mine = await supertest(getApp()).get('/bookings/me').set('Authorization', `Bearer ${renter.token}`)
    const requests = await supertest(getApp()).get('/bookings/requests').set('Authorization', `Bearer ${owner.token}`)
    assertClean(mine.body, 'GET /bookings/me')
    assertClean(requests.body, 'GET /bookings/requests')
  })

  test("a public profile shows no email or phone", async () => {
    const res = await supertest(getApp()).get(`/users/${owner.id}`).set('Authorization', `Bearer ${stranger.token}`)
    assert.equal(res.status, 200)
    const owners = await getTestPrisma().user.findUniqueOrThrow({ where: { id: owner.id } })
    assertClean(res.body, 'GET /users/:id', [owners.email, owners.phone ?? '+1'])
  })

  test("a listing shows no owner email, phone or Stripe account", async () => {
    const res = await supertest(getApp()).get(`/listings/${listingId}`).set('Authorization', `Bearer ${stranger.token}`)
    assert.equal(res.status, 200)
    const owners = await getTestPrisma().user.findUniqueOrThrow({ where: { id: owner.id } })
    assertClean(res.body, 'GET /listings/:id', [owners.email])
  })

  test('the conversation, to its renter, has no Stripe ids or owner email', async () => {
    const res = await supertest(getApp()).get(`/conversations/${conversationId}`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(res.status, 200)
    const owners = await getTestPrisma().user.findUniqueOrThrow({ where: { id: owner.id } })
    assertClean(res.body, 'GET /conversations/:id', [owners.email])
  })
})
