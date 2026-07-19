import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as userService from '../../services/userService'
import { updatePushToken } from './userController'
import { createMockResponse } from '../../testUtils/httpMocks'

const originalUpdateExpoPushToken = userService.updateExpoPushToken

afterEach(() => {
  ;(userService as any).updateExpoPushToken = originalUpdateExpoPushToken
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
