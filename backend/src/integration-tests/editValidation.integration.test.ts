/**
 * Integration Tests — edits checked against what is stored
 * ========================================================
 * A listing edit that sends only one of itemValue / depositAmount is checked
 * against the other's stored value; names can't be made blank with spaces.
 */
import { truncateAllTables, createTestUser, createTestListing, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'

let owner: { id: string; token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  listingId = (await createTestListing(owner.id, { itemValue: 100, depositAmount: 30 })).id
})

after(async () => disconnectTestPrisma())

const patchListing = (body: object) =>
  supertest(getApp()).patch(`/listings/${listingId}`).set('Authorization', `Bearer ${owner.token}`).send(body)

describe('PATCH /listings/:id', () => {
  test('lowering only the item value below the stored deposit is refused', async () => {
    const res = await patchListing({ itemValue: 20 })
    assert.equal(res.status, 400)
    assert.equal(res.body.error, 'depositAmount cannot exceed itemValue.')
    const stored = await getTestPrisma().listing.findUniqueOrThrow({ where: { id: listingId } })
    assert.equal(Number(stored.itemValue), 100)
  })

  test('raising only the deposit is checked against the stored item value', async () => {
    assert.equal((await patchListing({ depositAmount: 150 })).status, 400)
    const ok = await patchListing({ depositAmount: 50 })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.depositAmount, '50')
  })
})

describe('names', () => {
  test('a profile name of only spaces is refused, and names are stored trimmed', async () => {
    const as = (body: object) => supertest(getApp()).patch('/users/me').set('Authorization', `Bearer ${owner.token}`).send(body)
    assert.equal((await as({ firstName: '   ' })).status, 400)
    const ok = await as({ firstName: '  Sam  ', lastName: ' Lee ' })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.deepEqual([ok.body.firstName, ok.body.lastName], ['Sam', 'Lee'])
  })
})
