import test from 'node:test'
import assert from 'node:assert/strict'
import { scrubBreadcrumb, scrubEvent } from './sentryScrub'

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1MSJ9.c2lnbmF0dXJl'

test("a console breadcrumb loses the logged error's request config, Authorization header included", () => {
  const axiosError = { message: 'Request failed with status code 401', config: { headers: { Authorization: `Bearer ${JWT}` } } }
  const breadcrumb = scrubBreadcrumb({
    category: 'console',
    level: 'warning',
    message: 'Failed to release push token AxiosError: Request failed with status code 401',
    data: { arguments: ['Failed to release push token', axiosError], logger: 'console' },
  })
  assert.ok(!JSON.stringify(breadcrumb).includes(JWT))
  assert.equal(breadcrumb.data?.arguments, undefined)
  assert.equal(breadcrumb.data?.logger, 'console')
  assert.equal(axiosError.config.headers.Authorization, `Bearer ${JWT}`, 'the live error object is not changed')
})

test('breadcrumb data is scrubbed on a copy, never on live app objects', () => {
  const params = { email: 'student@mail.utoronto.ca', listingId: 'l1' }
  const breadcrumb = scrubBreadcrumb({ category: 'navigation', data: { to: 'Profile', params } })
  assert.equal((breadcrumb.data as any).params.email, '[Filtered]')
  assert.equal((breadcrumb.data as any).params.listingId, 'l1')
  assert.equal(params.email, 'student@mail.utoronto.ca')
})

test('events keep only the user id and lose emails, push tokens and tokens in text', () => {
  const event = scrubEvent({
    type: undefined,
    message: 'push failed for ExponentPushToken[abc123]',
    user: { id: 'u1', email: 'student@mail.utoronto.ca', ip_address: '1.2.3.4' },
    extra: { token: JWT, note: 'student@mail.utoronto.ca' },
    exception: { values: [{ type: 'Error', value: `Bearer ${JWT}` }] },
    breadcrumbs: [{ category: 'console', message: 'signed in as student@mail.utoronto.ca', data: { arguments: [{}] } }],
  })
  const text = JSON.stringify(event)
  for (const leaked of ['student@mail.utoronto.ca', 'abc123', JWT, '1.2.3.4']) {
    assert.ok(!text.includes(leaked), `still contains ${leaked}`)
  }
  assert.deepEqual(event.user, { id: 'u1' })
})
