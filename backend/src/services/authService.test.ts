import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SESClient } from '@aws-sdk/client-ses'
import prisma from '../utils/prisma'
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../config/legal'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

import { loginUser, registerUser } from './authService'

const originalFindUnique = prisma.user.findUnique
const originalCreate = prisma.user.create
const originalTokenCreate = prisma.verificationToken.create
const originalTransaction = prisma.$transaction
const originalSesSend = SESClient.prototype.send

afterEach(() => {
  ;(prisma.user as any).findUnique = originalFindUnique
  ;(prisma.user as any).create = originalCreate
  ;(prisma.verificationToken as any).create = originalTokenCreate
  ;(prisma as any).$transaction = originalTransaction
  ;(SESClient.prototype as any).send = originalSesSend
})

function stubHappyPathCollaborators(createSpy: (args: any) => void) {
  ;(prisma.user as any).findUnique = async () => null
  ;(prisma.verificationToken as any).create = async () => ({ id: 'token-1' })
  // The per-address send cap (reserveVerificationEmail): nothing sent yet.
  ;(prisma as any).$transaction = async (fn: (tx: any) => Promise<unknown>) =>
    fn({
      $queryRaw: async () => [],
      verificationEmailSend: { findMany: async () => [], create: async () => ({ id: 'send-1' }) },
      // Creating the account runs in its own transaction (replacing an
      // unverified sign-up); route it to the stubbed create below.
      user: { create: (args: any) => (prisma.user as any).create(args) },
    })
  ;(SESClient.prototype as any).send = async () => ({})
  ;(prisma.user as any).create = async (args: any) => {
    createSpy(args)
    return {
      id: 'user-1',
      email: args.data.email,
      firstName: args.data.firstName,
      verificationStatus: 'PENDING',
      role: 'USER',
      termsVersion: args.data.termsVersion,
      privacyVersion: args.data.privacyVersion,
    }
  }
}

test('registerUser stamps all five acceptance columns from a single timestamp', async () => {
  let capturedData: any = null
  stubHappyPathCollaborators((args) => { capturedData = args.data })

  const result = await registerUser(
    'student@mail.utoronto.ca',
    'password123',
    'Ada',
    'Lovelace',
    '+14165550192',
    'UOFT',
    CURRENT_TERMS_VERSION,
    CURRENT_PRIVACY_VERSION,
    true
  )

  assert.ok(capturedData, 'prisma.user.create should have been called')
  assert.equal(capturedData.university, 'UOFT')
  assert.equal(capturedData.termsVersion, CURRENT_TERMS_VERSION)
  assert.equal(capturedData.privacyVersion, CURRENT_PRIVACY_VERSION)
  assert.ok(capturedData.termsAcceptedAt instanceof Date)
  assert.ok(capturedData.privacyAcceptedAt instanceof Date)
  assert.ok(capturedData.ageAttestedAt instanceof Date)
  assert.equal(capturedData.termsAcceptedAt.getTime(), capturedData.privacyAcceptedAt.getTime())
  assert.equal(capturedData.termsAcceptedAt.getTime(), capturedData.ageAttestedAt.getTime())
  assert.equal(result.user.email, 'student@mail.utoronto.ca')
})

test('registerUser rejects a stale acceptedTermsVersion with 400 and never creates a user row', async () => {
  let createCalled = false
  stubHappyPathCollaborators(() => { createCalled = true })

  await assert.rejects(
    () => registerUser(
      'student@mail.utoronto.ca',
      'password123',
      'Ada',
      'Lovelace',
      '+14165550192',
      'UOFT',
      '0.9',
      CURRENT_PRIVACY_VERSION,
      true
    ),
    (err: any) => {
      assert.equal(err.statusCode, 400)
      return true
    }
  )

  assert.equal(createCalled, false, 'prisma.user.create must not run when the terms version is stale')
})

test('registerUser rejects a stale acceptedPrivacyVersion with 400 and never creates a user row', async () => {
  let createCalled = false
  stubHappyPathCollaborators(() => { createCalled = true })

  await assert.rejects(
    () => registerUser(
      'student@mail.utoronto.ca',
      'password123',
      'Ada',
      'Lovelace',
      '+14165550192',
      'UOFT',
      CURRENT_TERMS_VERSION,
      '0.9',
      true
    ),
    (err: any) => {
      assert.equal(err.statusCode, 400)
      return true
    }
  )

  assert.equal(createCalled, false, 'prisma.user.create must not run when the privacy version is stale')
})

// No wall-clock race: bcrypt(12) alone can exceed a second under the parallel
// unit suite. If registerUser awaited this never-settling send it would hang
// until the test timeout instead.
test('registerUser responds without waiting for the verification email to send', { timeout: 20_000 }, async () => {
  stubHappyPathCollaborators(() => {})
  let sendCalled = false
  // An SES call that never settles — sign-up must not block on it.
  ;(SESClient.prototype as any).send = () => {
    sendCalled = true
    return new Promise(() => {})
  }

  const result = await registerUser(
    'student@mail.utoronto.ca',
    'password123',
    'Ada',
    'Lovelace',
    '+14165550192',
    'UOFT',
    CURRENT_TERMS_VERSION,
    CURRENT_PRIVACY_VERSION,
    true
  )

  assert.ok(result.token)
  assert.equal(sendCalled, true, 'the verification email is still sent')
})

test('a failed verification email never logs the code in production', { timeout: 20_000 }, async () => {
  stubHappyPathCollaborators(() => {})
  ;(SESClient.prototype as any).send = async () => {
    throw new Error('Email address is not verified.')
  }
  const warnings: string[] = []
  const originalWarn = console.warn
  const originalEnv = process.env.NODE_ENV
  console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }
  process.env.NODE_ENV = 'production'
  try {
    await registerUser(
      'student@mail.utoronto.ca',
      'password123',
      'Ada',
      'Lovelace',
      '+14165550192',
      'UOFT',
      CURRENT_TERMS_VERSION,
      CURRENT_PRIVACY_VERSION,
      true
    )
    // The send runs in the background; let it settle.
    await new Promise((resolve) => setTimeout(resolve, 50))
  } finally {
    console.warn = originalWarn
    process.env.NODE_ENV = originalEnv
  }

  assert.ok(warnings.some((w) => w.includes('SES verification email failed')), 'the failure is still logged')
  assert.ok(warnings.every((w) => !/\b\d{6}\b/.test(w) && !w.includes('student@')), `no code or email logged: ${warnings.join(' | ')}`)
})

test('loginUser spends a bcrypt comparison even when the email has no account', async () => {
  const bcrypt = require('bcryptjs')
  const originalCompare = bcrypt.compare
  const compared: string[] = []
  bcrypt.compare = async (_password: string, hash: string) => {
    compared.push(hash)
    return false
  }
  try {
    ;(prisma.user as any).findUnique = async () => null
    await assert.rejects(loginUser('nobody@mail.utoronto.ca', 'password123'), { statusCode: 401, message: 'Invalid email or password.' })

    ;(prisma.user as any).findUnique = async () => ({ id: 'u', passwordHash: '$2b$12$realhash', deletedAt: new Date() })
    await assert.rejects(loginUser('gone@mail.utoronto.ca', 'password123'), { statusCode: 401, message: 'Invalid email or password.' })
  } finally {
    bcrypt.compare = originalCompare
  }

  assert.equal(compared.length, 2, 'unknown and deleted accounts still pay for one bcrypt comparison')
  for (const hash of compared) assert.match(hash, /^\$2[aby]\$12\$/, 'at the same cost as real password hashes')
})
