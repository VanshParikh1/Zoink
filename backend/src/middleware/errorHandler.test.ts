import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { errorHandler } from './errorHandler'
import { ConflictError, InternalServerError } from '../utils/errors'

function respond(err: unknown) {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
  const originalError = console.error
  console.error = () => {}
  try {
    errorHandler(err, { method: 'POST', path: '/admin/disputes/x/resolve' } as any, res, () => {})
  } finally {
    console.error = originalError
  }
  return res
}

describe('errorHandler', () => {
  test('a 500 AppError never sends its message (Stripe text, config names) to the client', () => {
    const res = respond(new InternalServerError('Failed to refund payment via Stripe: No such payment_intent: pi_123'))
    assert.equal(res.statusCode, 500)
    assert.deepEqual(res.body, { error: 'Something went wrong.' })
  })

  test('a 4xx AppError keeps its message', () => {
    const res = respond(new ConflictError('This booking has already been paid.'))
    assert.equal(res.statusCode, 409)
    assert.deepEqual(res.body, { error: 'This booking has already been paid.' })
  })
})
