/**
 * Integration Tests — P3-7: App Review demo listings stay with the demo accounts
 * ===============================================================================
 * Listings owned by a seeded reviewer account are hidden from browse, search,
 * categories and listing-by-id for everyone else, and can't be requested or
 * asked about. The reviewer accounts themselves still see and book them.
 */
import { truncateAllTables, createTestUser, createTestListing, futureDates, disconnectTestPrisma, getApp, getTestPrisma } from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'

let demoOwner: { id: string; token: string }
let reviewer: { id: string; token: string }
let stranger: { id: string; token: string }
let realOwner: { id: string; token: string }
let demoListing: string
let realListing: string

beforeEach(async () => {
  await truncateAllTables()
  demoOwner = await createTestUser({ email: 'reviewer-owner@zoink.app', firstName: 'Demo', stripeAccountId: 'acct_demo' })
  reviewer = await createTestUser({ email: 'reviewer@zoink.app', firstName: 'App' })
  stranger = await createTestUser({ firstName: 'Real' })
  realOwner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_real' })
  demoListing = (await createTestListing(demoOwner.id, { title: 'Demo tent' })).id
  realListing = (await createTestListing(realOwner.id, { title: 'Real kayak' })).id
  await getTestPrisma().listing.update({ where: { id: demoListing }, data: { category: 'Camping' } })
  await getTestPrisma().listing.update({ where: { id: realListing }, data: { category: 'Outdoors' } })
})

after(async () => disconnectTestPrisma())

const as = (token: string) => ({
  get: (path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object) => supertest(getApp()).post(path).set('Authorization', `Bearer ${token}`).send(body),
})
const ids = (res: supertest.Response) => (res.body.items as { id: string }[]).map((l) => l.id)

describe('App Review demo listings (P3-7)', () => {
  test('hidden from everyone else: browse, search, categories, by id; requests and chats refused', async () => {
    for (const path of ['/listings', '/listings?limit=20', '/listings?q=tent', '/listings?limit=20&q=tent']) {
      const res = await as(stranger.token).get(path)
      assert.equal(res.status, 200, path)
      assert.equal(ids(res).includes(demoListing), false, `${path} shows the demo listing`)
    }
    assert.ok(ids(await as(stranger.token).get('/listings')).includes(realListing), 'real listings still show')
    const categories = await as(stranger.token).get('/listings/categories')
    assert.deepEqual(categories.body.categories, ['Outdoors'])
    assert.equal((await as(stranger.token).get(`/listings/${demoListing}`)).status, 404)

    const { startDate, endDate } = futureDates(5, 2)
    const book = await as(stranger.token).post('/bookings', { listingId: demoListing, startDate, endDate })
    assert.equal(book.status, 400, JSON.stringify(book.body))
    assert.equal(book.body.error, 'This listing is currently unavailable.')
    assert.equal((await as(stranger.token).post('/conversations', { listingId: demoListing })).status, 400)
  })

  test('the reviewer accounts still see, search and request them', async () => {
    assert.ok(ids(await as(reviewer.token).get('/listings')).includes(demoListing))
    assert.ok(ids(await as(reviewer.token).get('/listings?limit=20&q=tent')).includes(demoListing))
    assert.deepEqual((await as(reviewer.token).get('/listings/categories')).body.categories, ['Camping', 'Outdoors'])
    assert.equal((await as(reviewer.token).get(`/listings/${demoListing}`)).status, 200)
    const { startDate, endDate } = futureDates(5, 2)
    const book = await as(reviewer.token).post('/bookings', { listingId: demoListing, startDate, endDate })
    assert.equal(book.status, 201, JSON.stringify(book.body))
    assert.equal((await as(reviewer.token).post('/conversations', { listingId: demoListing })).status, 201)
    // The demo owner still sees its own listing by id.
    assert.equal((await as(demoOwner.token).get(`/listings/${demoListing}`)).status, 200)
  })
})
