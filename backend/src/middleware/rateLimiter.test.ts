import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { once } from 'events'
import type { AddressInfo } from 'net'
import { buildGlobalLimiter, buildLimiter, clientIp, globalLimiter } from './rateLimiter'

process.env.JWT_SECRET ??= 'test-jwt-secret-for-rate-limiter-tests'

function buildTestApp(limit: number) {
  const app = express()
  app.use(buildLimiter({ windowMs: 60_000, limit }))
  app.get('/ping', (_req, res) => res.status(200).json({ ok: true }))
  return app
}

function tokenFor(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!)
}

test('rate limiter allows requests under the threshold', async () => {
  const app = buildTestApp(3)

  for (let i = 0; i < 3; i++) {
    const res = await request(app).get('/ping')
    assert.equal(res.status, 200)
  }
})

test('rate limiter rejects with 429 and a Retry-After header once the threshold is exceeded', async () => {
  const app = buildTestApp(3)

  for (let i = 0; i < 3; i++) {
    const res = await request(app).get('/ping')
    assert.equal(res.status, 200)
  }

  const blocked = await request(app).get('/ping')
  assert.equal(blocked.status, 429)
  assert.equal(blocked.body.error, 'Too many requests. Please try again later.')
  assert.ok(blocked.headers['retry-after'], 'expected a Retry-After header on a 429')
  assert.ok(Number(blocked.headers['retry-after']) >= 0)
})

test('rate limiter keys authenticated requests by IP + userId, so one user cannot exhaust another user\'s budget on the same connection', async () => {
  const app = buildTestApp(2)
  const userA = tokenFor('user-a')
  const userB = tokenFor('user-b')

  // Exhaust user A's budget.
  await request(app).get('/ping').set('Authorization', `Bearer ${userA}`)
  await request(app).get('/ping').set('Authorization', `Bearer ${userA}`)
  const userABlocked = await request(app).get('/ping').set('Authorization', `Bearer ${userA}`)
  assert.equal(userABlocked.status, 429)

  // User B, same test connection/IP, still has their own budget.
  const userBResponse = await request(app).get('/ping').set('Authorization', `Bearer ${userB}`)
  assert.equal(userBResponse.status, 200)
})

// ── Global limiter ────────────────────────────────────────────────────────────


function buildGlobalTestApp(limiter: ReturnType<typeof buildGlobalLimiter>) {
  const app = express()
  // Lets tests vary the client IP via X-Forwarded-For.
  app.set('trust proxy', true)
  app.use(limiter)
  app.get('/ping', (_req, res) => res.status(200).json({ ok: true }))
  return app
}

test('global limiter gives a signed-in user one budget across networks', async () => {
  const app = buildGlobalTestApp(buildGlobalLimiter({ windowMs: 60_000, authenticatedLimit: 3, anonymousLimit: 1 }))
  const token = tokenFor('user-roaming')

  const ips = ['203.0.113.1', '203.0.113.2', '198.51.100.3']
  for (const ip of ips) {
    const res = await request(app).get('/ping').set('Authorization', `Bearer ${token}`).set('X-Forwarded-For', ip)
    assert.equal(res.status, 200)
  }
  const blocked = await request(app).get('/ping').set('Authorization', `Bearer ${token}`).set('X-Forwarded-For', '192.0.2.9')
  assert.equal(blocked.status, 429, 'switching networks does not reset a signed-in budget')
})

