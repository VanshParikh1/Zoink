/**
 * Integration Tests — refund ceiling and owner share use the amount charged (F-03 + F-14)
 * =====================================================================================
 * The rent PaymentIntent charges rent + insurance + HST (getRentalAuthorizationAmount).
 * A full refund returns all of it, a partial refund is capped by it, and the owner's
 * remaining payout is their proportional share of what the renter kept paying (D-5).
 * Bookings made before D-2 carry HST; new ones don't.
 */
import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, checkStripeConnectivity } from './setup'
import * as disputeService from '../services/disputeService'
import { releaseDuePayouts } from '../services/cleanupJob'
import { BookingStatus, DisputeStatus, PaymentStatus, Prisma, Role } from '@prisma/client'

let stripeAvailable = false
let owner: { id: string }
let renter: { id: string }
let admin: { id: string }
let listingId: string

const stripe = () => {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
}

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  listingId = (await createTestListing(owner.id, { dailyPrice: 50, itemValue: 300 })).id
  await getTestPrisma().user.update({ where: { id: owner.id }, data: { stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID } })
})

after(async () => disconnectTestPrisma())

/** An ACTIVE booking whose rent ($100 + hst) was really charged and captured at pickup. */
async function pickedUpBooking(hst: number) {
  const chargedCents = Math.round((100 + hst) * 100)
  const intent = await stripe().paymentIntents.create({
    amount: chargedCents,
    currency: process.env.STRIPE_CURRENCY ?? 'cad',
    payment_method: 'pm_card_visa',
    payment_method_types: ['card'],
    confirm: true,
    capture_method: 'manual',
  })
  const captured = await stripe().paymentIntents.capture(intent.id)
  const { startDate, endDate } = futureDates(0, 2)
  const booking = await getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(100),
      hstAmount: new Prisma.Decimal(hst),
      insuranceFee: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(15),
      ownerPayout: new Prisma.Decimal(85),
      status: BookingStatus.ACTIVE,
      paymentStatus: PaymentStatus.CAPTURED,
      paidAt: new Date(),
      stripePaymentIntentId: intent.id,
      stripeChargeId: captured.latest_charge as string,
      version: 1,
    },
  })
  return { booking, chargedCents }
}

async function refund(bookingId: string, amountCents?: number) {
  const dispute = await disputeService.createDispute(bookingId, renter.id, 'ITEM_DAMAGED', 'The item was broken when I picked it up.')
  return disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Refunding the renter.', amountCents)
}

async function stripeRefundedCents(paymentIntentId: string) {
  const refunds = await stripe().refunds.list({ payment_intent: paymentIntentId })
  return refunds.data.reduce((sum: number, r: { amount: number }) => sum + r.amount, 0)
}

/** The return happens, the 24 h hold passes, the payout job runs. Returns the cents paid to the owner. */
async function completeAndPayOut(bookingId: string) {
  const db = getTestPrisma()
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
  await db.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.COMPLETED,
      completedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      paymentStatus: b.paymentStatus === PaymentStatus.CAPTURED ? PaymentStatus.PAYOUT_PENDING : b.paymentStatus,
    },
  })
  await releaseDuePayouts()
  const evt = await db.bookingEvent.findFirstOrThrow({ where: { bookingId, type: 'PAYOUT_TRIGGERED' }, orderBy: { createdAt: 'desc' } })
  return (evt.metadata as any).amountCents as number
}

describe('refund base = amount charged', () => {
  test('old booking with HST: a full refund returns rent + HST and the owner gets nothing', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking, chargedCents } = await pickedUpBooking(13)
    const resolved = await refund(booking.id)
    assert.equal(resolved.refundAmountCents, chargedCents)
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 11300, 'the renter gets the HST back too')
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.refundedAmountCents, 11300)
    assert.equal(after.paymentStatus, PaymentStatus.REFUNDED)
    assert.equal(await completeAndPayOut(booking.id), 0)
  })

  test('old booking with HST: a half refund pays the owner half their payout', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking } = await pickedUpBooking(13)
    await refund(booking.id, 5650)
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 5650)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.paymentStatus, PaymentStatus.CAPTURED, 'partial: not marked REFUNDED')
    // round((11300 - 5650) * 8500 / 11300) = 4250
    assert.equal(await completeAndPayOut(booking.id), 4250)
  })

  test('old booking with HST: a refund above the rent but within the charge is allowed; above the charge is not', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking } = await pickedUpBooking(13)
    const dispute = await disputeService.createDispute(booking.id, renter.id, 'ITEM_DAMAGED', 'The item was broken when I picked it up.')
    await assert.rejects(
      () => disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Too much.', 11301),
      (err: any) => err.statusCode === 400 && /\$113\.00/.test(err.message),
    )
    await disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Rent plus part of the tax.', 10500)
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 10500)
    // round(800 * 8500 / 11300) = 602
    assert.equal(await completeAndPayOut(booking.id), 602)
  })

  test('new booking without HST: a full refund returns the rent and the owner gets nothing', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking } = await pickedUpBooking(0)
    const resolved = await refund(booking.id)
    assert.equal(resolved.refundAmountCents, 10000)
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 10000)
    assert.equal(await completeAndPayOut(booking.id), 0)
  })

  test('new booking without HST: a half refund pays the owner half their payout', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking } = await pickedUpBooking(0)
    await refund(booking.id, 5000)
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 5000)
    assert.equal(await completeAndPayOut(booking.id), 4250)
  })
})
