/**
 * Integration Tests — refund ceiling and owner share use the amount charged (F-03 + F-14)
 * =====================================================================================
 * The rent PaymentIntent charges rent + insurance + HST (getRentalAuthorizationAmount).
 * A full refund returns all of it, a partial refund is capped by it, and the owner's
 * remaining payout is their proportional share of what the renter kept paying (D-5).
 * Bookings made before D-2 carry HST; new ones don't. D-4: after completion an admin
 * can refund rent through a dispute, with the same cap.
 */
import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, checkStripeConnectivity, getApp } from './setup'
import supertest from 'supertest'
import * as disputeService from '../services/disputeService'
import { releaseDuePayouts } from '../services/cleanupJob'
import { BookingStatus, DisputeStatus, PaymentStatus, Prisma, Role } from '@prisma/client'

let stripeAvailable = false
let owner: { id: string }
let renter: { id: string }
let admin: { id: string; token: string }
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

/** A booking returned `hoursAgo` hours ago with a dispute filed while the window was open. */
async function completedBookingWithDispute(hst: number, hoursAgo = 2) {
  const picked = await pickedUpBooking(hst)
  const db = getTestPrisma()
  await db.booking.update({
    where: { id: picked.booking.id },
    data: { status: BookingStatus.COMPLETED, completedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000), paymentStatus: PaymentStatus.PAYOUT_PENDING },
  })
  const dispute = await disputeService.createDispute(picked.booking.id, renter.id, 'ITEM_NOT_AS_DESCRIBED', 'It did not work when I got home with it.')
  return { ...picked, dispute }
}

async function payoutAmount(bookingId: string) {
  await releaseDuePayouts()
  const evt = await getTestPrisma().bookingEvent.findFirst({ where: { bookingId, type: 'PAYOUT_TRIGGERED' }, orderBy: { createdAt: 'desc' } })
  return evt ? ((evt.metadata as any).amountCents as number) : null
}

describe('D-4: rent refund after completion', () => {
  test('full refund of an old HST booking: renter gets rent + HST, owner gets nothing', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking, dispute } = await completedBookingWithDispute(13)
    const resolved = await disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Refund it all.', undefined, 'RENT')
    assert.equal(resolved.refundAmountCents, 11300)
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 11300)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.paymentStatus, PaymentStatus.REFUNDED)
    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { completedAt: new Date(Date.now() - 48 * 3600_000) } })
    assert.equal(await payoutAmount(booking.id), 0)
  })

  test('the open dispute holds the payout past 24 h; a partial refund then pays the owner their share', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking, dispute } = await completedBookingWithDispute(0)
    // 48 h later the dispute is still open: no payout.
    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { completedAt: new Date(Date.now() - 48 * 3600_000) } })
    assert.equal(await payoutAmount(booking.id), null, 'held while the dispute is open')
    await disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Half back.', 5000, 'RENT')
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 5000)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'partial: not marked REFUNDED')
    assert.equal(await payoutAmount(booking.id), 4250)
  })

  test('cap is the amount charged minus earlier refunds', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking, dispute } = await pickedUpBooking(13).then(async (picked) => {
      await refund(picked.booking.id, 3000) // during the rental
      const db = getTestPrisma()
      await db.booking.update({ where: { id: picked.booking.id }, data: { status: BookingStatus.COMPLETED, completedAt: new Date(Date.now() - 3600_000), paymentStatus: PaymentStatus.PAYOUT_PENDING } })
      const d = await disputeService.createDispute(picked.booking.id, renter.id, 'OTHER', 'Something else came up after the return.')
      return { ...picked, dispute: d }
    })
    await assert.rejects(
      () => disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Too much.', 8301, 'RENT'),
      (err: any) => err.statusCode === 400 && /\$83\.00/.test(err.message),
    )
    const resolved = await disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'The rest.', undefined, 'RENT')
    assert.equal(resolved.refundAmountCents, 8300)
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 11300)
    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { completedAt: new Date(Date.now() - 48 * 3600_000) } })
    assert.equal(await payoutAmount(booking.id), 0)
  })

  test('refused if the owner was somehow already paid', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking, dispute } = await completedBookingWithDispute(0)
    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { payoutSentAt: new Date(), paymentStatus: PaymentStatus.PAID_OUT } })
    await assert.rejects(
      () => disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Refund.', undefined, 'RENT'),
      (err: any) => err.statusCode === 400 && /already been paid/.test(err.message),
    )
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 0)
  })

  test('DEPOSIT before completion is refused', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking } = await pickedUpBooking(0)
    const dispute = await disputeService.createDispute(booking.id, renter.id, 'OTHER', 'Something is wrong with this.')
    await assert.rejects(
      () => disputeService.resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Charge.', undefined, 'DEPOSIT'),
      (err: any) => err.statusCode === 400 && /only be charged once the booking is completed/.test(err.message),
    )
  })

  test('HTTP: admin resolves with refundTarget RENT; a bad target is a 400', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe unavailable')
    const { booking, dispute } = await completedBookingWithDispute(0)
    const call = (body: object) =>
      supertest(getApp()).patch(`/admin/disputes/${dispute.id}/resolve`).set('Authorization', `Bearer ${admin.token}`).send(body)
    assert.equal((await call({ status: 'RESOLVED_REFUND', resolutionNotes: 'x', refundTarget: 'OWNER' })).status, 400)
    const res = await call({ status: 'RESOLVED_REFUND', resolutionNotes: 'Refunding $20 of the rent.', refundAmountCents: 2000, refundTarget: 'RENT' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(await stripeRefundedCents(booking.stripePaymentIntentId!), 2000)
  })
})
