import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors'

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Zod validation errors — structured 400 with per-field issue list
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed.',
      issues: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    })
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message })
  }

  // Fallback to 500 for unrecognized errors, logging them server-side
  console.error('Unhandled error:', err)
  return res.status(500).json({ error: 'Something went wrong.' })
}
