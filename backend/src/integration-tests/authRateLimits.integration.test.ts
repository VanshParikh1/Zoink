/**
 * Integration Tests — login and registration rate limits (S1)
 * ===========================================================
 *   login: 10 / 15 min per client address + account, 100 / 15 min per address
 *   register: 20 / hour per address
 *   verify-email, resend-otp, legal-version: 10 / 15 min per address (+ user)
 *
 * The client address comes from X-Real-IP, which Railway's edge sets, so each
 * test uses its own addresses. The limiters run before validation, so budgets
 * are exhausted with cheap invalid bodies (400s still count) and then a 429 is
 * expected.
 */

import test, { after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'events'
import type { AddressInfo } from 'net'
import { disconnectTestPrisma, getApp } from './setup'

after(async () => {
  await disconnectTestPrisma()
})

// Plain fetch keeps one pooled keep-alive connection; supertest opens a new
// TCP connection per request, and these tests send ~200 of them.
async function send(method: string, path: string, clientAddress: string, body?: unknown) {
  const server = getApp()
  if (!server.listening) await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'X-Real-IP': clientAddress,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  await res.arrayBuffer()
  return res.status
}

// An empty password fails validation, so no bcrypt work per attempt.
const loginAttempt = (clientAddress: string, email: string) =>
  send('POST', '/auth/login', clientAddress, { email, password: '' })

describe('POST /auth/login limits', () => {
  test('10 attempts per address and account; case and whitespace variants share the budget', async () => {
    for (let i = 0; i < 10; i++) {
      assert.equal(await loginAttempt('203.0.113.1', 'student@mail.utoronto.ca'), 400, `attempt ${i + 1}`)
    }
    assert.equal(await loginAttempt('203.0.113.1', ' Student@Mail.UToronto.ca '), 429)

    assert.equal(await loginAttempt('203.0.113.1', 'classmate@mail.utoronto.ca'), 400, 'another account on the same address is unaffected')
    assert.equal(await loginAttempt('203.0.113.2', 'student@mail.utoronto.ca'), 400, 'the same account from another address is unaffected')
  })

  test('100 attempts per address across accounts', async () => {
    for (let i = 0; i < 100; i++) {
      assert.equal(await loginAttempt('203.0.113.3', `student${i}@mail.utoronto.ca`), 400, `attempt ${i + 1}`)
    }
    assert.equal(await loginAttempt('203.0.113.3', 'student100@mail.utoronto.ca'), 429)
    assert.equal(await loginAttempt('203.0.113.4', 'student100@mail.utoronto.ca'), 400, 'another address is unaffected')
  })
})

describe('POST /auth/register limit', () => {
  test('20 attempts per address per hour', async () => {
    for (let i = 0; i < 20; i++) {
      assert.equal(await send('POST', '/auth/register', '203.0.113.5', {}), 400, `attempt ${i + 1}`)
    }
    assert.equal(await send('POST', '/auth/register', '203.0.113.5', {}), 429)
    assert.equal(await send('POST', '/auth/register', '203.0.113.6', {}), 400, 'another address is unaffected')
  })

  test('registering does not spend the login budget, and logging in does not spend registration', async () => {
    for (let i = 0; i < 20; i++) await send('POST', '/auth/register', '203.0.113.7', {})
    assert.equal(await loginAttempt('203.0.113.7', 'student@mail.utoronto.ca'), 400)

    for (let i = 0; i < 10; i++) await loginAttempt('203.0.113.8', 'student@mail.utoronto.ca')
    assert.equal(await send('POST', '/auth/register', '203.0.113.8', {}), 400)
  })
})

describe('other auth routes', () => {
  test('keep 10 per 15 minutes per address', async () => {
    for (let i = 0; i < 10; i++) {
      assert.equal(await send('GET', '/auth/legal-version', '203.0.113.9'), 200, `request ${i + 1}`)
    }
    assert.equal(await send('GET', '/auth/legal-version', '203.0.113.9'), 429)
    assert.equal(await send('POST', '/auth/resend-otp', '203.0.113.10'), 401, 'unauthenticated, but not limited from a fresh address')
  })
})
