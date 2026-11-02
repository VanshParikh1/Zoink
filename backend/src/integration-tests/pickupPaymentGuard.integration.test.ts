/**
 * Integration Tests — no pickup handoff without a successful payment
 * ===================================================================
 * The pickup "Zoink It" must be impossible unless the rent is authorized and,
 * when the booking has a deposit, the deposit hold is too. The payment status
 * is set directly on the fixture rows (what Stripe's webhooks would write), so
 * this runs without Stripe keys.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  getApp,
  handoffPhotoUrl,
} from './setup'
import { BookingStatus, DepositStatus, PaymentStatus, Prisma } from '@prisma/client'
import * as handoffService from '../services/handoffService'
import { transitionBookingStatus } from '../services/bookingService'

const REFUSAL = "Payment hasn't gone through. The renter needs to pay before pickup."

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let listingId: string

async function booking(data: Partial<Prisma.BookingUncheckedCreateInput>) {
  const { startDate, endDate } = futureDates(2, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(40),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.AUTHORIZED,
      stripePaymentIntentId: `pi_mock_guard_${Date.now()}`,
      ...data,
    },
  })
}

function photos(bookingId: string) {
  return [handoffPhotoUrl(bookingId, 'a'), handoffPhotoUrl(bookingId, 'b')]
}

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

after(async () => {
  await truncateAllTables()
  await disconnectTestPrisma()
})

describe('pickup needs a successful payment', () => {
  test('starting the pickup on an unpaid booking is refused with PICKUP_PAYMENT_REQUIRED, and nothing changes', async () => {
    for (const paymentStatus of [PaymentStatus.PENDING_AUTH, PaymentStatus.FAILED]) {
      const row = await booking({ paymentStatus })
      const res = await supertest(getApp())
        .post(`/bookings/${row.id}/pickup/initiate`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ photos: photos(row.id) })
      assert.equal(res.status, 409, paymentStatus)
      assert.deepEqual(res.body, { error: REFUSAL, code: 'PICKUP_PAYMENT_REQUIRED' })
      const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: row.id } })
      assert.equal(after.status, BookingStatus.CONFIRMED)
      assert.deepEqual(after.pickupPhotos, [])
    }
  })

  test('a deposit booking whose hold is not authorized cannot start the pickup', async () => {
    const row = await booking({ depositAmount: new Prisma.Decimal(50), depositStatus: DepositStatus.RELEASED })
    await assert.rejects(handoffService.initiateHandoff(row.id, owner.id, 'pickup', photos(row.id)), handoffService.PickupPaymentRequiredError)
  })

  test('a paid booking starts the pickup (with and without a deposit)', async () => {
    const plain = await booking({})
    assert.equal((await handoffService.initiateHandoff(plain.id, owner.id, 'pickup', photos(plain.id))).status, BookingStatus.PICKUP_PENDING)
    const withDeposit = await booking({
      depositAmount: new Prisma.Decimal(50),
      depositStatus: DepositStatus.AUTHORIZED,
      stripeDepositPaymentIntentId: `pi_mock_deposit_guard_${Date.now()}`,
    })
    assert.equal(
      (await handoffService.initiateHandoff(withDeposit.id, owner.id, 'pickup', photos(withDeposit.id))).status,
      BookingStatus.PICKUP_PENDING,
    )
  })

  test('a payment that fails after the pickup started blocks the Zoink It tap', async () => {
    const row = await booking({ status: BookingStatus.PICKUP_PENDING, pickupPhotos: photos('x'), paymentStatus: PaymentStatus.FAILED })
    const res = await supertest(getApp())
      .post(`/bookings/${row.id}/pickup/confirm`)
      .set('Authorization', `Bearer ${renter.token}`)
      .send({})
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'PICKUP_PAYMENT_REQUIRED')
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: row.id } })
    assert.equal(after.renterPickupTappedAt, null, 'the tap was not recorded')
  })
})

describe('paying for a booking without a deposit', () => {
  test('confirms on the rent alone: no $0 deposit PaymentIntent, no deposit status', async () => {
    const row = await booking({ status: BookingStatus.ACCEPTED, depositAmount: new Prisma.Decimal(0) })
    const confirmed = await transitionBookingStatus(row.id, renter.id, 'CONFIRMED')
    assert.equal(confirmed.status, BookingStatus.CONFIRMED)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: row.id } })
    assert.equal(after.stripeDepositPaymentIntentId, null)
    assert.equal(after.depositStatus, null)
    // A repeated confirm (double tap) returns the same booking.
    assert.equal((await transitionBookingStatus(row.id, renter.id, 'CONFIRMED')).status, BookingStatus.CONFIRMED)
  })
})
