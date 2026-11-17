/**
 * Integration Tests — password reset by emailed code, and password change
 * =====================================================================
 * The reset reuses the verification-code rules: a random 6-digit code,
 * 15-minute expiry, single use, 5 guesses, the address's daily email cap,
 * and the same answer whether or not the email has an account. Both reset
 * and change end every other session (tokenVersion).
 */
import { truncateAllTables, createTestUser, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { VerificationPurpose } from '@prisma/client'
import { MAX_VERIFICATION_EMAILS_PER_DAY, PASSWORD_RESET_REQUESTED } from '../services/authService'

let user: { id: string; email: string; token: string }
let ip = 10
const REFUSED = 'That code is incorrect or has expired. Request a new one.'

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Sam' })
  ip += 1 // a fresh client address per test, so the route limiters don't carry over
})

after(async () => disconnectTestPrisma())

const post = (path: string, body: object) => supertest(getApp()).post(path).set('X-Real-IP', `198.18.1.${ip}`).send(body)
const requestReset = (email: string) => post('/auth/password-reset/request', { email })
const confirmReset = (email: string, code: string, newPassword = 'brand-new-pass') =>
  post('/auth/password-reset/confirm', { email, code, newPassword })
const login = (email: string, password: string) => post('/auth/login', { email, password })
const me = (token: string) => supertest(getApp()).get('/users/me').set('Authorization', `Bearer ${token}`)

async function latestResetCode(userId: string) {
  const token = await getTestPrisma().verificationToken.findFirst({
    where: { userId, purpose: VerificationPurpose.PASSWORD_RESET },
    orderBy: { createdAt: 'desc' },
  })
  return token!.code
}

describe('POST /auth/password-reset/request', () => {
  test('answers the same for an account and for an unknown address', async () => {
    const known = await requestReset(user.email)
    const unknown = await requestReset('nobody@mail.utoronto.ca')
    assert.equal(known.status, 200)
    assert.equal(unknown.status, 200)
    assert.deepEqual(known.body, { message: PASSWORD_RESET_REQUESTED })
    assert.deepEqual(unknown.body, known.body)

    const codes = await getTestPrisma().verificationToken.findMany({ where: { purpose: VerificationPurpose.PASSWORD_RESET } })
    assert.equal(codes.length, 1)
    assert.equal(codes[0].userId, user.id)
    assert.match(codes[0].code, /^\d{6}$/)
    const minutes = (codes[0].expiresAt.getTime() - codes[0].createdAt.getTime()) / 60_000
    assert.ok(minutes > 14 && minutes <= 15, `expires in ~15 min, got ${minutes}`)
  })

  test('past the daily email cap it still answers the same, and sends nothing', async () => {
    const db = getTestPrisma()
    await db.verificationEmailSend.createMany({ data: Array.from({ length: MAX_VERIFICATION_EMAILS_PER_DAY }, () => ({ email: user.email })) })
    const res = await requestReset(user.email)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { message: PASSWORD_RESET_REQUESTED })
    assert.equal(await db.verificationToken.count({ where: { purpose: VerificationPurpose.PASSWORD_RESET } }), 0)
  })
})

describe('POST /auth/password-reset/confirm', () => {
  test('the right code sets the new password, signs this device in and every old session out', async () => {
    await requestReset(user.email)
    const res = await confirmReset(user.email, await latestResetCode(user.id))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.ok(res.body.token)

    assert.equal((await me(user.token)).status, 401, 'the session from before the reset is over')
    assert.equal((await me(res.body.token)).status, 200)
    assert.equal((await login(user.email, 'TestPass123!')).status, 401)
    assert.equal((await login(user.email, 'brand-new-pass')).status, 200)
  })

  test('a code works once', async () => {
    await requestReset(user.email)
    const code = await latestResetCode(user.id)
    assert.equal((await confirmReset(user.email, code)).status, 200)
    const again = await confirmReset(user.email, code, 'another-new-pass')
    assert.equal(again.status, 400)
    assert.equal(again.body.error, REFUSED)
  })

  test('five wrong guesses spend the code; the right one is then refused too', async () => {
    await requestReset(user.email)
    const code = await latestResetCode(user.id)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) assert.equal((await confirmReset(user.email, wrong)).body.error, REFUSED)
    const right = await confirmReset(user.email, code)
    assert.equal(right.status, 400)
    assert.equal(right.body.error, REFUSED)
    assert.equal((await login(user.email, 'TestPass123!')).status, 200, 'password unchanged')
  })

  test('an expired code is refused', async () => {
    await requestReset(user.email)
    await getTestPrisma().verificationToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    assert.equal((await confirmReset(user.email, await latestResetCode(user.id))).body.error, REFUSED)
  })

  test('an unknown address gets the same refusal as a wrong code', async () => {
    const res = await confirmReset('nobody@mail.utoronto.ca', '123456')
    assert.equal(res.status, 400)
    assert.equal(res.body.error, REFUSED)
  })

  test('a reset code cannot verify an email, and a verification code cannot reset a password', async () => {
    const db = getTestPrisma()
    await db.user.update({ where: { id: user.id }, data: { verificationStatus: 'PENDING' } })
    await requestReset(user.email)
    const resetCode = await latestResetCode(user.id)
    const verify = await supertest(getApp()).post('/auth/verify-email').set('X-Real-IP', `198.18.1.${ip}`).set('Authorization', `Bearer ${user.token}`).send({ code: resetCode })
    assert.equal(verify.status, 400)

    await db.verificationToken.create({ data: { userId: user.id, code: '424242', expiresAt: new Date(Date.now() + 600_000) } })
    await db.verificationToken.updateMany({ where: { purpose: VerificationPurpose.PASSWORD_RESET }, data: { usedAt: new Date() } })
    assert.equal((await confirmReset(user.email, '424242')).body.error, REFUSED)
  })
})

describe('PATCH /users/me/password', () => {
  const change = (token: string, body: object) => supertest(getApp()).patch('/users/me/password').set('Authorization', `Bearer ${token}`).send(body)

  test('a wrong current password is refused with 400 (the app signs out on 401)', async () => {
    const res = await change(user.token, { currentPassword: 'not-it', newPassword: 'brand-new-pass' })
    assert.equal(res.status, 400)
    assert.equal(res.body.error, 'Your current password is incorrect.')
  })

  test('changes the password, returns a session for this device and ends the others', async () => {
    const res = await change(user.token, { currentPassword: 'TestPass123!', newPassword: 'brand-new-pass' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal((await me(user.token)).status, 401)
    assert.equal((await me(res.body.token)).status, 200)
    assert.equal((await login(user.email, 'brand-new-pass')).status, 200)
  })

  test('the new password follows the sign-up length rule', async () => {
    assert.equal((await change(user.token, { currentPassword: 'TestPass123!', newPassword: 'short' })).status, 400)
  })
})
