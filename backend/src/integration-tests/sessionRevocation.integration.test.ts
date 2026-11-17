/**
 * Integration Tests — sessions end when the account's tokenVersion moves
 * =====================================================================
 * Every session token carries the user's tokenVersion. A password reset or
 * change bumps it, and from then on every older token is refused.
 */
import { truncateAllTables, createTestUser, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'

let user: { id: string; email: string; token: string }

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Sam' })
})

after(async () => disconnectTestPrisma())

const me = (token: string) => supertest(getApp()).get('/users/me').set('Authorization', `Bearer ${token}`)

describe('tokenVersion', () => {
  test('a token from before a bump is refused; one signed after it works', async () => {
    assert.equal((await me(user.token)).status, 200, 'tokens without the claim count as version 0')

    await getTestPrisma().user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } })
    const old = await me(user.token)
    assert.equal(old.status, 401)
    assert.equal(old.body.error, 'Your session has ended. Please sign in again.')

    const login = await supertest(getApp()).post('/auth/login').set('X-Real-IP', '198.18.0.40').send({ email: user.email, password: 'TestPass123!' })
    assert.equal(login.status, 200, JSON.stringify(login.body))
    assert.equal((await me(login.body.token)).status, 200)
  })

  test('an older session can still release its own phone push token', async () => {
    await getTestPrisma().user.update({ where: { id: user.id }, data: { expoPushToken: 'ExponentPushToken[old-phone]', tokenVersion: 1 } })
    const res = await supertest(getApp())
      .post('/users/me/push-token/release')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ expoPushToken: 'ExponentPushToken[old-phone]' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.released, true)
  })
})
