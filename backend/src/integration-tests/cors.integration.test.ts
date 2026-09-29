/**
 * Integration Tests — no cross-origin browser access
 * ==================================================
 * The API only serves the native app, which isn't subject to CORS. It used to
 * answer every origin with Access-Control-Allow-Origin: *; browsers on other
 * sites now get no CORS grant at all.
 */

import test, { after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { disconnectTestPrisma, getApp } from './setup'

after(async () => {
  await disconnectTestPrisma()
})

describe('CORS', () => {
  test('a preflight from another origin gets no CORS grant', async () => {
    const res = await supertest(getApp())
      .options('/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
    assert.equal(res.headers['access-control-allow-origin'], undefined)
    assert.equal(res.headers['access-control-allow-headers'], undefined)
  })

  test('a simple cross-origin request gets no CORS grant', async () => {
    const res = await supertest(getApp()).get('/health').set('Origin', 'https://evil.example')
    assert.equal(res.status, 200)
    assert.equal(res.headers['access-control-allow-origin'], undefined)
  })

  test('requests without an Origin (the native app) are unaffected', async () => {
    const res = await supertest(getApp()).get('/health')
    assert.equal(res.status, 200)
  })
})
