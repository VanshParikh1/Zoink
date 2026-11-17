import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeProductionConfig } from './productionGuards'

const PRODUCTION = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db.internal:5432/zoink',
  JWT_SECRET: 'k'.repeat(48),
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_CONNECT_RETURN_URL: 'https://api.example.test/stripe-return',
  STRIPE_CONNECT_REFRESH_URL: 'https://api.example.test/stripe-refresh',
  AWS_REGION: 'ca-central-1',
  AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'secret',
  SES_FROM_EMAIL: 'no-reply@example.test',
  CLOUDINARY_CLOUD_NAME: 'zoink',
  CLOUDINARY_API_KEY: '123',
  CLOUDINARY_API_SECRET: 'abc',
}

const without = (name: keyof typeof PRODUCTION) => {
  const env: Record<string, string> = { ...PRODUCTION }
  delete env[name]
  return env
}

describe('assertSafeProductionConfig', () => {
  test('a complete production environment starts', () => {
    assert.doesNotThrow(() => assertSafeProductionConfig(PRODUCTION))
  })

  test('every required production variable is checked, and named when missing', () => {
    for (const name of Object.keys(PRODUCTION).filter((n) => n !== 'NODE_ENV') as (keyof typeof PRODUCTION)[]) {
      assert.throws(() => assertSafeProductionConfig(without(name)), new RegExp(name), name)
      assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, [name]: '  ' }), new RegExp(name), `${name} blank`)
    }
  })

  test('all problems are reported at once', () => {
    assert.throws(
      () => assertSafeProductionConfig({ NODE_ENV: 'production' }),
      (error: Error) => /DATABASE_URL/.test(error.message) && /CLOUDINARY_API_SECRET/.test(error.message)
    )
  })

  test('refuses to start in production with DEV_STRIPE_ACCOUNT_ID set', () => {
    assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, DEV_STRIPE_ACCOUNT_ID: 'acct_123' }), /DEV_STRIPE_ACCOUNT_ID/)
    assert.doesNotThrow(() => assertSafeProductionConfig({ ...PRODUCTION, DEV_STRIPE_ACCOUNT_ID: '  ' }))
  })

  test('refuses a short JWT_SECRET in production', () => {
    assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, JWT_SECRET: 'k'.repeat(31) }), /at least 32/)
    assert.doesNotThrow(() => assertSafeProductionConfig({ ...PRODUCTION, JWT_SECRET: 'k'.repeat(32) }))
  })

  test('Stripe Connect return URLs must be https', () => {
    assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, STRIPE_CONNECT_RETURN_URL: 'http://api.example.test/r' }), /https/)
  })

  test('malformed optional values are refused', () => {
    assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, OTP_EXPIRY_MINUTES: 'soon' }), /refusing/i)
    assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, STRIPE_CURRENCY: 'CAD' }), /STRIPE_CURRENCY/)
  })

  test('NODE_ENV must be development, test or production', () => {
    assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, NODE_ENV: undefined }), /NODE_ENV/)
    assert.throws(() => assertSafeProductionConfig({ ...PRODUCTION, NODE_ENV: 'prod' }), /NODE_ENV/)
  })

  test('development needs only the database and a JWT secret, and allows DEV_STRIPE_ACCOUNT_ID', () => {
    assert.doesNotThrow(() =>
      assertSafeProductionConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://localhost/zoink', JWT_SECRET: 'short', DEV_STRIPE_ACCOUNT_ID: 'acct_123' })
    )
    assert.throws(() => assertSafeProductionConfig({ NODE_ENV: 'development', JWT_SECRET: 'short' }), /DATABASE_URL/)
  })

  test('test mode checks nothing beyond NODE_ENV', () => {
    assert.doesNotThrow(() => assertSafeProductionConfig({ NODE_ENV: 'test', JWT_SECRET: 'short', DEV_STRIPE_ACCOUNT_ID: 'acct_123' }))
  })
})
