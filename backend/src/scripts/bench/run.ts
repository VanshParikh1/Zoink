// Endpoint benchmark: p50/p95 latency, DB round trips and payload size for
// every API route, 50 sequential requests each, against a freshly seeded
// zoink_bench database. Stripe/SES/Cloudinary/Expo stay off the network (see
// benchEnv.ts), so write timings exclude third-party calls.
//
//   createdb zoink_bench
//   DATABASE_URL=postgresql://.../zoink_bench npx prisma migrate deploy
//   npx ts-node src/scripts/bench/run.ts [--json out.json] [--only substring]
//
// Requests run one at a time, so the query count is attributed by resetting a
// counter before each request. Fire-and-forget work a handler starts after it
// responds (push notifications) can land in the next request's count; those
// endpoints are marked in the notes column.
import './benchEnv'
import { writeFileSync } from 'fs'
import { AddressInfo } from 'net'
import jwt from 'jsonwebtoken'
import { TERMS_VERSION, PRIVACY_VERSION } from '@zoink/shared'
import { seed, BENCH_PASSWORD, N, type BenchFixtures } from './seed'
import prisma from '../../utils/prisma'

// Count every statement the pg driver sends (BEGIN/COMMIT included): that's
// the number of database round trips a request costs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pg = require('pg')
let queryCount = 0
const originalQuery = pg.Client.prototype.query
pg.Client.prototype.query = function countedQuery(...args: unknown[]) {
  queryCount += 1
  return originalQuery.apply(this, args)
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type Request = { method: Method; path: string; token?: string; body?: unknown; headers?: Record<string, string> }
type Scenario = { name: string; route: string; kind: 'read' | 'write'; note?: string; request: (i: number) => Request }
type Result = {
  name: string
  route: string
  kind: 'read' | 'write'
  p50: number
  p95: number
  max: number
  queries: number
  bytes: number
  ok: number
  failures: string[]
  note?: string
}

function tokenFor(userId: string, extra: Record<string, unknown> = {}) {
  return jwt.sign({ userId, verificationStatus: 'VERIFIED', role: 'USER', email: 'bench@mail.utoronto.ca', firstName: 'Bench', termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ...extra }, process.env.JWT_SECRET!, { expiresIn: '1h' })
}

function percentile(sorted: number[], p: number) {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function buildScenarios(f: BenchFixtures): Scenario[] {
  const renter = tokenFor(f.renter)
  const owner = tokenFor(f.owner)
  const admin = tokenFor(f.admin, { role: 'ADMIN' })
  const renterN = (i: number) => tokenFor(f.renters[i])
  const ip = (i: number) => ({ 'X-Real-IP': `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}` })
  const near = '?latitude=43.6629&longitude=-79.3957'
  const photos = (id: string) => [
    `https://res.cloudinary.com/zoinkbench/image/upload/v1/bookings/booking_${id}_1.jpg`,
    `https://res.cloudinary.com/zoinkbench/image/upload/v1/bookings/booking_${id}_2.jpg`,
  ]

  return [
    // ── Public / auth
    { name: 'health', route: 'GET /health', kind: 'read', request: () => ({ method: 'GET', path: '/health' }) },
    { name: 'legal-version', route: 'GET /auth/legal-version', kind: 'read', request: (i) => ({ method: 'GET', path: '/auth/legal-version', headers: ip(i) }) },
    {
      name: 'register', route: 'POST /auth/register', kind: 'write', note: 'bcrypt cost 12 dominates; SES off-network',
      request: (i) => ({
        method: 'POST', path: '/auth/register', headers: ip(i),
        body: { email: `fresh${i}_${Date.now()}@mail.utoronto.ca`, password: 'Password123!', firstName: 'Fresh', lastName: 'Student', phone: '4165550192', university: 'UOFT', acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION, ageAttested: true },
      }),
    },
    {
      name: 'login', route: 'POST /auth/login', kind: 'write', note: 'bcrypt compare dominates',
      request: (i) => ({ method: 'POST', path: '/auth/login', headers: ip(i), body: { email: `borrower${i}@x`, password: BENCH_PASSWORD } }),
    },
    { name: 'verify-email', route: 'POST /auth/verify-email', kind: 'write', request: (i) => ({ method: 'POST', path: '/auth/verify-email', headers: ip(i), token: tokenFor(f.verifyUsers[i], { verificationStatus: 'PENDING' }), body: { code: '123456' } }) },
    { name: 'resend-otp', route: 'POST /auth/resend-otp', kind: 'write', note: 'SES call fails fast (closed port)', request: (i) => ({ method: 'POST', path: '/auth/resend-otp', headers: ip(i), token: tokenFor(f.resendUsers[i], { verificationStatus: 'PENDING' }) }) },

    // ── Users
    { name: 'users/me', route: 'GET /users/me', kind: 'read', request: () => ({ method: 'GET', path: '/users/me', token: renter }) },
    { name: 'users/:id', route: 'GET /users/:id', kind: 'read', request: () => ({ method: 'GET', path: `/users/${f.owner}`, token: renter }) },
    { name: 'users/me/blocks', route: 'GET /users/me/blocks', kind: 'read', request: () => ({ method: 'GET', path: '/users/me/blocks', token: renter }) },
    { name: 'stripe-connect/status', route: 'GET /users/me/stripe-connect/status', kind: 'read', note: 'Stripe mocked', request: () => ({ method: 'GET', path: '/users/me/stripe-connect/status', token: owner }) },
    { name: 'stripe/connect/status', route: 'GET /stripe/connect/status', kind: 'read', note: 'Stripe mocked', request: () => ({ method: 'GET', path: '/stripe/connect/status', token: owner }) },
    { name: 'update me', route: 'PATCH /users/me', kind: 'write', request: (i) => ({ method: 'PATCH', path: '/users/me', token: renter, body: { bio: `Third-year engineering student ${i}` } }) },
    { name: 'notification prefs', route: 'PATCH /users/me/notification-prefs', kind: 'write', request: (i) => ({ method: 'PATCH', path: '/users/me/notification-prefs', token: renter, body: { notifyReviews: i % 2 === 0 } }) },
    { name: 'push token', route: 'PATCH /users/me/push-token', kind: 'write', request: () => ({ method: 'PATCH', path: '/users/me/push-token', token: renter, body: { expoPushToken: null } }) },
    { name: 'accept terms', route: 'POST /users/me/accept-terms', kind: 'write', request: () => ({ method: 'POST', path: '/users/me/accept-terms', token: renter }) },
    { name: 'stripe onboard', route: 'POST /users/me/stripe-connect/onboard', kind: 'write', note: 'Stripe mocked', request: () => ({ method: 'POST', path: '/users/me/stripe-connect/onboard', token: owner }) },
    { name: 'block', route: 'POST /users/:id/block', kind: 'write', request: (i) => ({ method: 'POST', path: `/users/${f.otherUser}/block`, token: renterN(i) }) },
    { name: 'unblock', route: 'DELETE /users/:id/block', kind: 'write', request: (i) => ({ method: 'DELETE', path: `/users/${f.otherUser}/block`, token: renterN(i) }) },
    { name: 'delete account', route: 'DELETE /users/me', kind: 'write', request: (i) => ({ method: 'DELETE', path: '/users/me', token: tokenFor(f.deletableUsers[i]) }) },

    // ── Listings
    { name: 'browse (nearby)', route: 'GET /listings?lat&lng', kind: 'read', request: () => ({ method: 'GET', path: `/listings${near}`, token: renter }) },
    { name: 'browse (search)', route: 'GET /listings?q', kind: 'read', request: () => ({ method: 'GET', path: `/listings${near}&q=item&category=Tools`, token: renter }) },
    { name: 'browse (page 3)', route: 'GET /listings?offset=40', kind: 'read', request: () => ({ method: 'GET', path: `/listings${near}&limit=20&offset=40`, token: renter }) },
    { name: 'categories', route: 'GET /listings/categories', kind: 'read', request: () => ({ method: 'GET', path: '/listings/categories', token: renter }) },
    { name: 'listing detail', route: 'GET /listings/:id', kind: 'read', request: () => ({ method: 'GET', path: `/listings/${f.browseListing}`, token: renter }) },
    { name: 'my listings', route: 'GET /listings/me', kind: 'read', request: () => ({ method: 'GET', path: '/listings/me', token: owner }) },
    {
      name: 'create listing', route: 'POST /listings', kind: 'write',
      request: (i) => ({ method: 'POST', path: '/listings', token: owner, body: { title: `Camping stove ${i}`, description: 'Two burner stove, works great.', category: 'Outdoors', dailyPrice: 12, itemValue: 120, depositAmount: 40, latitude: 43.66, longitude: -79.39, city: 'Toronto' } }),
    },
    { name: 'update listing', route: 'PATCH /listings/:id', kind: 'write', request: (i) => ({ method: 'PATCH', path: `/listings/${f.ownerListings[i % 10]}`, token: owner, body: { description: `Updated description ${i}` } }) },
    { name: 'toggle availability', route: 'PATCH /listings/:id/availability', kind: 'write', request: (i) => ({ method: 'PATCH', path: `/listings/${f.ownerListings[9]}/availability`, token: owner, body: { isAvailable: i % 2 === 1 } }) },
    { name: 'delete listing', route: 'DELETE /listings/:id', kind: 'write', request: (i) => ({ method: 'DELETE', path: `/listings/${f.deletableListings[i]}`, token: owner }) },

    // ── Bookings
    { name: 'my bookings', route: 'GET /bookings/me', kind: 'read', request: () => ({ method: 'GET', path: '/bookings/me', token: renter }) },
    { name: 'incoming requests', route: 'GET /bookings/requests', kind: 'read', request: () => ({ method: 'GET', path: '/bookings/requests', token: owner }) },
    { name: 'booking detail', route: 'GET /bookings/:id', kind: 'read', request: () => ({ method: 'GET', path: `/bookings/${f.renterBooking}`, token: renter }) },
    { name: 'handoff photos', route: 'GET /bookings/:id/photos', kind: 'read', request: () => ({ method: 'GET', path: `/bookings/${f.completedBooking}/photos`, token: owner }) },
    {
      name: 'create booking', route: 'POST /bookings', kind: 'write', note: 'notifies owner after responding',
      request: (i) => {
        const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() + 20)
        const end = new Date(start); end.setUTCDate(end.getUTCDate() + 2)
        return { method: 'POST', path: '/bookings', token: renterN(i), body: { listingId: f.bookingCreateListings[i], startDate: start.toISOString(), endDate: end.toISOString(), message: 'Hi! Could I borrow this for the weekend?' } }
      },
    },
    { name: 'accept', route: 'PATCH /bookings/:id/accept', kind: 'write', note: 'Stripe mocked; notifies renter', request: (i) => ({ method: 'PATCH', path: `/bookings/${f.accept[i]}/accept`, token: owner }) },
    { name: 'decline', route: 'PATCH /bookings/:id/decline', kind: 'write', request: (i) => ({ method: 'PATCH', path: `/bookings/${f.decline[i]}/decline`, token: owner }) },
    { name: 'cancel', route: 'PATCH /bookings/:id/cancel', kind: 'write', request: (i) => ({ method: 'PATCH', path: `/bookings/${f.cancel[i]}/cancel`, token: renterN(i) }) },
    { name: 'payment intent', route: 'POST /bookings/:id/payment-intent', kind: 'write', note: 'Stripe mocked', request: (i) => ({ method: 'POST', path: `/bookings/${f.paymentIntent[i]}/payment-intent`, token: renterN(i) }) },
    { name: 'confirm (pay)', route: 'PATCH /bookings/:id/confirm', kind: 'write', note: 'Stripe mocked', request: (i) => ({ method: 'PATCH', path: `/bookings/${f.confirm[i]}/confirm`, token: renterN(i) }) },
    { name: 'pickup initiate', route: 'POST /bookings/:id/pickup/initiate', kind: 'write', request: (i) => ({ method: 'POST', path: `/bookings/${f.pickupInitiate[i]}/pickup/initiate`, token: owner, body: { photos: photos(f.pickupInitiate[i]) } }) },
    { name: 'zoink tap (first)', route: 'POST /bookings/:id/zoink-tap', kind: 'write', request: (i) => ({ method: 'POST', path: `/bookings/${f.pickupTap[i]}/zoink-tap`, token: owner, body: { phase: 'pickup' } }) },
    { name: 'return initiate', route: 'POST /bookings/:id/return/initiate', kind: 'write', request: (i) => ({ method: 'POST', path: `/bookings/${f.returnInitiate[i]}/return/initiate`, token: renterN(i), body: { photos: photos(f.returnInitiate[i]) } }) },

    // ── Conversations
    { name: 'inbox', route: 'GET /conversations/me', kind: 'read', request: () => ({ method: 'GET', path: '/conversations/me', token: renter }) },
    { name: 'conversation', route: 'GET /conversations/:id', kind: 'read', request: () => ({ method: 'GET', path: `/conversations/${f.bigConversation}`, token: renter }) },
    { name: 'messages (500)', route: 'GET /conversations/:id/messages', kind: 'read', request: () => ({ method: 'GET', path: `/conversations/${f.bigConversation}/messages`, token: renter }) },
    { name: 'open conversation', route: 'POST /conversations', kind: 'write', request: (i) => ({ method: 'POST', path: '/conversations', token: renter, body: { listingId: f.openConversationListings[i] } }) },
    { name: 'send message', route: 'POST /conversations/:id/messages', kind: 'write', note: 'notifies recipient after responding', request: (i) => ({ method: 'POST', path: `/conversations/${f.messageConversations[i]}/messages`, token: renterN(i), body: { body: 'Sounds good, see you at 6!' } }) },
    { name: 'mark read', route: 'POST /conversations/:id/read', kind: 'write', request: () => ({ method: 'POST', path: `/conversations/${f.bigConversation}/read`, token: renter }) },

    // ── Reviews, disputes, reports
    { name: 'pending reviews', route: 'GET /reviews/pending', kind: 'read', request: (i) => ({ method: 'GET', path: '/reviews/pending', token: renterN(i) }) },
    { name: 'submit review', route: 'POST /reviews', kind: 'write', request: (i) => ({ method: 'POST', path: '/reviews', token: renterN(i), body: { obligationId: f.reviewObligations[i], reviewerRole: 'RENTER', scoreA: 5, scoreB: 4, scoreC: 5, itemRating: 5 } }) },
    { name: 'my disputes', route: 'GET /disputes', kind: 'read', request: () => ({ method: 'GET', path: '/disputes', token: tokenFor(f.renters[4]) }) },
    { name: 'dispute detail', route: 'GET /disputes/:id', kind: 'read', request: () => ({ method: 'GET', path: `/disputes/${f.dispute}`, token: owner }) },
    { name: 'file dispute', route: 'POST /disputes', kind: 'write', request: (i) => ({ method: 'POST', path: '/disputes', token: renterN(i), body: { bookingId: f.disputeCreate[i], reason: 'ITEM_NOT_AS_DESCRIBED', description: 'The listing said it came with a charger, it did not.' } }) },
    { name: 'file report', route: 'POST /reports', kind: 'write', request: (i) => ({ method: 'POST', path: '/reports', token: renterN(i), body: { targetType: 'USER', targetId: f.otherUser, reason: 'SPAM', description: 'Keeps sending the same link to everyone.' } }) },

    // ── Admin
    { name: 'admin disputes', route: 'GET /admin/disputes', kind: 'read', request: () => ({ method: 'GET', path: '/admin/disputes', token: admin }) },
    { name: 'admin dispute detail', route: 'GET /admin/disputes/:id', kind: 'read', request: () => ({ method: 'GET', path: `/admin/disputes/${f.dispute}`, token: admin }) },
    { name: 'admin booking events', route: 'GET /admin/bookings/:id/events', kind: 'read', request: () => ({ method: 'GET', path: `/admin/bookings/${f.renterBooking}/events`, token: admin }) },
    { name: 'admin reports', route: 'GET /admin/reports', kind: 'read', request: () => ({ method: 'GET', path: '/admin/reports', token: admin }) },
    { name: 'admin resolve dispute', route: 'PATCH /admin/disputes/:id/resolve', kind: 'write', request: (i) => ({ method: 'PATCH', path: `/admin/disputes/${f.disputeResolve[i]}/resolve`, token: admin, body: { status: 'RESOLVED_NO_ACTION', resolutionNotes: 'Normal wear, no action.' } }) },
    { name: 'admin resolve report', route: 'PATCH /admin/reports/:id', kind: 'write', request: (i) => ({ method: 'PATCH', path: `/admin/reports/${f.reportResolve[i]}`, token: admin, body: { status: 'REVIEWED' } }) },

    // ── Stripe webhook (unsigned events are accepted only under NODE_ENV=test)
    {
      name: 'stripe webhook', route: 'POST /stripe/webhook', kind: 'write',
      request: (i) => ({
        method: 'POST', path: '/stripe/webhook', headers: { 'Content-Type': 'application/json' },
        body: { id: `evt_bench_${i}_${Date.now()}`, type: 'payment_intent.amount_capturable_updated', data: { object: { id: `pi_bench_${f.webhookBookings[i]}`, object: 'payment_intent', metadata: { bookingId: f.webhookBookings[i] } } } },
      }),
    },
  ]
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined

  console.error('Seeding zoink_bench…')
  const fixtures = await seed()
  // The login scenario needs real addresses; resolve them now.
  const borrowerEmails = await prisma.user.findMany({ where: { id: { in: fixtures.renters } }, select: { id: true, email: true } })
  const emailById = new Map(borrowerEmails.map((u) => [u.id, u.email]))

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app = require('../../index').default
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  async function send(req: Request) {
    const headers: Record<string, string> = { ...(req.headers ?? {}) }
    if (req.token) headers.Authorization = `Bearer ${req.token}`
    if (req.body !== undefined) headers['Content-Type'] = 'application/json'
    queryCount = 0
    const started = process.hrtime.bigint()
    const res = await fetch(`${base}${req.path}`, { method: req.method, headers, body: req.body !== undefined ? JSON.stringify(req.body) : undefined })
    const buffer = Buffer.from(await res.arrayBuffer())
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    return { status: res.status, ms, queries: queryCount, bytes: buffer.length, text: buffer.toString('utf8').slice(0, 160), encoding: res.headers.get('content-encoding') }
  }

  const results: Result[] = []
  for (const scenario of buildScenarios(fixtures)) {
    if (only && !scenario.name.includes(only) && !scenario.route.includes(only)) continue
    const timings: number[] = []
    const queries: number[] = []
    const bytes: number[] = []
    const failures: string[] = []
    // Reads get 5 unmeasured warm-up requests; each write fixture is single-use.
    if (scenario.kind === 'read') {
      for (let w = 0; w < 5; w += 1) await send(scenario.request(w))
    }
    for (let i = 0; i < N; i += 1) {
      let req = scenario.request(i)
      if (scenario.name === 'login') req = { ...req, body: { email: emailById.get(fixtures.renters[i]), password: BENCH_PASSWORD } }
      const r = await send(req)
      timings.push(r.ms)
      queries.push(r.queries)
      bytes.push(r.bytes)
      if (r.status >= 400) failures.push(`${r.status} ${r.text}`)
    }
    const sorted = [...timings].sort((a, b) => a - b)
    const result: Result = {
      name: scenario.name,
      route: scenario.route,
      kind: scenario.kind,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted[sorted.length - 1],
      queries: median(queries),
      bytes: median(bytes),
      ok: N - failures.length,
      failures: [...new Set(failures)].slice(0, 3),
      note: scenario.note,
    }
    results.push(result)
    console.error(`${result.route.padEnd(42)} p50 ${result.p50.toFixed(1).padStart(7)}ms  p95 ${result.p95.toFixed(1).padStart(7)}ms  q ${String(result.queries).padStart(3)}  ${String(result.bytes).padStart(7)}B  ok ${result.ok}/${N}${result.failures.length ? `  ✖ ${result.failures[0]}` : ''}`)
  }

  server.close()
  await (prisma as any).$disconnect?.()

  const table = [
    '| Endpoint | Kind | p50 ms | p95 ms | DB queries | Payload | OK |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...results.map((r) => `| \`${r.route}\` | ${r.kind} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.queries} | ${(r.bytes / 1024).toFixed(1)} KB | ${r.ok}/${N} |`),
  ].join('\n')
  console.log(table)
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2))
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
