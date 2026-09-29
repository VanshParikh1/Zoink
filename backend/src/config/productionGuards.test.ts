import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeProductionConfig } from './productionGuards'

describe('assertSafeProductionConfig', () => {
  test('refuses to start in production with DEV_STRIPE_ACCOUNT_ID set', () => {
    assert.throws(
      () => assertSafeProductionConfig({ NODE_ENV: 'production', DEV_STRIPE_ACCOUNT_ID: 'acct_123' }),
      /DEV_STRIPE_ACCOUNT_ID/
    )
  })

  test('allows production without DEV_STRIPE_ACCOUNT_ID (unset or blank)', () => {
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'production' }))
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'production', DEV_STRIPE_ACCOUNT_ID: '  ' }))
  })

  test('allows DEV_STRIPE_ACCOUNT_ID outside production', () => {
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'test', DEV_STRIPE_ACCOUNT_ID: 'acct_123' }))
    assert.doesNotThrow(() => assertSafeProductionConfig({ DEV_STRIPE_ACCOUNT_ID: 'acct_123' }))
  })
})
