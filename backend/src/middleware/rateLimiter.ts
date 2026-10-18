import { Request, Response } from 'express'
import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { isIP } from 'net'

// In-memory store (express-rate-limit's default). Fine for the single Express
// instance we run today. If Zoink ever scales to multiple instances/processes,
// this needs to move to a shared store (e.g. rate-limit-redis) — otherwise each
// instance enforces its own independent counter and the real limit becomes
// (configured limit) x (instance count).

// The same request can hit several limiters (global + a route limiter), so the
// bearer token is verified once per request and the result memoized.
const bearerUserIdCache = new WeakMap<Request, string | null>()

function bearerUserId(req: Request): string | undefined {
  if (bearerUserIdCache.has(req)) return bearerUserIdCache.get(req) ?? undefined

  let userId: string | null = null
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice('Bearer '.length)
      const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as { userId?: string }
      userId = payload.userId ?? null
    } catch {
      userId = null
    }
  }

  bearerUserIdCache.set(req, userId)
  return userId ?? undefined
}

// The address rate limits are keyed on. In production req.ip is useless for
// this: with `trust proxy 1` it resolves to the last X-Forwarded-For hop, which
// is Railway's edge, so everyone shared a handful of edge addresses. Railway's
// edge sets X-Real-IP to the connecting client and overwrites whatever the
// client sent (verified 2026-09-26 against the production edge: spoofed,
// duplicated and lowercase X-Real-IP headers over HTTP/1.1 and HTTP/2 all
// arrived as the real address). Anywhere the header is absent or isn't a
// single IP (tests, local dev) this falls back to req.ip. Only valid behind an
// edge that overwrites the header.
export function clientIp(req: Request): string {
  const realIp = req.get('x-real-ip')?.trim()
  if (realIp && isIP(realIp)) return realIp
  return req.ip ?? ''
}

function ipKey(req: Request): string {
  return ipKeyGenerator(clientIp(req))
}

// Keys by IP, combined with userId when the request carries a valid token, so
// one abusive authenticated user can't burn through the shared quota of
// everyone else behind the same IP — relevant on campus WiFi (UofT, TMU, etc.)
// where many students share one address.
function keyByIpAndUser(req: Request): string {
  const ip = ipKey(req)
  const userId = bearerUserId(req)
  return userId ? `${ip}:${userId}` : ip
}

function rateLimitHandler(_req: Request, res: Response) {
  res.status(429).json({ error: 'Too many requests. Please try again later.' })
}

export function buildLimiter(options: Pick<Partial<Options>, 'windowMs' | 'limit'>) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByIpAndUser,
    handler: rateLimitHandler,
    ...options,
  })
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Tight limit for the remaining auth routes (email verification, code resend,
// legal version), per address + signed-in user.
export const authLimiter = buildLimiter({ windowMs: 15 * MINUTE, limit: 10 })

function keyedLimiter(options: {
  windowMs: number
  limit: number
  key: (req: Request) => string
  skipFailedRequests?: boolean
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.key,
    skipFailedRequests: options.skipFailedRequests ?? false,
    handler: rateLimitHandler,
  })
}

// The address as typed, normalized the way accounts are looked up, so case or
// whitespace variants of one address share a budget.
function submittedEmail(req: Request): string {
  const email = req.body?.email
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

// Login guesses are counted per address + account, so one shared campus
// address isn't a single bucket for every student signing in; a looser cap
// per address stops one client from walking through many accounts. Both run
// before validation, so malformed attempts count too.
export const loginAccountLimiter = keyedLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  key: (req) => `login:${ipKey(req)}:${submittedEmail(req)}`,
})
export const loginAddressLimiter = keyedLimiter({
  windowMs: 15 * MINUTE,
  limit: 100,
  key: (req) => `login-ip:${ipKey(req)}`,
})
export const registerLimiter = keyedLimiter({
  windowMs: HOUR,
  limit: 20,
  key: (req) => `register:${ipKey(req)}`,
})

// Verification emails sent per address per day, sign-ups and resends together.
// Only requests that sent one count. Generous, because a campus network can
// put many students behind one address; the per-email cap in authService
// (MAX_VERIFICATION_EMAILS_PER_DAY) is the tight one.
export const verificationEmailAddressLimiter = keyedLimiter({
  windowMs: DAY,
  limit: 50,
  key: (req) => `verification-email:${ipKey(req)}`,
  skipFailedRequests: true,
})

// Blanket default applied to everything. A signed-in user gets one budget of
// their own, whichever network they're on; anonymous callers are counted per
// IP. The signed-in budget has to cover the app's polling — an open chat alone
// makes ~3 requests every 4s — which a 300/15min per-IP+user cap cut off
// after under 7 minutes.
export function buildGlobalLimiter(options: { windowMs: number; authenticatedLimit: number; anonymousLimit: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    limit: (req: Request) => (bearerUserId(req) ? options.authenticatedLimit : options.anonymousLimit),
    keyGenerator: (req: Request) => {
      const userId = bearerUserId(req)
      return userId ? `user:${userId}` : `ip:${ipKey(req)}`
    },
    handler: rateLimitHandler,
  })
}

export const globalLimiter = buildGlobalLimiter({
  windowMs: 15 * 60 * 1000,
  authenticatedLimit: 1200,
  anonymousLimit: 300,
})

// Per-user caps on write actions that notify or cost something per call. Mount
// AFTER requireAuth: keyed by the authenticated user id it sets. One instance
// per bucket, so routes sharing an instance share the count.
export function buildUserLimiter(name: string, options: { windowMs: number; limit: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const userId = (req as any).userId as string | undefined
      return userId ? `${name}:${userId}` : `${name}:ip:${ipKey(req)}`
    },
    handler: rateLimitHandler,
  })
}

export const messageLimiter = buildUserLimiter('messages', { windowMs: MINUTE, limit: 60 })
export const bookingRequestLimiter = buildUserLimiter('booking-requests', { windowMs: HOUR, limit: 20 })
export const reportLimiter = buildUserLimiter('reports', { windowMs: DAY, limit: 10 })
export const disputeLimiter = buildUserLimiter('disputes', { windowMs: DAY, limit: 10 })
// Avatar, listing photo and handoff photo uploads share one budget.
export const uploadLimiter = buildUserLimiter('uploads', { windowMs: HOUR, limit: 30 })
// Blocking and unblocking share one budget.
export const blockLimiter = buildUserLimiter('blocks', { windowMs: HOUR, limit: 30 })
