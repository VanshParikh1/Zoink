/**
 * Integration Tests — verification-code guessing is capped per code
 * =================================================================
 * A 6-digit code with no attempt cap could be brute-forced by whoever holds
 * the (unverified) account — e.g. someone who registered with another
 * student's email — limited only by the per-IP rate limiter. A code now dies
 * after 5 wrong guesses; the user requests a new one.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { truncateAllTables, getTestPrisma, disconnectTestPrisma } from './setup'
import { verifyOTP } from '../services/authService'

let userId: string
let tokenId: string

beforeEach(async () => {
  await truncateAllTables()
  const db = getTestPrisma()
  userId = (
    await db.user.create({
      data: {
        email: `otp_${Date.now()}@mail.utoronto.ca`,
        passwordHash: 'x',
        firstName: 'Otp',
        lastName: 'Test',
        phone: '+14165550100',
      },
    })
  ).id
  tokenId = (
    await db.verificationToken.create({
      data: { userId, code: '123456', expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
    })
  ).id
})

after(async () => {
  await disconnectTestPrisma()
})

async function wrongGuess() {
  return assert.rejects(verifyOTP(userId, '000000'), (err: any) => err.statusCode === 400)
}

describe('verifyOTP attempt cap', () => {
  test('four wrong guesses still allow the right code', async () => {
    for (let i = 0; i < 4; i++) {
      await assert.rejects(verifyOTP(userId, '000000'), { statusCode: 400, message: 'Incorrect verification code.' })
    }
    const result = await verifyOTP(userId, '123456')
    assert.ok(result.token)
    const user = await getTestPrisma().user.findUniqueOrThrow({ where: { id: userId } })
    assert.equal(user.verificationStatus, 'VERIFIED')
  })

  test('the fifth wrong guess invalidates the code, even for the right answer afterwards', async () => {
    for (let i = 0; i < 4; i++) await wrongGuess()
    await assert.rejects(verifyOTP(userId, '000000'), {
      statusCode: 400,
      message: 'Too many incorrect attempts. Please request a new code.',
    })

    const token = await getTestPrisma().verificationToken.findUniqueOrThrow({ where: { id: tokenId } })
    assert.ok(token.usedAt, 'the code is spent')
    assert.equal(token.failedAttempts, 5)

    await assert.rejects(verifyOTP(userId, '123456'), {
      statusCode: 400,
      message: 'No verification code found. Please request a new one.',
    })
    const user = await getTestPrisma().user.findUniqueOrThrow({ where: { id: userId } })
    assert.equal(user.verificationStatus, 'PENDING')
  })

  test('parallel guesses cannot exceed the cap', async () => {
    const guesses = Array.from({ length: 12 }, () => verifyOTP(userId, '000000').catch((err) => err.message))
    await Promise.all(guesses)
    const token = await getTestPrisma().verificationToken.findUniqueOrThrow({ where: { id: tokenId } })
    assert.ok(token.usedAt, 'the code is spent')
    await assert.rejects(verifyOTP(userId, '123456'), { statusCode: 400 })
  })

  test('a fresh code after the cap starts with a clean slate', async () => {
    for (let i = 0; i < 5; i++) await wrongGuess()
    await getTestPrisma().verificationToken.create({
      data: { userId, code: '654321', expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
    })
    const result = await verifyOTP(userId, '654321')
    assert.ok(result.token)
  })
})
