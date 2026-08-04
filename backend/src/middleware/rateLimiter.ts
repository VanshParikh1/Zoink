import { Request, Response } from 'express'
import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit'
import jwt from 'jsonwebtoken'

// In-memory store (express-rate-limit's default). Fine for the single Express
// instance we run today. If Zoink ever scales to multiple instances/processes,
// this needs to move to a shared store (e.g. rate-limit-redis) — otherwise each
// instance enforces its own independent counter and the real limit becomes
// (configured limit) x (instance count).

function bearerUserId(req: Request): string | undefined {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return undefined

  try {
    const token = authHeader.slice('Bearer '.length)
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string }
    return payload.userId
  } catch {
    return undefined
  }
}

// Keys by IP, combined with userId when the request carries a valid token, so
// one abusive authenticated user can't burn through the shared quota of
// everyone else behind the same IP — relevant on campus WiFi (UofT, TMU, etc.)
// where many students share one address.
function keyByIpAndUser(req: Request): string {
  const ip = ipKeyGenerator(req.ip ?? '')
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

// Tight limit for brute-force/spam-prone auth routes: login, register, OTP
// request/verify.
export const authLimiter = buildLimiter({ windowMs: 15 * 60 * 1000, limit: 10 })

// Generous blanket default applied to everything else.
export const globalLimiter = buildLimiter({ windowMs: 15 * 60 * 1000, limit: 300 })
