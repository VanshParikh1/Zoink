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
}

require('stripe')
require.cache[require.resolve('stripe')]!.exports = RecordingStripe

import { createConnectAccountLink, getOrCreateStripeCustomer } from './paymentService'

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
