import test from 'node:test'
import assert from 'node:assert/strict'
import { CreateListingSchema, UpdateListingSchema } from './listing.schema'

const LISTING_ID = '6f1c2b3a-4d5e-4f60-8a71-92b3c4d5e6f7'

function create(dailyPrice: number) {
  return CreateListingSchema.safeParse({
    body: { title: 'Drill', description: 'Cordless', category: 'Tools', dailyPrice, latitude: 43.66, longitude: -79.39, city: 'Toronto' },
  })
}

test('a listing costs at least $5 a day, on create and on edit', () => {
  assert.equal(create(4.99).success, false)
  assert.match(JSON.stringify(create(4.99).error?.issues), /at least 5/)
  assert.equal(create(5).success, true, JSON.stringify(create(5).error?.issues))

  const edit = (dailyPrice: number) => UpdateListingSchema.safeParse({ params: { id: LISTING_ID }, body: { dailyPrice } })
  assert.equal(edit(1).success, false)
  assert.equal(edit(5).success, true)
})
