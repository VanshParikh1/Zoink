// Environment for the endpoint benchmark. Imported first by run.ts, before any
// module that builds the Prisma pool at load time (see utils/prisma.ts).
//
// - Its own database (zoink_bench), never the dev or test one: the run
//   truncates every table before seeding.
// - Stripe, SES, Cloudinary and Expo push are kept off the network so the
//   numbers measure this server and Postgres, not third-party round trips:
//   paymentService falls back to its mock objects without STRIPE_SECRET_KEY,
//   and SES is pointed at a closed local port so it fails fast.
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') })

const testUrl = process.env.DATABASE_URL ?? ''
process.env.DATABASE_URL = process.env.BENCH_DATABASE_URL ?? testUrl.replace('zoink_test', 'zoink_bench')

if (!process.env.DATABASE_URL.includes('zoink_bench')) {
  console.error(`Refusing to run: DATABASE_URL must point at zoink_bench (got "${process.env.DATABASE_URL}").`)
  process.exit(1)
}

process.env.NODE_ENV = 'test'
process.env.STRIPE_SECRET_KEY = ''
delete process.env.STRIPE_WEBHOOK_SECRET
delete process.env.DEV_STRIPE_ACCOUNT_ID
process.env.CLOUDINARY_CLOUD_NAME = 'zoinkbench'
process.env.AWS_REGION = 'us-east-1'
process.env.AWS_ACCESS_KEY_ID = 'bench'
process.env.AWS_SECRET_ACCESS_KEY = 'bench'
process.env.AWS_ENDPOINT_URL_SES = 'http://127.0.0.1:9'
process.env.EXPO_ACCESS_TOKEN = ''
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bench-jwt-secret'
