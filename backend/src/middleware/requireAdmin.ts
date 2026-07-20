import { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = (req as any).role
  if (role !== 'ADMIN') {
    return next(new ForbiddenError('Admin access required.'))
  }
  next()
}
