/**
 * Integration Tests — per-user limits on write actions
 * ===================================================
 * Actions that notify another user or cost something per call have their own
 * per-user caps on top of the global limiter:
 *   messages 60/min · booking requests 20/hour · reports 10/day ·
 *   disputes 10/day · uploads 30/hour (shared) · block/unblock 30/hour (shared)
 *
 * The limiter runs before validation, so these tests exhaust each budget
 * with cheap invalid requests (400s still count) and then expect a 429.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'events'
import type { AddressInfo } from 'net'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  getTestPrisma,
  disconnectTestPrisma,
  getApp,
} from './setup'

let user: { id: string; token: string }
let other: { id: string; token: string }
let listingId: string
let conversationId: string

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Busy' })
  other = await createTestUser({ firstName: 'Other' })
  listingId = (await createTestListing(user.id)).id
  conversationId = (
    await getTestPrisma().conversation.create({ data: { listingId, renterId: other.id, ownerId: user.id } })
  ).id
})

after(async () => {
  await disconnectTestPrisma()
})

type Reply = { status: number; body: any }
type Call = (token: string) => Promise<Reply>

// Plain fetch keeps one pooled keep-alive connection; supertest opens a new
// TCP connection per request, and these tests send ~200 of them.
async function send(method: string, path: string, token: string, body?: unknown): Promise<Reply> {
  const server = getApp()
  if (!server.listening) await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any = text
  try {
    parsed = JSON.parse(text)
  } catch {}
  return { status: res.status, body: parsed }
}

async function exhaust(call: Call, token: string, limit: number) {
  for (let i = 0; i < limit; i++) {
    const res = await call(token)
    assert.notEqual(res.status, 429, `call ${i + 1} of ${limit} should be allowed`)
  }
  const blocked = await call(token)
  assert.equal(blocked.status, 429, `call ${limit + 1} should be rate limited`)
  assert.equal(blocked.body.error, 'Too many requests. Please try again later.')
}

describe('per-user write limits', () => {
  test('messages: 60 per minute', async () => {
    const message: Call = (token) => send('POST', `/conversations/${conversationId}/messages`, token, { body: 42 })
    await exhaust(message, user.token, 60)

    const otherUser = await send('POST', `/conversations/${conversationId}/messages`, other.token, { body: 'still fine' })
    assert.equal(otherUser.status, 201, 'another user has their own budget')
  })

  test('booking requests: 20 per hour', async () => {
    const request: Call = (token) => send('POST', '/bookings', token, {})
    await exhaust(request, other.token, 20)
  })

  test('reports and disputes: 10 per day each, counted separately', async () => {
    const report: Call = (token) => send('POST', '/reports', token, {})
    const dispute: Call = (token) => send('POST', '/disputes', token, {})

    await exhaust(report, user.token, 10)
    const firstDispute = await dispute(user.token)
    assert.equal(firstDispute.status, 400, 'reports and disputes have separate budgets')
    await exhaust(dispute, user.token, 9)
  })

  test('uploads: 30 per hour, shared across avatar, listing and handoff photos', async () => {
    const avatar: Call = (token) => send('POST', '/users/me/avatar', token)
    await exhaust(avatar, user.token, 30)

    const listingPhoto = await send('POST', `/listings/${listingId}/images`, user.token)
    assert.equal(listingPhoto.status, 429, 'listing photo uploads draw from the same budget')
  })

  test('block/unblock: 30 per hour, shared', async () => {
    let flip = false
    const toggle: Call = (token) => {
      flip = !flip
      return send(flip ? 'POST' : 'DELETE', `/users/${other.id}/block`, token)
    }
    await exhaust(toggle, user.token, 30)
  })
})
