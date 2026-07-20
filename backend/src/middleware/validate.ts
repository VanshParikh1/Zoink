import { ZodSchema } from 'zod'
import { Request, Response, NextFunction } from 'express'

/**
 * Generic validation middleware factory.
 *
 * Accepts a Zod schema shaped as `{ body?, params?, query? }`.
 * Parses each sub-object against the corresponding schema field.
 * On failure: passes the raw ZodError to next() → lands in the Phase 4
 *   errorHandler which formats it as 400 { error, issues }.
 * On success: replaces req.body / req.params / req.query with the
 *   parsed (typed, coerced) values so controllers receive clean data.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    })

    if (!result.success) {
      next(result.error) // ZodError → errorHandler
      return
    }

    const data = result.data as {
      body?: Record<string, unknown>
      params?: Record<string, string>
      query?: Record<string, unknown>
    }

    if (data.body !== undefined) req.body = data.body
    if (data.params !== undefined) req.params = data.params as any
    if (data.query !== undefined) req.query = data.query as any

    next()
  }
}
