import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors'
import { Sentry } from '../instrument'

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
    // Only 500-level AppErrors (e.g. InternalServerError) are bugs worth
    // paging on — 4xx AppErrors are expected validation/business-rule
    // outcomes and would just drown out real signal in Sentry.
    if (err.statusCode >= 500) {
      Sentry.captureException(err)
    }
    return res.status(err.statusCode).json({ error: err.message })
  }

  // Fallback to 500 for unrecognized errors, logging them server-side
  console.error('Unhandled error:', err)
  Sentry.captureException(err)
  return res.status(500).json({ error: 'Something went wrong.' })
}
