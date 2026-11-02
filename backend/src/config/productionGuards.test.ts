import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeProductionConfig } from './productionGuards'

const JWT_SECRET = 'k'.repeat(48)
const STRIPE = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }

describe('assertSafeProductionConfig', () => {
  test('refuses to start in production with DEV_STRIPE_ACCOUNT_ID set', () => {
    assert.throws(
      () => assertSafeProductionConfig({ NODE_ENV: 'production', ...STRIPE, JWT_SECRET, DEV_STRIPE_ACCOUNT_ID: 'acct_123' }),
      /DEV_STRIPE_ACCOUNT_ID/
    )
  })

  test('allows production without DEV_STRIPE_ACCOUNT_ID (unset or blank)', () => {
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'production', ...STRIPE, JWT_SECRET }))
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'production', ...STRIPE, JWT_SECRET, DEV_STRIPE_ACCOUNT_ID: '  ' }))
  })

  test('refuses to start in production with a missing or short JWT_SECRET', () => {
    assert.throws(() => assertSafeProductionConfig({ NODE_ENV: 'production', ...STRIPE }), /JWT_SECRET/)
    assert.throws(() => assertSafeProductionConfig({ NODE_ENV: 'production', ...STRIPE, JWT_SECRET: 'k'.repeat(31) }), /at least 32/)
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'production', ...STRIPE, JWT_SECRET: 'k'.repeat(32) }))
  })

  test('refuses to start in production without Stripe keys', () => {
    assert.throws(() => assertSafeProductionConfig({ NODE_ENV: 'production', JWT_SECRET }), /STRIPE_SECRET_KEY/)
    assert.throws(
      () => assertSafeProductionConfig({ NODE_ENV: 'production', JWT_SECRET, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: ' ' }),
      /STRIPE_WEBHOOK_SECRET/
    )
  })

  test('leaves JWT_SECRET alone outside production', () => {
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'test', JWT_SECRET: 'short' }))
  })

  test('allows DEV_STRIPE_ACCOUNT_ID outside production', () => {
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'test', DEV_STRIPE_ACCOUNT_ID: 'acct_123' }))
    assert.doesNotThrow(() => assertSafeProductionConfig({ DEV_STRIPE_ACCOUNT_ID: 'acct_123' }))
  })
})
