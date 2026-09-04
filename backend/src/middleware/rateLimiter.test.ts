import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { buildLimiter } from './rateLimiter'

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
