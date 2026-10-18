/**
 * Integration Tests — verification code sends, format and expiry
 * ===============================================================
 * Codes allow 5 guesses each (otpAttempts.integration.test.ts) and a new one
 * could be requested every 60 s with no daily limit, so guessing someone
 * else's university email through to a verified account was a matter of
 * patience: about even odds in two months.
 *  - At most MAX_VERIFICATION_EMAILS_PER_DAY codes per address in any 24 h,
 *    sign-ups and resends together, counted per address in the database.
 *  - Still one resend a minute.
 *  - A code is six digits and is refused once expired, even when right.
 * The per-network daily cap is covered in middleware/rateLimiter.test.ts.
 */

import test, { after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { VerificationStatus } from '@prisma/client'
import { disconnectTestPrisma, getApp, getTestPrisma, signTestJwt, truncateAllTables } from './setup'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'
import { MAX_VERIFICATION_EMAILS_PER_DAY } from '../services/authService'
import { purgeOldVerificationTokens } from '../services/cleanupJob'

const HOUR = 60 * 60 * 1000
const EMAIL = 'sendcap@mail.utoronto.ca'
let ipCounter = 0

beforeEach(async () => {
  await truncateAllTables()
})

after(async () => {
  await disconnectTestPrisma()
})

// Each request from its own address, so the per-address route limiters stay
// out of the way of what these tests count.
function freshIp() {
  ipCounter += 1
  return `198.51.100.${ipCounter % 250}`
}

function register(email = EMAIL) {
  return supertest(getApp())
    .post('/auth/register')
    .set('X-Real-IP', freshIp())
    .send({
      email,
      password: 'CorrectHorse1!',
      firstName: 'Sam',
      lastName: 'Student',
      phone: '416-555-0192',
      university: 'UOFT',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      acceptedPrivacyVersion: CURRENT_PRIVACY_VERSION,
      ageAttested: true,
    })
}

function resend(token: string) {
  return supertest(getApp()).post('/auth/resend-otp').set('X-Real-IP', freshIp()).set('Authorization', `Bearer ${token}`)
}

function verify(token: string, code: unknown) {
  return supertest(getApp())
    .post('/auth/verify-email')
    .set('X-Real-IP', freshIp())
    .set('Authorization', `Bearer ${token}`)
    .send({ code })
}

/** Earlier sends to `email`, `hoursAgo` each. */
async function priorSends(email: string, hoursAgo: number[]) {
  await getTestPrisma().verificationEmailSend.createMany({
    data: hoursAgo.map((h) => ({ email, createdAt: new Date(Date.now() - h * HOUR) })),
  })
}

async function sendCount(email = EMAIL) {
  return getTestPrisma().verificationEmailSend.count({ where: { email } })
}

/** Moves every send to `email` back by `ms`, as if that much time had passed. */
async function age(email: string, ms: number) {
  const db = getTestPrisma()
  for (const row of await db.verificationEmailSend.findMany({ where: { email } })) {
    await db.verificationEmailSend.update({ where: { id: row.id }, data: { createdAt: new Date(row.createdAt.getTime() - ms) } })
  }
}

describe('daily cap per address', () => {
  test('the cap is 10 a day', () => {
    assert.equal(MAX_VERIFICATION_EMAILS_PER_DAY, 10)
  })

  test('sign-up counts as a send', async () => {
    const res = await register()
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(await sendCount(), 1)
  })

  test('the 10th code of the day is sent, the 11th is refused with a readable message', async () => {
    await priorSends(EMAIL, [1, 2, 3, 4, 5, 6, 7, 8])
    const res = await register()
    assert.equal(res.status, 201, '9th: sign-up')
    const token = res.body.token
    await age(EMAIL, 2 * 60 * 1000) // past the one-minute resend gap

    assert.equal((await resend(token)).status, 200, '10th: resend')
    await age(EMAIL, 2 * 60 * 1000)

    const refused = await resend(token)
    assert.equal(refused.status, 429)
    assert.match(refused.body.error, /today/)
    assert.equal(await sendCount(), 10, 'a refused send is not recorded')
  })

  test('a sign-up over the cap creates no account and sends nothing', async () => {
    await priorSends(EMAIL, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const res = await register()
    assert.equal(res.status, 429)
    assert.equal(await getTestPrisma().user.count(), 0)
    assert.equal(await getTestPrisma().verificationToken.count(), 0)
  })

  test('sends older than 24 hours no longer count', async () => {
    await priorSends(EMAIL, [25, 26, 27, 28, 29, 30, 31, 32, 33, 34])
    assert.equal((await register()).status, 201)
  })

  test('the cap is per address: another address is unaffected', async () => {
    await priorSends(EMAIL, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.equal((await register('someone.else@mail.utoronto.ca')).status, 201)
  })

  test('case and spacing variants of one address share the cap', async () => {
    await priorSends(EMAIL, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.equal((await register('  SendCap@Mail.UToronto.ca ')).status, 429)
  })

  test('the 24-hour sweep deletes old send records with the old codes', async () => {
    await priorSends(EMAIL, [25, 1])
    const result = await purgeOldVerificationTokens()
    assert.equal(result.emailSendsDeleted, 1)
    assert.equal(await sendCount(), 1)
  })
})

describe('one resend a minute', () => {
  test('a resend straight after sign-up waits, then goes through after a minute', async () => {
    const { body } = await register()
    const early = await resend(body.token)
    assert.equal(early.status, 429)
    assert.match(early.body.error, /60 seconds/)

    await age(EMAIL, 61 * 1000)
    assert.equal((await resend(body.token)).status, 200)
  })
})

describe('the code itself', () => {
  async function pendingUserWithCode(code: string, expiresInMs: number) {
    const db = getTestPrisma()
    const user = await db.user.create({
      data: {
        email: EMAIL,
        passwordHash: 'x',
        firstName: 'Sam',
        lastName: 'Student',
        phone: '+14165550192',
        verificationStatus: VerificationStatus.PENDING,
      },
    })
    await db.verificationToken.create({ data: { userId: user.id, code, expiresAt: new Date(Date.now() + expiresInMs) } })
    return { id: user.id, token: signTestJwt({ userId: user.id, verificationStatus: VerificationStatus.PENDING }) }
  }

  test('anything but six digits is refused before it counts as a guess', async () => {
    const user = await pendingUserWithCode('123456', 15 * 60 * 1000)
    for (const code of ['12345', '1234567', 'abcdef', ' 123456', '123 456', '', 123456]) {
      assert.equal((await verify(user.token, code)).status, 400, JSON.stringify(code))
    }
    const stored = await getTestPrisma().verificationToken.findFirstOrThrow({ where: { userId: user.id } })
    assert.equal(stored.failedAttempts, 0)
    assert.equal((await verify(user.token, '123456')).status, 200)
  })

  test('an expired code is refused even when it is right', async () => {
    const user = await pendingUserWithCode('654321', -1000)
    const res = await verify(user.token, '654321')
    assert.equal(res.status, 400)
    assert.match(res.body.error, /expired/)
    const row = await getTestPrisma().user.findUniqueOrThrow({ where: { id: user.id } })
    assert.equal(row.verificationStatus, VerificationStatus.PENDING)
  })
})
