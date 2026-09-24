/**
 * Integration Test — App Review walkthrough
 * ==========================================
 * The exact sequence App Review is asked to record, over HTTP only:
 * register → verify email → login → create listing → request booking →
 * report listing / user / message → block → delete account.
 */

import './setup'
import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'

beforeEach(async () => {
  await truncateAllTables()
})

after(async () => {
  await disconnectTestPrisma()
})

function daysFromNow(days: number) {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

async function registerAndVerify(email: string, firstName: string) {
  const app = getApp()
  const password = 'Str0ng-Passw0rd!'
  const reg = await supertest(app).post('/auth/register').send({
    email,
    password,
    firstName,
    lastName: 'Tester',
    phone: '(416) 555-0192',
    university: 'UOFT',
    acceptedTermsVersion: CURRENT_TERMS_VERSION,
    acceptedPrivacyVersion: CURRENT_PRIVACY_VERSION,
    ageAttested: true,
  })
  assert.equal(reg.status, 201, JSON.stringify(reg.body))

  // The OTP normally arrives by email; read it straight from the DB here.
  const user = await getTestPrisma().user.findUniqueOrThrow({ where: { email } })
  const otp = await getTestPrisma().verificationToken.findFirstOrThrow({ where: { userId: user.id, usedAt: null } })
  const verify = await supertest(app)
    .post('/auth/verify-email')
    .set('Authorization', `Bearer ${reg.body.token}`)
    .send({ code: otp.code })
  assert.equal(verify.status, 200, JSON.stringify(verify.body))

  const login = await supertest(app).post('/auth/login').send({ email, password })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.verificationStatus, 'VERIFIED')
  return { id: user.id, token: login.body.token as string, password, email }
}

test('register → login → list → book → report ×3 → block → delete account', async () => {
  const app = getApp()
  const owner = await registerAndVerify('owner.review@mail.utoronto.ca', 'Olivia')
  const renter = await registerAndVerify('renter.review@mail.utoronto.ca', 'Ravi')
  const auth = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` })

  // Create listing
  const listing = await supertest(app).post('/listings').set(auth(owner)).send({
    title: 'Tripod for photo projects',
    description: 'Sturdy aluminium tripod with a phone mount.',
    category: 'Cameras',
    dailyPrice: 8,
    itemValue: 120,
    depositAmount: 10,
    latitude: 43.6629,
    longitude: -79.3957,
    city: 'Toronto',
  })
  assert.equal(listing.status, 201, JSON.stringify(listing.body))

  // Renter finds and books it
  const browse = await supertest(app).get('/listings').query({ q: 'Tripod' }).set(auth(renter))
  assert.equal(browse.body.items.length, 1)

  const booking = await supertest(app).post('/bookings').set(auth(renter)).send({
    listingId: listing.body.id,
    startDate: daysFromNow(3),
    endDate: daysFromNow(4),
    message: 'Could I borrow this for Saturday?',
  })
  assert.equal(booking.status, 201, JSON.stringify(booking.body))

  // Owner replies in the booking's thread
  const inbox = await supertest(app).get('/conversations/me').set(auth(owner))
  assert.equal(inbox.body.length, 1)
  const conversationId = inbox.body[0].id
  const reply = await supertest(app)
    .post(`/conversations/${conversationId}/messages`)
    .set(auth(owner))
    .send({ body: 'Sure, but send the money to my personal account instead.' })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))

  // Renter reports the listing, the user and the message
  for (const [targetType, targetId] of [
    ['LISTING', listing.body.id],
    ['USER', owner.id],
    ['MESSAGE', reply.body.id],
  ] as const) {
    const res = await supertest(app)
      .post('/reports')
      .set(auth(renter))
      .send({ targetType, targetId, reason: 'SCAM', description: 'Asked to pay outside of Zoink.' })
    assert.equal(res.status, 201, `${targetType}: ${JSON.stringify(res.body)}`)
  }
  assert.equal(await getTestPrisma().report.count({ where: { reporterId: renter.id } }), 3)

  // Renter blocks the owner — the listing, profile and thread disappear
  assert.equal((await supertest(app).post(`/users/${owner.id}/block`).set(auth(renter))).status, 204)
  assert.equal((await supertest(app).get('/listings').query({ q: 'Tripod' }).set(auth(renter))).body.items.length, 0)
  assert.equal((await supertest(app).get(`/users/${owner.id}`).set(auth(renter))).status, 404)
  assert.equal((await supertest(app).get('/conversations/me').set(auth(renter))).body.length, 0)
  const blocked = await supertest(app)
    .post(`/conversations/${conversationId}/messages`)
    .set(auth(owner))
    .send({ body: 'hello?' })
  assert.equal(blocked.status, 403)

  // Renter deletes their account
  assert.equal((await supertest(app).delete('/users/me').set(auth(renter))).status, 204)
  const relogin = await supertest(app).post('/auth/login').send({ email: renter.email, password: renter.password })
  assert.equal(relogin.status, 401)
  assert.equal((await supertest(app).get('/users/me').set(auth(renter))).status, 401)
})
