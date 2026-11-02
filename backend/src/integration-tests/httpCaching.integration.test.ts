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

describe('listing reads: Cache-Control and ETag', () => {
  test('a listing is revalidated: unchanged is a 304 with no body, changed is a fresh 200', async () => {
    const first = await get(`/listings/${listingId}`)
    assert.equal(first.status, 200)
    assert.equal(first.headers['cache-control'], 'private, no-cache')
    const etag = first.headers.etag
    assert.ok(etag, 'has an ETag')

    const again = await get(`/listings/${listingId}`, { 'If-None-Match': etag })
    assert.equal(again.status, 304)
    assert.equal(again.text, '')

    await getTestPrisma().listing.update({ where: { id: listingId }, data: { dailyPrice: 99 } })
    const changed = await get(`/listings/${listingId}`, { 'If-None-Match': etag })
    assert.equal(changed.status, 200)
    assert.equal(changed.body.dailyPrice, '99')
    assert.notEqual(changed.headers.etag, etag)
  })

  test('browse pages revalidate the same way; categories may be reused for five minutes', async () => {
    const page = await get('/listings?limit=3')
    assert.equal(page.headers['cache-control'], 'private, no-cache')
    assert.equal((await get('/listings?limit=3', { 'If-None-Match': page.headers.etag })).status, 304)

    const categories = await get('/listings/categories')
    assert.equal(categories.headers['cache-control'], 'private, max-age=300')
  })

  test("another viewer's ETag never matches a viewer-specific answer", async () => {
    const asOwner = await supertest(getApp()).get(`/listings/${listingId}`).set('Authorization', `Bearer ${owner.token}`)
    const asViewer = await get(`/listings/${listingId}`, { 'If-None-Match': asOwner.headers.etag })
    assert.equal(asViewer.status, 200, 'the owner sees the exact point and address; the viewer does not')
    assert.equal(asViewer.body.address, null)
  })
})
