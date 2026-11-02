import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../utils/prisma'

function authenticate(options: { allowExpired: boolean }) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided.' })
    }

    const token = authHeader.split(' ')[1]

    let payload: { userId: string; verificationStatus: string; role: string }
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!, {
        algorithms: ['HS256'],
        ignoreExpiration: options.allowExpired,
      }) as { userId: string; verificationStatus: string; role: string }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }

    // TODO(auth): tokens can't be revoked before their 30-day expiry (logout,
    // password change, compromise). Token versioning — a users.tokenVersion
    // claim checked here and bumped on those events — was deferred; see the
    // perf/security audit.
    //
    // Stateless JWTs can't be revoked, so this one narrow lookup per authed
    // request is also where role and verificationStatus are resolved: they come
    // from the live DB row, not the 30-day token, so a revoked admin (or a
    // changed verification status) takes effect on the next request instead of
    // only when the token expires.
    let user: { deletedAt: Date | null; role: string | null; verificationStatus: string } | null
    try {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { deletedAt: true, role: true, verificationStatus: true },
      })
    } catch {
      // A database problem is not a bad session: 401 makes the app delete its
      // stored token, which would log users out over a transient outage.
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }

    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'This account is no longer active.' })
    }

    ;(req as any).userId = payload.userId
    ;(req as any).verificationStatus = user.verificationStatus
    ;(req as any).role = user.role || 'USER'
    next()
  }
}

export const requireAuth = authenticate({ allowExpired: false })

// Only for signing a phone out after its session has lapsed (releasing its push
// token): the token must still be one this server signed, but may be past its
// expiry. Never for anything that reads or changes account data.
export const requireAuthAllowingExpired = authenticate({ allowExpired: true })
