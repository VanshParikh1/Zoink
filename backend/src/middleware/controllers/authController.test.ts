import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as authService from '../../services/authService'
import * as userService from '../../services/userService'
import { register, getLegalVersion } from './authController'
import { acceptTerms } from './userController'
import { validate } from '../validate'
import { RegisterSchema } from '../../schemas/auth.schema'
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../../config/legal'
import { createMockResponse } from '../../testUtils/httpMocks'
import { errorHandler } from '../errorHandler'

const originalRegisterUser = authService.registerUser
const originalAcceptTerms = userService.acceptTerms

afterEach(() => {
  ;(authService as any).registerUser = originalRegisterUser
  ;(userService as any).acceptTerms = originalAcceptTerms
})

// Valid terms/privacy/age/university fields shared by tests that aren't
// exercising them directly, so each test only has to override what it's
// actually testing.
const VALID_LEGAL_FIELDS = {
  acceptedTermsVersion: CURRENT_TERMS_VERSION,
  acceptedPrivacyVersion: CURRENT_PRIVACY_VERSION,
  ageAttested: true,
}

// UOFT + a matching @mail.utoronto.ca email is the default combo baked into
// every test's email above — tests targeting the university check itself
// override one or both.
const VALID_UNIVERSITY_FIELDS = {
  university: 'UOFT',
}

function runValidate(body: Record<string, unknown>) {
  const req: any = { body: { ...VALID_LEGAL_FIELDS, ...VALID_UNIVERSITY_FIELDS, ...body }, params: {}, query: {} }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(RegisterSchema)(req, res as any, next)

  return { req, res, capturedError }
}

test('validate(RegisterSchema) rejects registration with a missing phone number', () => {
  const { capturedError, req, res } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.phone'), 'should flag missing phone')
})

test('validate(RegisterSchema) rejects an invalid phone format', () => {
  const { capturedError, req, res } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '123', // too short, not a valid NANP number
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.phone'), 'should flag invalid phone format')
})

test('validate(RegisterSchema) rejects a phone number with a bad NANP area code', () => {
  // Area codes can't start with 0 or 1 per NANP.
  const { capturedError } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '016-555-0192',
  })

  assert.ok(capturedError, 'ZodError should be passed to next() for a bad area code')
})

test('validate(RegisterSchema) accepts and normalizes formatted Canadian phone numbers', () => {
  const formats = ['(416) 555-0192', '416-555-0192', '4165550192', '+1 416 555 0192']

  for (const phone of formats) {
    const { req, capturedError } = runValidate({
      email: 'student@mail.utoronto.ca',
      password: 'password123',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone,
    })

    assert.ok(!capturedError, `${phone} should be accepted`)
    assert.equal(req.body.phone, '+14165550192', `${phone} should normalize to +14165550192`)
  }
})

test('validate(RegisterSchema) rejects a firstName over 50 characters', () => {
  const { capturedError, req, res } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'A'.repeat(51),
    lastName: 'Lovelace',
    phone: '4165550192',
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.firstName'), 'should flag firstName over 50 characters')
})

test('validate(RegisterSchema) rejects a lastName over 50 characters', () => {
  const { capturedError, req, res } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'L'.repeat(51),
    phone: '4165550192',
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.lastName'), 'should flag lastName over 50 characters')
})

test('register returns 201 with the normalized phone passed through to registerUser', async () => {
  ;(authService as any).registerUser = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone: string
  ) => {
    assert.equal(email, 'student@mail.utoronto.ca')
    assert.equal(phone, '+14165550192')
    return { token: 'jwt-token', user: { id: 'user-1', email, firstName, phone } }
  }

  const req: any = {
    body: {
      email: 'student@mail.utoronto.ca',
      password: 'password123',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+14165550192',
      ...VALID_LEGAL_FIELDS,
      ...VALID_UNIVERSITY_FIELDS,
    },
  }
  const res = createMockResponse()

  await register(req, res as any, (() => {}) as any)

  assert.equal(res.statusCode, 201)
  assert.equal((res.body as any).token, 'jwt-token')
})

