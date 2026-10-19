/**
 * Integration Tests — compression and revalidation
 * =================================================
 * Responses over 1 KB are gzip-compressed when the client accepts it (the
 * app's HTTP stack always does). Listing reads carry Cache-Control so the
 * phone may keep a copy but revalidates it; Express's ETag then turns an
 * unchanged listing into a 304 with no body.
 */

import test, { after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { createTestListing, createTestUser, disconnectTestPrisma, getApp, getTestPrisma, truncateAllTables } from './setup'

let viewer: { id: string; token: string }
let owner: { id: string; token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  viewer = await createTestUser({ firstName: 'Viewer' })
  owner = await createTestUser({ firstName: 'Owner' })
  for (let i = 0; i < 6; i++) listingId = (await createTestListing(owner.id, { title: `Compressible listing ${i}` })).id
})

after(async () => {
  await disconnectTestPrisma()
})

const get = (path: string, headers: Record<string, string> = {}) =>
  supertest(getApp()).get(path).set('Authorization', `Bearer ${viewer.token}`).set(headers)

describe('compression', () => {
  test('a large response is gzipped when the client accepts it', async () => {
    const res = await get('/listings', { 'Accept-Encoding': 'gzip' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-encoding'], 'gzip')
    assert.equal(res.body.items.length, 6, 'decodes to the same JSON')
  })

  test('a small response, or a client that does not accept gzip, is sent as is', async () => {
    const small = await get('/listings/categories', { 'Accept-Encoding': 'gzip' })
    assert.equal(small.status, 200)
    assert.equal(small.headers['content-encoding'], undefined)
    const plain = await get('/listings', { 'Accept-Encoding': 'identity' })
    assert.equal(plain.headers['content-encoding'], undefined)
    assert.equal(plain.body.items.length, 6)
  })
})
