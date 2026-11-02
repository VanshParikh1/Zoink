import test, { afterEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import { currentToast, subscribeToasts, Toast, toast, toastDuration } from './toast'
import { HttpError } from './http'

afterEach(() => toast.dismiss())

describe('toasts', () => {
  test('one at a time: a new toast replaces the one showing', () => {
    const seen: (Toast | null)[] = []
    const unsubscribe = subscribeToasts((t) => seen.push(t))
    toast.success('Saved.')
    toast.error('Not saved.')
    unsubscribe()
    assert.deepEqual(seen.map((t) => t?.message), ['Saved.', 'Not saved.'])
    assert.equal(currentToast()?.kind, 'error')
  })

  test('dismissing an old toast leaves a newer one up', () => {
    const first = toast.info('First')
    toast.info('Second')
    toast.dismiss(first)
    assert.equal(currentToast()?.message, 'Second')
    toast.dismiss()
    assert.equal(currentToast(), null)
  })

  test('a failed request shows the plain message, never the raw one', () => {
    const request = { method: 'post' as const, url: '/x', headers: {} }
    const error = new HttpError('Request failed with status code 500', request, {
      status: 500,
      data: { error: 'Failed to refund payment via Stripe: No such payment_intent' },
      headers: new Headers(),
      config: request,
    })
    toast.failure(error)
    assert.equal(currentToast()?.message, 'Something went wrong on our side. Please try again in a moment.')
  })

  test('errors stay longer than successes, long messages longer still, capped', () => {
    assert.ok(toastDuration({ kind: 'error', message: 'x' }) > toastDuration({ kind: 'success', message: 'x' }))
    assert.ok(toastDuration({ kind: 'info', message: 'x'.repeat(150) }) > toastDuration({ kind: 'info', message: 'x' }))
    assert.equal(toastDuration({ kind: 'error', message: 'x'.repeat(1000) }), 8000)
  })
})
