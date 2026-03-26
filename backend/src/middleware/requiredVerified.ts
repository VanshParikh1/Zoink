import { Request, Response, NextFunction } from 'express'

export function requireVerified(req: Request, res: Response, next: NextFunction) {
  const status = (req as any).verificationStatus
  if (status !== 'VERIFIED') {
    return res.status(403).json({ error: 'Please verify your university email to continue.' })
  }
  next()
}