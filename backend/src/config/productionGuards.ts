import { z } from 'zod'

// Boot-time check of every environment variable the API reads. Run from
// index.ts right after env loading, so a bad deploy crashes on start (Railway
// keeps the previous deployment serving) instead of failing at first use or,
// worse, misbehaving live. Scripts (seeds, admin CLI) don't run it.

export const MIN_JWT_SECRET_LENGTH = 32

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)
const optional = z.preprocess(blankToUndefined, z.string().optional())
const required = (name: string) => z.preprocess(blankToUndefined, z.string({ error: `${name} must be set.` }))
const positiveNumber = z.preprocess(blankToUndefined, z.coerce.number().positive().optional())
const httpsUrl = (name: string) =>
  required(name).refine((value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, `${name} must be an https:// URL.`)

// Read everywhere, required nowhere (each has a default or is a feature switch).
const shared = {
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
  STRIPE_CURRENCY: z.preprocess(blankToUndefined, z.string().regex(/^[a-z]{3}$/, 'STRIPE_CURRENCY must be a 3-letter lowercase code.').optional()),
  OTP_EXPIRY_MINUTES: positiveNumber,
  INSURANCE_RATE: positiveNumber,
  MIN_INSURANCE_FEE: positiveNumber,
  MAX_INSURANCE_FEE: positiveNumber,
  SENTRY_DSN: optional,
  SENTRY_ENVIRONMENT: optional,
  EXPO_ACCESS_TOKEN: optional,
  AWS_ENDPOINT_URL_SES: optional,
  DEV_STRIPE_ACCOUNT_ID: optional,
}

// Locally, Stripe, SES and Cloudinary may be missing: payments run in mock
// mode and emails log the code instead.
const development = z.object({
  ...shared,
  NODE_ENV: z.literal('development'),
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
})

// Integration tests load .env.test themselves (see integration-tests/setup.ts).
const test = z.object({ ...shared, NODE_ENV: z.literal('test') })

const production = z.object({
  ...shared,
  NODE_ENV: z.literal('production'),
  DATABASE_URL: required('DATABASE_URL'),
  // Every session token is an HS256 signature with this secret; a short one
  // can be brute-forced offline from any token, which forges any account.
  JWT_SECRET: required('JWT_SECRET').refine(
    (value) => value.length >= MIN_JWT_SECRET_LENGTH,
    `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production (e.g. \`openssl rand -base64 48\`). Changing it signs everyone out.`
  ),
  // Without these, paymentService fakes every Stripe call (pi_mock_/tr_mock_)
  // and the webhook rejects every delivery: bookings would "pay" and owners be
  // "paid out" with no money moving.
  STRIPE_SECRET_KEY: required('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: required('STRIPE_WEBHOOK_SECRET'),
  STRIPE_CONNECT_RETURN_URL: httpsUrl('STRIPE_CONNECT_RETURN_URL'),
  STRIPE_CONNECT_REFRESH_URL: httpsUrl('STRIPE_CONNECT_REFRESH_URL'),
  AWS_REGION: required('AWS_REGION'),
  AWS_ACCESS_KEY_ID: required('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: required('AWS_SECRET_ACCESS_KEY'),
  SES_FROM_EMAIL: required('SES_FROM_EMAIL'),
  CLOUDINARY_CLOUD_NAME: required('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY: required('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: required('CLOUDINARY_API_SECRET'),
  // bookingService.ensureOwnerStripeAccount assigns this to any owner without
  // a connected account outside production. A single env slip would route
  // real owners' payouts to the dev account, so it must not be set at all.
  DEV_STRIPE_ACCOUNT_ID: z.preprocess(
    blankToUndefined,
    z.undefined({ error: 'DEV_STRIPE_ACCOUNT_ID is set while NODE_ENV=production. Remove it from the production environment variables.' })
  ),
})

const envSchema = z.discriminatedUnion('NODE_ENV', [development, test, production], {
  error: 'NODE_ENV must be development, test or production.',
})

/** Throws, naming every problem at once, if the environment can't run the API. */
export function assertSafeProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(env)
  if (result.success) return
  const problems = result.error.issues.map((issue) => `  - ${issue.message}`)
  throw new Error(`Refusing to start: invalid environment.\n${[...new Set(problems)].join('\n')}`)
}
