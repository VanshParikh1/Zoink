/**
 * Integration Tests — unverified accounts (owner decision, 2026-10-18)
 * =====================================================================
 * Anyone could sign up with someone else's university email, and since the
 * address was then taken and unverified accounts were never cleaned up, its
 * owner could never sign up. Decided:
 *  - An account isn't active until its code is verified (the route matrix is
 *    in authorization.integration.test.ts).
 *  - Signing up with the email of an unverified account replaces it, as a new
 *    account with a new id.
 *  - Accounts still unverified 24 hours after sign-up are deleted. The job
 *    is idempotent.
 */

import test, { after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, NotificationType, Prisma, Role, VerificationStatus } from '@prisma/client'
import {
  createTestListing,
  createTestUser,
  disconnectTestPrisma,
  futureDates,
  getApp,
  getTestPrisma,
  signTestJwt,
  truncateAllTables,
} from './setup'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'
import { purgeUnverifiedAccounts } from '../services/cleanupJob'

const HOUR = 60 * 60 * 1000
const EMAIL = 'taken@mail.utoronto.ca'
let ipCounter = 0

beforeEach(async () => {
  await truncateAllTables()
})

after(async () => {
  await disconnectTestPrisma()
})

function register(firstName: string, email = EMAIL) {
  ipCounter += 1
  return supertest(getApp())
    .post('/auth/register')
    .set('X-Real-IP', `192.0.2.${ipCounter % 250}`)
    .send({
      email,
      password: `${firstName}Password1!`,
      firstName,
      lastName: 'Student',
      phone: '416-555-0192',
      university: 'UOFT',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      acceptedPrivacyVersion: CURRENT_PRIVACY_VERSION,
      ageAttested: true,
    })
}

async function latestCode(userId: string) {
  const row = await getTestPrisma().verificationToken.findFirstOrThrow({ where: { userId, usedAt: null }, orderBy: { createdAt: 'desc' } })
  return row.code
}

function as(token: string) {
  return {
    get: (path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body?: object) =>
      supertest(getApp()).post(path).set('X-Real-IP', '192.0.2.251').set('Authorization', `Bearer ${token}`).send(body),
  }
}

/** A user row aged `hoursAgo`, unverified unless told otherwise. */
async function accountAged(hoursAgo: number, overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  return getTestPrisma().user.create({
    data: {
      email: `aged_${Math.random().toString(36).slice(2)}@mail.utoronto.ca`,
      passwordHash: 'x',
      firstName: 'Aged',
      lastName: 'Account',
      phone: '+14165550100',
      verificationStatus: VerificationStatus.PENDING,
      createdAt: new Date(Date.now() - hoursAgo * HOUR),
      ...overrides,
    },
  })
}

describe('signing up with the email of an unverified account', () => {
  test('replaces it with a new account; the earlier sign-up is gone', async () => {
    const first = await register('Squatter')
    assert.equal(first.status, 201)
    const second = await register('Owner')
    assert.equal(second.status, 201, JSON.stringify(second.body))

    assert.notEqual(second.body.user.id, first.body.user.id, 'a new id, not the old account')
    const rows = await getTestPrisma().user.findMany({ where: { email: EMAIL } })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].firstName, 'Owner')
    assert.equal(await getTestPrisma().verificationToken.count({ where: { userId: first.body.user.id } }), 0, 'old codes deleted')
  })

  test("the earlier sign-up's session can't reach the new account, before or after it is verified", async () => {
    const squatter = (await register('Squatter')).body
    const owner = (await register('Owner')).body

    assert.equal((await as(squatter.token).get('/users/me')).status, 401)
    const verified = await as(owner.token).post('/auth/verify-email', { code: await latestCode(owner.user.id) })
    assert.equal(verified.status, 200, JSON.stringify(verified.body))
    assert.equal((await as(squatter.token).get('/users/me')).status, 401)
    assert.equal((await as(verified.body.token).get('/listings')).status, 200, 'the owner is in')
  })

  test("the earlier sign-up's code no longer verifies anything", async () => {
    const squatter = (await register('Squatter')).body
    const squatterCode = await latestCode(squatter.user.id)
    const owner = (await register('Owner')).body
    await getTestPrisma().verificationToken.updateMany({ where: { userId: owner.user.id }, data: { code: '000000' } })

    const res = await as(owner.token).post('/auth/verify-email', { code: squatterCode === '000000' ? '111111' : squatterCode })
    assert.equal(res.status, 400)
  })

  test('a verified account is never replaced', async () => {
    const owner = await createTestUser({ email: EMAIL, firstName: 'Verified' })
    const res = await register('Squatter')
    assert.equal(res.status, 409)
    const row = await getTestPrisma().user.findUniqueOrThrow({ where: { email: EMAIL } })
    assert.equal(row.id, owner.id)
    assert.equal(row.firstName, 'Verified')
  })

  test('an unverified account with activity from before the gate is not replaced', async () => {
    const legacy = await accountAged(1, { email: EMAIL })
    await createTestListing(legacy.id)
    assert.equal((await register('Squatter')).status, 409)
    assert.ok(await getTestPrisma().user.findUnique({ where: { id: legacy.id } }))
  })

  test('two sign-ups at once leave exactly one account', async () => {
    await register('First')
    const results = await Promise.all([register('Second'), register('Third')])
    const statuses = results.map((r) => r.status).sort()
    assert.ok(
      JSON.stringify(statuses) === JSON.stringify([201, 409]) || JSON.stringify(statuses) === JSON.stringify([201, 201]),
      `statuses ${statuses}`
    )
    assert.equal(await getTestPrisma().user.count({ where: { email: EMAIL } }), 1)
  })

  test('the daily cap on codes to the address carries over', async () => {
    await getTestPrisma().verificationEmailSend.createMany({
      data: Array.from({ length: 9 }, (_, i) => ({ email: EMAIL, createdAt: new Date(Date.now() - (i + 1) * HOUR) })),
    })
    assert.equal((await register('Tenth')).status, 201)
    assert.equal((await register('Eleventh')).status, 429)
    assert.equal((await getTestPrisma().user.findUniqueOrThrow({ where: { email: EMAIL } })).firstName, 'Tenth')
  })
})

