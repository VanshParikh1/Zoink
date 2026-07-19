import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/errors'

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message })
  }

  // Fallback to 500 for unrecognized errors, logging them server-side
  console.error('Unhandled error:', err)
  return res.status(500).json({ error: 'Something went wrong.' })
}
