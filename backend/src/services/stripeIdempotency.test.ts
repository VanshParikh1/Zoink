import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import prisma from '../utils/prisma'

// paymentService builds its Stripe client lazily with require('stripe'), so
// swapping the cached module export for a recorder before the first call lets
// these tests see exactly what would be sent to Stripe — without a network or
// creating real Connect accounts in the test-mode dashboard.
process.env.STRIPE_SECRET_KEY = 'sk_test_unit_idempotency'
process.env.STRIPE_CONNECT_RETURN_URL = 'https://api.example.test/stripe-return'
process.env.STRIPE_CONNECT_REFRESH_URL = 'https://api.example.test/stripe-refresh'

type Call = { method: string; params: any; options: any }
const calls: Call[] = []

class RecordingStripe {
  accounts = {
    create: async (params: any, options: any) => {
      calls.push({ method: 'accounts.create', params, options })
      return { id: 'acct_recorded' }
    },
  }
  accountLinks = {
    create: async (params: any) => ({ url: `https://connect.stripe.com/setup/${params.account}` }),
  }
  customers = {
    create: async (params: any, options: any) => {
      calls.push({ method: 'customers.create', params, options })
      return { id: 'cus_recorded' }
    },
  }
  paymentIntents = {
    create: async (params: any, options: any) => {
      calls.push({ method: 'paymentIntents.create', params, options })
      return { id: `pi_for_${options?.idempotencyKey}`, status: 'requires_capture' }
    },
    cancel: async (id: string, params: any, options: any) => {
      calls.push({ method: 'paymentIntents.cancel', params: { id, ...params }, options })
      if (id === 'pi_already_canceled') throw new Error('You cannot cancel this PaymentIntent because it has a status of canceled.')
      if (id === 'pi_cancel_fails') throw new Error('Request timed out')
      return { id, status: 'canceled' }
    },
    retrieve: async (id: string) => ({ id, status: id === 'pi_already_canceled' ? 'canceled' : 'requires_capture' }),
    capture: async (id: string, params: any, options: any) => {
      calls.push({ method: 'paymentIntents.capture', params: { id, ...params }, options })
      return { id, status: 'succeeded' }
    },
  }
}

require('stripe')
require.cache[require.resolve('stripe')]!.exports = RecordingStripe

import {
  cancelDepositPaymentIntent,
  cancelPaymentIntent,
  captureDepositPaymentIntent,
  capturePaymentIntent,
  createConnectAccountLink,
  createDepositPaymentIntent,
  getOrCreateStripeCustomer,
} from './paymentService'
import { Prisma } from '@prisma/client'

describe('Stripe object creation is idempotent per user', () => {
  test('a new Connect account is created with a per-user idempotency key', async () => {
    calls.length = 0
    const result = await createConnectAccountLink(null, 'user-123')
    assert.equal(result.accountId, 'acct_recorded')
    const create = calls.find((c) => c.method === 'accounts.create')!
    assert.equal(create.options?.idempotencyKey, 'connect-account-user-123')
  })

  test('an existing Connect account is reused without creating another', async () => {
    calls.length = 0
    await createConnectAccountLink('acct_existing', 'user-123')
    assert.equal(calls.filter((c) => c.method === 'accounts.create').length, 0)
  })

  test('a new Stripe customer is created with a per-user idempotency key', async () => {
    calls.length = 0
    const originalUpdate = prisma.user.update
    ;(prisma.user as any).update = async () => ({})
    try {
      const id = await getOrCreateStripeCustomer('user-456', 'renter@mail.utoronto.ca', null)
      assert.equal(id, 'cus_recorded')
    } finally {
      ;(prisma.user as any).update = originalUpdate
    }
    const create = calls.find((c) => c.method === 'customers.create')!
    assert.equal(create.options?.idempotencyKey, 'customer-user-456')
  })
})

describe('deposit holds are keyed on the rental authorization, not the booking version', () => {
  const booking = { id: 'booking-1', depositAmount: new Prisma.Decimal(50), stripePaymentIntentId: 'pi_rent_1' }

  test('a retried confirm gets the same deposit hold even after webhooks bumped the version', async () => {
    calls.length = 0
    const first = await createDepositPaymentIntent({ ...booking, version: 3 }, 'cus_1', 'pm_1')
    const retried = await createDepositPaymentIntent({ ...booking, version: 5 }, 'cus_1', 'pm_1')
    const creates = calls.filter((c) => c.method === 'paymentIntents.create')
    assert.equal(creates[0].options.idempotencyKey, 'deposit-payment-intent-booking-1-pi_rent_1')
    assert.equal(creates[1].options.idempotencyKey, creates[0].options.idempotencyKey)
    assert.equal(first.id, retried.id)
  })

  test('a new rental authorization (a fresh Pay) gets its own deposit hold', async () => {
    calls.length = 0
    await createDepositPaymentIntent({ ...booking, version: 3 }, 'cus_1', 'pm_1')
    await createDepositPaymentIntent({ ...booking, version: 3, stripePaymentIntentId: 'pi_rent_2' }, 'cus_1', 'pm_1')
    const keys = calls.filter((c) => c.method === 'paymentIntents.create').map((c) => c.options.idempotencyKey)
    assert.notEqual(keys[0], keys[1])
  })

  test('releasing or capturing a deposit never shares a key with the rental PaymentIntent', async () => {
    calls.length = 0
    const rental = { id: 'booking-1', version: 7, stripePaymentIntentId: 'pi_rent_1', totalPrice: new Prisma.Decimal(10), insuranceFee: new Prisma.Decimal(0), hstAmount: new Prisma.Decimal(1.3) }
    await cancelPaymentIntent(rental)
    await cancelDepositPaymentIntent({ id: 'booking-1', stripeDepositPaymentIntentId: 'pi_dep_1' })
    await capturePaymentIntent(rental)
    await captureDepositPaymentIntent({ id: 'booking-1', stripeDepositPaymentIntentId: 'pi_dep_1' }, 2500)
    const keys = calls.map((c) => c.options.idempotencyKey)
    assert.equal(new Set(keys).size, keys.length, `keys collide: ${keys.join(', ')}`)
    assert.equal(keys[1], 'cancel-deposit-booking-1-pi_dep_1')
    assert.equal(keys[3], 'capture-deposit-booking-1-pi_dep_1')
  })

  test('a deposit Stripe already released is treated as released', async () => {
    const result = await cancelDepositPaymentIntent({ id: 'booking-1', stripeDepositPaymentIntentId: 'pi_already_canceled' })
    assert.equal(result.status, 'canceled')
  })

  test('any other release failure still throws', async () => {
    await assert.rejects(
      cancelDepositPaymentIntent({ id: 'booking-1', stripeDepositPaymentIntentId: 'pi_cancel_fails' }),
      /timed out/
    )
  })
})
