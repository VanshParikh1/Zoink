import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../utils/prisma'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' })
  }

  const token = authHeader.split(' ')[1]

  let payload: { userId: string; verificationStatus: string; role: string }
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; verificationStatus: string; role: string }
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }

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
    return res.status(401).json({ error: 'Could not verify this session.' })
  }

  if (!user || user.deletedAt) {
    return res.status(401).json({ error: 'This account is no longer active.' })
  }

  ;(req as any).userId = payload.userId
  ;(req as any).verificationStatus = user.verificationStatus
  ;(req as any).role = user.role || 'USER'
  next()
}