// ── University allowlist ─────────────────────────────────────────────────────

// Base fields unrelated to the university check, factored out so each test
// below only has to override university/email — mirrors runValidate's own
// VALID_LEGAL_FIELDS pattern above. (Zod only runs the cross-field
// superRefine once the rest of the object shape parses cleanly, so every
// required field has to be present for these tests to actually exercise it.)
const BASE_REGISTRATION_FIELDS = {
  password: 'password123',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '4165550192',
}

test('validate(RegisterSchema) rejects an unknown university value', () => {
  const { capturedError, req, res } = runValidate({
    ...BASE_REGISTRATION_FIELDS,
    university: 'HARVARD',
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.university'), 'should flag the invalid university value')
})

test('validate(RegisterSchema) rejects an email that does not match the selected university\'s domain', () => {
  const { capturedError, req, res } = runValidate({
    ...BASE_REGISTRATION_FIELDS,
    university: 'UOFT',
    email: 'student@yorku.ca', // wrong school for UOFT, and not even the real York domain
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.email'), 'should flag the email/university domain mismatch')
})

test('validate(RegisterSchema) accepts a matching email for every university in the allowlist', () => {
  const validCombos: [string, string][] = [
    ['UOFT', 'student@mail.utoronto.ca'],
    ['TMU', 'student@torontomu.ca'],
    ['LAURIER', 'student@mylaurier.ca'],
    ['YORK', 'student@my.yorku.ca'],
    ['ONTARIO_TECH', 'student@ontariotechu.net'],
    ['MCMASTER', 'student@mcmaster.ca'],
    ['WATERLOO', 'student@uwaterloo.ca'],
  ]

  for (const [university, email] of validCombos) {
    const { capturedError } = runValidate({ ...BASE_REGISTRATION_FIELDS, university, email })
    assert.ok(!capturedError, `${email} should be accepted for ${university}`)
  }
})

test('validate(RegisterSchema) rejects a student email from the wrong university in the allowlist', () => {
  const { capturedError, req, res } = runValidate({
    ...BASE_REGISTRATION_FIELDS,
    university: 'MCMASTER',
    email: 'student@uwaterloo.ca', // a real allowlisted domain, just for a different school
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.email'), 'should flag the cross-school mismatch')
})

// ── Terms/privacy acceptance ────────────────────────────────────────────────

test('validate(RegisterSchema) rejects registration missing ageAttested', () => {
  const { capturedError, req, res } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '4165550192',
    ageAttested: undefined,
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.ageAttested'), 'should flag missing ageAttested')
})

test('validate(RegisterSchema) rejects registration with ageAttested: false', () => {
  const { capturedError, req, res } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '4165550192',
    ageAttested: false,
  })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.ageAttested'), 'should flag ageAttested: false')
})

test('validate(RegisterSchema) accepts a structurally valid (but stale) terms version — the version check itself lives in authService, see authService.test.ts', () => {
  const { capturedError } = runValidate({
    email: 'student@mail.utoronto.ca',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '4165550192',
    acceptedTermsVersion: '0.9',
  })

  assert.ok(!capturedError, 'zod only checks structure — a stale-but-well-formed version string is a business rule, not a schema violation')
})

test('GET /auth/legal-version returns the current terms and privacy constants', async () => {
  const req: any = {}
  const res = createMockResponse()

  await getLegalVersion(req, res as any, (() => {}) as any)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION })
})

test('POST /users/me/accept-terms stamps the columns and returns the refreshed user', async () => {
  ;(userService as any).acceptTerms = async (userId: string) => {
    assert.equal(userId, 'user-1')
    return { token: 'new-jwt', user: { id: userId, email: 'student@mail.utoronto.ca', firstName: 'Ada', verificationStatus: 'VERIFIED', role: 'USER' } }
  }

  const req: any = { userId: 'user-1' }
  const res = createMockResponse()

  await acceptTerms(req, res as any, (() => {}) as any)

  assert.equal(res.statusCode, 200)
  assert.equal((res.body as any).token, 'new-jwt')
  assert.equal((res.body as any).user.id, 'user-1')
})
