/**
 * Integration Tests — deleted photos leave Cloudinary too
 * ========================================================
 * privacy.md §7: "When you delete a listing, it and its photos are deleted
 * immediately." Deleting a listing removed its rows, but the files stayed on
 * Cloudinary, public at their URLs. A deleted account's profile photo did the
 * same. Now the files go with them, and only this app's own uploads are ever
 * deleted (never a seed photo or another account's URL).
 *
 * Cloudinary's destroy call is mocked; nothing leaves the machine.
 */

import test, { after, afterEach, beforeEach, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { v2 as cloudinarySdk } from 'cloudinary'
import { createTestListing, createTestUser, disconnectTestPrisma, getApp, getTestPrisma, truncateAllTables } from './setup'

type U = { id: string; token: string }
let owner: U
let stranger: U
let listingId: string
let destroyed: string[]

const own = (path: string) => `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1712345678/${path}.jpg`
const SEED_PHOTO = 'https://images.unsplash.com/photo-1519183071298-a2962feb14f4?w=1200'

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  stranger = await createTestUser({ firstName: 'Stranger' })
  listingId = (await createTestListing(owner.id)).id
  destroyed = []
  mock.method(cloudinarySdk.uploader, 'destroy', async (publicId: string) => {
    destroyed.push(publicId)
    return { result: 'ok' }
  })
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await disconnectTestPrisma()
})

const as = (token: string) => ({
  delete: (path: string) => supertest(getApp()).delete(path).set('Authorization', `Bearer ${token}`),
})

async function addPhotos(id: string, urls: string[]) {
  return Promise.all(
    urls.map((url, order) => getTestPrisma().listingImage.create({ data: { listingId: id, url, order } }))
  )
}

describe('deleting a listing', () => {
  test("deletes its photos from Cloudinary, and only this app's own uploads", async () => {
    await addPhotos(listingId, [own('listings/a1'), own('listings/a2'), SEED_PHOTO])

    const res = await as(owner.token).delete(`/listings/${listingId}`)

    assert.equal(res.status, 204, JSON.stringify(res.body))
    assert.deepEqual(destroyed.sort(), ['listings/a1', 'listings/a2'])
    assert.equal(await getTestPrisma().listingImage.count(), 0)
  })

  test("someone else's delete is refused and touches no file", async () => {
    await addPhotos(listingId, [own('listings/b1')])
    assert.equal((await as(stranger.token).delete(`/listings/${listingId}`)).status, 403)
    assert.deepEqual(destroyed, [])
  })

  test('a Cloudinary failure does not undo or fail the deletion', async () => {
    mock.restoreAll()
    mock.method(cloudinarySdk.uploader, 'destroy', async () => {
      throw new Error('Cloudinary is down')
    })
    await addPhotos(listingId, [own('listings/c1')])
    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)
    assert.equal(await getTestPrisma().listing.count({ where: { id: listingId } }), 0)
  })
})

describe('deleting one listing photo', () => {
  test('deletes that file only', async () => {
    const [photo] = await addPhotos(listingId, [own('listings/d1'), own('listings/d2')])
    assert.equal((await as(owner.token).delete(`/listings/${listingId}/images/${photo.id}`)).status, 204)
    assert.deepEqual(destroyed, ['listings/d1'])
  })

  test("another listing's photo, named through your own listing, is refused", async () => {
    const otherListing = await createTestListing(stranger.id)
    const [theirs] = await addPhotos(otherListing.id, [own('listings/e1')])
    assert.equal((await as(owner.token).delete(`/listings/${listingId}/images/${theirs.id}`)).status, 404)
    assert.deepEqual(destroyed, [])
  })
})

describe('deleting an account', () => {
  test('deletes the profile photo file', async () => {
    await getTestPrisma().user.update({ where: { id: owner.id }, data: { avatarUrl: own(`avatars/avatar_${owner.id}`) } })

    assert.equal((await as(owner.token).delete('/users/me')).status, 204)
    assert.deepEqual(destroyed, [`avatars/avatar_${owner.id}`])
    assert.equal((await getTestPrisma().user.findUniqueOrThrow({ where: { id: owner.id } })).avatarUrl, null)
  })

  test('an account without a photo, or with a photo hosted elsewhere, deletes no file', async () => {
    await getTestPrisma().user.update({ where: { id: stranger.id }, data: { avatarUrl: SEED_PHOTO } })
    assert.equal((await as(owner.token).delete('/users/me')).status, 204)
    assert.equal((await as(stranger.token).delete('/users/me')).status, 204)
    assert.deepEqual(destroyed, [])
  })
})
