import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SESClient } from '@aws-sdk/client-ses'
import prisma from '../utils/prisma'
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../config/legal'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

import { registerUser } from './authService'

const originalFindUnique = prisma.user.findUnique
const originalCreate = prisma.user.create
const originalTokenCreate = prisma.verificationToken.create
const originalSesSend = SESClient.prototype.send

afterEach(() => {
  ;(prisma.user as any).findUnique = originalFindUnique
  ;(prisma.user as any).create = originalCreate
  ;(prisma.verificationToken as any).create = originalTokenCreate
  ;(SESClient.prototype as any).send = originalSesSend
})

function stubHappyPathCollaborators(createSpy: (args: any) => void) {
  ;(prisma.user as any).findUnique = async () => null
  ;(prisma.verificationToken as any).create = async () => ({ id: 'token-1' })
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
