/**
 * Integration Tests — listing photo uploads are authorized before they upload
 * ==========================================================================
 * POST /listings/:id/images streamed the file to Cloudinary first and only
 * then checked that the caller owned the listing, so any verified user could
 * push files into Zoink's Cloudinary account through any listing id, with no
 * cap on photos per listing. Ownership and the 8-photo cap (the create
 * screen's limit) are now checked before anything is uploaded.
 */

import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, createTestListing, disconnectTestPrisma, getApp, getTestPrisma } from './setup'
import * as cloudinary from '../utils/cloudinary'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

let owner: { id: string; token: string }
let stranger: { id: string; token: string }
let listingId: string
let uploads: number

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  stranger = await createTestUser({ firstName: 'Stranger' })
  listingId = (await createTestListing(owner.id)).id
  uploads = 0
  mock.method(cloudinary, 'uploadImage', async () => {
    uploads += 1
    return `https://res.cloudinary.com/test/image/upload/v1/listings/img${uploads}.jpg`
  })
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await disconnectTestPrisma()
})

const upload = (id: string, token: string) =>
  supertest(getApp())
    .post(`/listings/${id}/images`)
    .set('Authorization', `Bearer ${token}`)
    .attach('image', PNG_1X1, { filename: 'p.png', contentType: 'image/png' })

describe('POST /listings/:id/images', () => {
  test('the owner can add a photo', async () => {
    const res = await upload(listingId, owner.token)
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(uploads, 1)
  })

  test("someone else's listing is a 403 and nothing reaches Cloudinary", async () => {
    const res = await upload(listingId, stranger.token)
    assert.equal(res.status, 403)
    assert.equal(uploads, 0)
  })

  test('an unknown listing is a 404 and nothing reaches Cloudinary', async () => {
    const res = await upload('00000000-0000-0000-0000-000000000000', owner.token)
    assert.equal(res.status, 404)
    assert.equal(uploads, 0)
  })

  test('a 9th photo is a 400 and nothing reaches Cloudinary', async () => {
    await getTestPrisma().listingImage.createMany({
      data: Array.from({ length: 8 }, (_, order) => ({ listingId, url: `https://res.cloudinary.com/test/image/upload/listings/x${order}.jpg`, order })),
    })
    const res = await upload(listingId, owner.token)
    assert.equal(res.status, 400)
    assert.deepEqual(res.body, { error: 'A listing can have at most 8 photos.' })
    assert.equal(uploads, 0)
  })
})
