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

  // Stateless JWTs can't be revoked, so a deleted account's still-valid token
  // has to be rejected here: one narrow lookup per authed request.
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { deletedAt: true },
    })
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'This account is no longer active.' })
    }
  } catch {
    return res.status(401).json({ error: 'Could not verify this session.' })
  }

  ;(req as any).userId = payload.userId
  ;(req as any).verificationStatus = payload.verificationStatus
  ;(req as any).role = payload.role || 'USER'
  next()
}
