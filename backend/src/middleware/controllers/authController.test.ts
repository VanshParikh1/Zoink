import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as authService from '../../services/authService'
import { register } from './authController'
import { validate } from '../validate'
import { RegisterSchema } from '../../schemas/auth.schema'
import { createMockResponse } from '../../testUtils/httpMocks'
import { errorHandler } from '../errorHandler'

const originalRegisterUser = authService.registerUser

afterEach(() => {
  ;(authService as any).registerUser = originalRegisterUser
})

function runValidate(body: Record<string, unknown>) {
  const req: any = { body, params: {}, query: {} }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(RegisterSchema)(req, res as any, next)

  return { req, res, capturedError }
}

test('validate(RegisterSchema) rejects registration with a missing phone number', () => {
  const { capturedError, req, res } = runValidate({
    email: 'student@school.edu',
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
    email: 'student@school.edu',
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
    email: 'student@school.edu',
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
      email: 'student@school.edu',
      password: 'password123',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone,
    })

    assert.ok(!capturedError, `${phone} should be accepted`)
    assert.equal(req.body.phone, '+14165550192', `${phone} should normalize to +14165550192`)
  }
})

test('register returns 201 with the normalized phone passed through to registerUser', async () => {
  ;(authService as any).registerUser = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone: string
  ) => {
    assert.equal(email, 'student@school.edu')
    assert.equal(phone, '+14165550192')
    return { token: 'jwt-token', user: { id: 'user-1', email, firstName, phone } }
  }

  const req: any = {
    body: {
      email: 'student@school.edu',
      password: 'password123',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+14165550192',
    },
  }
  const res = createMockResponse()

  await register(req, res as any, (() => {}) as any)

  assert.equal(res.statusCode, 201)
  assert.equal((res.body as any).token, 'jwt-token')
})
