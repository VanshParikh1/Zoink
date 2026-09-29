/**
 * Integration Tests — avatar upload through multer
 * ================================================
 * Exercises POST /users/me/avatar end to end through the multipart parser
 * (multer), with the Cloudinary upload itself stubbed so no network is used:
 * a valid image is accepted and saved, the size and type limits still hold.
 */

import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, disconnectTestPrisma, getApp, getTestPrisma } from './setup'
import * as cloudinary from '../utils/cloudinary'

// Smallest valid PNG: 1x1 transparent pixel.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

let user: { id: string; token: string }

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Avatar' })
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await disconnectTestPrisma()
})

const upload = () => supertest(getApp()).post('/users/me/avatar').set('Authorization', `Bearer ${user.token}`)

describe('POST /users/me/avatar', () => {
  test('a valid image is parsed, uploaded and saved as the avatar', async () => {
    const uploaded: { size: number; folder: string; publicId?: string }[] = []
    mock.method(cloudinary, 'uploadImage', async (buffer: Buffer, folder: string, publicId?: string) => {
      uploaded.push({ size: buffer.length, folder, publicId })
      return `https://res.cloudinary.com/test/image/upload/v1/avatars/${publicId}.png`
    })

    const res = await upload().attach('avatar', PNG_1X1, { filename: 'me.png', contentType: 'image/png' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(uploaded.length, 1)
    assert.equal(uploaded[0].size, PNG_1X1.length, 'multer hands the full file buffer to the uploader')
    assert.equal(uploaded[0].folder, 'avatars')
    assert.equal(uploaded[0].publicId, `avatar_${user.id}`)

    const saved = await getTestPrisma().user.findUniqueOrThrow({ where: { id: user.id } })
    assert.equal(saved.avatarUrl, res.body.avatarUrl)
  })

  test('a request without a file is a 400 and uploads nothing', async () => {
    const spy = mock.method(cloudinary, 'uploadImage', async () => 'unused')
    const res = await upload()
    assert.equal(res.status, 400)
    assert.equal(spy.mock.callCount(), 0)
  })

  test('the 5 MB limit and image-only filter still apply', async () => {
    const spy = mock.method(cloudinary, 'uploadImage', async () => 'unused')
    const tooBig = await upload().attach('avatar', Buffer.alloc(5 * 1024 * 1024 + 1, 1), { filename: 'big.png', contentType: 'image/png' })
    assert.equal(tooBig.status, 413)
    const notImage = await upload().attach('avatar', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
    assert.equal(notImage.status, 400)
    assert.equal(spy.mock.callCount(), 0)
  })
})
