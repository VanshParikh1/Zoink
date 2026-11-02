/**
 * Integration Tests — one phone's push token belongs to one account
 * ==================================================================
 * A session can end without a sign-out (the token expires, or sign-out can't
 * reach the server). The phone's Expo push token then stayed on the old
 * account, and once someone else signed in on that phone it sat on both: the
 * new user got the previous account's notifications, message previews
 * included.
 *  - Registering a token takes it off every other account.
 *  - Signing out releases it, but only while it's still this phone's.
 *  - Release works with a lapsed session, which is when the app needs it.
 */

import test, { after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import supertest from 'supertest'
import { createTestUser, disconnectTestPrisma, getApp, getTestPrisma, truncateAllTables } from './setup'

const PHONE = 'ExponentPushToken[phone-one-aaaaaaaaaaaa]'
const OTHER_PHONE = 'ExponentPushToken[phone-two-bbbbbbbbbbbb]'

type U = { id: string; token: string }
let alice: U
let bob: U

beforeEach(async () => {
  await truncateAllTables()
  alice = await createTestUser({ firstName: 'Alice' })
  bob = await createTestUser({ firstName: 'Bob' })
})

after(async () => {
  await disconnectTestPrisma()
})

function register(user: U, expoPushToken: string | null) {
  return supertest(getApp())
    .patch('/users/me/push-token')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ expoPushToken })
}

function release(sessionToken: string, expoPushToken: string) {
  return supertest(getApp())
    .post('/users/me/push-token/release')
    .set('Authorization', `Bearer ${sessionToken}`)
    .send({ expoPushToken })
}

async function tokenOf(user: U) {
  const row = await getTestPrisma().user.findUniqueOrThrow({ where: { id: user.id }, select: { expoPushToken: true } })
  return row.expoPushToken
}

function expiredSessionFor(user: U) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: -60 })
}

describe('registering a push token', () => {
  test("takes the phone's token off the account that had it before", async () => {
    assert.equal((await register(alice, PHONE)).status, 200)
    assert.equal((await register(bob, PHONE)).status, 200)

    assert.equal(await tokenOf(bob), PHONE)
    assert.equal(await tokenOf(alice), null, "Alice's notifications would still go to Bob's phone")
  })

  test("leaves other accounts' different tokens alone", async () => {
    await register(alice, OTHER_PHONE)
    await register(bob, PHONE)

    assert.equal(await tokenOf(alice), OTHER_PHONE)
    assert.equal(await tokenOf(bob), PHONE)
  })

  test('re-registering the same token on the same account is a no-op', async () => {
    await register(alice, PHONE)
    assert.equal((await register(alice, PHONE)).status, 200)
    assert.equal(await tokenOf(alice), PHONE)
  })

  test('null still clears it (sign-out from app versions before release)', async () => {
    await register(alice, PHONE)
    assert.equal((await register(alice, null)).status, 200)
    assert.equal(await tokenOf(alice), null)
  })
})

describe('releasing a push token on sign-out', () => {
  test("clears the account's token when it is this phone's", async () => {
    await register(alice, PHONE)
    const res = await release(alice.token, PHONE)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { released: true })
    assert.equal(await tokenOf(alice), null)
  })

  test("signing out on an old phone doesn't silence the account's current phone", async () => {
    await register(alice, PHONE)
    await register(alice, OTHER_PHONE) // signed in on a second phone since

    const res = await release(alice.token, PHONE)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { released: false })
    assert.equal(await tokenOf(alice), OTHER_PHONE)
  })

  test("can't clear another account's token", async () => {
    await register(bob, PHONE)
    await release(alice.token, PHONE)
    assert.equal(await tokenOf(bob), PHONE)
  })

  test('works with a session that has expired', async () => {
    await register(alice, PHONE)
    const res = await release(expiredSessionFor(alice), PHONE)
    assert.equal(res.status, 200)
    assert.equal(await tokenOf(alice), null)
  })

  test('an expired session is still refused everywhere else', async () => {
    const res = await supertest(getApp()).get('/users/me').set('Authorization', `Bearer ${expiredSessionFor(alice)}`)
    assert.equal(res.status, 401)
    const reRegister = await register({ ...alice, token: expiredSessionFor(alice) }, PHONE)
    assert.equal(reRegister.status, 401)
  })

  test('a token not signed by this server is refused', async () => {
    await register(alice, PHONE)
    const forged = jwt.sign({ userId: alice.id }, 'not-the-secret', { algorithm: 'HS256', expiresIn: -60 })
    assert.equal((await release(forged, PHONE)).status, 401)
    assert.equal(await tokenOf(alice), PHONE)
  })

  test('no token: 401', async () => {
    const res = await supertest(getApp()).post('/users/me/push-token/release').send({ expoPushToken: PHONE })
    assert.equal(res.status, 401)
  })

  test('the token is required', async () => {
    const res = await supertest(getApp())
      .post('/users/me/push-token/release')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({})
    assert.equal(res.status, 400)
  })
})
