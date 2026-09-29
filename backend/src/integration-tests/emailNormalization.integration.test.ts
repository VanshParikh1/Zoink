/**
 * Integration Tests — email normalization and '+' addresses at sign-up (S8)
 * ========================================================================
 * Accounts are stored and looked up by trimmed, lowercase email, so `Alice@`
 * and `alice@` are one account. Registration refuses a '+' in the local part
 * (one mailbox could otherwise open unlimited accounts), with a message the
 * app shows as-is. Accounts that already have a '+' address keep working:
 * login, verification and code resend don't apply the rule.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import bcrypt from 'bcryptjs'
import { VerificationStatus } from '@prisma/client'
import { truncateAllTables, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'

const PASSWORD = 'Str0ng-Passw0rd!'
const PLUS_MESSAGE = "Email addresses with a '+' can't be used to sign up. Please use your plain student email address."

function register(email: string) {
  return supertest(getApp()).post('/auth/register').send({
    email,
    password: PASSWORD,
    firstName: 'Alice',
    lastName: 'Tester',
    phone: '(416) 555-0192',
    university: 'UOFT',
    acceptedTermsVersion: CURRENT_TERMS_VERSION,
    acceptedPrivacyVersion: CURRENT_PRIVACY_VERSION,
    ageAttested: true,
  })
}

function login(email: string, password = PASSWORD) {
  return supertest(getApp()).post('/auth/login').send({ email, password })
}

beforeEach(async () => {
  await truncateAllTables()
})

after(async () => {
  await disconnectTestPrisma()
})

describe('email normalization', () => {
  test('registration stores the address trimmed and lowercase', async () => {
    const res = await register('  Alice.Smith@Mail.UToronto.ca ')
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.user.email, 'alice.smith@mail.utoronto.ca')

    const stored = await getTestPrisma().user.findMany({ select: { email: true } })
    assert.deepEqual(stored, [{ email: 'alice.smith@mail.utoronto.ca' }])
  })

  test('a case or whitespace variant of an existing address is the same account', async () => {
    assert.equal((await register('alice.smith@mail.utoronto.ca')).status, 201)

    const again = await register('ALICE.SMITH@mail.utoronto.ca')
    assert.equal(again.status, 409)
    assert.equal(await getTestPrisma().user.count(), 1)

    const res = await login(' Alice.Smith@MAIL.utoronto.ca  ')
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.user.email, 'alice.smith@mail.utoronto.ca')
  })
})

describe("'+' addresses", () => {
  test('registration refuses a + in the local part, with a message the app can show', async () => {
    const res = await register('alice+zoink@mail.utoronto.ca')
    assert.equal(res.status, 400)
    assert.equal(res.body.error, PLUS_MESSAGE)
    assert.equal(await getTestPrisma().user.count(), 0)
  })

  test('a + in the domain part is not the rule (the domain check still applies)', async () => {
    const res = await register('alice@mail+x.utoronto.ca')
    assert.equal(res.status, 400)
    assert.notEqual(res.body.error, PLUS_MESSAGE)
  })

  test('an existing + account can still log in, resend its code and verify', async () => {
    const email = 'legacy+tag@mail.utoronto.ca'
    const user = await getTestPrisma().user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        firstName: 'Legacy',
        lastName: 'Plus',
        phone: '+14165550193',
        verificationStatus: VerificationStatus.PENDING,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      },
    })

    const res = await login('Legacy+Tag@mail.utoronto.ca')
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const token = res.body.token

    const resend = await supertest(getApp()).post('/auth/resend-otp').set('Authorization', `Bearer ${token}`)
    assert.equal(resend.status, 200, JSON.stringify(resend.body))

    const { code } = await getTestPrisma().verificationToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    const verify = await supertest(getApp()).post('/auth/verify-email').set('Authorization', `Bearer ${token}`).send({ code })
    assert.equal(verify.status, 200, JSON.stringify(verify.body))
    assert.equal((await getTestPrisma().user.findUniqueOrThrow({ where: { id: user.id } })).verificationStatus, VerificationStatus.VERIFIED)
  })
})
