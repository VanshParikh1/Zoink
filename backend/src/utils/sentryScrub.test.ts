import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import type { ErrorEvent } from '@sentry/node'
import { FILTERED, scrubBreadcrumb, scrubEvent } from './sentryScrub'

function event(overrides: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...overrides } as ErrorEvent
}

describe('scrubEvent', () => {
  test('filters credentials, contact details and one-time codes from request bodies', () => {
    const scrubbed = scrubEvent(event({
      request: {
        data: {
          email: 'alice@mail.utoronto.ca',
          password: 'hunter22',
          phone: '+14165550192',
          code: '123456',
          firstName: 'Alice',
          nested: { stripeSecretKey: 'sk_live_x', expoPushToken: 'ExponentPushToken[x]', note: 'hi' },
        },
      },
    }))
    const data = scrubbed.request!.data as any
    assert.equal(data.email, FILTERED)
    assert.equal(data.password, FILTERED)
    assert.equal(data.phone, FILTERED)
    assert.equal(data.code, FILTERED)
    assert.equal(data.firstName, 'Alice')
    assert.equal(data.nested.stripeSecretKey, FILTERED)
    assert.equal(data.nested.expoPushToken, FILTERED)
    assert.equal(data.nested.note, 'hi')
  })

  test('drops raw string bodies (e.g. the Stripe webhook payload) entirely', () => {
    const scrubbed = scrubEvent(event({ request: { data: '{"customer_email":"a@b.co","card":{"last4":"4242"}}' } }))
    assert.equal(scrubbed.request!.data, FILTERED)
  })

  test('filters auth headers and cookies, redacts emails in the URL and query', () => {
    const scrubbed = scrubEvent(event({
      request: {
        headers: { authorization: 'Bearer eyJ...', 'user-agent': 'Zoink/1.0' },
        cookies: { session: 'abc' },
        url: 'https://api.zoink.app/users?email=alice@mail.utoronto.ca',
        query_string: 'email=alice@mail.utoronto.ca',
      },
    }))
    assert.equal(scrubbed.request!.headers!.authorization, FILTERED)
    assert.equal(scrubbed.request!.headers!['user-agent'], 'Zoink/1.0')
    assert.equal((scrubbed.request!.cookies as any).session, FILTERED)
    assert.ok(!scrubbed.request!.url!.includes('alice@'))
    assert.ok(!String(scrubbed.request!.query_string).includes('alice@'))
  })

  test('keeps only the user id, and redacts emails in messages, exceptions and breadcrumbs', () => {
    const scrubbed = scrubEvent(event({
      user: { id: 'user-1', email: 'alice@mail.utoronto.ca', ip_address: '203.0.113.9' },
      message: 'failed for alice@mail.utoronto.ca',
      exception: { values: [{ type: 'Error', value: 'No such customer for bob@torontomu.ca' }] },
      breadcrumbs: [{ category: 'console', message: '[DEV] OTP for carol@mylaurier.ca: 123456', data: { code: '123456', status_code: 500 } }],
    }))
    assert.deepEqual(scrubbed.user, { id: 'user-1' })
    assert.ok(!scrubbed.message!.includes('@'))
    assert.ok(!scrubbed.exception!.values![0].value!.includes('@'))
    const crumb = scrubbed.breadcrumbs![0]
    assert.ok(!crumb.message!.includes('carol@'))
    assert.equal((crumb.data as any).code, FILTERED)
    assert.equal((crumb.data as any).status_code, 500, 'status_code is not mistaken for a code')
  })
})

describe('scrubBreadcrumb', () => {
  test('redacts emails and filters sensitive data keys', () => {
    const crumb = scrubBreadcrumb({ message: 'login alice@mail.utoronto.ca', data: { password: 'x', url: '/auth/login' } })
    assert.equal(crumb.message, 'login [email]')
    assert.equal((crumb.data as any).password, FILTERED)
    assert.equal((crumb.data as any).url, '/auth/login')
  })
})
