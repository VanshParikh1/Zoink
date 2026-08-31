import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as userService from '../../services/userService'
import { deleteMe, updateNotificationPrefs, updatePushToken } from './userController'
import { createMockResponse } from '../../testUtils/httpMocks'
import { validate } from '../validate'
import { UpdateMeSchema, UpdateNotificationPrefsSchema } from '../../schemas/user.schema'
import { errorHandler } from '../errorHandler'

function runValidate(body: Record<string, unknown>) {
  const req: any = { body, params: {}, query: {} }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(UpdateMeSchema)(req, res as any, next)

  return { req, res, capturedError }
}

function runPrefsValidate(body: Record<string, unknown>) {
  const req: any = { body, params: {}, query: {} }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(UpdateNotificationPrefsSchema)(req, res as any, next)

  return { req, res, capturedError }
}

test('validate(UpdateMeSchema) rejects a firstName over 50 characters', () => {
  const { capturedError, req, res } = runValidate({ firstName: 'A'.repeat(51) })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.firstName'), 'should flag firstName over 50 characters')
})

test('validate(UpdateMeSchema) rejects a lastName over 50 characters', () => {
  const { capturedError, req, res } = runValidate({ lastName: 'L'.repeat(51) })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.lastName'), 'should flag lastName over 50 characters')
})

test('validate(UpdateMeSchema) rejects a bio over 300 characters', () => {
  const { capturedError, req, res } = runValidate({ bio: 'B'.repeat(301) })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.bio'), 'should flag bio over 300 characters')
})

test('validate(UpdateMeSchema) accepts a well-formed profile update', () => {
  const { capturedError } = runValidate({
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '4165550192',
    bio: 'Loves renting camping gear.',
  })

  assert.ok(!capturedError, 'should not raise a ZodError')
})

test('validate(UpdateNotificationPrefsSchema) rejects an empty body', () => {
  const { capturedError, req, res } = runPrefsValidate({})

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})
  assert.equal(res.statusCode, 400)
})

test('validate(UpdateNotificationPrefsSchema) rejects a non-boolean toggle', () => {
  const { capturedError, req, res } = runPrefsValidate({ notifyMessages: 'yes' })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})
  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.notifyMessages'))
})

test('validate(UpdateNotificationPrefsSchema) accepts a partial update', () => {
  const { capturedError } = runPrefsValidate({ notifyReviews: false })
  assert.ok(!capturedError, 'should not raise a ZodError')
})

const originalUpdateExpoPushToken = userService.updateExpoPushToken
const originalUpdateNotificationPreferences = userService.updateNotificationPreferences
const originalDeleteMe = userService.deleteMe

afterEach(() => {
  ;(userService as any).updateExpoPushToken = originalUpdateExpoPushToken
  ;(userService as any).updateNotificationPreferences = originalUpdateNotificationPreferences
  ;(userService as any).deleteMe = originalDeleteMe
})

test('updateNotificationPrefs returns the updated preferences', async () => {
  const prefs = {
    notifyMessages: false,
    notifyBookingActivity: true,
    notifyPaymentsPayouts: true,
    notifyDepositUpdates: true,
    notifyReviews: true,
  }
  ;(userService as any).updateNotificationPreferences = async (userId: string, patch: any) => {
    assert.equal(userId, 'user-1')
    assert.deepEqual(patch, { notifyMessages: false })
    return prefs
  }

  const req: any = { userId: 'user-1', body: { notifyMessages: false } }
  const res = createMockResponse()

  await updateNotificationPrefs(req, res as any, () => {})

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, prefs)
})

test('deleteMe responds 204 with no body', async () => {
  let calledWith: string | null = null
  ;(userService as any).deleteMe = async (userId: string) => { calledWith = userId }

  const req: any = { userId: 'user-1' }
  const res = createMockResponse()

  await deleteMe(req, res as any, () => {})

  assert.equal(calledWith, 'user-1')
  assert.equal(res.statusCode, 204)
})

test('updatePushToken rejects non-string token payloads', async () => {
  const req: any = {
    userId: 'user-1',
    body: { expoPushToken: 12345 },
  }
  const res = createMockResponse()
  const next = (err: any) => {}

  await updatePushToken(req, res as any, next)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    error: 'expoPushToken must be a string or null.',
  })
})

test('updatePushToken persists null token clears', async () => {
  ;(userService as any).updateExpoPushToken = async (userId: string, expoPushToken: string | null) => {
    assert.equal(userId, 'user-1')
    assert.equal(expoPushToken, null)
    return { id: userId, expoPushToken }
  }

  const req: any = {
    userId: 'user-1',
    body: { expoPushToken: null },
  }
  const res = createMockResponse()
  const next = (err: any) => {}

  await updatePushToken(req, res as any, next)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { id: 'user-1', expoPushToken: null })
})
