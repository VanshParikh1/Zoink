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

    let payload: { userId: string; verificationStatus: string; role: string; tokenVersion?: number }
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!, {
        algorithms: ['HS256'],
        ignoreExpiration: options.allowExpired,
      }) as { userId: string; verificationStatus: string; role: string; tokenVersion?: number }
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' })
    }

    // Stateless JWTs can't be revoked on their own, so this one narrow lookup
    // per authed request checks the token's tokenVersion against the user's
    // (bumped on a password reset or change; tokens from before versioning
    // carry none and count as 0). It is also where
    // role and verificationStatus are resolved: they come
    // from the live DB row, not the 30-day token, so a revoked admin (or a
    // changed verification status) takes effect on the next request instead of
    // only when the token expires.
    let user: { deletedAt: Date | null; role: string | null; verificationStatus: string; tokenVersion: number } | null
    try {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { deletedAt: true, role: true, verificationStatus: true, tokenVersion: true },
      })
    } catch {
      // A database problem is not a bad session: 401 makes the app delete its
      // stored token, which would log users out over a transient outage.
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }

    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'This account is no longer active.' })
    }

    // Releasing a phone's push token on sign-out is allowed with an older
    // session too: that phone is exactly the one that should stop getting
    // this account's notifications.
    if (!options.allowExpired && (payload.tokenVersion ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ error: 'Your session has ended. Please sign in again.' })
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
