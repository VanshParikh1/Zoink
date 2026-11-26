/**
 * Integration Tests — admin list and unblock of blocked payouts
 * ==============================================================
 * A payout Stripe refused permanently is parked (payoutBlockedAt). Admins see
 * it, with Stripe's error, and can unblock it, which retries it at once.
 * Stripe is mocked on the paymentService module.
 */
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, PaymentStatus, Prisma, Role } from '@prisma/client'
import * as paymentService from '../services/paymentService'
import { releaseDuePayouts } from '../services/cleanupJob'

let owner: { id: string; email: string; token: string }
let renter: { id: string }
let admin: { id: string; token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_blocked' })
  renter = await createTestUser({ firstName: 'Renter' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  listingId = (await createTestListing(owner.id, { title: 'Drill' })).id
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

function payable() {
  const { startDate, endDate } = futureDates(3, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(50),
      commissionAmount: new Prisma.Decimal(7.5),
      ownerPayout: new Prisma.Decimal(42.5),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      completedAt: new Date(Date.now() - 25 * 3600_000),
      stripeChargeId: 'ch_blocked',
    },
  })
}

const http = (token: string) => ({
  get: (path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string) => supertest(getApp()).post(path).set('Authorization', `Bearer ${token}`),
})

describe('blocked payouts (admin)', () => {
  test('listed with the Stripe error; unblock retries it and it is paid', async () => {
    const b = await payable()
    let refuse = true
    const transfer = mock.method(paymentService, 'transferPayout', async () => {
      if (refuse) throw Object.assign(new Error('Your destination account needs to have the transfers capability enabled.'), { type: 'StripeInvalidRequestError', statusCode: 400 })
      return { id: 'tr_after_unblock' }
    })
    assert.equal((await releaseDuePayouts()).blocked, 1)

    const list = await http(admin.token).get('/admin/payouts/blocked')
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].id, b.id)
    assert.equal(list.body[0].listing.title, 'Drill')
    assert.equal(list.body[0].owner.email, owner.email)
    assert.match(list.body[0].blockedReason, /transfers capability/)
    assert.ok(list.body[0].payoutBlockedAt)

    refuse = false
    const unblock = await http(admin.token).post(`/admin/bookings/${b.id}/payout/unblock`)
    assert.equal(unblock.status, 200, JSON.stringify(unblock.body))
    assert.deepEqual(unblock.body, { bookingId: b.id, result: 'paid' })
    assert.equal(transfer.mock.callCount(), 2)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: b.id } })
    assert.equal(row.payoutBlockedAt, null)
    assert.equal(row.stripeTransferId, 'tr_after_unblock')
    const audit = await getTestPrisma().bookingEvent.findFirstOrThrow({ where: { bookingId: b.id, type: 'PAYOUT_UNBLOCKED' } })
    assert.equal(audit.actorId, admin.id)
    assert.deepEqual((await http(admin.token).get('/admin/payouts/blocked')).body, [])
  })

  test('a payout refused again is blocked again and stays on the list', async () => {
    const b = await payable()
    mock.method(paymentService, 'transferPayout', async () => {
      throw Object.assign(new Error('Account restricted.'), { type: 'StripeInvalidRequestError', statusCode: 400 })
    })
    await releaseDuePayouts()
    const res = await http(admin.token).post(`/admin/bookings/${b.id}/payout/unblock`)
    assert.deepEqual(res.body, { bookingId: b.id, result: 'blocked' })
    assert.equal((await http(admin.token).get('/admin/payouts/blocked')).body.length, 1)
  })

  test('refuses: not blocked (400), unknown booking (404), non-admin (403)', async () => {
    const b = await payable()
    assert.equal((await http(admin.token).post(`/admin/bookings/${b.id}/payout/unblock`)).status, 400)
    assert.equal((await http(admin.token).post('/admin/bookings/00000000-0000-0000-0000-000000000000/payout/unblock')).status, 404)
    assert.equal((await http(owner.token).get('/admin/payouts/blocked')).status, 403)
    assert.equal((await http(owner.token).post(`/admin/bookings/${b.id}/payout/unblock`)).status, 403)
  })
})
