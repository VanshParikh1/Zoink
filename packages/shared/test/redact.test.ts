import test from 'node:test'
import assert from 'node:assert/strict'
import { FILTERED, redactText, scrubObject } from '../src/redact'

test('redactText removes emails, push tokens, JWTs, bearer tokens and stored-format phone numbers', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1MSJ9.c2lnbmF0dXJl'
  const text = [
    'Email address is not verified. The following identities failed the check: student@mail.utoronto.ca',
    '"ExponentPushToken[abcDEF123]" is not a registered push notification recipient',
    `token ${jwt}`,
    'Authorization: Bearer abc.def-ghi_jkl',
    'call +14165550192',
  ].join('\n')

  const out = redactText(text)
  for (const leaked of ['student@mail.utoronto.ca', 'abcDEF123', jwt, 'abc.def-ghi_jkl', '+14165550192']) {
    assert.ok(!out.includes(leaked), `still contains ${leaked}: ${out}`)
  }
  assert.match(out, /\[email\]/)
  assert.match(out, /\[push-token\]/)
  assert.match(out, /\[jwt\]/)
  assert.match(out, /\[phone\]/)
})

test('redactText leaves ordinary text, ids and amounts alone', () => {
  const text = 'booking 3f2a9c1e-0b7d-4c55-9a51-2d1f6b8e7c40 failed: capture of 4520 cents (status 402)'
  assert.equal(redactText(text), text)
})

test('scrubObject filters sensitive keys at any depth and redacts strings', () => {
  const scrubbed = scrubObject({
    status_code: 401,
    config: { headers: { Authorization: 'Bearer x', Accept: 'application/json' }, url: '/users/me' },
    code: '123456',
    note: 'reach me at a@b.co',
    list: ['c@d.co', { password: 'p' }],
  })
  assert.equal(scrubbed.status_code, 401)
  assert.equal(scrubbed.config.headers.Authorization, FILTERED)
  assert.equal(scrubbed.config.headers.Accept, 'application/json')
  assert.equal(scrubbed.code, FILTERED)
  assert.equal(scrubbed.note, 'reach me at [email]')
  assert.deepEqual(scrubbed.list, ['[email]', { password: FILTERED }])
})
