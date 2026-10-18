import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import multer from 'multer'
import { AppError } from '../utils/errors'
import { Sentry } from '../instrument'
import { loggableError } from '../utils/sentryScrub'

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

  // Upload limits (multer): an oversized file is 413, anything else malformed 400.
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'That file is too large.' })
    }
    return res.status(400).json({ error: 'Invalid file upload.' })
  }

  // Client errors raised by Express / body-parser before a handler runs
  // (malformed JSON, oversized body, undecodable URL parameter). They carry a
  // 4xx `status`; the message is fixed here so parser internals never leak.
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : undefined
  if (status !== undefined && status >= 400 && status < 500) {
    const message =
      err.type === 'entity.parse.failed'
        ? 'Malformed JSON body.'
        : err.type === 'entity.too.large'
          ? 'Request body is too large.'
          : 'Bad request.'
    return res.status(status).json({ error: message })
  }

  // Fallback to 500 for unrecognized errors, logging them server-side
  console.error('Unhandled error:', loggableError(err))
  Sentry.captureException(err)
  return res.status(500).json({ error: 'Something went wrong.' })
}
