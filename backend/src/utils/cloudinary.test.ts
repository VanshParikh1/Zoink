import test from 'node:test'
import assert from 'node:assert/strict'

process.env.CLOUDINARY_CLOUD_NAME = 'zoinkcloud'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ownPublicId } = require('./cloudinary') as typeof import('./cloudinary')

test("ownPublicId names only this app's own uploads", () => {
  assert.equal(ownPublicId('https://res.cloudinary.com/zoinkcloud/image/upload/v1712345678/listings/abc.jpg'), 'listings/abc')
  assert.equal(ownPublicId('https://res.cloudinary.com/zoinkcloud/image/upload/avatars/avatar_u1.png'), 'avatars/avatar_u1')
  assert.equal(ownPublicId('https://res.cloudinary.com/someoneelse/image/upload/v1/listings/abc.jpg'), null, 'another account')
  assert.equal(ownPublicId('https://images.unsplash.com/photo-1?w=1200'), null, 'a seed photo')
  assert.equal(ownPublicId('https://res.cloudinary.com/zoinkcloud/image/upload/'), null, 'no public id')
  assert.equal(ownPublicId('http://res.cloudinary.com/zoinkcloud/image/upload/v1/listings/abc.jpg'), null, 'not the secure URL uploads return')
})