describe('an unverified account is not active', () => {
  test('it can read and delete itself and verify, but not change its profile, push token, avatar or blocks', async () => {
    const { token, user } = (await register('Pending')).body
    assert.equal((await as(token).get('/users/me')).status, 200)
    for (const [method, path, body] of [
      ['patch', '/users/me', { bio: 'hi' }],
      ['patch', '/users/me/push-token', { expoPushToken: 'ExponentPushToken[x]' }],
      ['patch', '/users/me/notification-prefs', { notifyMessages: false }],
      ['post', '/users/me/accept-terms', {}],
      ['get', '/users/me/blocks', undefined],
    ] as const) {
      const res = await (supertest(getApp()) as any)[method](path).set('Authorization', `Bearer ${token}`).send(body)
      assert.equal(res.status, 403, `${method} ${path}`)
    }
    const verified = await as(token).post('/auth/verify-email', { code: await latestCode(user.id) })
    assert.equal(verified.status, 200)
    assert.equal((await as(verified.body.token).get('/users/me/blocks')).status, 200, 'and once verified, it can')
  })
})

describe('purgeUnverifiedAccounts', () => {
  test('deletes accounts still unverified 24 hours after sign-up, with their codes, blocks and notifications', async () => {
    const db = getTestPrisma()
    const stale = await accountAged(25)
    const failed = await accountAged(48, { verificationStatus: VerificationStatus.FAILED })
    const someone = await createTestUser()
    await db.verificationToken.create({ data: { userId: stale.id, code: '123456', expiresAt: new Date() } })
    await db.userBlock.create({ data: { blockerId: stale.id, blockedId: someone.id } })
    await db.notification.create({ data: { userId: stale.id, type: NotificationType.VERIFICATION_APPROVED, title: 't', body: 'b' } })

    const result = await purgeUnverifiedAccounts()

    assert.equal(result.deleted, 2)
    assert.equal(await db.user.count({ where: { id: { in: [stale.id, failed.id] } } }), 0)
    assert.equal(await db.verificationToken.count(), 0)
    assert.equal(await db.userBlock.count(), 0)
    assert.equal(await db.notification.count(), 0)
    assert.ok(await db.user.findUnique({ where: { id: someone.id } }))
  })

  test('keeps recent sign-ups, verified, admin and soft-deleted accounts, and any with activity', async () => {
    const db = getTestPrisma()
    const keep = [
      await accountAged(23),
      await accountAged(500, { verificationStatus: VerificationStatus.VERIFIED }),
      await accountAged(500, { role: Role.ADMIN }),
      await accountAged(500, { deletedAt: new Date() }),
    ]
    const withListing = await accountAged(500)
    await createTestListing(withListing.id)
    const renterWithBooking = await accountAged(500)
    const owner = await createTestUser()
    const listing = await createTestListing(owner.id)
    const { startDate, endDate } = futureDates(3, 2)
    await db.booking.create({
      data: {
        listingId: listing.id,
        renterId: renterWithBooking.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(20),
        depositAmount: new Prisma.Decimal(0),
        status: BookingStatus.PENDING,
      },
    })
    keep.push(withListing, renterWithBooking)

    assert.deepEqual(await purgeUnverifiedAccounts(), { deleted: 0 })
    assert.equal(await db.user.count({ where: { id: { in: keep.map((u) => u.id) } } }), keep.length)
  })

  test('is idempotent: a second run, or two at once, deletes nothing more', async () => {
    await accountAged(30)
    await accountAged(30)
    const fresh = await accountAged(1)

    const [a, b] = await Promise.all([purgeUnverifiedAccounts(), purgeUnverifiedAccounts()])
    assert.equal(a.deleted + b.deleted, 2)
    assert.deepEqual(await purgeUnverifiedAccounts(), { deleted: 0 })
    assert.deepEqual((await getTestPrisma().user.findMany({ select: { id: true } })).map((u) => u.id), [fresh.id])
  })

  test("a purged account's session is refused, and its address is free again", async () => {
    const pending = await accountAged(30, { email: EMAIL })
    const token = signTestJwt({ userId: pending.id, verificationStatus: VerificationStatus.PENDING })
    await purgeUnverifiedAccounts()

    assert.equal((await as(token).get('/users/me')).status, 401)
    assert.equal((await register('Owner')).status, 201)
  })
})