test('global limiter counts anonymous callers per IP with the lower limit', async () => {
  const app = buildGlobalTestApp(buildGlobalLimiter({ windowMs: 60_000, authenticatedLimit: 5, anonymousLimit: 1 }))

  assert.equal((await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.1')).status, 200)
  assert.equal((await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.1')).status, 429)
  assert.equal((await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.2')).status, 200, 'another IP has its own budget')

  // A signed-in user on the exhausted IP is unaffected.
  const signedIn = await request(app).get('/ping').set('Authorization', `Bearer ${tokenFor('user-on-busy-ip')}`).set('X-Forwarded-For', '203.0.113.1')
  assert.equal(signedIn.status, 200)
})

test('global limiter treats a forged token as anonymous', async () => {
  const app = buildGlobalTestApp(buildGlobalLimiter({ windowMs: 60_000, authenticatedLimit: 5, anonymousLimit: 1 }))
  const forged = jwt.sign({ userId: 'user-forged' }, 'not-the-server-secret')

  assert.equal((await request(app).get('/ping').set('Authorization', `Bearer ${forged}`).set('X-Forwarded-For', '203.0.113.7')).status, 200)
  assert.equal((await request(app).get('/ping').set('Authorization', `Bearer ${forged}`).set('X-Forwarded-For', '203.0.113.7')).status, 429)
})

test('production global limiter lets a signed-in user keep polling past the old 300-request cap', async () => {
  // Plain fetch over one pooled keep-alive connection: supertest opens a new
  // TCP connection per request, and at 316 of them an occasional loopback
  // connection on this machine is picked up by an unrelated local process.
  const server = buildGlobalTestApp(globalLimiter).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ping`
  const headers = { Authorization: `Bearer ${tokenFor('user-chatting')}` }

  try {
    // 3 requests every 4s for 7 minutes = 315 — build 5's open-chat poll.
    for (let i = 0; i < 315; i++) {
      const res = await fetch(url, { headers })
      await res.arrayBuffer()
      assert.equal(res.status, 200, `request ${i + 1} should not be rate limited`)
    }
    const res = await fetch(url, { headers })
    await res.arrayBuffer()
    assert.equal(res.headers.get('ratelimit-limit'), '1200')
  } finally {
    server.closeAllConnections()
    server.close()
  }
})

test('global limiter treats a token signed with another HMAC algorithm as anonymous', async () => {
  const app = buildGlobalTestApp(buildGlobalLimiter({ windowMs: 60_000, authenticatedLimit: 5, anonymousLimit: 1 }))
  const hs512 = jwt.sign({ userId: 'user-hs512' }, process.env.JWT_SECRET!, { algorithm: 'HS512' })

  assert.equal((await request(app).get('/ping').set('Authorization', `Bearer ${hs512}`).set('X-Forwarded-For', '203.0.113.8')).status, 200)
  assert.equal((await request(app).get('/ping').set('Authorization', `Bearer ${hs512}`).set('X-Forwarded-For', '203.0.113.8')).status, 429)
})

// ── Client address behind Railway's edge (S1) ────────────────────────────────

// What production sees: one trusted proxy hop, X-Forwarded-For ending in the
// edge's own address (shared by many clients), and X-Real-IP set by the edge
// to the connecting client.
const EDGE = '79.127.200.35'

function buildRailwayLikeApp(limiter: ReturnType<typeof buildGlobalLimiter>) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(limiter)
  app.get('/ping', (req, res) => res.status(200).json({ ip: req.ip, clientIp: clientIp(req) }))
  return app
}

function viaEdge(app: express.Express, client: string, extra: Record<string, string> = {}) {
  return request(app).get('/ping').set('X-Forwarded-For', `${client}, ${EDGE}`).set('X-Real-IP', client).set(extra)
}

test('behind the edge, clients get their own budgets instead of sharing the edge address', async () => {
  const app = buildRailwayLikeApp(buildGlobalLimiter({ windowMs: 60_000, authenticatedLimit: 5, anonymousLimit: 1 }))

  const first = await viaEdge(app, '203.0.113.10')
  assert.equal(first.status, 200)
  assert.equal(first.body.ip, EDGE, 'req.ip is the edge address, which is why it cannot be the key')
  assert.equal(first.body.clientIp, '203.0.113.10')

  assert.equal((await viaEdge(app, '203.0.113.11')).status, 200, 'a second client behind the same edge is not blocked')
  assert.equal((await viaEdge(app, '203.0.113.10')).status, 429, 'the first client is still limited')
})

test('the limiter key follows X-Real-IP, not whatever the client put in X-Forwarded-For', async () => {
  const app = buildRailwayLikeApp(buildGlobalLimiter({ windowMs: 60_000, authenticatedLimit: 5, anonymousLimit: 2 }))

  // The edge keeps the client's own X-Forwarded-For entries ahead of its own;
  // rotating them must not buy a fresh budget.
  for (const spoofed of ['1.1.1.1', '2.2.2.2']) {
    const res = await request(app).get('/ping').set('X-Forwarded-For', `${spoofed}, 203.0.113.20, ${EDGE}`).set('X-Real-IP', '203.0.113.20')
    assert.equal(res.status, 200)
  }
  const blocked = await request(app).get('/ping').set('X-Forwarded-For', `3.3.3.3, 203.0.113.20, ${EDGE}`).set('X-Real-IP', '203.0.113.20')
  assert.equal(blocked.status, 429)
})

test('an X-Real-IP that is not a single IP address falls back to req.ip', async () => {
  const app = buildRailwayLikeApp(buildGlobalLimiter({ windowMs: 60_000, authenticatedLimit: 5, anonymousLimit: 1 }))

  const res = await request(app).get('/ping').set('X-Forwarded-For', EDGE).set('X-Real-IP', 'not-an-ip')
  assert.equal(res.body.clientIp, EDGE)
  // Junk values can't be rotated into fresh budgets either.
  const again = await request(app).get('/ping').set('X-Forwarded-For', EDGE).set('X-Real-IP', '203.0.113.30, 203.0.113.31')
  assert.equal(again.status, 429)
})

test('clientIp accepts IPv6 from X-Real-IP', () => {
  const req = { get: (name: string) => (name === 'x-real-ip' ? ' 2001:db8::1 ' : undefined), ip: '10.0.0.1' } as any
  assert.equal(clientIp(req), '2001:db8::1')
})
