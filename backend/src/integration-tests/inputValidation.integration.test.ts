/**
 * Integration Tests — request validation on the remaining unvalidated routes
 * ==========================================================================
 * The conversation routes, GET /users/:id, PATCH /users/me/push-token and
 * GET /disputes?status took raw input straight into Prisma (a non-string
 * listingId or an unknown status enum surfaced as a 500). They now go through
 * Zod like every other route: malformed input is a 400 with the usual
 * { error: 'Validation failed.', issues } body. Stripe payout onboarding now
 * also requires a verified account.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { torontoDayKey } from '@zoink/shared'
import { truncateAllTables, createTestUser, createTestListing, getTestPrisma, disconnectTestPrisma, getApp, futureDates } from './setup'

let user: { id: string; token: string }
let owner: { id: string; token: string }
let conversationId: string
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Renter' })
  owner = await createTestUser({ firstName: 'Owner' })
  listingId = (await createTestListing(owner.id)).id
  conversationId = (await getTestPrisma().conversation.create({ data: { listingId, renterId: user.id, ownerId: owner.id } })).id
})

after(async () => {
  await disconnectTestPrisma()
})

const as = (token: string) => ({
  get: (path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string) => supertest(getApp()).post(path).set('Authorization', `Bearer ${token}`),
  patch: (path: string) => supertest(getApp()).patch(path).set('Authorization', `Bearer ${token}`),
})

function assertValidationError(res: supertest.Response) {
  assert.equal(res.status, 400, JSON.stringify(res.body))
  assert.equal(res.body.error, 'Validation failed.')
}

describe('conversation routes', () => {
  test('POST /conversations needs a listingId string (an object was a 500)', async () => {
    assertValidationError(await as(user.token).post('/conversations').send({ listingId: { not: 'a string' } }))
    assertValidationError(await as(user.token).post('/conversations').send({}))
    assert.equal((await as(user.token).post('/conversations').send({ listingId })).status, 201)
  })

  test('conversation ids and the message cursor must be UUIDs', async () => {
    assertValidationError(await as(user.token).get('/conversations/not-a-uuid'))
    assertValidationError(await as(user.token).get('/conversations/not-a-uuid/messages'))
    assertValidationError(await as(user.token).get(`/conversations/${conversationId}/messages?after=not-a-uuid`))
    assertValidationError(await as(user.token).post('/conversations/not-a-uuid/read'))

    assert.equal((await as(user.token).get(`/conversations/${conversationId}`)).status, 200)
    assert.equal((await as(user.token).get(`/conversations/${conversationId}/messages`)).status, 200)
    assert.equal((await as(user.token).post(`/conversations/${conversationId}/read`)).status, 204)
  })
})

describe('user routes', () => {
  test('GET /users/:id needs a UUID', async () => {
    assertValidationError(await as(user.token).get('/users/not-a-uuid'))
    assert.equal((await as(user.token).get(`/users/${owner.id}`)).status, 200)
  })

  test('PATCH /users/me/push-token takes a bounded string or null', async () => {
    assertValidationError(await as(user.token).patch('/users/me/push-token').send({ expoPushToken: 'x'.repeat(5000) }))
    assertValidationError(await as(user.token).patch('/users/me/push-token').send({ expoPushToken: 42 }))
    assert.equal((await as(user.token).patch('/users/me/push-token').send({ expoPushToken: 'ExponentPushToken[abc123]' })).status, 200)
    assert.equal((await as(user.token).patch('/users/me/push-token').send({ expoPushToken: null })).status, 200)
  })

  test('Stripe payout onboarding requires a verified account', async () => {
    await getTestPrisma().user.update({ where: { id: user.id }, data: { verificationStatus: 'PENDING' } })
    const res = await as(user.token).post('/users/me/stripe-connect/onboard')
    assert.equal(res.status, 403)
  })
})

describe('dispute routes', () => {
  test('GET /disputes?status must be a known status (an unknown one was a 500)', async () => {
    assertValidationError(await as(user.token).get('/disputes?status=BOGUS'))
    assert.equal((await as(user.token).get('/disputes?status=OPEN')).status, 200)
    assert.equal((await as(user.token).get('/disputes')).status, 200)
  })
})

describe('unknown fields are refused, not dropped', () => {
  function assertUnknownField(res: supertest.Response, field: string) {
    assertValidationError(res)
    assert.ok(
      res.body.issues.some((i: { message: string }) => i.message.includes(field)),
      `names ${field}: ${JSON.stringify(res.body.issues)}`
    )
  }

  test('a profile update cannot carry role, verification or email, and changes nothing', async () => {
    for (const extra of [{ role: 'ADMIN' }, { verificationStatus: 'VERIFIED' }, { email: 'other@mail.utoronto.ca' }]) {
      assertUnknownField(await as(user.token).patch('/users/me').send({ bio: 'Changed', ...extra }), Object.keys(extra)[0])
    }
    const row = await getTestPrisma().user.findUniqueOrThrow({ where: { id: user.id } })
    assert.equal(row.role, 'USER')
    assert.equal(row.bio, null)
    assert.equal((await as(user.token).patch('/users/me').send({ bio: 'Changed' })).status, 200, 'the known fields alone go through')
  })

  test('a listing cannot be created for someone else or with server-owned fields', async () => {
    const listing = {
      title: 'Camera',
      description: 'A camera',
      category: 'Electronics',
      dailyPrice: 10,
      latitude: 43.66,
      longitude: -79.39,
      city: 'Toronto',
    }
    assertUnknownField(await as(user.token).post('/listings').send({ ...listing, ownerId: owner.id }), 'ownerId')
    assertUnknownField(await as(user.token).post('/listings').send({ ...listing, isAvailable: false, images: [] }), 'isAvailable')
    assert.equal(await getTestPrisma().listing.count({ where: { title: 'Camera' } }), 0)
  })

  test('sign-up cannot carry a role', async () => {
    const res = await supertest(getApp()).post('/auth/register').set('X-Real-IP', '198.18.0.1').send({ email: 'x@mail.utoronto.ca', role: 'ADMIN' })
    assertUnknownField(res, 'role')
  })

  test('unknown query parameters are refused too', async () => {
    assertUnknownField(await as(user.token).get('/listings?ownerId=abc'), 'ownerId')
    assert.equal((await as(user.token).get('/listings?q=camera')).status, 200)
  })

  test('insuranceOptIn from older app builds is accepted and has no effect', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const plain = await as(user.token).post('/bookings').send({ listingId, startDate, endDate })
    assert.equal(plain.status, 201, JSON.stringify(plain.body))

    const otherListing = (await createTestListing(owner.id)).id
    const withOptIn = await as(user.token)
      .post('/bookings')
      .send({ listingId: otherListing, startDate, endDate, insuranceOptIn: true })
    assert.equal(withOptIn.status, 201, JSON.stringify(withOptIn.body))

    for (const field of ['insuranceOptIn', 'insuranceFee', 'totalPrice', 'hstAmount', 'commissionAmount', 'ownerPayout', 'depositAmount']) {
      assert.deepEqual(withOptIn.body[field], plain.body[field], field)
    }
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: withOptIn.body.id } })
    assert.equal(row.insuranceOptIn, false)
    assert.equal(row.insuranceFee.toString(), '0')

    // Only that one retired field is let through; anything else is still refused.
    assertUnknownField(
      await as(user.token).post('/bookings').send({ listingId, startDate, endDate, insuranceOptIn: true, insuranceFee: 5 }),
      'insuranceFee'
    )
  })

  test('routes that validate params and body separately still take their body', async () => {
    const res = await as(user.token).post(`/conversations/${conversationId}/messages`).send({ body: 'Hello' })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assertUnknownField(await as(user.token).post(`/conversations/${conversationId}/messages`).send({ body: 'Hi', senderId: owner.id }), 'senderId')
  })
})

describe('bounds the app already keeps to', () => {
  // A rental day as the app sends it: that calendar day at midnight UTC.
  function rentalDay(offsetDays: number) {
    const today = torontoDayKey()!
    const date = new Date(`${today}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + offsetDays)
    return date.toISOString()
  }

  test('a booking request cannot start on a day that has already gone', async () => {
    const past = await as(user.token).post('/bookings').send({ listingId, startDate: rentalDay(-1), endDate: rentalDay(1) })
    assert.equal(past.status, 400)
    assert.equal(past.body.error, 'Pick a start date from today onwards.')
    assert.equal(await getTestPrisma().booking.count(), 0)

    const today = await as(user.token).post('/bookings').send({ listingId, startDate: rentalDay(0), endDate: rentalDay(1) })
    assert.equal(today.status, 201, JSON.stringify(today.body))
  })

  test('a profile phone follows the sign-up rule and is stored the same way', async () => {
    const bad = await as(user.token).patch('/users/me').send({ phone: 'call me maybe' })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /10-digit Canadian phone number/)
    assertValidationError(await as(user.token).patch('/users/me').send({ phone: '4'.repeat(31) }))

    const ok = await as(user.token).patch('/users/me').send({ phone: '(416) 555-0199' })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal((await getTestPrisma().user.findUniqueOrThrow({ where: { id: user.id } })).phone, '+14165550199')
  })

  test('passwords and browse filters are bounded', async () => {
    const longRegister = await supertest(getApp())
      .post('/auth/register')
      .set('X-Real-IP', '198.18.0.2')
      .send({ email: 'x@mail.utoronto.ca', password: 'p'.repeat(129) })
    assert.ok(longRegister.body.issues.some((i: { path: string }) => i.path === 'body.password'), JSON.stringify(longRegister.body))
    const longLogin = await supertest(getApp())
      .post('/auth/login')
      .set('X-Real-IP', '198.18.0.3')
      .send({ email: 'x@mail.utoronto.ca', password: 'p'.repeat(1025) })
    assertValidationError(longLogin)

    assertValidationError(await as(user.token).get(`/listings?q=${'a'.repeat(101)}`))
    assertValidationError(await as(user.token).get(`/listings?category=${'a'.repeat(41)}`))
    assertValidationError(await as(user.token).get(`/listings?city=${'a'.repeat(61)}`))
  })
})
