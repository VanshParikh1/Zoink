import { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'

export const SUSPENDED_MESSAGE =
  "Your account is suspended, so you can't start anything new. You can still finish your current rentals. Contact zoinksupport@gmail.com if you think this is a mistake."

/** Mount after requireAuth on routes that create something (D-9). */
export function requireNotSuspended(req: Request, _res: Response, next: NextFunction) {
  if ((req as any).suspended) return next(new ForbiddenError(SUSPENDED_MESSAGE))
  next()
}
